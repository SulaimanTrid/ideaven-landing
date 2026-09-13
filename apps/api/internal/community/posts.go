package community

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// normalizeTags validates and normalizes a tag list: lowercase, deduped,
// max 5, each 2-24 chars of [a-z0-9-].
func normalizeTags(raw []string) ([]string, error) {
	seen := map[string]bool{}
	tags := []string{}
	for _, t := range raw {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" {
			continue
		}
		if !tagPattern.MatchString(t) {
			return nil, fmt.Errorf("Tag %q must be 2-24 characters of lowercase letters, digits, and dashes.", t)
		}
		if !seen[t] {
			seen[t] = true
			tags = append(tags, t)
		}
		if len(tags) > maxTags {
			return nil, fmt.Errorf("A post can have at most %d tags.", maxTags)
		}
	}
	if tags == nil {
		tags = []string{}
	}
	return tags, nil
}

// CreatePost validates and inserts a new question or discussion.
func (s *Service) CreatePost(ctx context.Context, authorID string, kind, channel, title, body string, tags []string, projectSlug string) (*Post, error) {
	kind = strings.TrimSpace(kind)
	if kind == "" {
		kind = "question"
	}
	if !postKinds[kind] {
		return nil, field("kind", fmt.Errorf("A post is either a question or a discussion."))
	}
	if !postChannels[channel] {
		return nil, field("channel", fmt.Errorf("Unknown channel %q.", channel))
	}
	title = strings.TrimSpace(title)
	if len(title) < 5 {
		return nil, field("title", errors.New("Titles need at least 5 characters."))
	}
	if len(title) > maxTitleLen {
		return nil, field("title", fmt.Errorf("Keep titles under %d characters.", maxTitleLen))
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, field("body", errors.New("The post needs a body."))
	}
	if len(body) > maxBodyLen {
		return nil, field("body", fmt.Errorf("Keep the body under %d characters.", maxBodyLen))
	}
	tags, err := normalizeTags(tags)
	if err != nil {
		return nil, field("tags", err)
	}
	projectSlug = strings.TrimSpace(projectSlug)
	if projectSlug != "" {
		var exists bool
		if err := s.db.QueryRowContext(ctx,
			`SELECT EXISTS(SELECT 1 FROM projects WHERE slug = $1 AND status = 'published')`,
			projectSlug).Scan(&exists); err != nil {
			return nil, fmt.Errorf("community: project check: %w", err)
		}
		if !exists {
			return nil, field("projectSlug", errors.New("Attach one of your published projects — that project is not published."))
		}
	}

	var postID string
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO community_posts (kind, channel, title, body, author_id, project_slug, tags)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7) RETURNING id`,
		kind, channel, title, body, authorID, projectSlug, tags).Scan(&postID)
	if err != nil {
		return nil, fmt.Errorf("community: create post: %w", err)
	}
	return s.Get(ctx, authorID, postID)
}

// DeletePost soft-deletes the caller's own post (the moderation state).
func (s *Service) DeletePost(ctx context.Context, authorID, id string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE community_posts SET deleted_at = now()
		WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL`, id, authorID)
	if err != nil {
		return fmt.Errorf("community: delete post: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return notFound()
	}
	return nil
}

// repliesSelect is the shared reply projection; $1 viewer, then post filter.
const repliesSelect = `
	SELECT r.id, r.post_id, r.body, r.author_id, r.created_at, u.username, u.display_name,
	       (SELECT count(*) FROM community_votes v WHERE v.reply_id = r.id) AS upvote_count,
	       EXISTS(SELECT 1 FROM community_votes v WHERE v.reply_id = r.id AND v.user_id = $1)
	FROM community_replies r
	JOIN users u ON u.id = r.author_id `

func scanReply(scanner interface{ Scan(...any) error }, viewerID string) (Reply, error) {
	var r Reply
	if err := scanner.Scan(&r.ID, &r.PostID, &r.Body, &r.AuthorID, &r.CreatedAt,
		&r.Author, &r.AuthorName, &r.Upvotes, &r.ViewerVoted); err != nil {
		return r, err
	}
	r.ViewerIsAuthor = viewerID != "" && r.AuthorID == viewerID
	return r, nil
}

// Replies lists the visible answers of a post, oldest first, marking the
// accepted one.
func (s *Service) Replies(ctx context.Context, viewerID, postID string) ([]Reply, error) {
	post, err := s.Get(ctx, viewerID, postID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx,
		repliesSelect+" WHERE r.post_id = $2 AND r.deleted_at IS NULL ORDER BY r.created_at, r.id",
		nullableUUID(viewerID), postID)
	if err != nil {
		return nil, fmt.Errorf("community: replies: %w", err)
	}
	defer rows.Close()

	replies := []Reply{}
	for rows.Next() {
		r, err := scanReply(rows, viewerID)
		if err != nil {
			return nil, fmt.Errorf("community: replies scan: %w", err)
		}
		r.Accepted = r.ID == post.AcceptedReplyID
		replies = append(replies, r)
	}
	return replies, rows.Err()
}

