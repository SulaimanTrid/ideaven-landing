// Package community implements the creator community (TASK 07): questions
// and discussions in channels, answers with upvotes and an accepted answer,
// tags, soft deletion, and reports. Reads are public; writes require a
// session. Every count (answers, upvotes) is derived at query time from the
// rows themselves, so the numbers shown can never drift from reality and
// nothing is ever faked.
package community

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"ideaven/apps/api/internal/httpx"
)

// Post kinds and channels are closed vocabularies.
var postKinds = map[string]bool{"question": true, "discussion": true}

var postChannels = map[string]bool{
	"general": true, "help": true, "showcase": true, "game-dev": true,
	"app-dev": true, "extensions": true, "beginner-zone": true,
}

// Channels is the ordered channel list shared with the API surface.
var Channels = []string{"general", "help", "showcase", "game-dev", "app-dev", "extensions", "beginner-zone"}

const (
	maxTitleLen    = 150
	maxBodyLen     = 5000
	maxTags        = 5
	maxReportsNote = 300
	feedLimitMax   = 50
)

var tagPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,23}$`)

// slugShape mirrors the project slug generator's output alphabet.
var slugShape = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// Service holds the community business logic.
type Service struct {
	db     *sql.DB
	logger *slog.Logger
}

// NewService wires a Service.
func NewService(db *sql.DB, logger *slog.Logger) *Service {
	return &Service{db: db, logger: logger}
}

func notFound() *httpx.Error {
	return httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "That community post does not exist.")
}

func field(name string, err error) *httpx.Error {
	return httpx.Errorf(http.StatusBadRequest, httpx.CodeValidation, "Validation failed.").WithDetails(httpx.FieldError{Field: name, Message: err.Error()})
}

// Post is one feed row with derived counts.
type Post struct {
	ID              string    `json:"id"`
	Kind            string    `json:"kind"`
	Channel         string    `json:"channel"`
	Title           string    `json:"title"`
	Body            string    `json:"body"`
	Tags            []string  `json:"tags"`
	AuthorID        string    `json:"-"`
	Author          string    `json:"author"`
	AuthorName      string    `json:"authorName,omitempty"`
	ProjectSlug     string    `json:"projectSlug,omitempty"`
	ProjectName     string    `json:"projectName,omitempty"`
	ProjectType     string    `json:"projectType,omitempty"`
	AcceptedReplyID string    `json:"acceptedReplyId,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	ReplyCount      int       `json:"replyCount"`
	Upvotes         int       `json:"upvotes"`
	ViewerVoted     bool      `json:"viewerVoted"`
	ViewerIsAuthor  bool      `json:"viewerIsAuthor"`
}

