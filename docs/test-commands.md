# Signup
curl -i -X POST http://localhost:8080/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'

# Login
curl -i -X POST http://localhost:8080/auth/login   -H "Content-Type: application/json"   -d '{"email":"alice@example.com","password":"password123"}'