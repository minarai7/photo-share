package main

import (
	"encoding/json"
	"log"
	"net/http"

	"backend/internal/config"
)

func healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]string{
		"status": "ok",
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Println("failed to write response:", err)
	}
}

func main() {
	cfg := config.MustLoad()
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	addr := ":" + cfg.Port
	log.Println("server starting on", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
