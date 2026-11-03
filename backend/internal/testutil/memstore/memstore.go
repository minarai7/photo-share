// Package memstore is an in-memory stand-in for the Postgres repositories,
// used by service and HTTP tests. It implements service.UserStore and
// service.PostStore and copies the *observable* behaviour of the real
// repositories, including their not-found conventions:
//
//   - user lookups return (nil, nil) when missing
//   - GetPostByID returns qrm.ErrNoRows when missing
//   - UpdatePost / DeletePostByID return repository.ErrorPostNotFound on 0 rows
//   - users.username and users.email are unique; deleting is not supported
//
// Those conventions are asserted against a real database in
// internal/repository/*_test.go. If you change a repository's behaviour,
// change this file to match, or the service/HTTP tests will be testing fiction.
package memstore

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"

	"backend/internal/db/gen/photoshare/public/model"
	"backend/internal/dto"
	"backend/internal/repository"

	"github.com/go-jet/jet/v2/qrm"
)

// Store holds users and posts. The zero value is not usable; call New.
type Store struct {
	mu sync.Mutex

	users      map[int64]model.Users
	posts      map[int64]model.Posts
	nextUserID int64
	nextPostID int64

	// Now returns the timestamp for created_at/updated_at. Tests may override it.
	Now func() time.Time

	// Err, when non-nil, is returned by every method. Use it to simulate a
	// database outage and check that handlers don't leak driver errors.
	Err error
}

func New() *Store {
	return &Store{
		users:      map[int64]model.Users{},
		posts:      map[int64]model.Posts{},
		nextUserID: 1,
		nextPostID: 1,
		Now:        time.Now,
	}
}

// Users is the UserStore view; Posts is the PostStore view. Both share state,
// so posts can resolve usernames exactly like the SQL join does.
func (s *Store) Users() *UserStore { return &UserStore{s} }
func (s *Store) Posts() *PostStore { return &PostStore{s} }

// ---- users ----

type UserStore struct{ s *Store }

func (u *UserStore) GetByID(_ context.Context, id int64) (*model.Users, error) {
	return u.find(func(m model.Users) bool { return m.ID == id })
}

func (u *UserStore) GetByEmail(_ context.Context, email string) (*model.Users, error) {
	return u.find(func(m model.Users) bool { return m.Email == email })
}

func (u *UserStore) GetByUsername(_ context.Context, username string) (*model.Users, error) {
	return u.find(func(m model.Users) bool { return m.Username == username })
}

func (u *UserStore) find(match func(model.Users) bool) (*model.Users, error) {
	s := u.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return nil, s.Err
	}
	for _, m := range s.users {
		if match(m) {
			cp := m
			return &cp, nil
		}
	}
	return nil, nil
}

func (u *UserStore) Create(_ context.Context, p repository.CreateUserParams) (*model.Users, error) {
	s := u.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return nil, s.Err
	}
	for _, m := range s.users {
		if m.Email == p.Email || m.Username == p.Username {
			return nil, fmt.Errorf("memstore: unique violation (SQLSTATE 23505)")
		}
	}
	m := model.Users{
		ID:                s.nextUserID,
		Username:          p.Username,
		Email:             p.Email,
		PasswordHash:      p.PasswordHash,
		CreatedAt:         s.Now(),
		PreferredLanguage: "en",
	}
	s.nextUserID++
	s.users[m.ID] = m
	cp := m
	return &cp, nil
}

func (u *UserStore) UpdatePreferredLanguage(_ context.Context, id int64, lang string) error {
	s := u.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.users[id]
	if !ok {
		return repository.ErrorUserNotFound
	}
	if lang != "en" && lang != "ja" {
		return fmt.Errorf("memstore: check constraint users_preferred_language_check (SQLSTATE 23514)")
	}
	m.PreferredLanguage = lang
	s.users[id] = m
	return nil
}

// ---- posts ----

type PostStore struct{ s *Store }

func (p *PostStore) toDTO(m model.Posts) dto.PostResponse {
	return dto.PostResponse{
		ID:         m.ID,
		UserID:     m.UserID,
		Username:   p.s.users[m.UserID].Username,
		ImagePath:  m.ImagePath,
		Caption:    m.Caption,
		Location:   m.Location,
		CameraBody: m.CameraBody,
		Lens:       m.Lens,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}
}

func (p *PostStore) ListPosts(_ context.Context) ([]dto.PostResponse, error) {
	s := p.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return nil, s.Err
	}
	out := make([]dto.PostResponse, 0, len(s.posts))
	for _, m := range s.posts {
		out = append(out, p.toDTO(m))
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].CreatedAt.After(out[j].CreatedAt)
		}
		return out[i].ID > out[j].ID
	})
	return out, nil
}

func (p *PostStore) GetPostByID(_ context.Context, id int64) (*dto.PostResponse, error) {
	s := p.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return nil, s.Err
	}
	m, ok := s.posts[id]
	if !ok {
		return nil, qrm.ErrNoRows
	}
	d := p.toDTO(m)
	return &d, nil
}

func (p *PostStore) CreatePost(_ context.Context, in repository.CreatePostParams) (int64, error) {
	s := p.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return 0, s.Err
	}
	if _, ok := s.users[in.UserID]; !ok {
		return 0, fmt.Errorf("memstore: foreign key violation posts_user_id_fkey (SQLSTATE 23503)")
	}
	now := s.Now()
	m := model.Posts{
		ID:         s.nextPostID,
		UserID:     in.UserID,
		ImagePath:  in.ImagePath,
		Caption:    in.Caption,
		Location:   in.Location,
		CameraBody: in.CameraBody,
		Lens:       in.Lens,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	s.nextPostID++
	s.posts[m.ID] = m
	return m.ID, nil
}

func (p *PostStore) UpdatePost(_ context.Context, in repository.UpdatePostParams) error {
	s := p.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return s.Err
	}
	m, ok := s.posts[in.ID]
	if !ok || m.UserID != in.UserID {
		return repository.ErrorPostNotFound
	}
	m.Caption = in.Caption
	m.Location = in.Location
	m.CameraBody = in.CameraBody
	m.Lens = in.Lens
	m.UpdatedAt = s.Now()
	s.posts[in.ID] = m
	return nil
}

func (p *PostStore) DeletePostByID(_ context.Context, id int64) error {
	s := p.s
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Err != nil {
		return s.Err
	}
	if _, ok := s.posts[id]; !ok {
		return repository.ErrorPostNotFound
	}
	delete(s.posts, id)
	return nil
}

// ---- test helpers ----

// MustAddUser inserts a user directly (bypassing bcrypt) and returns it.
func (s *Store) MustAddUser(username, email string) model.Users {
	u, err := s.Users().Create(context.Background(), repository.CreateUserParams{
		Username:     username,
		Email:        email,
		PasswordHash: "not-a-real-hash",
	})
	if err != nil {
		panic(err)
	}
	return *u
}

// MustAddPost inserts a post directly and returns its ID.
func (s *Store) MustAddPost(userID int64, imagePath, caption string) int64 {
	id, err := s.Posts().CreatePost(context.Background(), repository.CreatePostParams{
		UserID:    userID,
		ImagePath: imagePath,
		Caption:   caption,
	})
	if err != nil {
		panic(err)
	}
	return id
}
