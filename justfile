set shell := ["zsh", "-cu"]
set dotenv-load := true

infra-up:
  docker compose -f demo/docker-compose.yml up -d minio minio-setup

infra-down:
  docker compose -f demo/docker-compose.yml down

infra-logs:
  docker compose -f demo/docker-compose.yml logs -f minio

sandbox-build:
  docker compose --env-file service/.env.docker -f service/docker-compose.yml build sandbox-server

sandbox-up:
  docker compose --env-file service/.env.docker -f service/docker-compose.yml up -d sandbox-server

sandbox-down:
  docker compose --env-file service/.env.docker -f service/docker-compose.yml down

sandbox-logs:
  docker compose --env-file service/.env.docker -f service/docker-compose.yml logs -f sandbox-server

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

build-data-science-image image="sandbox-data-science:py312-v1":
  docker build --platform linux/arm64 -t {{image}} images/data-science-runtime

test-data-science-image image="sandbox-data-science:py312-v1":
  docker run --rm --platform linux/arm64 {{image}} python3 -c "import numpy, pandas, matplotlib, seaborn, sklearn, plotly, scipy, openpyxl; print('data-science runtime ok')"

publish-data-science-image image:
  docker buildx build --platform linux/amd64,linux/arm64 -t {{image}} --push images/data-science-runtime
