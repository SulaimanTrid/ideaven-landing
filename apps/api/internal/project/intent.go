package project

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Project Intent (roadmap 7.0 M11, phase 7A): the user's structured
// statement of what the project is for — goal, audience, platforms,
// constraints, success criteria. User-authored (never derived), consumed by
// the AI planner next to Project Memory, surfaced read-only in the Project
// Brain. One row per project; every path is owner-checked.

const intentFieldLimit = 500

// Intent is the project's purpose statement.
type Intent struct {
	ProjectID  string    `json:"projectId"`
	Goal       string    `json:"goal"`
	Audience   string    `json:"audience"`
	Platforms  string    `json:"platforms"`
	Constraint string    `json:"constraints"`
	Success    string    `json:"success"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// IntentGet returns the project's intent; an absent row reads as the empty
// intent (projects are born without one).
func (s *Service) IntentGet(ctx context.Context, ownerID, projectID string) (*Intent, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	intent := &Intent{ProjectID: projectID}
	err := s.db.QueryRowContext(ctx,
		`SELECT goal, audience, platforms, "constraints", success, updated_at
		 FROM project_intent WHERE project_id = $1`, projectID).
		Scan(&intent.Goal, &intent.Audience, &intent.Platforms, &intent.Constraint, &intent.Success, &intent.UpdatedAt)
	if err != nil {
		// No row yet is the normal empty case, not an error.
		return intent, nil
	}
	return intent, nil
}

// IntentSet upserts the full intent (all fields, trimmed, length-capped).
func (s *Service) IntentSet(ctx context.Context, ownerID, projectID string, intent *Intent) (*Intent, error) {
	if err := validateID(projectID); err != nil {
		return nil, err
	}
	if _, err := s.Get(ctx, ownerID, projectID); err != nil {
		return nil, err
	}
	if intent == nil {
		return nil, field("intent", fmt.Errorf("An intent document is required."))
	}
	trim := func(v string) string {
		v = strings.TrimSpace(v)
		if len(v) > intentFieldLimit {
			return v[:intentFieldLimit]
		}
		return v
	}
	clean := &Intent{
		ProjectID:  projectID,
		Goal:       trim(intent.Goal),
		Audience:   trim(intent.Audience),
		Platforms:  trim(intent.Platforms),
		Constraint: trim(intent.Constraint),
		Success:    trim(intent.Success),
	}
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO project_intent (project_id, goal, audience, platforms, "constraints", success, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, now())
		 ON CONFLICT (project_id) DO UPDATE SET
		   goal = EXCLUDED.goal, audience = EXCLUDED.audience, platforms = EXCLUDED.platforms,
		   "constraints" = EXCLUDED."constraints", success = EXCLUDED.success, updated_at = now()
		 RETURNING goal, audience, platforms, "constraints", success, updated_at`,
		projectID, clean.Goal, clean.Audience, clean.Platforms, clean.Constraint, clean.Success).
		Scan(&clean.Goal, &clean.Audience, &clean.Platforms, &clean.Constraint, &clean.Success, &clean.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("project: intent set: %w", err)
	}
	return clean, nil
}

// IntentLinesForAI is the planner read path: ownership-enforced, formatted
// as "Label: value" lines for the model (empty fields omitted).
func (s *Service) IntentLinesForAI(ctx context.Context, ownerID, projectID string) ([]string, error) {
	intent, err := s.IntentGet(ctx, ownerID, projectID)
	if err != nil {
		return nil, err
	}
	lines := make([]string, 0, 5)
	add := func(label, value string) {
		if value != "" {
			lines = append(lines, label+": "+value)
		}
	}
	add("Goal", intent.Goal)
	add("Target users", intent.Audience)
	add("Platforms", intent.Platforms)
	add("Constraints", intent.Constraint)
	add("Success criteria", intent.Success)
	return lines, nil
}

// ---- HTTP handlers -----------------------------------------------------------

// IntentGet handles GET /api/projects/{id}/intent.
func (h *Handler) IntentGet(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	intent, err := h.service.IntentGet(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"intent": intent})
}

// IntentSet handles PUT /api/projects/{id}/intent.
func (h *Handler) IntentSet(w http.ResponseWriter, r *http.Request) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	var body struct {
		Goal       string `json:"goal"`
		Audience   string `json:"audience"`
		Platforms  string `json:"platforms"`
		Constraint string `json:"constraints"`
		Success    string `json:"success"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 8<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	intent, err := h.service.IntentSet(r.Context(), current.ID, r.PathValue("id"), &Intent{
		Goal: body.Goal, Audience: body.Audience, Platforms: body.Platforms,
		Constraint: body.Constraint, Success: body.Success,
	})
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"intent": intent})
}
