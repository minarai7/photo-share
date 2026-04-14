package middleware

import (
	"encoding/json"
	"log"
	"net/http"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic recovered: %v", err)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				response := map[string]string{
					"error": "internal server error",
				}
				_ = json.NewEncoder(w).Encode(response)
			}
		}()

		next.ServeHTTP(w, r)
	})
}
