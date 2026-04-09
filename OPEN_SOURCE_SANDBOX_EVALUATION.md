# Open Source Sandbox Evaluation

## Goal

We want an on-prem execution service for moderately risky, agent-generated Python code with these requirements:

- External systems can call it over an API.
- Each execution can read and write files in a per-session workspace.
- Session files live in MinIO and are copied into the sandbox before execution.
- Changed and newly created files are copied back to MinIO after execution.
- Network access must be disabled by default and selectively allowed to approved destinations.
- The initial version should run locally on a MacBook M4 with 24 GB RAM.
- The design should later migrate cleanly to Linux production infrastructure.

## What We Learned

The main takeaway is that "code execution API" products and "workspace-oriented sandbox service" products are not the same thing.

Many open source projects can execute code safely enough for short-lived snippet execution, but they do not naturally model:

- per-session workspaces
- bidirectional file sync
- controlled outbound networking
- a clean artifact export story

That means we likely need our own service, even if we reuse containers or sandbox primitives underneath.

## Evaluated Options

### Judge0

#### Why it looked promising

- Mature, well-known open source code execution API
- Self-hostable
- Supports resource limits
- Accepts additional files as part of a submission

#### Why it does not fit well

- Its core abstraction is "submit code and get execution output back," not "mount a mutable workspace and sync file changes back out."
- It supports sending files in, but it is not a natural fit for returning a changed workspace after execution.
- Network access is closer to an on/off capability than a first-class outbound allowlist model.
- Our service would still need a significant wrapper for MinIO sync, workspace lifecycle, artifact extraction, and policy enforcement.

#### Verdict

Good execution engine for online-judge style workloads. Poor fit for our session workspace model.

### Piston

#### Why it looked promising

- Lightweight self-hosted execution API
- Simpler than Judge0
- Supports uploaded files
- Easier to reason about as an embeddable execution component

#### Why it does not fit well

- Similar to Judge0, it is optimized for "run this code" rather than "host a mutable analyst workspace."
- It does not give us a strong built-in session/filesystem model.
- We would still need to build most of the file staging, workspace export, and network policy layers ourselves.
- If we are already building those layers, there is less value in centering the system around Piston.

#### Verdict

A decent low-level execution API, but not a strong fit for a file-heavy analyst sandbox service.

### Daytona

#### Why it looked promising

- Very good developer sandbox experience
- Good file APIs and sandbox abstractions
- Supports network allowlist features
- Designed with AI/agent workflows in mind

#### Why it does not fit well

- Our requirement is on-prem and fully under our control.
- Daytona supports customer-managed compute, but its control plane is not positioned as a fully self-hosted open source on-prem platform in the way we need.
- For this project, we want to own the full execution service, policy layer, and runtime lifecycle.

#### Verdict

Feature-wise it aligns well, but the deployment model does not fit a fully self-hosted requirement.

### Zeroboot

#### Why it looked promising

- Very strong isolation story using KVM-backed forked VMs
- Extremely attractive latency claims
- Self-hostable
- Interesting future-facing foundation for sandbox execution

#### Why it does not fit well

- The project describes itself as a working prototype and not production-hardened.
- Its API is intentionally minimal.
- It is not naturally shaped around our file synchronization workflow.
- Its documented networking model is restrictive enough that it conflicts with our need for selective outbound access.
- It is Linux/KVM-oriented, so it is not a convenient local development path on macOS.

#### Verdict

Very promising execution substrate, but too early and too mismatched for the current workspace-and-network requirements.

### Dify Sandbox

#### Why it looked promising

- Built around agent-oriented code execution
- Stronger sandbox flavor than generic execution APIs
- Multi-tenant and security-conscious positioning

#### Why it does not fit well

- It is better understood as a sandbox component than as a ready-made service matching our exact workflow.
- We would still need to build the surrounding system for session workspaces, MinIO synchronization, file export, and network policies.
- It does not clearly reduce enough of the system design burden compared with directly building on containers.

#### Verdict

Interesting component, but not enough of a complete fit to justify adopting it as the core of the system.

### Microsandbox

#### Why it looked promising

- Runs on macOS Apple Silicon and Linux
- Uses microVM isolation rather than plain containers
- Has SDKs, a CLI, and persistent sandbox handles
- Supports long-running sandboxes and persistent state between executions
- Supports filesystem access and documented volume mounts
- Fits AI-agent workflows well

#### Why it is interesting for our use case

- It is one of the few options that is both local-first and macOS-friendly.
- Its support for named sandboxes, filesystem access, bind mounts, and named volumes maps very well to a session workspace model.
- Its network model is richer than we first thought, with configurable policies, custom rules, DNS protections, and secret-aware host allowlists.
- Its persistent handles and detached lifecycle are much closer to a reusable service substrate than a simple "run code" library.

