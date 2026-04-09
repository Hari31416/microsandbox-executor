set shell := ["zsh", "-cu"]

infra-up:
  docker compose up -d minio minio-setup

infra-down:
  docker compose down

infra-logs:
  docker compose logs -f minio

install-service:
  cd service && bun install

install-demo:
  cd demo/server && bun install
  cd demo/web && bun install

sandbox-dev:
  cd service && bun run dev

sandbox-stop:
  -kill $(lsof -ti tcp:3000)

demo-api-dev:
  cd demo/server && bun run dev

demo-api-stop:
  -kill $(lsof -ti tcp:8787)

frontend-dev:
  cd demo/web && bun run dev

frontend-stop:
  -kill $(lsof -ti tcp:5173)
