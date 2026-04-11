#!/usr/bin/env python3
"""
Live integration test for the SandboxExecutorClient.

Usage:
    uv run python live_test.py [BASE_URL]

    BASE_URL defaults to http://127.0.0.1:3000

Each step prints PASS / FAIL and a short description.
The script exits with code 0 on full success, 1 if anything failed.
"""
from __future__ import annotations

import sys
import textwrap
import time

from sandbox_executor_client import (
    ExecuteBashRequest,
    ExecuteRequest,
    SandboxExecutorClient,
    SandboxExecutorError,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
SKIP = "\033[33mSKIP\033[0m"

_results: list[tuple[str, bool]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    status = PASS if ok else FAIL
    suffix = f"  ({detail})" if detail else ""
    print(f"  [{status}] {label}{suffix}")
    _results.append((label, ok))


def section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def poll_job(client: SandboxExecutorClient, job_id: str, *, timeout: float = 30.0):
    """Poll until a job reaches a terminal state or timeout is exceeded."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get_job(job_id)
        if job.status in ("completed", "failed"):
            return job
        time.sleep(0.5)
    raise TimeoutError(f"Job {job_id!r} did not complete within {timeout}s")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
    print(f"\nLive test against: {base_url}")

    client = SandboxExecutorClient(base_url=base_url, timeout=30.0)
    session_id: str | None = None

    # ── 1. Health ────────────────────────────────────────────────────────────
    section("1 · Health check")
    try:
        health = client.health()
        check(
            "GET /v1/health returns ok status",
            health.status in ("ok", "degraded"),
            health.status,
        )
        check("runtime component present", health.runtime is not None)
        check("storage component present", health.storage is not None)
    except Exception as exc:
        check("health request succeeded", False, str(exc))
        print("\n  Cannot reach the service — aborting remaining tests.")
        return 1

    # ── 2. Create session ────────────────────────────────────────────────────
    section("2 · Create session")
    try:
        session = client.create_session()
        session_id = session.session_id
        check("session_id is non-empty", bool(session_id), session_id)
        check("created_at is present", bool(session.created_at))
        print(f"       session_id = {session_id}")
    except Exception as exc:
        check("create_session() succeeded", False, str(exc))
        return 1

    # ── 3. Upload files ──────────────────────────────────────────────────────
    section("3 · Upload files")
    csv_content = b"name,age\nAlice,30\nBob,25\n"
    py_content = b"import sys\nprint('hello from script')\n"
    try:
        upload = client.upload_files(
            session_id,
            {
                "data.csv": csv_content,
                "helper.py": py_content,
            },
        )
        check("session_id matches", upload.session_id == session_id)
        check(
            "2 files returned in file_paths",
            len(upload.file_paths) == 2,
            str(upload.file_paths),
        )
        check("files list has 2 entries", len(upload.files) == 2)
        sizes = {f.path: f.size for f in upload.files}
        check(
            "data.csv size correct",
            sizes.get("data.csv") == len(csv_content),
            str(sizes),
        )
        check(
            "helper.py size correct",
            sizes.get("helper.py") == len(py_content),
            str(sizes),
        )
    except Exception as exc:
        check("upload_files() succeeded", False, str(exc))

    # ── 4. List files ─────────────────────────────────────────────────────────
    section("4 · List files")
    try:
        listing = client.list_files(session_id)
        check("session_id matches", listing.session_id == session_id)
        paths = {f.path for f in listing.files}
        check("data.csv visible", "data.csv" in paths, str(paths))
        check("helper.py visible", "helper.py" in paths, str(paths))
    except Exception as exc:
        check("list_files() succeeded", False, str(exc))

    # ── 5. Download file ─────────────────────────────────────────────────────
    section("5 · Download file")
    try:
        raw = client.download_file(session_id, "data.csv")
        check(
            "downloaded bytes match uploaded content",
            raw == csv_content,
            repr(raw[:40]),
        )
    except Exception as exc:
        check("download_file() succeeded", False, str(exc))

    try:
        client.download_file(session_id, "nonexistent.txt")
        check(
            "download of missing file raises SandboxExecutorError",
            False,
            "no exception raised",
        )
    except SandboxExecutorError as exc:
        check(
            "download of missing file raises SandboxExecutorError (404)",
            exc.status_code == 404,
            str(exc.status_code),
        )
    except Exception as exc:
        check("download of missing file raises SandboxExecutorError", False, str(exc))

    # ── 6. Execute Python ────────────────────────────────────────────────────
    section("6 · Execute Python (sync)")
    try:
        result = client.execute(
            ExecuteRequest(
                session_id=session_id,
                code=textwrap.dedent(
                    """\
                    import csv, io
                    with open('data.csv') as f:
                        rows = list(csv.DictReader(f))
                    print(f'rows: {len(rows)}')
                    print(rows[0]['name'])
                """
                ),
                file_paths=["data.csv"],
                timeout_seconds=20,
            )
        )
        check("status is completed", result.status == "completed", result.status)
        check("exit_code is 0", result.exit_code == 0, str(result.exit_code))
        check(
            "stdout contains 'rows: 2'", "rows: 2" in result.stdout, repr(result.stdout)
        )
        check("stdout contains 'Alice'", "Alice" in result.stdout, repr(result.stdout))
        if result.stderr:
            print(f"       stderr: {result.stderr[:200]}")
    except Exception as exc:
        check("execute() succeeded", False, str(exc))

    # ── 7. Execute Bash ──────────────────────────────────────────────────────
    section("7 · Execute Bash (sync)")
    try:
        result = client.execute_bash(
            ExecuteBashRequest(
                session_id=session_id,
                script="wc -l data.csv && echo 'bash_ok'",
                file_paths=["data.csv"],
                timeout_seconds=10,
            )
        )
        check("status is completed", result.status == "completed", result.status)
        check("exit_code is 0", result.exit_code == 0, str(result.exit_code))
        check(
            "stdout contains 'bash_ok'", "bash_ok" in result.stdout, repr(result.stdout)
        )
    except Exception as exc:
        check("execute_bash() succeeded", False, str(exc))

    # ── 8. Get job by ID ─────────────────────────────────────────────────────
    section("8 · Get job by ID")
    try:
        # Re-run a tiny job to capture its ID
        result = client.execute(
            ExecuteRequest(
                session_id=session_id,
                code="print('job_id_test')",
                timeout_seconds=10,
            )
        )
        job = client.get_job(result.job_id)
        check("job_id matches", job.job_id == result.job_id)
        check("status is terminal", job.status in ("completed", "failed"), job.status)
    except Exception as exc:
        check("get_job() succeeded", False, str(exc))

    # ── 9. Delete session ────────────────────────────────────────────────────
    section("9 · Delete session")
    try:
        client.delete_session(session_id)
        check("delete_session() returned without error", True)
        session_id = None  # already gone
    except Exception as exc:
        check("delete_session() succeeded", False, str(exc))

    # Verify the session is gone
    try:
        client.list_files(session_id or "deleted")
        check(
            "list_files on deleted session raises SandboxExecutorError",
            False,
            "no exception",
        )
    except SandboxExecutorError as exc:
        check(
            "list_files on deleted session raises SandboxExecutorError",
            exc.status_code in (404, 400),
            str(exc.status_code),
        )
    except Exception as exc:
        check(
            "list_files on deleted session raises SandboxExecutorError", False, str(exc)
        )

    # ── Summary ──────────────────────────────────────────────────────────────
    total = len(_results)
    passed = sum(1 for _, ok in _results if ok)
    failed = total - passed

    print(f"\n{'═' * 60}")
    print(f"  Results: {passed}/{total} passed", end="")
    if failed:
        print(f"  |  {failed} FAILED")
    else:
        print("  🎉")
    print(f"{'═' * 60}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
