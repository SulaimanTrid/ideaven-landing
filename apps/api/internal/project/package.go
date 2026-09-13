package project

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Project package portability (roadmap 6.0 6J): a project backup is one zip
// containing version metadata, the canonical model document, and every
// stored asset's media bytes. Import restores it as a NEW owned project
// (assets re-uploaded through the validated asset path) — the original is
// never touched, and ownership is derived from the importing session.

// Package metadata (version-tagged so future formats stay detectable).
type projectPackageMeta struct {
	Format       int       `json:"format"` // 1
	Kind         string    `json:"kind"`   // "ideaven-project-package"
	Schema       int       `json:"schemaVersion"`
	ExportedAt   time.Time `json:"exportedAt"`
	Name         string    `json:"name"`
	Type         string    `json:"type"`
	Description  string    `json:"description,omitempty"`
	AssetCount   int       `json:"assetCount"`
}

const packageFormat = 1

// ProjectPackage handles GET /api/projects/{id}/package — owner-only backup
// download (model + assets + version metadata in one zip).
func (h *Handler) ProjectPackage(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	projectID := r.PathValue("id")
	if err := validateID(projectID); err != nil {
		httpx.WriteError(w, err)
		return
	}
	project, err := h.service.store.FindForOwner(r.Context(), current.ID, projectID)
	if err != nil {
		httpx.WriteError(w, notFound())
		return
	}

	assets, err := h.service.AssetMediaList(r.Context(), projectID)
	if err != nil {
		httpx.WriteError(w, fmt.Errorf("project: package: %w", err))
		return
	}

	meta, _ := json.Marshal(projectPackageMeta{
		Format:      packageFormat,
		Kind:        "ideaven-project-package",
		Schema:      ModelSchemaVersion,
		ExportedAt:  time.Now().UTC(),
		Name:        project.Name,
		Type:        project.Type,
		Description: project.Description,
		AssetCount:  len(assets),
	})

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	if f, err := zw.Create("package.json"); err == nil {
		_, _ = f.Write(meta)
	}
	if f, err := zw.Create("model.json"); err == nil {
		_, _ = f.Write(project.Model)
	}
	for _, ref := range assets {
		media, err := h.service.AssetMediaData(r.Context(), current.ID, ref.ID)
		if err != nil {
			continue // an unreadable asset is skipped, never silently faked in the manifest
		}
		f, err := zw.Create("assets/" + ref.ID + "__" + packageFileName(ref.Name, ref.MIME))
		if err != nil {
			continue
		}
		_, _ = f.Write(media.Data)
	}
	if err := zw.Close(); err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Could not assemble the package."))
		return
	}

	safe := slugInvalid.ReplaceAllString(strings.ToLower(project.Name), "-")
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s-package.zip"`, safe))
	_, _ = w.Write(buf.Bytes())
}

// ImportPackage handles POST /api/projects/import — restores a package zip
// as a NEW owned project. The name is suffixed "(imported)" and a fresh
// slug/ID are generated; the original project (if any) is untouched.
func (h *Handler) ImportPackage(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := r.ParseMultipartForm(32<<20 + 2048); err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "The package upload failed."))
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "Attach a project package (.zip)."))
		return
	}
	defer file.Close()

	created, err := h.service.ImportPackage(r.Context(), current.ID, file)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]ProjectWire{"project": wire(created, false)})
}

