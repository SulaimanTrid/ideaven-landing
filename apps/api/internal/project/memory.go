package project

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Project Memory (roadmap 5.0 M5, phase 5A): durable per-project rules the
// user writes for the AI planner. Categories are a closed vocabulary; every
// read/write is owner-checked through the project itself so rules can never
// leak between projects. The AI handler reads these before every plan.

const memoryMaxPerProject = 50

var memoryCategories = map[string]bool{
	"coding": true, "ui": true, "architecture": true, "naming": true,
	"ai-instruction": true, "forbidden": true, "preferred": true,
	"goal": true, "legacy": true,
}

// MemoryItem is one durable project rule.
type MemoryItem struct {
	ID        string    `json:"id"`
	Category  string    `json:"category"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

// MemoryList returns the project's rules, oldest first.
func (s *Service) MemoryList(ctx context.Context, ownerID, projectID string) ([]MemoryItem, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, category, content, created_at FROM project_memory WHERE project_id = $1 ORDER BY created_at, id`,
		projectID)
	if err != nil {
		return nil, fmt.Errorf("project: memory list: %w", err)
	}
	defer rows.Close()

	items := []MemoryItem{}
	for rows.Next() {
		var item MemoryItem
		if err := rows.Scan(&item.ID, &item.Category, &item.Content, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("project: memory scan: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// MemoryAdd appends one rule after validating the closed vocabulary and
// enforcing a sane per-project cap.
func (s *Service) MemoryAdd(ctx context.Context, ownerID, projectID, category, content string) (*MemoryItem, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	category = strings.TrimSpace(category)
	content = strings.TrimSpace(content)
	if !memoryCategories[category] {
		return nil, field("category", fmt.Errorf("Unknown memory category %q.", category))
	}
	if content == "" {
		return nil, field("content", errors.New("A rule needs some text."))
	}
	if len(content) > 500 {
		return nil, field("content", errors.New("Keep rules under 500 characters."))
	}

	var count int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM project_memory WHERE project_id = $1`, projectID).Scan(&count); err != nil {
		return nil, fmt.Errorf("project: memory count: %w", err)
	}
	if count >= memoryMaxPerProject {
		return nil, field("content", fmt.Errorf("This project already has %d rules — remove one first.", memoryMaxPerProject))
	}

	var item MemoryItem
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO project_memory (project_id, category, content) VALUES ($1, $2, $3)
		 RETURNING id, category, content, created_at`,
		projectID, category, content).Scan(&item.ID, &item.Category, &item.Content, &item.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("project: memory add: %w", err)
	}
	return &item, nil
}

// MemoryDelete removes one rule; the project must belong to the caller.
func (s *Service) MemoryDelete(ctx context.Context, ownerID, projectID, memoryID string) error {
	if err := validateID(projectID); err != nil {
		return err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return err
	}
	result, err := s.db.ExecContext(ctx,
		`DELETE FROM project_memory WHERE id = $1 AND project_id = $2`, memoryID, projectID)
	if err != nil {
		return fmt.Errorf("project: memory delete: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return notFound()
	}
	return nil
}

// MemoryRulesForAI is the read path the AI planner uses: it verifies the
// project belongs to the user, then returns just the rule texts.
func (s *Service) MemoryRulesForAI(ctx context.Context, ownerID, projectID string) ([]string, error) {
	items, err := s.MemoryList(ctx, ownerID, projectID)
	if err != nil {
		return nil, err
	}
	rules := make([]string, 0, len(items))
	for _, item := range items {
		rules = append(rules, item.Content)
	}
	return rules, nil
}

// ---- HTTP handlers -----------------------------------------------------------

// MemoryList handles GET /api/projects/{id}/memory.
func (h *Handler) MemoryList(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	items, err := h.service.MemoryList(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"memory": items})
}

// MemoryAdd handles POST /api/projects/{id}/memory.
func (h *Handler) MemoryAdd(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Category string `json:"category"`
		Content  string `json:"content"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 4<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	item, err := h.service.MemoryAdd(r.Context(), current.ID, r.PathValue("id"), body.Category, body.Content)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"memory": item})
}

// MemoryDelete handles DELETE /api/projects/{id}/memory/{memoryId}.
func (h *Handler) MemoryDelete(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.MemoryDelete(r.Context(), current.ID, r.PathValue("id"), r.PathValue("memoryId")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
