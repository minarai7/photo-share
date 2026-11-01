# syntax=docker/dockerfile:1

FROM golang:1.26.1-bookworm AS builder

WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# The runtime image has no shell, so prepare the uploads directory here.
RUN mkdir -p /out/storage/uploads

# Distroless static: only CA certificates, tzdata and /etc/passwd — no shell,
# package manager or libc. The server is a static binary (CGO_ENABLED=0).
# The :nonroot tag runs as UID/GID 65532.
FROM gcr.io/distroless/static-debian13:nonroot AS runtime

WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/migrations ./migrations
# Owned by the nonroot user so local storage (STORAGE_DRIVER=local) can write.
# A fresh named volume mounted here inherits this ownership.
COPY --from=builder --chown=65532:65532 /out/storage ./storage

EXPOSE 8080

CMD ["./server"]
