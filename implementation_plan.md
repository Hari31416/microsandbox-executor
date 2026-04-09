# Sandbox Executor Service Implementation Plan

## Goal

Build a self-hosted execution service for moderately risky, agent-generated Python code with:

- per-session workspaces
- MinIO-backed file persistence
- isolated microVM execution
- network disabled by default
- allowlisted outbound networking when required
- a local-first development experience on macOS
- a clean path to later Linux deployment

This document is the final implementation plan for the system we will build.

## Final Architecture Decision

We will build a **separate TypeScript HTTP service** that depends on `microsandbox`.

We will **not** modify the `microsandbox` codebase directly unless we hit a real blocker.

We will **not** depend on a built-in HTTP API from `microsandbox`, because the project is designed as an embedded SDK/runtime rather than a standalone REST server.

The architecture will be:

- `microsandbox` as the sandbox runtime dependency
- our own TypeScript service as the control plane
- optional thin Python client wrapper for calling our HTTP API

## Why This Architecture

### Why `microsandbox`

After reviewing the codebase, `microsandbox` is the best long-term substrate for this use case because it provides:

- microVM isolation on macOS Apple Silicon and Linux
- persistent sandbox lifecycle primitives
- filesystem APIs
- bind mounts and named volumes
- richer network policy controls than most alternatives
- strong alignment with a workspace-oriented service model

### Why a separate service instead of modifying `microsandbox`

Keeping our service separate gives us:

- cleaner upgrades to new `microsandbox` versions
- less coupling to upstream internal code
- freedom to swap or add other runtimes later
- a cleaner boundary between sandbox runtime and product logic

### Why TypeScript for the service

`microsandbox` has a real Node SDK today and no real Python SDK yet.

That means the cleanest implementation path is:

- TypeScript service using the Node SDK directly

instead of:

- Python service wrapping a CLI as the primary integration path

### Why keep Python in the picture

Much of the surrounding agent system may still be Python-based.

So we will expose a stable HTTP API and optionally provide:

- a thin Python client

This gives us Python ergonomics without forcing the runtime integration to be Python-native.

## System Overview

The service accepts execution requests from external callers.

Each request:

1. identifies a logical `session_id`
2. fetches the current session files from MinIO
3. stages them into a local workspace
4. creates a fresh sandbox
5. makes the workspace available inside the sandbox
6. writes the submitted Python code into the workspace
7. executes the code
8. captures stdout, stderr, exit status, and metadata
9. detects changed and new files
10. uploads those files back to MinIO
11. destroys the sandbox

## Core Design Principles

- One fresh sandbox per job
- Session persistence in MinIO, not in the runtime
- Runtime abstraction from day one
- Network disabled by default
- Allowlisted networking enforced outside the Python code itself
- Restricted Python executor used as defense-in-depth, not the primary boundary
- Keep v1 intentionally simple and personal-use friendly

## Scope

### In Scope

- Python-only code execution
- HTTP API for external callers
- Per-session workspace staging from MinIO
- File writes back to MinIO after execution
- Timeout, memory, and CPU controls
- Allowlisted outbound network policy
- Local development on macOS

### Out of Scope For V1

- Multi-language support
- Interactive notebook semantics
- Browser-based terminals
- GPU execution
- Multi-region deployment
- Billing or quota accounting
- Dynamic package installation during user execution

## Repository Strategy

We will create a **new project** in this repo root for the executor service.

It will depend on `microsandbox` as a package dependency.

During local development we can use:

- a local path dependency to the checked-out `microsandbox` repo

Later we should pin to:

- a released version
- or an exact git commit

We should also isolate all runtime-specific logic behind a small adapter interface so the rest of our code does not directly depend on `microsandbox`.

## Proposed Project Structure

```text
.
├── implementation_plan.md
├── OPEN_SOURCE_SANDBOX_EVALUATION.md
├── service/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── server.ts
│   │   ├── app.ts
│   │   ├── config.ts
│   │   ├── routes/
│   │   │   ├── execute.ts
│   │   │   ├── jobs.ts
│   │   │   └── health.ts
│   │   ├── runtime/
│   │   │   ├── types.ts
│   │   │   ├── microsandbox_runtime.ts
│   │   │   └── docker_runtime.ts
│   │   ├── jobs/
│   │   │   ├── executor.ts
│   │   │   ├── models.ts
│   │   │   ├── queue.ts
│   │   │   └── manifests.ts
│   │   ├── storage/
│   │   │   ├── minio.ts
│   │   │   ├── workspace.ts
│   │   │   └── sync.ts
│   │   ├── policy/
│   │   │   ├── network.ts
│   │   │   └── restricted_exec.ts
│   │   └── util/
│   │       ├── fs.ts
│   │       ├── logging.ts
│   │       └── ids.ts
│   └── tests/
│       ├── unit/
│       └── integration/
└── python-client/
    ├── pyproject.toml
    └── sandbox_executor_client/
        ├── __init__.py
        ├── client.py
        └── models.py
```

