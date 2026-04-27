# Backend

## Signup
curl -i -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'

## Login
curl -i -X POST http://localhost:8080/auth/login   -H "Content-Type: application/json"   -d '{"email":"alice@example.com","password":"password123"}'

## Create Post
curl -i -X POST http://localhost:8080/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "image_path": "/demo/test.jpg",
    "caption": "Evening walk",
    "location": "Tokyo",
    "camera_body": "Sony A7 IV",
    "lens": "35mm F1.8"
  }'

## Get Post
curl -i http://localhost:8080/posts/{id}

## Update Post
curl -i -X PUT http://localhost:8080/posts/5 \
-H "Authorization: Bearer YOUR_TOKEN_HERE" \
-H "Content-Type: application/json" \
-d '{
  "caption": "Updated caption",
  "location": "Tokyo",
  "camera_body": "Sony A7 III",
  "lens": "35mm F1.8"
}'

## Upload Image
curl -i -X POST http://localhost:8080/uploads/images   -F "image=@testfiles/building.jpg" -H "Authorization: Bearer YOUR_TOKEN_HERE"

## Example Token
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzcxMTY1NzUsImlhdCI6MTc3NzAzMDE3NSwidXNlcl9pZCI6MX0.91BUH1UI0iSduPdxZ4iZruaMCHco4xtZVRrnGQuaZhw


# Frontend
## Login using dev console
localStorage.setItem("auth_token", "test-token");
localStorage.setItem(
  "auth_user",
  JSON.stringify({ id: 1, username: "alice", email: "alice@example.com" })
);
window.dispatchEvent(new Event("auth_changed"));