#### Why it does not become an automatic choice

- The project explicitly describes itself as beta software with rough edges and breaking changes.
- There is no real Python SDK yet, so adopting it cleanly pushes us toward a TypeScript or Rust service, or toward wrapping the CLI.
- It is a broader sandbox platform than we strictly need for v1, so some of its surface area may become extra operational complexity.

#### Verdict

After reading the codebase, this is the strongest long-term substrate for our service if we are willing to build the control plane in TypeScript or Rust instead of Python.

### exec-sandbox

#### Why it looked promising

- Runs on macOS and Linux
- Uses QEMU microVMs with HVF on macOS and KVM on Linux
- Designed for running untrusted code locally without a cloud dependency
- Provides a Python library that we can wrap with our own service
- Supports sessions, file upload and download, snapshots, and warm pools
- Explicitly documents network enablement with domain allowlists

#### Why it fits our use case well

- It is a strong match for the Mac-first development requirement.
- It is already shaped around code execution for AI-style workloads.
- The documented upload and download flow maps well to staging files in and out of a sandbox.
- Sessions and snapshot caching give us a path to better latency later.
- It has a much better Python integration story than microsandbox today.

#### What it still does not solve for us

- It is a library and execution substrate, not a complete multi-tenant service.
- We still need to build the API layer, MinIO synchronization logic, job tracking, and policy model.
- Its writable filesystem is guest-local, so large analyst workspaces may need careful memory sizing and operational testing.
- Its network policy model is narrower than microsandbox's richer rule-based system.
- The local git history shows it is still heavily concentrated around a single maintainer.

#### Verdict

Very strong Python-first option and probably the fastest way to get a prototype running. It is no longer the preferred long-term foundation, but it remains the best fallback if we decide Python ergonomics matter more than platform breadth.

### CodeJail

#### Why it looked promising

- Python-focused
- Relevant because we plan to use a restricted Python executor
- Useful as a defense-in-depth layer for untrusted Python

#### Why it does not fit well as the primary sandbox

- It is better as an inner Python safety layer than as the main isolation boundary.
- Its isolation model is weaker than container- or VM-based sandboxing for our service.
- It does not solve the broader service concerns around workspace lifecycle, networking, and file synchronization.

#### Verdict

Useful as an optional inner layer, but not sufficient as the core sandbox service.

### Jupyter Enterprise Gateway

#### Why it looked promising

- Strong fit for persistent notebook-like analyst sessions
- Remote kernel model maps well to longer-lived analysis workflows
- Good if we wanted stateful, interactive execution

#### Why it does not fit well right now

- It introduces notebook/kernel semantics that are broader than our first version needs.
- It is heavier operationally than a simple execution service.
- Our first version is better served by job/session sandboxes with a simpler API surface.

#### Verdict

Worth revisiting if we later want long-lived stateful analysis sessions, but too heavy for v1.

### Shared Long-Lived Container With Multiple Python Processes

#### Why it looked promising

- Lowest startup latency
- Simple to prototype
- Easy to keep warm

#### Why it does not fit well

- It is a weak isolation model between executions.
- Jobs can interfere with each other through shared filesystem state, process pressure, memory pressure, or leaked state.
- It becomes difficult to reason about cleanup, session separation, and cross-run contamination.
- Once we add mutable files and selective network access, a shared sandbox becomes harder to secure correctly.

#### Verdict

Not acceptable as the main isolation boundary, even for a personal-first system that may later be deployed more broadly.

## Remaining Viable Direction

The remaining viable direction is:

- build our own API/service layer
- run one ephemeral sandbox per job
- stage files into a per-job workspace
- sync changed files back to MinIO
- enforce outbound access outside the Python process itself

The most promising execution backends for local development on macOS are now:

- `microsandbox` as the preferred backend
- `exec-sandbox` as the Python-first fallback
- Docker Desktop with one fresh container per job as a fallback baseline

For later Linux production deployment, the cleanest upgrade path is:

- `microsandbox` on Linux if the local-first approach works well
- `exec-sandbox` on Linux with KVM if we choose the Python-first path
- or Docker or containerd plus gVisor if we want a container-native deployment model
- or Kubernetes plus gVisor if we need stronger scheduling and policy control

## Decision

We will build our own execution service.

The current preferred v1 execution substrate is `microsandbox`, because it is:

- macOS-friendly
- self-hosted
- microVM-based
- richer in lifecycle, volume, and network policy primitives
- better aligned with a workspace-oriented service model

`exec-sandbox` remains a strong alternative, especially if we decide that building the service in Python is more important than using the broader sandbox platform.

Docker remains the fallback option if we need a simpler baseline or hit limitations in the VM-based options.

This gives us:

- a workspace model that matches the MinIO session design
- enough isolation for moderately risky code
- a manageable local development experience
- a clean path to stronger runtime isolation later