// CreateReply adds an answer to a visible post.
func (s *Service) CreateReply(ctx context.Context, authorID, postID, body string) (*Reply, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, field("body", errors.New("An answer needs some text."))
	}
	if len(body) > maxBodyLen {
		return nil, field("body", fmt.Errorf("Keep the answer under %d characters.", maxBodyLen))
	}
	if _, err := s.Get(ctx, authorID, postID); err != nil {
		return nil, err
	}
	var replyID string
	if err := s.db.QueryRowContext(ctx, `
		INSERT INTO community_replies (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`,
		postID, authorID, body).Scan(&replyID); err != nil {
		return nil, fmt.Errorf("community: create reply: %w", err)
	}
	reply, err := s.replyByID(ctx, authorID, replyID)
	if err != nil {
		return nil, err
	}
	return reply, nil
}

func (s *Service) replyByID(ctx context.Context, viewerID, id string) (*Reply, error) {
	row := s.db.QueryRowContext(ctx,
		repliesSelect+" WHERE r.id = $2 AND r.deleted_at IS NULL", nullableUUID(viewerID), id)
	r, err := scanReply(row, viewerID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, notFound()
	}
	if err != nil {
		return nil, fmt.Errorf("community: reply by id: %w", err)
	}
	return &r, nil
}

// DeleteReply soft-deletes the caller's own answer.
func (s *Service) DeleteReply(ctx context.Context, authorID, id string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE community_replies SET deleted_at = now()
		WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL`, id, authorID)
	if err != nil {
		return fmt.Errorf("community: delete reply: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return notFound()
	}
	return nil
}

// TogglePostVote upvotes a post for the caller, or removes the upvote if it
// already exists. Returns the new derived state.
func (s *Service) TogglePostVote(ctx context.Context, userID, postID string) (*Post, error) {
	if _, err := s.Get(ctx, userID, postID); err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM community_votes WHERE user_id = $1 AND post_id = $2`, userID, postID)
	if err != nil {
		return nil, fmt.Errorf("community: unvote post: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		if _, err := s.insertVote(ctx, userID, &postID, nil); err != nil {
			return nil, err
		}
	}
	return s.Get(ctx, userID, postID)
}

// ToggleReplyVote upvotes an answer for the caller, or removes the upvote.
func (s *Service) ToggleReplyVote(ctx context.Context, userID, replyID string) (*Reply, error) {
	if _, err := s.replyByID(ctx, userID, replyID); err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM community_votes WHERE user_id = $1 AND reply_id = $2`, userID, replyID)
	if err != nil {
		return nil, fmt.Errorf("community: unvote reply: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		if _, err := s.insertVote(ctx, userID, nil, &replyID); err != nil {
			return nil, err
		}
	}
	return s.replyByID(ctx, userID, replyID)
}

func (s *Service) insertVote(ctx context.Context, userID string, postID, replyID *string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO community_votes (user_id, post_id, reply_id) VALUES ($1, $2, $3)
		ON CONFLICT DO NOTHING`, userID, postID, replyID)
	if err != nil {
		return false, fmt.Errorf("community: vote: %w", err)
	}
	affected, _ := result.RowsAffected()
	return affected > 0, nil
}

// AcceptReply marks an answer as the accepted answer. Only the question's
// author may accept; an empty replyID clears the acceptance.
func (s *Service) AcceptReply(ctx context.Context, userID, postID, replyID string) (*Post, error) {
	post, err := s.Get(ctx, userID, postID)
	if err != nil {
		return nil, err
	}
	if post.AuthorID != userID {
		return nil, httpx.Errorf(http.StatusForbidden, httpx.CodeForbidden, "Only the person who asked can accept an answer.")
	}
	if post.Kind != "question" {
		return nil, field("kind", errors.New("Only questions can have an accepted answer."))
	}
	replyID = strings.TrimSpace(replyID)
	if replyID == "" {
		if _, err := s.db.ExecContext(ctx, `
			UPDATE community_posts SET accepted_reply_id = NULL WHERE id = $1`, postID); err != nil {
			return nil, fmt.Errorf("community: clear accepted: %w", err)
		}
	} else {
		reply, err := s.replyByID(ctx, userID, replyID)
		if err != nil {
			return nil, err
		}
		if reply.PostID != postID {
			return nil, field("replyId", errors.New("That answer does not belong to this question."))
		}
		if _, err := s.db.ExecContext(ctx, `
			UPDATE community_posts SET accepted_reply_id = $2 WHERE id = $1`, postID, replyID); err != nil {
			return nil, fmt.Errorf("community: accept answer: %w", err)
		}
	}
	return s.Get(ctx, userID, postID)
}

var reportReasons = map[string]bool{
	"spam": true, "abusive": true, "inappropriate": true, "other": true,
}