// ImportPackage performs the restore: read the zip, validate the package
// metadata + model, create the project, and re-upload assets through the
// asset package's own validated insert path.
func (s *Service) ImportPackage(ctx context.Context, ownerID string, r io.Reader) (*Project, error) {
	// io.Reader + size: read fully (packages are bounded by the multipart
	// cap) so zip.NewReader gets a Len()'d reader.
	buf, err := io.ReadAll(r)
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "The package upload failed.")
	}
	zr, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "That file is not a valid project package (zip).")
	}
	var meta projectPackageMeta
	var model []byte
	assetFiles := map[string][]byte{}
	for _, zf := range zr.File {
		switch {
		case zf.Name == "package.json":
			data, err := readZipFile(zf)
			if err != nil {
				return nil, err
			}
			if err := json.Unmarshal(data, &meta); err != nil {
				return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "package.json is not valid.")
			}
		case zf.Name == "model.json":
			data, err := readZipFile(zf)
			if err != nil {
				return nil, err
			}
			model = data
		case strings.HasPrefix(zf.Name, "assets/"):
			data, err := readZipFile(zf)
			if err != nil {
				return nil, err
			}
			assetFiles[strings.TrimPrefix(zf.Name, "assets/")] = data
		}
	}
	if meta.Kind != "ideaven-project-package" || meta.Format != packageFormat || len(model) == 0 {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody,
			"That package is not an Ideaven project package (format 1).")
	}

	// Validate the model BEFORE creating anything — an invalid document
	// imports nothing.
	var typed Model
	if err := json.Unmarshal(model, &typed); err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "model.json is not a valid project model.")
	}
	if err := ValidateModel(&typed); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(meta.Name) + " (imported)"
	if len(name) > NameMaxLen {
		name = name[:NameMaxLen]
	}
	created, err := s.Create(ctx, ownerID, CreateInput{
		Name: name, Type: meta.Type, Description: meta.Description,
	})
	if err != nil {
		return nil, err
	}
	if _, err := s.store.UpdateModel(ctx, ownerID, created.ID, model); err != nil {
		return nil, fmt.Errorf("project: import: model: %w", err)
	}

	// Re-upload assets through the asset package's validated insert path
	// (MIME sniffed, capped) and rewrite the model's asset:<id> references
	// to the NEW ids.
	if s.AssetInserter != nil && len(assetFiles) > 0 {
		idMap := map[string]string{}
		for key, data := range assetFiles {
			parts := strings.SplitN(key, "__", 2)
			oldID := parts[0]
			fileName := oldID
			if len(parts) == 2 {
				fileName = parts[1]
			}
			inserted, err := s.AssetInserter(ctx, ownerID, created.ID, fileName, data)
			if err != nil {
				continue // a failed asset is skipped and simply loses its reference
			}
			idMap[oldID] = inserted
		}
		if len(idMap) > 0 {
			updated := string(model)
			for oldID, newID := range idMap {
				updated = strings.ReplaceAll(updated, "asset:"+oldID, "asset:"+newID)
			}
			if _, err := s.store.UpdateModel(ctx, ownerID, created.ID, []byte(updated)); err != nil {
				return nil, fmt.Errorf("project: import: remap: %w", err)
			}
		}
	}

	return s.store.FindForOwner(ctx, ownerID, created.ID)
}

// packageFileName sanitizes an asset name for safe archive paths.
func packageFileName(name, mime string) string {
	base := slugInvalid.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	base = strings.Trim(base, "-")
	if base == "" {
		exts := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "audio/wav": ".wav", "audio/mpeg": ".mp3"}
		base = "asset" + exts[mime]
	}
	return base
}

func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "Package entry could not be read.")
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return nil, httpx.Errorf(http.StatusBadRequest, httpx.CodeInvalidBody, "Package entry could not be read.")
	}
	return data, nil
}

// AssetMediaList/Data delegate to the injected asset media source (M30).
func (s *Service) AssetMediaList(ctx context.Context, projectID string) ([]AssetRef, error) {
	if s.assetMedia == nil {
		return []AssetRef{}, nil
	}
	return s.assetMedia.ProjectMediaList(ctx, projectID)
}

func (s *Service) AssetMediaData(ctx context.Context, ownerID, assetID string) (AssetBytes, error) {
	if s.assetMedia == nil {
		return AssetBytes{}, httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "That asset does not exist.")
	}
	return s.assetMedia.ProjectMediaData(ctx, ownerID, assetID)
}
