package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"backend/internal/dto"
	"backend/internal/service"
	"backend/internal/testutil/memstore"
)

func strPtr(s string) *string { return &s }

func newPosts(t *testing.T) (*service.PostService, *memstore.Store) {
	t.Helper()
	store := memstore.New()
	return service.NewPostService(store.Posts(), nil), store
}

// fakeTints gives every thumbnail the tint in its map, or fails.
type fakeTints map[string]string

func (f fakeTints) TintFor(_ context.Context, thumbnailPath string) (string, error) {
	if t, ok := f[thumbnailPath]; ok {
		return t, nil
	}
	return "", errors.New("no such thumbnail")
}

func TestCreatePost_ReturnsHydratedPost(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	post, err := svc.CreatePost(context.Background(), service.CreatePostParams{
		UserID:     alice.ID,
		ImagePath:  "/uploads/a.jpg",
		Caption:    "sunset",
		Location:   strPtr("Kyoto"),
		CameraBody: strPtr("X100V"),
	})
	if err != nil {
		t.Fatalf("CreatePost: %v", err)
	}
	if post.ID == 0 || post.UserID != alice.ID || post.Username != "alice" {
		t.Errorf("unexpected post identity: %+v", post)
	}
	if post.Caption != "sunset" || *post.Location != "Kyoto" || *post.CameraBody != "X100V" || post.Lens != nil {
		t.Errorf("fields not round-tripped: %+v", post)
	}
}

func TestCreatePost_Validation(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	_, err := svc.CreatePost(context.Background(), service.CreatePostParams{UserID: 0, ImagePath: "/uploads/a.jpg"})
	if !errors.Is(err, service.ErrUserRequired) {
		t.Errorf("missing user: got %v", err)
	}
	_, err = svc.CreatePost(context.Background(), service.CreatePostParams{UserID: alice.ID, ImagePath: "   "})
	if !errors.Is(err, service.ErrImagePathRequired) {
		t.Errorf("blank image path: got %v", err)
	}
}

func TestCreatePost_ThumbnailPath(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	create := func(image string, thumb *string) (*dto.PostResponse, error) {
		return svc.CreatePost(context.Background(), service.CreatePostParams{UserID: alice.ID, ImagePath: image, ThumbnailPath: thumb})
	}

	post, err := create("/uploads/1730_abc12345.png", strPtr("/uploads/1730_abc12345_w800.jpg"))
	if err != nil {
		t.Fatalf("matching thumbnail: %v", err)
	}
	if post.ThumbnailPath == nil || *post.ThumbnailPath != "/uploads/1730_abc12345_w800.jpg" {
		t.Errorf("thumbnail not stored: %+v", post.ThumbnailPath)
	}

	for _, thumb := range []*string{nil, strPtr("")} {
		post, err := create("/uploads/1730_abc12345.png", thumb)
		if err != nil {
			t.Fatalf("no thumbnail: %v", err)
		}
		if post.ThumbnailPath != nil {
			t.Errorf("absent/empty thumbnail stored as %q, want nil", *post.ThumbnailPath)
		}
	}

	for _, bad := range []string{
		"/uploads/someone-elses_w800.jpg",
		"/uploads/1730_abc12345.png", // the original itself
		"/uploads/1730_abc12345_w400.jpg",
		"https://evil.example/1730_abc12345_w800.jpg",
	} {
		if _, err := create("/uploads/1730_abc12345.png", strPtr(bad)); !errors.Is(err, service.ErrInvalidThumbnailPath) {
			t.Errorf("thumbnail %q: got %v, want ErrInvalidThumbnailPath", bad, err)
		}
	}
}

func images(paths ...string) []service.CreatePostImage {
	out := make([]service.CreatePostImage, len(paths))
	for i, p := range paths {
		out[i] = service.CreatePostImage{ImagePath: p}
	}
	return out
}

func imagePaths(p *dto.PostResponse) []string {
	out := []string{}
	for _, i := range p.Images {
		out = append(out, i.ImagePath)
	}
	return out
}

