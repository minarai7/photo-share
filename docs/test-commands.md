# Signup
curl -i -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'

# Login
curl -i -X POST http://localhost:8080/auth/login   -H "Content-Type: application/json"   -d '{"email":"alice@example.com","password":"password123"}'

# Create Post
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

# Get Post
curl -i http://localhost:8080/posts/{id}