The `python-client/` package is optional and can be added after the service is functional.

## Main Components

### 1. HTTP API Service

The TypeScript service will expose the public API.

Recommended stack:

- Node.js
- TypeScript
- Fastify
- Zod for request validation

Responsibilities:

- validate requests
- authenticate callers if needed
- create job records
- trigger execution
- return results or job status

### 2. Runtime Adapter Layer

The runtime adapter is the most important design choice.

The rest of the system should never directly depend on `microsandbox`.

Instead, define an interface like:

```ts
interface SandboxRuntime {
  executeJob(input: RuntimeJobInput): Promise<RuntimeJobResult>;
}
```

Initial implementation:

- `MicrosandboxRuntime`

Possible future implementations:

- `ExecSandboxRuntime`
- `DockerRuntime`

This protects us from lock-in and keeps the control plane clean.

### 3. Job Executor

The job executor orchestrates a single run end to end.

Responsibilities:

- create local scratch workspace
- download session files from MinIO
- create sandbox
- attach workspace to sandbox
- write code into workspace
- run code
- collect result
- diff workspace
- upload changed and new files back to MinIO
- clean up

### 4. MinIO Sync Layer

Responsibilities:

- download `sessions/{session_id}/...` into the local workspace
- upload changed and new files after execution
- optionally track deletion support in a later version

### 5. Network Policy Mapper

Responsibilities:

- map API-level allowlist requests into `microsandbox` network config
- default to no network
- support explicit outbound rules
- keep this logic separate from request parsing

### 6. Restricted Execution Layer

Responsibilities:

- wrap submitted Python with your restricted executor
- block dangerous imports or builtins if desired
- provide defense-in-depth

This layer should not be treated as the main isolation boundary.

## Runtime Model

### Preferred v1 Runtime

- `microsandbox`

### Fallback Runtime

- `exec-sandbox`

### Last-resort Fallback

- Docker Desktop

The runtime choice should be hidden behind the runtime adapter interface.

## Workspace Model

Each request references a `session_id`.

The session is a storage namespace in MinIO, not a long-running VM.

For each job:

1. create `/tmp/agent-sandbox/<session_id>/<job_id>/workspace`
2. sync current session files from MinIO into the workspace
3. create an entrypoint file such as `main.py`
4. make the workspace available to the sandbox
5. execute code
6. diff workspace against a pre-run manifest
7. upload changed and new files back to MinIO
8. delete local scratch data

### Why not persistent sandboxes for v1

Even though `microsandbox` supports long-running sandboxes, v1 should prefer fresh per-job sandboxes because:

- cleanup is simpler
- failures are easier to reason about
- retries are simpler
- session state is already modeled in MinIO

We can revisit long-lived session sandboxes later.

## How We Will Use `microsandbox`

### Preferred file model

For your use case, the best `microsandbox` integration path is:

- use a local workspace directory per job
- bind-mount it into the guest

Why:

- it fits the MinIO sync model naturally
- it is faster than pushing many files through the filesystem API
- it keeps changed-file detection straightforward on the host side

### When to use filesystem API instead

Use the `microsandbox` filesystem API for:

- small ad-hoc file transfers
- diagnostics
- quick single-file injection

Do not use it as the primary path for large analyst workspaces.

### Network policy strategy

Default:

- no network

When allowlisted network is needed:

- map requested domains/IPs into `microsandbox` network rules
- keep deny-by-default behavior
- optionally enable DNS protections

### Secret handling

If future jobs need secrets, prefer `microsandbox`’s host-scoped secret model rather than passing raw secrets into the guest.

This is likely a v2 concern, not necessary for the first execution MVP.

## API Design

### `POST /v1/execute`

Primary endpoint for synchronous or semi-synchronous execution.

