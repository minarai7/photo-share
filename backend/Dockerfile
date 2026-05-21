# syntax=docker/dockerfile:1

FROM golang:1.26.1-bookworm AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/server ./server
COPY migrations ./migrations

RUN mkdir -p storage/uploads

EXPOSE 8080

CMD ["./server"]