func TestCreatePost_MultipleImages(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	create := func(imgs []service.CreatePostImage) (*dto.PostResponse, error) {
		return svc.CreatePost(context.Background(), service.CreatePostParams{UserID: alice.ID, Images: imgs})
	}

	t.Run("kept in order, first is the cover", func(t *testing.T) {
		imgs := images("/uploads/3.jpg", "/uploads/1.png", "/uploads/2.webp")
		imgs[0].ThumbnailPath = strPtr("/uploads/3_w800.jpg")
		post, err := create(imgs)
		if err != nil {
			t.Fatal(err)
		}
		got := imagePaths(post)
		if len(got) != 3 || got[0] != "/uploads/3.jpg" || got[1] != "/uploads/1.png" || got[2] != "/uploads/2.webp" {
			t.Errorf("images = %v", got)
		}
		if post.ImagePath != "/uploads/3.jpg" || post.ThumbnailPath == nil || *post.ThumbnailPath != "/uploads/3_w800.jpg" {
			t.Errorf("cover = %q / %v, want the first image and its thumbnail", post.ImagePath, post.ThumbnailPath)
		}
	})

	t.Run("up to the limit", func(t *testing.T) {
		var paths []string
		for i := range service.MaxImagesPerPost {
			paths = append(paths, fmt.Sprintf("/uploads/max%d.jpg", i))
		}
		post, err := create(images(paths...))
		if err != nil {
			t.Fatalf("%d images: %v", service.MaxImagesPerPost, err)
		}
		if len(post.Images) != service.MaxImagesPerPost {
			t.Errorf("stored %d images", len(post.Images))
		}

		paths = append(paths, "/uploads/one-too-many.jpg")
		if _, err := create(images(paths...)); !errors.Is(err, service.ErrTooManyImages) {
			t.Errorf("%d images: got %v, want ErrTooManyImages", len(paths), err)
		}
	})

	t.Run("each image is validated", func(t *testing.T) {
		if _, err := create(images("/uploads/a.jpg", " ")); !errors.Is(err, service.ErrImagePathRequired) {
			t.Errorf("blank second image: got %v", err)
		}
		if _, err := create(images("/uploads/a.jpg", "/uploads/b.jpg", "/uploads/a.jpg")); !errors.Is(err, service.ErrDuplicateImage) {
			t.Errorf("duplicate image: got %v", err)
		}
		bad := images("/uploads/a.jpg", "/uploads/b.jpg")
		bad[1].ThumbnailPath = strPtr("/uploads/a_w800.jpg") // the first image's thumbnail
		if _, err := create(bad); !errors.Is(err, service.ErrInvalidThumbnailPath) {
			t.Errorf("wrong thumbnail on image 2: got %v", err)
		}
	})

	t.Run("nothing is stored when validation fails", func(t *testing.T) {
		before, _ := svc.ListPosts(context.Background(), service.ListPostsParams{})
		_, _ = create(images("/uploads/x.jpg", "/uploads/x.jpg"))
		after, _ := svc.ListPosts(context.Background(), service.ListPostsParams{})
		if len(after) != len(before) {
			t.Errorf("posts %d -> %d after a rejected create", len(before), len(after))
		}
	})
}

