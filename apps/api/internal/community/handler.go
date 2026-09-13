package community

import (
	"context"
	"errors"
	"net/http"

	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/user"
)

// Authenticator mirrors the project domain's interface so the community
// package stays free of auth imports.
type Authenticator interface {
	Authenticate(ctx context.Context, token string) (*user.User, error)
}

// Handler adapts the community service to HTTP.
type Handler struct {
	service *Service
	auth    Authenticator
	cookie  config.CookieConfig
}

// NewHandler wires a Handler.
func NewHandler(service *Service, auth Authenticator, cookie config.CookieConfig) *Handler {
	return &Handler{service: service, auth: auth, cookie: cookie}
}

// currentUser resolves the session user, or nil for anonymous readers.
func (h *Handler) currentUser(r *http.Request) (*user.User, error) {
	cookie, err := r.Cookie(h.cookie.Name)
	if err != nil || cookie.Value == "" {
		return nil, nil
	}
	current, err := h.auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		return nil, toHTTPX(err)
	}
	return current, nil
}

func toHTTPX(err error) error {
	println("DEBUG community error:", err.Error())
	var apiErr *httpx.Error
	if errors.As(err, &apiErr) {
		return apiErr
	}
	return httpx.Errorf(http.StatusInternalServerError, httpx.CodeInternal, "Something went wrong on our side. Try again shortly.")
}

// requireUser resolves the session user and rejects anonymous writes.
func (h *Handler) requireUser(w http.ResponseWriter, r *http.Request) (*user.User, bool) {
	current, err := h.currentUser(r)
	if err != nil {
		httpx.WriteError(w, err)
		return nil, false
	}
	if current == nil {
		httpx.WriteError(w, httpx.Errorf(http.StatusUnauthorized, httpx.CodeUnauthorized, "Sign in to join the community."))
		return nil, false
	}
	return current, true
}

// viewerID is the session user ID, or "" for anonymous.
func (h *Handler) viewerID(r *http.Request) string {
	current, err := h.currentUser(r)
	if err != nil || current == nil {
		return ""
	}
	return current.ID
}

// Feed handles GET /api/community/feed.
func (h *Handler) Feed(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	posts, err := h.service.Feed(r.Context(), h.viewerID(r), FeedInput{
		Channel:     q.Get("channel"),
		Kind:        q.Get("kind"),
		Tag:         q.Get("tag"),
		Query:       q.Get("q"),
		Sort:        q.Get("sort"),
		ProjectSlug: q.Get("projectSlug"),
		HasProject:  q.Get("hasProject") == "1",
	}, parseLimit(q.Get("limit")))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"posts": posts})
}

func parseLimit(raw string) int {
	limit := 0
	for _, c := range raw {
		if c < '0' || c > '9' {
			return 0
		}
		limit = limit*10 + int(c-'0')
		if limit > feedLimitMax {
			return feedLimitMax
		}
	}
	return limit
}

// Post handles GET /api/community/posts/{id}.
func (h *Handler) Post(w http.ResponseWriter, r *http.Request) {
	viewer := h.viewerID(r)
	post, err := h.service.Get(r.Context(), viewer, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	replies, err := h.service.Replies(r.Context(), viewer, post.ID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"post": post, "replies": replies})
}

// CreatePost handles POST /api/community/posts.
func (h *Handler) CreatePost(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	var body struct {
		Kind        string   `json:"kind"`
		Channel     string   `json:"channel"`
		Title       string   `json:"title"`
		Body        string   `json:"body"`
		Tags        []string `json:"tags"`
		ProjectSlug string   `json:"projectSlug"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 16<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	post, err := h.service.CreatePost(r.Context(), current.ID, body.Kind, body.Channel,
		body.Title, body.Body, body.Tags, body.ProjectSlug)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"post": post})
}

// DeletePost handles DELETE /api/community/posts/{id}.
func (h *Handler) DeletePost(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	if err := h.service.DeletePost(r.Context(), current.ID, r.PathValue("id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// CreateReply handles POST /api/community/posts/{id}/replies.
func (h *Handler) CreateReply(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	var body struct {
		Body string `json:"body"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 16<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	reply, err := h.service.CreateReply(r.Context(), current.ID, r.PathValue("id"), body.Body)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"reply": reply})
}

// DeleteReply handles DELETE /api/community/replies/{id}.
func (h *Handler) DeleteReply(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	if err := h.service.DeleteReply(r.Context(), current.ID, r.PathValue("id")); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// VotePost handles POST /api/community/posts/{id}/vote (toggle).
func (h *Handler) VotePost(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	post, err := h.service.TogglePostVote(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"post": post})
}

// VoteReply handles POST /api/community/replies/{id}/vote (toggle).
func (h *Handler) VoteReply(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	reply, err := h.service.ToggleReplyVote(r.Context(), current.ID, r.PathValue("id"))
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"reply": reply})
}

// AcceptReply handles POST /api/community/posts/{id}/accept.
func (h *Handler) AcceptReply(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	var body struct {
		ReplyID string `json:"replyId"`
	}
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(w, r, &body, 2<<10); err != nil {
			httpx.WriteError(w, err)
			return
		}
	}
	post, err := h.service.AcceptReply(r.Context(), current.ID, r.PathValue("id"), body.ReplyID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"post": post})
}

// Report handles POST /api/community/report.
func (h *Handler) Report(w http.ResponseWriter, r *http.Request) {
	current, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	var body struct {
		PostID  string `json:"postId"`
		ReplyID string `json:"replyId"`
		Reason  string `json:"reason"`
		Note    string `json:"note"`
	}
	if err := httpx.DecodeJSON(w, r, &body, 2<<10); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.service.Report(r.Context(), current.ID, body.PostID, body.ReplyID, body.Reason, body.Note); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

// Summary handles GET /api/community/summary.
func (h *Handler) Summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.service.Summary(r.Context())
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"summary": summary})
}