// Report records a user report against a post or reply. Reports are stored
// for moderation; there is no public moderation surface yet, so nothing
// pretends otherwise.
func (s *Service) Report(ctx context.Context, userID string, postID, replyID, reason, note string) error {
	reason = strings.TrimSpace(reason)
	if !reportReasons[reason] {
		return field("reason", errors.New("Pick a report reason: spam, abusive, inappropriate, or other."))
	}
	note = strings.TrimSpace(note)
	if len(note) > maxReportsNote {
		return field("note", fmt.Errorf("Keep the note under %d characters.", maxReportsNote))
	}
	if postID != "" {
		if _, err := s.Get(ctx, userID, postID); err != nil {
			return err
		}
	} else if replyID != "" {
		if _, err := s.replyByID(ctx, userID, replyID); err != nil {
			return err
		}
	} else {
		return field("postId", errors.New("A report needs a target."))
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO community_reports (reporter_id, post_id, reply_id, reason, note)
		VALUES ($1, NULLIF($2, '')::uuid, NULLIF($3, '')::uuid, $4, $5)`,
		userID, postID, replyID, reason, note)
	if err != nil {
		return fmt.Errorf("community: report: %w", err)
	}
	return nil
}

// ---- Summary (right sidebar, real data only) ---------------------------------

// TagCount is a trending tag with its real post count.
type TagCount struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// HelpfulCreator ranks creators by accepted answers (real activity only —
// the list is empty until answers are actually accepted).
type HelpfulCreator struct {
	Username        string `json:"username"`
	DisplayName     string `json:"displayName,omitempty"`
	AcceptedAnswers int    `json:"acceptedAnswers"`
}

// ChannelCount carries per-channel post counts for the nav.
type ChannelCount struct {
	Channel string `json:"channel"`
	Count   int    `json:"count"`
}

// Summary aggregates the community sidebar data.
type Summary struct {
	TrendingTags     []TagCount        `json:"trendingTags"`
	HelpfulCreators  []HelpfulCreator  `json:"helpfulCreators"`
	Channels         []ChannelCount    `json:"channels"`
	QuestionCount    int               `json:"questionCount"`
	AnswerCount      int               `json:"answerCount"`
}

// Summary returns the derived sidebar aggregates. Every number is a real
// COUNT over the rows.
func (s *Service) Summary(ctx context.Context) (*Summary, error) {
	out := &Summary{
		TrendingTags:    []TagCount{},
		HelpfulCreators: []HelpfulCreator{},
		Channels:        []ChannelCount{},
	}
	if err := s.db.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM community_posts WHERE deleted_at IS NULL AND kind = 'question'),
		       (SELECT count(*) FROM community_replies WHERE deleted_at IS NULL)`).
		Scan(&out.QuestionCount, &out.AnswerCount); err != nil {
		return nil, fmt.Errorf("community: summary counts: %w", err)
	}

	tagRows, err := s.db.QueryContext(ctx, `
		SELECT tag, count(*) AS uses FROM community_posts, unnest(tags) AS tag
		WHERE deleted_at IS NULL GROUP BY tag ORDER BY uses DESC, tag LIMIT 8`)
	if err != nil {
		return nil, fmt.Errorf("community: summary tags: %w", err)
	}
	defer tagRows.Close()
	for tagRows.Next() {
		var t TagCount
		if err := tagRows.Scan(&t.Tag, &t.Count); err != nil {
			return nil, fmt.Errorf("community: summary tags scan: %w", err)
		}
		out.TrendingTags = append(out.TrendingTags, t)
	}
	if err := tagRows.Err(); err != nil {
		return nil, err
	}

	creatorRows, err := s.db.QueryContext(ctx, `
		SELECT u.username, u.display_name, count(*) AS accepted
		FROM community_posts p
		JOIN community_replies r ON r.id = p.accepted_reply_id
		JOIN users u ON u.id = r.author_id
		WHERE p.deleted_at IS NULL AND r.deleted_at IS NULL
		GROUP BY u.username, u.display_name
		ORDER BY accepted DESC, u.username LIMIT 5`)
	if err != nil {
		return nil, fmt.Errorf("community: summary creators: %w", err)
	}
	defer creatorRows.Close()
	for creatorRows.Next() {
		var c HelpfulCreator
		if err := creatorRows.Scan(&c.Username, &c.DisplayName, &c.AcceptedAnswers); err != nil {
			return nil, fmt.Errorf("community: summary creators scan: %w", err)
		}
		out.HelpfulCreators = append(out.HelpfulCreators, c)
	}
	if err := creatorRows.Err(); err != nil {
		return nil, err
	}

	for _, ch := range Channels {
		var count int
		if err := s.db.QueryRowContext(ctx, `
			SELECT count(*) FROM community_posts WHERE deleted_at IS NULL AND channel = $1`, ch).
			Scan(&count); err != nil {
			return nil, fmt.Errorf("community: summary channels: %w", err)
		}
		out.Channels = append(out.Channels, ChannelCount{Channel: ch, Count: count})
	}
	return out, nil
}
