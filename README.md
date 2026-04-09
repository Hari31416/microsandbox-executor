# Sandbox Executor Service

Self-hosted execution service for moderately risky, agent-generated Python code.

This repository contains:

- a production-oriented implementation plan in `implementation_plan.md`
- a TypeScript HTTP executor service in `service/`
- a local checkout of `microsandbox/` used as the sandbox runtime substrate

## What This Builds

The system executes Python jobs in an isolated sandbox with:

- per-session workspaces
- MinIO-backed file persistence
- one fresh sandbox per job
- network disabled by default
- optional allowlisted outbound networking
- runtime abstraction so sandbox backend can be swapped later

Primary architecture:

- Control plane: TypeScript HTTP service
- Runtime: `microsandbox` (default), Docker adapter placeholder for fallback
- Session state: MinIO object storage

## Status

The `service/` project already includes:

- Fastify server and route wiring
- `POST /v1/execute`, `GET /v1/jobs/:jobId`, and `GET /v1/health`
- runtime adapter interface and `MicrosandboxRuntime` implementation
- MinIO session download/upload support
- workspace manifest diffing for changed/new files
- restricted Python wrapper (defense-in-depth)

## Repository Layout

```text
.
├── implementation_plan.md
├── OPEN_SOURCE_SANDBOX_EVALUATION.md
├── microsandbox/
└── service/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── server.ts
    │   ├── app.ts
    │   ├── config.ts
    │   ├── routes/
    │   ├── runtime/
    │   ├── jobs/
    │   ├── storage/
    │   ├── policy/
    │   └── util/
    └── tests/
```

## API Overview

### POST /v1/execute

Runs a Python job synchronously and returns execution output.

Request body example:

```json
{
  "session_id": "sess_123",
  "job_id": "job_456",
  "code": "print('hello')",
  "entrypoint": "main.py",
  "timeout_seconds": 60,
  "cpu_limit": 1,
  "memory_mb": 2048,
  "network_mode": "none",
  "allowed_hosts": [],
  "environment": {
    "PYTHONUNBUFFERED": "1"
  },
  "restricted_exec": true
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
  "files_uploaded": ["analysis/output.txt"],
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
- MinIO probe details

## Execution Flow

For each execution request:

1. Validate input and create/find job ID.
2. Create local workspace at `/tmp/agent-sandbox/<session>/<job>/workspace`.
3. Download existing session files from MinIO.
4. Capture pre-run workspace manifest.
5. Write user code (and optional restricted runner).
6. Start a fresh sandbox with workspace bind mount.
7. Execute Python with timeout/resource/network controls.
8. Capture post-run manifest and diff changed/new files.
9. Upload changed/new files to MinIO.
10. Tear down sandbox and clean local scratch data.

## Security Model

- Isolation boundary: microVM sandbox runtime.
- Defense-in-depth: optional restricted Python import blocking layer.
- Network default: deny all (`network_mode: none`).
- Allowlist mode: explicit outbound host rules plus DNS, private-range, and metadata protections.

## Configuration

The service is configured through environment variables.

Core settings:

- `HOST` (default `0.0.0.0`)
- `PORT` (default `3000`)
- `LOG_LEVEL` (default `info`)
- `RUNTIME` (`microsandbox` or `docker`, default `microsandbox`)
- `MICROSANDBOX_IMAGE` (default `python:3.12`)
- `SCRATCH_ROOT` (default `/tmp/agent-sandbox`)
- `GUEST_WORKSPACE_PATH` (default `/workspace`)

Execution limits:

- `DEFAULT_TIMEOUT_SECONDS`, `MAX_TIMEOUT_SECONDS`
- `DEFAULT_CPU_LIMIT`, `MAX_CPU_LIMIT`
- `DEFAULT_MEMORY_MB`, `MAX_MEMORY_MB`

Restricted execution:

- `ENABLE_RESTRICTED_EXEC` (default `true`)
- `RESTRICTED_EXEC_BLOCKED_IMPORTS`

MinIO (optional, but required for persistent sessions):

- `MINIO_ENDPOINT`
- `MINIO_PORT` (default `9000`)
- `MINIO_USE_SSL` (default `false`)
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_REGION`
- `MINIO_SESSION_PREFIX` (default `sessions`)

When MinIO is not configured, the service still executes jobs, but session persistence is disabled.

## Local Development

Prerequisites:

- Node.js LTS
- `microsandbox` installed and working on host
- MinIO instance (optional for early local testing)

From the `service/` directory:

```bash
npm install
npm run dev
```

Other useful commands:

```bash
npm run check
npm run build
npm run test
```

## Example Request

```bash
curl -sS http://localhost:3000/v1/execute \
  -H 'content-type: application/json' \
  -d '{
    "session_id": "sess_demo",
    "code": "print(2 + 2)",
    "network_mode": "none"
  }'
```

## Design Principles

- Keep runtime logic behind a small adapter interface.
- Keep session state in MinIO, not in long-lived VMs.
- Prefer fresh sandbox per job for simpler cleanup and retries.
- Treat restricted Python controls as defense-in-depth, not the primary boundary.

## Roadmap

Planned next steps from `implementation_plan.md`:

1. harden runtime adapter behavior and Docker fallback
2. expand policy and integration test coverage
3. improve error/reporting surfaces
4. add optional thin Python client package
5. prepare Linux deployment profile

## Notes

- `DockerRuntime` currently exists as a stub and is not implemented.
- Job metadata is currently stored in memory; restart clears historical job records.
- v1 intentionally ignores deletion propagation from workspace back to MinIO.