// Reply is one answer row with derived counts.
type Reply struct {
	ID             string    `json:"id"`
	PostID         string    `json:"postId"`
	Body           string    `json:"body"`
	AuthorID       string    `json:"-"`
	Author         string    `json:"author"`
	AuthorName     string    `json:"authorName,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	Upvotes        int       `json:"upvotes"`
	ViewerVoted    bool      `json:"viewerVoted"`
	ViewerIsAuthor bool      `json:"viewerIsAuthor"`
	Accepted       bool      `json:"accepted"`
}

// FeedInput filters the post feed. All fields are optional.
type FeedInput struct {
	Channel     string
	Kind        string
	Tag         string
	Query       string
	Sort        string // latest | popular | unanswered | trending
	ProjectSlug string // posts attached to one published project
	HasProject  bool   // posts that carry any published-project attachment
}

// feedSelect is the shared post projection; $1 is the viewer ID (NULL for
// anonymous readers — the EXISTS votes check is simply false).
const feedSelect = `
	SELECT p.id, p.kind, p.channel, p.title, p.body, p.tags, p.author_id,
	       p.accepted_reply_id, p.created_at, u.username, u.display_name,
	       p.project_slug, COALESCE(pr.name, ''), COALESCE(pr.type, ''),
	       (SELECT count(*) FROM community_replies r WHERE r.post_id = p.id AND r.deleted_at IS NULL) AS reply_count,
	       (SELECT count(*) FROM community_votes v WHERE v.post_id = p.id) AS upvote_count,
	       EXISTS(SELECT 1 FROM community_votes v WHERE v.post_id = p.id AND v.user_id = $1)
	FROM community_posts p
	JOIN users u ON u.id = p.author_id
	LEFT JOIN projects pr ON pr.slug = p.project_slug
	WHERE p.deleted_at IS NULL `

// tagList scans a Postgres TEXT[] literal into a []string. Community tags
// are constrained to [a-z0-9-] (no quoting, no commas), so a literal
// "{a,b,c}" parse is exact — anything else cannot be stored in the first
// place.
type tagList []string

func (t *tagList) Scan(value any) error {
	text, ok := value.(string)
	if !ok {
		if value == nil {
			*t = []string{}
			return nil
		}
		return fmt.Errorf("community: tags: unexpected driver type %T", value)
	}
	trimmed := strings.TrimPrefix(strings.TrimSuffix(text, "}"), "{")
	out := []string{}
	if trimmed != "" {
		out = strings.Split(trimmed, ",")
	}
	*t = out
	return nil
}

func scanPost(scanner interface{ Scan(...any) error }, viewerID string) (Post, error) {
	var p Post
	var accepted, projectSlug sql.NullString
	var tags tagList
	if err := scanner.Scan(&p.ID, &p.Kind, &p.Channel, &p.Title, &p.Body, &tags, &p.AuthorID,
		&accepted, &p.CreatedAt, &p.Author, &p.AuthorName, &projectSlug,
		&p.ProjectName, &p.ProjectType, &p.ReplyCount, &p.Upvotes, &p.ViewerVoted); err != nil {
		return p, err
	}
	if accepted.Valid {
		p.AcceptedReplyID = accepted.String
	}
	if projectSlug.Valid {
		p.ProjectSlug = projectSlug.String
	}
	p.Tags = tags
	p.ViewerIsAuthor = viewerID != "" && p.AuthorID == viewerID
	return p, nil
}

// Feed returns visible posts matching the filters. viewerID may be empty
// for anonymous readers.
func (s *Service) Feed(ctx context.Context, viewerID string, in FeedInput, limit int) ([]Post, error) {
	if limit <= 0 || limit > feedLimitMax {
		limit = 25
	}
	// The projection is wrapped as a derived table, so filters reference its
	// output column names (id, kind, channel, tags, reply_count, ...).
	where := "TRUE"
	args := []any{nullableUUID(viewerID)}
	arg := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }

	if in.Channel != "" {
		if !postChannels[in.Channel] {
			return nil, field("channel", fmt.Errorf("Unknown channel %q.", in.Channel))
		}
		where += " AND channel = " + arg(in.Channel)
	}
	if in.Kind != "" {
		if !postKinds[in.Kind] {
			return nil, field("kind", fmt.Errorf("Unknown post kind %q.", in.Kind))
		}
		where += " AND kind = " + arg(in.Kind)
	}
	if in.Tag != "" {
		if !tagPattern.MatchString(in.Tag) {
			return nil, field("tag", errors.New("Tags are lowercase letters, digits, and dashes."))
		}
		where += " AND tags @> ARRAY[" + arg(in.Tag) + "]"
	}
	if in.HasProject {
		where += " AND project_slug IS NOT NULL"
	}
	if in.ProjectSlug != "" {
		if !slugShape.MatchString(in.ProjectSlug) {
			return nil, field("projectSlug", errors.New("Unknown project."))
		}
		where += " AND project_slug = " + arg(in.ProjectSlug)
	}
	if q := strings.TrimSpace(in.Query); q != "" {
		like := arg("%" + q + "%")
		where += " AND (title ILIKE " + like + " OR body ILIKE " + like + ")"
	}

	order := "created_at DESC"
	switch in.Sort {
	case "", "latest":
	case "popular":
		order = "upvote_count DESC, reply_count DESC, created_at DESC"
	case "unanswered":
		where += ` AND kind = 'question' AND accepted_reply_id IS NULL
			AND NOT EXISTS (SELECT 1 FROM community_replies r WHERE r.post_id = feed.id AND r.deleted_at IS NULL)`
	case "trending":
		where += " AND created_at > now() - interval '14 days'"
		order = "upvote_count DESC, reply_count DESC, created_at DESC"
	default:
		return nil, field("sort", fmt.Errorf("Unknown sort %q.", in.Sort))
	}

	rows, err := s.db.QueryContext(ctx,
		"SELECT * FROM ("+feedSelect+") feed WHERE "+where+" ORDER BY "+order+" LIMIT "+arg(limit),
		args...)
	if err != nil {
		return nil, fmt.Errorf("community: feed: %w", err)
	}
	defer rows.Close()

	posts := []Post{}
	for rows.Next() {
		p, err := scanPost(rows, viewerID)
		if err != nil {
			return nil, fmt.Errorf("community: feed scan: %w", err)
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

// Get returns one visible post.
func (s *Service) Get(ctx context.Context, viewerID, id string) (*Post, error) {
	row := s.db.QueryRowContext(ctx,
		"SELECT * FROM ("+feedSelect+") feed WHERE id = $2", nullableUUID(viewerID), id)
	p, err := scanPost(row, viewerID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, notFound()
	}
	if err != nil {
		return nil, fmt.Errorf("community: get post: %w", err)
	}
	return &p, nil
}

func nullableUUID(id string) any {
	if id == "" {
		return nil
	}
	return id
}
