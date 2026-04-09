# Sandbox Executor Service

Self-hosted execution service for moderately risky, agent-generated Python code.

This repository contains:

- the executor service in `service/`
- a thin Python client in `python-client/`
- a demo app in `demo/`
- local infra helpers in `docker-compose.yml` and `justfile`
- a local checkout of `microsandbox/`, which is the default sandbox runtime

## What This Builds

The system executes Python jobs in a fresh sandbox with:

- per-job temporary workspaces
- S3-compatible file staging and persistence
- network disabled by default
- optional allowlisted outbound networking
- runtime profiles, including a custom data-science image
- one fresh microVM per job

Primary architecture:

- Control plane: TypeScript HTTP service
- Runtime: `microsandbox` by default
- Storage: S3-compatible object storage

## How Microsandbox Fits In

`microsandbox` is the isolation layer that actually runs user code.

Execution flow:

1. The service accepts `POST /v1/execute`.
2. It creates a host workspace under `/tmp/agent-sandbox/<session>/<job>/workspace`.
3. It downloads the requested `file_paths` from S3-compatible storage into that workspace.
4. It writes the submitted Python code into the workspace entrypoint.
5. It starts a fresh Microsandbox microVM from the selected OCI image.
6. It bind-mounts the host workspace into the guest at `/workspace`.
7. It runs `python3 <entrypoint>` inside the guest.
8. It diffs the workspace afterward and uploads changed files back to object storage.
9. It stops the microVM and deletes the temporary host workspace.

Important distinction:

- Microsandbox uses OCI images like `python:3.12` or `hari31416/sandbox-data-science:py312-v1`
- it does **not** use the Docker daemon to execute jobs
- it runs code in a short-lived microVM, not a normal Docker container

## Does It Require Docker?

For sandbox execution: no.

If Microsandbox is installed and working on the host, the service can run jobs without Docker Desktop or the Docker daemon.

Docker is still used in this repository for:

- building and pushing custom OCI images
- running local demo infrastructure like MinIO

So the split is:

- Microsandbox execution: no Docker required
- local image build/push and demo infra: Docker required in this repo

## Runtime Requirements

To run the executor service, you need:

- Node.js
- service dependencies installed in `service/`
- the Microsandbox runtime installed and usable on the host
- a supported host platform for Microsandbox
- access to the OCI image you want to run, unless it is already cached

If you want file staging and persistence, you also need:

- an S3-compatible object store
- valid S3 credentials and bucket configuration

If you want to run the included demo app, you additionally need:

- the demo server/frontend dependencies
- local object storage such as MinIO
- Docker, because the provided demo infra uses `docker compose`

## Repository Layout

```text
.
├── demo/
├── docker-compose.yml
├── images/
│   └── data-science-runtime/
├── implementation_plan.md
├── microsandbox/
├── python-client/
├── service/
└── justfile
```

## API Overview

### POST /v1/execute

Runs a Python job synchronously and returns execution output.

Request body example:

```json
{
  "session_id": "sess_123",
  "file_paths": ["demo/sess_123/inputs/data.csv"],
  "job_id": "job_456",
  "code": "print('hello')",
  "entrypoint": "demo/sess_123/scripts/main.py",
  "python_profile": "data-science",
  "timeout_seconds": 60,
  "cpu_limit": 1,
  "memory_mb": 2048,
  "network_mode": "none",
  "allowed_hosts": [],
  "environment": {
    "PYTHONUNBUFFERED": "1"
  },
  "restricted_exec": false
}
```

Response example:

```json
{
  "job_id": "job_456",
  "session_id": "sess_123",
  "status": "completed",
  "exit_code": 0,
  "stdout": "hello\n",
  "stderr": "",
  "duration_ms": 420,
  "files_uploaded": ["demo/sess_123/outputs/result.txt"],
  "created_at": "2026-04-09T10:00:00.000Z",
  "started_at": "2026-04-09T10:00:00.050Z",
  "completed_at": "2026-04-09T10:00:00.470Z"
}
```

### GET /v1/jobs/:jobId

Returns the in-memory job record for the given job ID.

### GET /v1/health

Returns runtime and storage health:

- overall status (`ok` or `degraded`)
- runtime probe details
- storage probe details

## Execution Flow

For each execution request:

1. Validate input and create a job ID.
2. Create a local workspace at `/tmp/agent-sandbox/<session>/<job>/workspace`.
3. Download requested `file_paths` from object storage.
4. Capture a pre-run workspace manifest.
5. Write user code and optional restricted runner.
6. Start a fresh sandbox with the workspace bind-mounted at `/workspace`.
7. Execute Python with timeout, CPU, memory, and network controls.
8. Capture a post-run manifest and diff changed/new files.
9. Upload changed/new files back to object storage.
10. Tear down the sandbox and clean the local scratch workspace.

## Security Model

- Primary isolation boundary: Microsandbox microVM
- Defense-in-depth: optional restricted Python import shim
- Network default: deny all (`network_mode: none`)
- Resource controls: timeout, CPU, and memory limits

Current recommendation:

- rely on the microVM as the main safety boundary
- keep restricted execution disabled by default for compatibility with real Python libraries like `pandas`
- enable `restricted_exec` only for specific workloads if you need the extra policy layer

## Configuration

The service loads config from the repo root `.env` by default, with `ENV_FILE=/path/to/file` as an override.

