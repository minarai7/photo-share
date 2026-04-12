# Schema notes

## MVP features the database must support

- Users can sign up
- Users can log in
- Users can create photo posts
- Posts have caption
- Posts have location
- Posts have camera body
- Posts have lens
- Users can view a feed
- Users can view a single post
- Users can view profiles
- Users can edit/delete their own posts

## Tables

### users

Stores account information for each user

### posts

Stores each photo post created by a user

## users table

- id: unique identifier for each user
- username: public display name / handle
- email: used for login and uniqueness
- password_hash: securely stored password hash, not the raw password
- created_at: when the account was created

## posts table

- id: unique identifier for each post
- user_id: which user created the post
- image_path: where the image file is stored
- caption: text written by the user
- location: where the photo was taken or posted from
- camera_body: camera model/body metadata
- lens: lens metadata
- created_at: when the post was created
- updated_at: when the post was last edited

## Relationship

- One user can create many posts
- Each post belongs to exactly one user
- posts.user_id points to users.id

## Sketch

users
-----
id
username
email
password_hash
created_at

posts
-----
id
user_id  -> users.id
image_path
caption
location
camera_body
lens
created_at
updated_at