// Clients from before multi-image posts send image_path/thumbnail_path only.
func TestCreatePost_LegacySingleImage(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	post, err := svc.CreatePost(context.Background(), service.CreatePostParams{
		UserID: alice.ID, ImagePath: "/uploads/a.png", ThumbnailPath: strPtr("/uploads/a_w800.jpg"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(post.Images) != 1 || post.Images[0].ImagePath != "/uploads/a.png" ||
		post.Images[0].ThumbnailPath == nil || *post.Images[0].ThumbnailPath != "/uploads/a_w800.jpg" {
		t.Errorf("images = %+v", post.Images)
	}

	// Images wins over the legacy fields when both are sent.
	post, err = svc.CreatePost(context.Background(), service.CreatePostParams{
		UserID: alice.ID, ImagePath: "/uploads/ignored.jpg", Images: images("/uploads/b.jpg"),
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := imagePaths(post); len(got) != 1 || got[0] != "/uploads/b.jpg" {
		t.Errorf("images = %v, want [/uploads/b.jpg]", got)
	}
}

// A post created by an older backend has no image rows; reads show its cover
// as its only image so clients can always use images.
func TestReadsFillImagesFromCover(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	id := store.AddLegacyPost(alice.ID, "/uploads/old.jpg", strPtr("/uploads/old_w800.jpg"))

	post, err := svc.GetPostByID(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if len(post.Images) != 1 || post.Images[0].ImagePath != "/uploads/old.jpg" || *post.Images[0].ThumbnailPath != "/uploads/old_w800.jpg" {
		t.Errorf("GetPostByID images = %+v", post.Images)
	}

	list, err := svc.ListPosts(context.Background(), service.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ImageCount != 1 || list[0].ImagePath != "/uploads/old.jpg" {
		t.Errorf("ListPosts = %+v, want the cover with image_count 1", list)
	}
	if post.ImageCount != 1 {
		t.Errorf("GetPostByID image_count = %d, want 1", post.ImageCount)
	}
}

func TestThumbnailPathFor(t *testing.T) {
	for in, want := range map[string]string{
		"/uploads/1730_abc12345.png":  "/uploads/1730_abc12345_w800.jpg",
		"/uploads/1730_abc12345.jpg":  "/uploads/1730_abc12345_w800.jpg",
		"/uploads/1730_abc12345.webp": "/uploads/1730_abc12345_w800.jpg",
	} {
		if got := service.ThumbnailPathFor(in); got != want {
			t.Errorf("ThumbnailPathFor(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGetPostByID_NotFound(t *testing.T) {
	svc, _ := newPosts(t)
	_, err := svc.GetPostByID(context.Background(), 404)
	if !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("got %v, want ErrPostNotFound", err)
	}
}

func TestListPosts_NewestFirst(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")

	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	store.Now = func() time.Time { return base }
	older := store.MustAddPost(alice.ID, "/uploads/1.jpg", "older")
	store.Now = func() time.Time { return base.Add(time.Hour) }
	newer := store.MustAddPost(alice.ID, "/uploads/2.jpg", "newer")

	posts, err := svc.ListPosts(context.Background(), service.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 2 || posts[0].ID != newer || posts[1].ID != older {
		t.Fatalf("order = %v, want [%d %d]", ids(posts), newer, older)
	}
}

func TestListPosts_CountsInsteadOfImages(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	post, err := svc.CreatePost(context.Background(), service.CreatePostParams{UserID: alice.ID, Images: images("/uploads/1.jpg", "/uploads/2.jpg", "/uploads/3.jpg")})
	if err != nil {
		t.Fatal(err)
	}
	if post.ImageCount != 3 || len(post.Images) != 3 {
		t.Errorf("created post: image_count %d, %d images; want 3 and 3", post.ImageCount, len(post.Images))
	}

	list, err := svc.ListPosts(context.Background(), service.ListPostsParams{})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ImageCount != 3 || list[0].Images != nil || list[0].ImagePath != "/uploads/1.jpg" {
		t.Errorf("ListPosts = %+v, want cover + image_count 3, no images", list)
	}
}

func TestListPosts_Pagination(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	bob := store.MustAddUser("bob", "bob@example.com")
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	var want []int64
	for i := range 5 {
		store.Now = func() time.Time { return base.Add(time.Duration(i) * time.Hour) }
		owner := alice.ID
		if i == 2 {
			owner = bob.ID
		}
		want = append([]int64{store.MustAddPost(owner, fmt.Sprintf("/uploads/%d.jpg", i), "")}, want...)
	}

	first, err := svc.ListPosts(context.Background(), service.ListPostsParams{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	last := first[len(first)-1]
	second, err := svc.ListPosts(context.Background(), service.ListPostsParams{
		Limit: 2, After: &service.PostCursor{CreatedAt: last.CreatedAt, ID: last.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := append(ids(first), ids(second)...); len(got) != 4 || got[0] != want[0] || got[3] != want[3] {
		t.Errorf("two pages = %v, want the first 4 of %v", got, want)
	}

	bobs, err := svc.ListPosts(context.Background(), service.ListPostsParams{PostFilter: service.PostFilter{UserIDs: []int64{bob.ID}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(bobs) != 1 || bobs[0].UserID != bob.ID {
		t.Errorf("bob's posts = %v", ids(bobs))
	}

	for name, bad := range map[string]service.ListPostsParams{
		"negative limit":           {Limit: -1},
		"limit too large":          {Limit: service.MaxPageSize + 1},
		"cursor id 0":              {After: &service.PostCursor{CreatedAt: base}},
		"most without image count": {Sort: service.SortMost, After: &service.PostCursor{CreatedAt: base, ID: 3}},
	} {
		if _, err := svc.ListPosts(context.Background(), bad); !errors.Is(err, service.ErrInvalidPagination) {
			t.Errorf("%s: got %v, want ErrInvalidPagination", name, err)
		}
	}
	if _, err := svc.ListPosts(context.Background(), service.ListPostsParams{Limit: service.MaxPageSize}); err != nil {
		t.Errorf("limit %d: %v", service.MaxPageSize, err)
	}
}

func TestListPosts_RejectsBadSortAndFilters(t *testing.T) {
	svc, _ := newPosts(t)
	ctx := context.Background()
	tooMany := make([]int64, service.MaxUserIDs+1)
	for i := range tooMany {
		tooMany[i] = int64(i + 1)
	}
	for name, tc := range map[string]struct {
		p    service.ListPostsParams
		want error
	}{
		"unknown sort":   {service.ListPostsParams{Sort: "popular"}, service.ErrInvalidSort},
		"unknown photos": {service.ListPostsParams{PostFilter: service.PostFilter{Photos: "many"}}, service.ErrInvalidPhotosFilter},
		"user id 0":      {service.ListPostsParams{PostFilter: service.PostFilter{UserIDs: []int64{3, 0}}}, service.ErrInvalidUserIDs},
		"too many users": {service.ListPostsParams{PostFilter: service.PostFilter{UserIDs: tooMany}}, service.ErrInvalidUserIDs},
	} {
		if _, err := svc.ListPosts(ctx, tc.p); !errors.Is(err, tc.want) {
			t.Errorf("list, %s: got %v, want %v", name, err, tc.want)
		}
		if tc.want == service.ErrInvalidSort {
			continue // counts have no sort
		}
		if _, err := svc.CountPosts(ctx, tc.p.PostFilter); !errors.Is(err, tc.want) {
			t.Errorf("count, %s: got %v, want %v", name, err, tc.want)
		}
	}
	for _, sort := range []service.PostSort{"", service.SortNewest, service.SortOldest, service.SortMost} {
		if _, err := svc.ListPosts(ctx, service.ListPostsParams{Sort: sort}); err != nil {
			t.Errorf("sort %q: %v", sort, err)
		}
	}
}

// Sorts, the people filter, the photos filter and the count agree.
func TestListPosts_SortAndFilter(t *testing.T) {
	svc, store := newPosts(t)
	ctx := context.Background()
	alice := store.MustAddUser("alice", "alice@example.com")
	bob := store.MustAddUser("bob", "bob@example.com")
	carol := store.MustAddUser("carol", "carol@example.com")
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	add := func(i int, owner int64, images int) int64 {
		store.Now = func() time.Time { return base.Add(time.Duration(i) * time.Hour) }
		paths := make([]string, images)
		for j := range paths {
			paths[j] = fmt.Sprintf("/uploads/%d_%d.jpg", i, j)
		}
		p, err := svc.CreatePost(ctx, service.CreatePostParams{UserID: owner, Images: imagesFor(paths...)})
		if err != nil {
			t.Fatal(err)
		}
		return p.ID
	}
	a1 := add(0, alice.ID, 1)
	b3 := add(1, bob.ID, 3)
	c2 := add(2, carol.ID, 2)
	a3 := add(3, alice.ID, 3)

	list := func(p service.ListPostsParams) []int64 {
		t.Helper()
		posts, err := svc.ListPosts(ctx, p)
		if err != nil {
			t.Fatal(err)
		}
		return ids(posts)
	}
	for name, tc := range map[string]struct {
		p    service.ListPostsParams
		want []int64
	}{
		"newest":            {service.ListPostsParams{}, []int64{a3, c2, b3, a1}},
		"oldest":            {service.ListPostsParams{Sort: service.SortOldest}, []int64{a1, b3, c2, a3}},
		"most, ties newest": {service.ListPostsParams{Sort: service.SortMost}, []int64{a3, b3, c2, a1}},
		"alice and carol":   {service.ListPostsParams{PostFilter: service.PostFilter{UserIDs: []int64{alice.ID, carol.ID}}}, []int64{a3, c2, a1}},
		"single":            {service.ListPostsParams{PostFilter: service.PostFilter{Photos: service.PhotosSingle}}, []int64{a1}},
		"series":            {service.ListPostsParams{PostFilter: service.PostFilter{Photos: service.PhotosSeries}}, []int64{a3, c2, b3}},
		"any":               {service.ListPostsParams{PostFilter: service.PostFilter{Photos: service.PhotosAny}}, []int64{a3, c2, b3, a1}},
		"most after a3": {service.ListPostsParams{Sort: service.SortMost, After: &service.PostCursor{
			CreatedAt: base.Add(3 * time.Hour), ID: a3, ImageCount: 3,
		}}, []int64{b3, c2, a1}},
	} {
		if got := list(tc.p); fmt.Sprint(got) != fmt.Sprint(tc.want) {
			t.Errorf("%s: %v, want %v", name, got, tc.want)
		}
		n, err := svc.CountPosts(ctx, tc.p.PostFilter)
		if err != nil {
			t.Fatal(err)
		}
		if tc.p.After == nil && n != len(tc.want) {
			t.Errorf("%s: count %d, want %d", name, n, len(tc.want))
		}
	}
}

func imagesFor(paths ...string) []service.CreatePostImage {
	out := make([]service.CreatePostImage, len(paths))
	for i, p := range paths {
		out[i] = service.CreatePostImage{ImagePath: p}
	}
	return out
}

// The tint comes from the cover's thumbnail, never from the client; without
// a thumbnail or when it can't be read, the post has none.
func TestCreatePost_Tint(t *testing.T) {
	store := memstore.New()
	svc := service.NewPostService(store.Posts(), fakeTints{"/uploads/a_w800.jpg": "#eeddcc"})
	alice := store.MustAddUser("alice", "alice@example.com")
	ctx := context.Background()

	withThumb, err := svc.CreatePost(ctx, service.CreatePostParams{UserID: alice.ID, Images: []service.CreatePostImage{
		{ImagePath: "/uploads/a.jpg", ThumbnailPath: strPtr("/uploads/a_w800.jpg")},
		{ImagePath: "/uploads/b.jpg"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if withThumb.Tint == nil || *withThumb.Tint != "#eeddcc" {
		t.Errorf("tint = %v, want #eeddcc from the cover's thumbnail", withThumb.Tint)
	}
	listed, _ := svc.ListPosts(ctx, service.ListPostsParams{})
	if len(listed) != 1 || listed[0].Tint == nil || *listed[0].Tint != "#eeddcc" {
		t.Errorf("listed tint = %+v", listed)
	}

	// The second image's thumbnail is not the cover's: no tint.
	noCoverThumb, err := svc.CreatePost(ctx, service.CreatePostParams{UserID: alice.ID, Images: []service.CreatePostImage{
		{ImagePath: "/uploads/c.jpg"},
		{ImagePath: "/uploads/a.jpg", ThumbnailPath: strPtr("/uploads/a_w800.jpg")},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if noCoverThumb.Tint != nil {
		t.Errorf("tint without a cover thumbnail = %s, want none", *noCoverThumb.Tint)
	}

	// The tint source fails: the post is still created, without a tint.
	unreadable, err := svc.CreatePost(ctx, service.CreatePostParams{UserID: alice.ID, Images: []service.CreatePostImage{
		{ImagePath: "/uploads/d.jpg", ThumbnailPath: strPtr("/uploads/d_w800.jpg")},
	}})
	if err != nil {
		t.Fatalf("create with an unreadable thumbnail: %v", err)
	}
	if unreadable.Tint != nil {
		t.Errorf("tint = %s, want none", *unreadable.Tint)
	}
}

func TestUserService(t *testing.T) {
	store := memstore.New()
	users := service.NewUserService(store.Users(), store.Posts())
	posts := service.NewPostService(store.Posts(), nil)
	ctx := context.Background()
	zoe := store.MustAddUser("zoe", "zoe@example.com")
	amy := store.MustAddUser("amy", "amy@example.com")
	store.MustAddUser("lurker", "lurker@example.com")

	store.MustAddPost(zoe.ID, "/uploads/z1.jpg", "")
	if _, err := posts.CreatePost(ctx, service.CreatePostParams{UserID: zoe.ID, Images: imagesFor("/uploads/z2.jpg", "/uploads/z3.jpg", "/uploads/z4.jpg")}); err != nil {
		t.Fatal(err)
	}
	store.MustAddPost(amy.ID, "/uploads/a1.jpg", "")

	profile, err := users.GetProfile(ctx, zoe.ID)
	if err != nil {
		t.Fatal(err)
	}
	if profile.User.Username != "zoe" || profile.Work.PostCount != 2 || profile.Work.PhotoCount != 4 {
		t.Errorf("zoe's profile = %+v / %+v, want 2 works, 4 photographs", profile.User, profile.Work)
	}
	if _, err := users.GetProfile(ctx, 999); !errors.Is(err, service.ErrUserNotFound) {
		t.Errorf("unknown user: %v, want ErrUserNotFound", err)
	}

	authors, err := users.ListAuthors(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(authors) != fmt.Sprint([]dto.Author{{ID: amy.ID, Username: "amy", PostCount: 1}, {ID: zoe.ID, Username: "zoe", PostCount: 2}}) {
		t.Errorf("authors = %+v, want amy then zoe, without lurker", authors)
	}
}

func TestUpdatePost_Ownership(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	mallory := store.MustAddUser("mallory", "mallory@example.com")
	postID := store.MustAddPost(alice.ID, "/uploads/a.jpg", "original")

	t.Run("non-owner is forbidden and the post is unchanged", func(t *testing.T) {
		_, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: postID, UserID: mallory.ID, Caption: "pwned"})
		if !errors.Is(err, service.ErrForbidden) {
			t.Fatalf("got %v, want ErrForbidden", err)
		}
		p, _ := svc.GetPostByID(context.Background(), postID)
		if p.Caption != "original" {
			t.Errorf("caption changed to %q", p.Caption)
		}
	})

	t.Run("owner can update and gets the fresh row", func(t *testing.T) {
		got, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: postID, UserID: alice.ID, Caption: "edited", Lens: strPtr("35mm")})
		if err != nil {
			t.Fatal(err)
		}
		if got.Caption != "edited" || got.Lens == nil || *got.Lens != "35mm" {
			t.Errorf("returned stale post: %+v", got)
		}
	})

	t.Run("missing post is not found", func(t *testing.T) {
		_, err := svc.UpdatePost(context.Background(), service.UpdatePostParams{PostID: 999, UserID: alice.ID})
		if !errors.Is(err, service.ErrPostNotFound) {
			t.Fatalf("got %v, want ErrPostNotFound", err)
		}
	})
}

func TestDeletePost_Ownership(t *testing.T) {
	svc, store := newPosts(t)
	alice := store.MustAddUser("alice", "alice@example.com")
	mallory := store.MustAddUser("mallory", "mallory@example.com")
	postID := store.MustAddPost(alice.ID, "/uploads/a.jpg", "mine")

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: mallory.ID}); !errors.Is(err, service.ErrForbidden) {
		t.Fatalf("non-owner delete: got %v, want ErrForbidden", err)
	}
	if _, err := svc.GetPostByID(context.Background(), postID); err != nil {
		t.Fatalf("post vanished after forbidden delete: %v", err)
	}

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: alice.ID}); err != nil {
		t.Fatalf("owner delete: %v", err)
	}
	if _, err := svc.GetPostByID(context.Background(), postID); !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("post still exists after delete: %v", err)
	}

	if err := svc.DeletePost(context.Background(), service.DeletePostParams{PostID: postID, UserID: alice.ID}); !errors.Is(err, service.ErrPostNotFound) {
		t.Fatalf("second delete: got %v, want ErrPostNotFound", err)
	}
}

func ids(posts []dto.PostResponse) []int64 {
	out := make([]int64, len(posts))
	for i, p := range posts {
		out[i] = p.ID
	}
	return out
}