Core settings:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `3000`)
- `LOG_LEVEL` (default `info`)
- `MICROSANDBOX_IMAGE` (default `python:3.12`)
- `MICROSANDBOX_IMAGE_DATA_SCIENCE` (default `hari31416/sandbox-data-science:py312-v1`)
- `SCRATCH_ROOT` (default `/tmp/agent-sandbox`)
- `GUEST_WORKSPACE_PATH` (default `/workspace`)

Execution limits:

- `DEFAULT_TIMEOUT_SECONDS`, `MAX_TIMEOUT_SECONDS`
- `DEFAULT_CPU_LIMIT`, `MAX_CPU_LIMIT`
- `DEFAULT_MEMORY_MB`, `MAX_MEMORY_MB`

Restricted execution:

- `ENABLE_RESTRICTED_EXEC` (default `false`)
- `RESTRICTED_EXEC_BLOCKED_IMPORTS`

S3-compatible storage:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

When S3 is not configured, the service still executes jobs, but file staging/persistence is disabled.

## Python Profiles

The executor currently supports:

- `default`: base Python image
- `data-science`: custom image with:
  `numpy`, `pandas`, `matplotlib`, `seaborn`, `scikit-learn`, `plotly`, `scipy`, and `openpyxl`

The custom image definition lives in:

- `images/data-science-runtime/Dockerfile`
- `images/data-science-runtime/requirements.txt`

Published image:

- `hari31416/sandbox-data-science:py312-v1`

## Integrating With Agents

This service is designed to sit behind an agent that generates Python code, such as an LLM-powered data analyst.

A typical integration looks like this:

1. Your application stores user-provided files in S3-compatible object storage.
2. Your agent inspects the task, chooses relevant input files, and generates Python code.
3. Your application calls `POST /v1/execute` with:
   - a stable `session_id`
   - the bucket-relative `file_paths` the code should be able to read
   - an `entrypoint` path where the generated script should live
   - the generated Python `code`
   - an appropriate `python_profile`, usually `data-science` for analyst workloads
4. The sandbox service stages those files into `/workspace`, runs the code in a fresh microVM, and uploads changed output files back to object storage.
5. Your application reads `stdout`, `stderr`, `files_uploaded`, and `exit_code` from the response, then feeds that back into the agent for the next step.

For an LLM-powered data analyst, the common loop is:

- upload raw inputs like CSV, Excel, or JSON files
- ask the model to write analysis or transformation code
- execute that code through the sandbox service
- show stdout, charts, and generated artifacts to the user
- let the model revise the code using the previous run result

Good integration practices:

- reuse the same `session_id` across related runs so the agent can build on prior outputs
- keep `network_mode` as `none` unless the task genuinely needs external access
- choose `data-science` when the agent needs `pandas`, `matplotlib`, `seaborn`, `plotly`, or `scikit-learn`
- treat `stdout` and uploaded files as part of the agent's working memory
- persist the script itself under a predictable path like `projects/<task>/scripts/main.py` so retries are reproducible

Minimal Python client example:

```python
from sandbox_executor_client import SandboxExecutorClient, ExecuteRequest

client = SandboxExecutorClient("http://127.0.0.1:3000")

result = client.execute(
    ExecuteRequest(
        session_id="analysis-123",
        file_paths=[
            "projects/analysis-123/inputs/customers.csv",
        ],
        entrypoint="projects/analysis-123/scripts/main.py",
        python_profile="data-science",
        code="""
import pandas as pd

df = pd.read_csv("projects/analysis-123/inputs/customers.csv")
print(df.head())
df.describe(include="all").to_csv("projects/analysis-123/outputs/summary.csv")
""",
        network_mode="none",
    )
)

print(result.exit_code)
print(result.stdout)
print(result.files_uploaded)
```

## Local Development

Install dependencies:

```bash
just install-service
just install-demo
```

Run the executor service:

```bash
just sandbox-dev
```

Run demo infrastructure:

```bash
just infra-up
just demo-api-dev
just frontend-dev
```

Useful service commands:

```bash
cd service
bun run check
bun run build
bun run test
```

## Custom Image Commands

Build the local data-science image:

```bash
just build-data-science-image
```

Smoke-test the image:

```bash
just test-data-science-image
```

Publish a tag:

```bash
just publish-data-science-image hari31416/sandbox-data-science:py312-v1
```

## Example Request

```bash
curl -sS http://localhost:3000/v1/execute \
  -H 'content-type: application/json' \
  -d '{
    "session_id": "sess_demo",
    "file_paths": ["demo/sess_demo/inputs/data.csv"],
    "entrypoint": "demo/sess_demo/scripts/main.py",
    "python_profile": "data-science",
    "code": "import pandas as pd\nprint(pd.__version__)",
    "network_mode": "none"
  }'
```

## Design Principles

- Keep runtime logic behind a small adapter interface
- Keep persistent state in object storage, not long-lived VMs
- Prefer a fresh sandbox per job for simpler cleanup and retries
- Treat Python-level restrictions as defense-in-depth, not the primary boundary

## Notes

- job metadata is currently stored in memory, so restart clears historical job records
- deletion propagation from workspace back to object storage is intentionally not implemented in v1

## Acknowledgements

Special thanks to [superradcompany/microsandbox](https://github.com/superradcompany/microsandbox) for the microVM sandbox runtime that powers execution in this project.
