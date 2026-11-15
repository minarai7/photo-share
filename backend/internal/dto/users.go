package dto

// Author is a person who has posted, for the feed's "By" filter.
type Author struct {
	ID        int64  `json:"id" sql:"primary_key"`
	Username  string `json:"username"`
	PostCount int    `json:"post_count"`
}

// UserWork counts a person's posts and the photographs in them, for the
// person hero ("12 works · 31 photographs").
type UserWork struct {
	PostCount  int `json:"post_count"`
	PhotoCount int `json:"photo_count"`
}
