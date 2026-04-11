set shell := ["zsh", "-cu"]

demo-build:
  env_file=demo/.env.docker; if [[ ! -f "$env_file" ]]; then env_file=demo/.env.docker.example; fi; docker compose --env-file "$env_file" -f demo/docker-compose.yml build demo-api demo-web

demo-up:
  env_file=demo/.env.docker; if [[ ! -f "$env_file" ]]; then env_file=demo/.env.docker.example; fi; docker compose --env-file "$env_file" -f demo/docker-compose.yml up -d demo-api demo-web

demo-down:
  env_file=demo/.env.docker; if [[ ! -f "$env_file" ]]; then env_file=demo/.env.docker.example; fi; docker compose --env-file "$env_file" -f demo/docker-compose.yml down

demo-logs:
  env_file=demo/.env.docker; if [[ ! -f "$env_file" ]]; then env_file=demo/.env.docker.example; fi; docker compose --env-file "$env_file" -f demo/docker-compose.yml logs -f demo-api demo-web

sandbox-build:
  cd service && bun run build

sandbox-up:
  mkdir -p .run
  if [[ -f .run/sandbox.pid ]] && kill -0 "$(cat .run/sandbox.pid)" 2>/dev/null; then \
    echo "Sandbox service is already running (pid $(cat .run/sandbox.pid))"; \
  else \
    (cd service && nohup bun run dev > ../.run/sandbox.log 2>&1 & echo $! > ../.run/sandbox.pid); \
    echo "Started sandbox service (pid $(cat .run/sandbox.pid))"; \
    echo "Logs: .run/sandbox.log"; \
  fi

sandbox-down:
  if [[ -f .run/sandbox.pid ]]; then \
    pid="$(cat .run/sandbox.pid)"; \
    if kill -0 "$pid" 2>/dev/null; then \
      kill "$pid"; \
      echo "Stopped sandbox service (pid $pid)"; \
    else \
      echo "Sandbox service is not running"; \
    fi; \
    rm -f .run/sandbox.pid; \
  else \
    echo "Sandbox service is not running"; \
  fi

sandbox-logs:
  if [[ -f .run/sandbox.log ]]; then \
    tail -f .run/sandbox.log; \
  else \
    echo "No sandbox log file found at .run/sandbox.log"; \
  fi

build-data-science-image image="sandbox-data-science:py312-v1":
  docker build --platform linux/arm64 -t {{image}} images/data-science-runtime

test-data-science-image image="sandbox-data-science:py312-v1":
  docker run --rm --platform linux/arm64 {{image}} python3 -c "import numpy, pandas, matplotlib, seaborn, sklearn, plotly, scipy, openpyxl; print('data-science runtime ok')"

publish-data-science-image image:
  docker buildx build --platform linux/amd64,linux/arm64 -t {{image}} --push images/data-science-runtime
