# Sandbox Executor Service

Self-hosted execution service for moderately risky, agent-generated Python code.

This repository contains:

- the executor service in `service/`
- a thin Python client in `python-client/`
- a demo app in `demo/`
- local run helpers in `justfile`
- a local checkout of `microsandbox/`, which is the default sandbox runtime

## What This Builds

The system executes Python jobs in a fresh sandbox with:

- per-session local file storage
- SQLite-backed session, file, job, and cleanup metadata
- per-job temporary workspaces
- network disabled by default
- optional allowlisted outbound networking
- runtime profiles, including a custom data-science image
- one fresh microVM per job

Primary architecture:

- Control plane: TypeScript HTTP service
- Runtime: `microsandbox` by default
- Persistent file storage: local filesystem
- Metadata store: SQLite

## Execution Model

The executor service owns the full file lifecycle:

1. Create a session with `POST /v1/sessions`.
2. Upload files with `POST /v1/sessions/:sessionId/files`.
3. Run code with `POST /v1/execute`.
4. List files with `GET /v1/sessions/:sessionId/files`.
5. Download artifacts with `GET /v1/sessions/:sessionId/files/*`.
6. Delete sessions with `DELETE /v1/sessions/:sessionId`.

During execution the service:

1. Creates a fresh workspace under `SCRATCH_ROOT/<session>/<job>/workspace`.
2. Copies the requested session files into that workspace.
3. Writes the submitted Python entrypoint into the workspace.
4. Starts a fresh Microsandbox microVM from the selected OCI image.
5. Bind-mounts the workspace into the guest at `/workspace`.
6. Runs `python3 <entrypoint>` inside the guest.
7. Diffs the workspace afterward and copies changed/new files back into the persistent session directory.
8. Updates SQLite metadata for jobs and session files.
9. Stops the microVM and deletes the temporary job workspace.

Sessions are cleaned up by:

- a built-in TTL cleanup loop
- an explicit `DELETE /v1/sessions/:sessionId` endpoint

## Does It Require Docker?

For sandbox execution: no.

If Microsandbox is installed and working on the host, the service can run jobs without Docker Desktop or the Docker daemon.

Docker is still used in this repository for:

- building and pushing custom OCI images
- running the demo API and demo web stack locally

## Runtime Requirements

To run the executor service, you need:

- Node.js
- service dependencies installed in `service/`
- the Microsandbox runtime installed and usable on the host
- a supported host platform for Microsandbox
- access to the OCI image you want to run, unless it is already cached
- writable local storage for session files and SQLite metadata

## Running Locally

Recommended local flow on macOS:

1. Start the sandbox service on the host:
   - `just sandbox-up`
2. Start the demo stack:
   - `just demo-up`
3. Open the demo:
   - `http://127.0.0.1:5173`

Useful commands:

- `just sandbox-build` builds the service TypeScript output
- `just sandbox-up` starts the executor on the host and writes logs to `.run/sandbox.log`
- `just sandbox-logs` tails `.run/sandbox.log`
- `just sandbox-down` stops the host-run executor
- `just demo-build` builds the demo containers
- `just demo-up` starts demo API and demo web
- `just demo-down` stops the demo containers
- `just demo-logs` tails demo API and frontend logs

## API Overview

### POST /v1/sessions

Creates a new session.

Response example:

```json
{
  "session_id": "sess_123",
  "created_at": "2026-04-11T10:00:00.000Z",
  "expires_at": "2026-04-12T10:00:00.000Z"
}
```

### POST /v1/sessions/:sessionId/files

Uploads one or more multipart files into a session.

Response example:

```json
{
  "session_id": "sess_123",
  "file_paths": ["input.csv"],
  "files": [
    {
      "path": "input.csv",
      "size": 128,
      "content_type": "text/csv",
      "updated_at": "2026-04-11T10:01:00.000Z"
    }
  ]
}
```

### GET /v1/sessions/:sessionId/files

Lists files currently stored in the session.

### GET /v1/sessions/:sessionId/files/*

Downloads a specific session file.

### DELETE /v1/sessions/:sessionId

Deletes the session and all associated files when no jobs are active.

### POST /v1/execute

Runs a Python job synchronously and returns execution output.

Request body example:

```json
{
  "session_id": "sess_123",
  "file_paths": ["input.csv"],
  "job_id": "job_456",
  "code": "print('hello')",
  "entrypoint": "main.py",
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

If `file_paths` is omitted, the service stages all current files in the session.

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
  "files_uploaded": ["main.py", "outputs/result.txt"],
  "created_at": "2026-04-11T10:00:00.000Z",
  "started_at": "2026-04-11T10:00:00.050Z",
  "completed_at": "2026-04-11T10:00:00.470Z"
}
```

### GET /v1/jobs/:jobId

Returns the persisted job record for the given job ID.

### GET /v1/health

Returns runtime, storage, and metadata health:

- overall status (`ok` or `degraded`)
- runtime probe details
- local storage probe details
- SQLite metadata probe details

## Configuration

The service loads config from the repo root `.env` by default, with `ENV_FILE=/path/to/file` as an override.

Useful environment variables:

- `SCRATCH_ROOT`
- `SESSION_STORAGE_ROOT`
- `SQLITE_DB_PATH`
- `SESSION_TTL_SECONDS`
- `SESSION_CLEANUP_INTERVAL_SECONDS`
- `MAX_UPLOAD_BYTES`
- `MAX_FILES_PER_UPLOAD`
- `MICROSANDBOX_IMAGE`
- `MICROSANDBOX_IMAGE_DATA_SCIENCE`

## Cleanup Behavior

The service does not rely on OS-level `/tmp` cleanup for correctness.

Cleanup rules:

- sessions are given a TTL when created or touched
- a background cleanup pass runs on startup and on a fixed interval
- expired sessions are deleted only when `active_job_count = 0`
- users can also delete sessions explicitly through the API

## Security Model

- Primary isolation boundary: Microsandbox microVM
- Defense-in-depth: optional restricted Python import shim
- Network default: deny all (`network_mode: none`)
- Resource controls: timeout, CPU, and memory limits

Current recommendation:

- rely on the microVM as the main safety boundary
- keep restricted execution disabled by default for compatibility with real Python libraries like `pandas`
- enable `restricted_exec` only for specific workloads if you need the extra policy layer
