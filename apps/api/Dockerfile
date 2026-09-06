# Ideaven API. Single-stage image: the Go toolchain and module source stay in
# the image on purpose — extension builds run `go run ./cmd/extbuild` at
# runtime, so the container needs go + source, not just the api binary.
FROM golang:1.25-alpine

WORKDIR /app

# Module cache layer first so source edits don't re-download dependencies.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go build -o /app/api ./cmd/api

# Runtime extension builds need a writable cache outside image layers.
ENV GOCACHE=/tmp/gocache
ENV CGO_ENABLED=0
ENV API_ADDR=:8080

EXPOSE 8080

CMD ["/app/api"]
