package community_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/community"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/database"
	"ideaven/apps/api/internal/project"
)

// Community tests (TASK 07): channels feed, questions with accepted
// answers, upvotes, soft delete, reports, and the deterministic public
// thumbnail. Needs PostgreSQL — the harness skips without one, like every
// other integration suite here.

func testDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven_test_community?sslmode=disable"
}

var testSecret = bytes.Repeat([]byte{0x6d}, 32)

type silentMailer struct{}

func (silentMailer) SendEmailVerification(context.Context, string, string) error { return nil }
func (silentMailer) SendPasswordReset(context.Context, string, string) error     { return nil }

type harness struct {
	server *httptest.Server
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dsn := testDSN()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := database.EnsureDatabase(ctx, dsn); err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	db, err := database.Connect(ctx, dsn)
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := database.Migrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := db.Exec(`TRUNCATE users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	cfg := config.Config{
		Env: config.EnvDevelopment, Addr: ":0", ReadTimeout: 5 * time.Second,
		WriteTimeout: 5 * time.Second, AllowedOrigins: []string{"http://localhost:3000"},
		DatabaseURL: dsn, SessionSecret: testSecret, AppURL: "http://localhost:3000",
		SessionTTL: 7 * 24 * time.Hour, ResetTokenTTL: time.Hour, VerifyTokenTTL: 24 * time.Hour,
		Cookie: config.CookieConfig{
			Name: "ideaven_session", Secure: false, HTTPOnly: true, SameSite: "Lax",
			Path: "/", MaxAge: 7 * 24 * time.Hour,
		},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	authService := auth.NewService(db, cfg, silentMailer{}, logger)
	authHandler := auth.NewHandler(authService, cfg.Cookie)
	projectService := project.NewService(db, logger)
	projectHandler := project.NewHandler(projectService, authService, cfg.Cookie)
	communityService := community.NewService(db, logger)
	communityHandler := community.NewHandler(communityService, authService, cfg.Cookie)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/projects", projectHandler.Create)
	mux.HandleFunc("POST /api/projects/{id}/publish", projectHandler.Publish)
	mux.HandleFunc("GET /api/public/projects/{slug}/thumbnail.svg", projectHandler.PublicThumbnail)
	mux.HandleFunc("GET /api/community/feed", communityHandler.Feed)
	mux.HandleFunc("GET /api/community/summary", communityHandler.Summary)
	mux.HandleFunc("GET /api/community/posts/{id}", communityHandler.Post)
	mux.HandleFunc("POST /api/community/posts", communityHandler.CreatePost)
	mux.HandleFunc("DELETE /api/community/posts/{id}", communityHandler.DeletePost)
	mux.HandleFunc("POST /api/community/posts/{id}/replies", communityHandler.CreateReply)
	mux.HandleFunc("POST /api/community/posts/{id}/vote", communityHandler.VotePost)
	mux.HandleFunc("POST /api/community/posts/{id}/accept", communityHandler.AcceptReply)
	mux.HandleFunc("DELETE /api/community/replies/{id}", communityHandler.DeleteReply)
	mux.HandleFunc("POST /api/community/replies/{id}/vote", communityHandler.VoteReply)
	mux.HandleFunc("POST /api/community/report", communityHandler.Report)

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return &harness{server: server}
}

func call(t *testing.T, h *harness, method, path string, body any, cookie *http.Cookie) (*http.Response, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, h.server.URL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	res, err := h.server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	payload := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &payload); err != nil {
			t.Fatalf("%s %s: non-JSON: %q", method, path, raw)
		}
	}
	return res, payload
}

func register(t *testing.T, h *harness, email, username string) *http.Cookie {
	t.Helper()
	res, _ := call(t, h, http.MethodPost, "/api/auth/register", map[string]string{
		"email": email, "username": username, "password": "Correct-Horse-9",
	}, nil)
	for _, cookie := range res.Cookies() {
		if cookie.Name == "ideaven_session" && cookie.Value != "" {
			return cookie
		}
	}
	t.Fatalf("register %s did not set a session", email)
	return nil
}

func createPost(t *testing.T, h *harness, cookie *http.Cookie, body map[string]any) map[string]any {
	t.Helper()
	res, payload := call(t, h, http.MethodPost, "/api/community/posts", body, cookie)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create post: status = %d, %v", res.StatusCode, payload)
	}
	post, _ := payload["post"].(map[string]any)
	if post == nil {
		t.Fatalf("create post: no post in payload: %v", payload)
	}
	return post
}

func TestCommunityQuestionLifecycle(t *testing.T) {
	h := newHarness(t)
	asker := register(t, h, "asker@example.com", "asker")
	answerer := register(t, h, "helper@example.com", "helper")

	post := createPost(t, h, asker, map[string]any{
		"kind": "question", "channel": "help", "title": "How do I make a score system?",
		"body": "I want the score to go up when the player taps the coin.",
		"tags": []string{"blocks", "game-dev"},
	})
	if post["kind"] != "question" || post["channel"] != "help" || post["author"] != "asker" {
		t.Fatalf("post wire mismatch: %v", post)
	}
	if post["replyCount"] != float64(0) || post["upvotes"] != float64(0) {
		t.Fatalf("fresh post must have zero derived counts: %v", post)
	}
	postID, _ := post["id"].(string)

	// Anonymous readers see the feed; counts stay real.
	res, feed := call(t, h, http.MethodGet, "/api/community/feed?channel=help", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("feed = %d", res.StatusCode)
	}
	posts, _ := feed["posts"].([]any)
	if len(posts) != 1 {
		t.Fatalf("feed posts = %v", feed)
	}

	// A wrong-vocabulary channel is a 400, not a 500.
	res, _ = call(t, h, http.MethodPost, "/api/community/posts", map[string]any{
		"channel": "memes", "title": "Hello there friends", "body": "Hi!",
	}, asker)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unknown channel = %d, want 400", res.StatusCode)
	}

	// Anonymous writes are rejected.
	res, _ = call(t, h, http.MethodPost, "/api/community/posts/"+postID+"/replies", map[string]any{
		"body": "sneaky",
	}, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous reply = %d, want 401", res.StatusCode)
	}

	// Answer, upvote the answer, upvote the post.
	res, replyPayload := call(t, h, http.MethodPost, "/api/community/posts/"+postID+"/replies", map[string]any{
		"body": "Use the change-variable block with score by 1.",
	}, answerer)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("reply = %d (%v)", res.StatusCode, replyPayload)
	}
	reply, _ := replyPayload["reply"].(map[string]any)
	replyID, _ := reply["id"].(string)

	res, voted := call(t, h, http.MethodPost, "/api/community/replies/"+replyID+"/vote", nil, asker)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("vote reply = %d (%v)", res.StatusCode, voted)
	}
	if r, _ := voted["reply"].(map[string]any); r["upvotes"] != float64(1) || r["viewerVoted"] != true {
		t.Fatalf("reply vote state = %v", voted)
	}
	// Toggle removes the vote.
	res, unvoted := call(t, h, http.MethodPost, "/api/community/replies/"+replyID+"/vote", nil, asker)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unvote reply = %d", res.StatusCode)
	}
	if r, _ := unvoted["reply"].(map[string]any); r["upvotes"] != float64(0) {
		t.Fatalf("reply unvote state = %v", unvoted)
	}

	res, postVoted := call(t, h, http.MethodPost, "/api/community/posts/"+postID+"/vote", nil, answerer)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("vote post = %d", res.StatusCode)
	}
	if p, _ := postVoted["post"].(map[string]any); p["upvotes"] != float64(1) {
		t.Fatalf("post vote state = %v", postVoted)
	}

	// Only the asker can accept; then the feed + summary reflect it.
	res, _ = call(t, h, http.MethodPost, "/api/community/posts/"+postID+"/accept", map[string]any{
		"replyId": replyID,
	}, answerer)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("accept by non-asker = %d, want 403", res.StatusCode)
	}
	res, accepted := call(t, h, http.MethodPost, "/api/community/posts/"+postID+"/accept", map[string]any{
		"replyId": replyID,
	}, asker)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("accept = %d (%v)", res.StatusCode, accepted)
	}
	if p, _ := accepted["post"].(map[string]any); p["acceptedReplyId"] != replyID {
		t.Fatalf("accepted reply pointer = %v", accepted)
	}

	// Detail endpoint: post + replies with the accepted flag.
	res, detail := call(t, h, http.MethodGet, "/api/community/posts/"+postID, nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("detail = %d", res.StatusCode)
	}
	replies, _ := detail["replies"].([]any)
	if len(replies) != 1 {
		t.Fatalf("detail replies = %v", detail)
	}
	if r, _ := replies[0].(map[string]any); r["accepted"] != true {
		t.Fatalf("accepted flag missing: %v", replies)
	}

	// Summary aggregates are real: 1 question, 1 answer, one helpful creator.
	res, summary := call(t, h, http.MethodGet, "/api/community/summary", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("summary = %d", res.StatusCode)
	}
	s, _ := summary["summary"].(map[string]any)
	if s["questionCount"] != float64(1) || s["answerCount"] != float64(1) {
		t.Fatalf("summary counts = %v", s)
	}
	creators, _ := s["helpfulCreators"].([]any)
	if len(creators) != 1 {
		t.Fatalf("helpful creators = %v", s)
	}
	if c, _ := creators[0].(map[string]any); c["username"] != "helper" {
		t.Fatalf("helpful creator = %v", creators)
	}

	// Unanswered sort no longer lists it.
	res, unanswered := call(t, h, http.MethodGet, "/api/community/feed?sort=unanswered", nil, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("unanswered = %d", res.StatusCode)
	}
	if list, _ := unanswered["posts"].([]any); len(list) != 0 {
		t.Fatalf("unanswered feed should be empty: %v", unanswered)
	}
}

func TestCommunityOwnershipAndSoftDelete(t *testing.T) {
	h := newHarness(t)
	owner := register(t, h, "owner@example.com", "owner")
	other := register(t, h, "other@example.com", "other")

	post := createPost(t, h, owner, map[string]any{
		"channel": "general", "title": "Sharing my first app", "kind": "discussion",
		"body": "It is a task list built with blocks.",
	})
	postID, _ := post["id"].(string)

	// Only the author can delete.
	res, _ := call(t, h, http.MethodDelete, "/api/community/posts/"+postID, nil, other)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("foreign delete = %d, want 404", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodDelete, "/api/community/posts/"+postID, nil, owner)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("own delete = %d", res.StatusCode)
	}

	// Soft-deleted posts leave every public surface.
	res, feed := call(t, h, http.MethodGet, "/api/community/feed", nil, nil)
	if list, _ := feed["posts"].([]any); len(list) != 0 {
		t.Fatalf("deleted post still in feed: %v", feed)
	}
	res, _ = call(t, h, http.MethodGet, "/api/community/posts/"+postID, nil, nil)
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("deleted detail = %d, want 404", res.StatusCode)
	}
}

func TestCommunityProjectAttachment(t *testing.T) {
	h := newHarness(t)
	author := register(t, h, "creator@example.com", "creator")

	// Create + publish a real project to attach.
	res, created := call(t, h, http.MethodPost, "/api/projects", map[string]any{
		"name": "Coin Runner", "type": "game",
	}, author)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create project = %d (%v)", res.StatusCode, created)
	}
	proj, _ := created["project"].(map[string]any)
	projectID, _ := proj["id"].(string)
	slug, _ := proj["slug"].(string)
	res, _ = call(t, h, http.MethodPost, "/api/projects/"+projectID+"/publish", map[string]any{}, author)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("publish = %d", res.StatusCode)
	}

	// Attaching a published project works; attaching an unpublished one is a 400.
	post := createPost(t, h, author, map[string]any{
		"channel": "showcase", "title": "My coin runner game", "kind": "discussion",
		"body": "Try it and tell me what to improve.", "projectSlug": slug,
	})
	if post["projectSlug"] != slug || post["projectName"] != "Coin Runner" || post["projectType"] != "game" {
		t.Fatalf("attachment wire = %v", post)
	}

	res, _ = call(t, h, http.MethodPost, "/api/community/posts", map[string]any{
		"channel": "showcase", "title": "Not published yet", "body": "Should not attach.",
		"projectSlug": "never-published",
	}, author)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unpublished attachment = %d, want 400", res.StatusCode)
	}

	// The deterministic thumbnail endpoint serves real SVG for the slug.
	res2, err := http.Get(h.server.URL + "/api/public/projects/" + slug + "/thumbnail.svg")
	if err != nil {
		t.Fatal(err)
	}
	defer res2.Body.Close()
	if res2.StatusCode != http.StatusOK {
		t.Fatalf("thumbnail = %d", res2.StatusCode)
	}
	if ct := res2.Header.Get("Content-Type"); ct != "image/svg+xml" {
		t.Fatalf("thumbnail content type = %q", ct)
	}
	raw, _ := io.ReadAll(res2.Body)
	if !strings.Contains(string(raw), "<svg") {
		t.Fatalf("thumbnail body is not SVG: %.80s", raw)
	}
	// Deterministic: the same slug renders identical bytes.
	res3, _ := http.Get(h.server.URL + "/api/public/projects/" + slug + "/thumbnail.svg")
	raw3, _ := io.ReadAll(res3.Body)
	res3.Body.Close()
	if string(raw) != string(raw3) {
		t.Fatal("thumbnail is not deterministic for the same slug")
	}

	// Unknown slugs 404 like every public surface.
	res4, _ := http.Get(h.server.URL + "/api/public/projects/missing-slug/thumbnail.svg")
	if res4.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown thumbnail = %d, want 404", res4.StatusCode)
	}
	res4.Body.Close()
}

func TestCommunityReportsAndTags(t *testing.T) {
	h := newHarness(t)
	reporter := register(t, h, "reporter@example.com", "reporter")
	poster := register(t, h, "poster@example.com", "poster")

	post := createPost(t, h, poster, map[string]any{
		"channel": "help", "title": "Extension import fails", "body": "What does AIX stand for?",
		"tags": []string{"Extensions", "extensions", "help"},
	})
	// Tags are normalized (lowercase + dedupe).
	if tags, _ := post["tags"].([]any); len(tags) != 2 {
		t.Fatalf("normalized tags = %v", post["tags"])
	}
	postID, _ := post["id"].(string)

	res, _ := call(t, h, http.MethodPost, "/api/community/report", map[string]any{
		"postId": postID, "reason": "spam", "note": "Looks like advertising.",
	}, reporter)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("report = %d", res.StatusCode)
	}
	res, _ = call(t, h, http.MethodPost, "/api/community/report", map[string]any{
		"postId": postID, "reason": "nonsense",
	}, reporter)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad reason = %d, want 400", res.StatusCode)
	}

	// Tag filter finds it.
	res, tagged := call(t, h, http.MethodGet, "/api/community/feed?tag=extensions", nil, nil)
	if list, _ := tagged["posts"].([]any); len(list) != 1 {
		t.Fatalf("tag filter = %v", tagged)
	}
	_ = res
}