Example request:

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
  }
}
```

Example response:

```json
{
  "job_id": "job_456",
  "session_id": "sess_123",
  "status": "completed",
  "exit_code": 0,
  "stdout": "hello\n",
  "stderr": "",
  "duration_ms": 420,
  "files_uploaded": []
}
```

### `GET /v1/jobs/:job_id`

Used to fetch job status and metadata if we move to queued or asynchronous execution.

### `GET /v1/health`

Reports:

- service healthy
- MinIO connectivity
- runtime availability

## Execution Flow

### Step 1: Receive request

- validate payload
- generate IDs if needed
- create job record

### Step 2: Stage workspace

- create scratch directory
- download session files from MinIO
- capture before-manifest

### Step 3: Prepare code

- write submitted code to `main.py`
- optionally wrap it with restricted execution logic

### Step 4: Create sandbox

- configure CPU and memory
- configure workspace bind mount
- configure network policy
- start sandbox

### Step 5: Execute code

- run `python main.py`
- capture stdout and stderr
- enforce timeout

### Step 6: Collect changes

- capture after-manifest
- identify changed and new files
- upload to MinIO

### Step 7: Return result

- exit code
- stdout
- stderr
- duration
- uploaded files

### Step 8: Cleanup

- stop sandbox
- remove scratch workspace

## File Sync Strategy

### v1

Keep file sync simple:

- full session download before execution
- manifest-based changed/new file detection after execution
- upload changed/new files only

### Deletions

Defer deletion propagation unless it becomes necessary.

For v1:

- ignore deletions

Later:

- add delete markers or explicit deletion tracking

### Manifest contents

Each manifest should include:

- relative path
- kind
- size
- mtime
- optional hash for small files

## Local Development Plan

The first target environment is:

- MacBook M4
- 24 GB RAM
- Apple Silicon

Recommended local setup:

- Node.js current LTS
- `microsandbox` installed via npm dependency
- MinIO available locally or on your network
- 2-4 concurrent jobs max initially

Do not optimize for high concurrency yet.

## Production Direction

Later deployment can keep the same service architecture.

Likely production setup:

- Linux hosts
- same TypeScript HTTP service
- `microsandbox` on Linux
- same MinIO sync model
- same runtime abstraction

If needed later, we can still add:

- `exec-sandbox`
- Docker/gVisor
- Kubernetes

without rewriting the API shape.

## Risks

### Risk: `microsandbox` is still beta

Mitigation:

- keep a runtime abstraction
- pin exact dependency versions
- avoid depending on internal implementation details

### Risk: No Python SDK

Mitigation:

- use TypeScript for the service
- expose an HTTP API
- add a thin Python client package later

### Risk: Workspace sync performance

Mitigation:

- use bind-mounted workspace rather than ad-hoc file streaming for main data path
- keep full sync in v1
- optimize with incremental sync later

### Risk: Network policy mistakes

Mitigation:

- deny by default
- centralize policy mapping in one module
- add integration tests for blocked and allowed destinations

### Risk: Restricted executor overconfidence

Mitigation:

- treat it as defense-in-depth only
- rely on microVM isolation as the real boundary

## Recommended Initial Decisions

Commit to these now:

- build a new TypeScript HTTP service
- depend on `microsandbox`, do not patch it initially
- use bind-mounted local workspaces as the primary file path
- persist session state in MinIO
- use one fresh sandbox per job
- disable network by default
- support allowlisted network rules when required
- use runtime abstraction from the beginning
- add a thin Python client only after the service works

## Implementation Phases

### Phase 1: Service Skeleton

Deliver:

- Fastify app
- config loading
- health endpoint
- runtime interface

### Phase 2: `microsandbox` Runtime Adapter

Deliver:

- create sandbox
- run command
- stop sandbox
- bind mount workspace
- basic network config

### Phase 3: MinIO Workspace Flow

Deliver:

- download session files
- local scratch workspace
- upload changed/new files
- manifest diffing

### Phase 4: End-to-End Execution Endpoint

Deliver:

- `POST /v1/execute`
- stdout/stderr capture
- timeout handling
- result response

### Phase 5: Policy and Hardening

Deliver:

- restricted executor integration
- allowlisted network mapping
- better error handling
- integration tests

### Phase 6: Client Support

Deliver:

- thin Python client package

## First Build Steps

We should implement in this order:

1. scaffold the TypeScript service
2. add config and health route
3. define runtime interface
4. implement `MicrosandboxRuntime`
5. add local workspace management
6. add MinIO download/upload support
7. add manifest diffing
8. add `/v1/execute`
9. add network allowlist mapping
10. add restricted Python wrapper
11. add optional Python client

## Final Recommendation

We should build:

- a **TypeScript HTTP executor service**
- that **depends on `microsandbox`**
- and later optionally provide
- a **thin Python wrapper/client**

This is the best balance of:

- strong isolation
- clean architecture
- local usability on your Mac
- compatibility with your file workflow
- future deployment flexibility
