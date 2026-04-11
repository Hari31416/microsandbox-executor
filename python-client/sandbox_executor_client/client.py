from __future__ import annotations

import io
import json
import mimetypes
import os
import uuid
from dataclasses import asdict, is_dataclass
from typing import Any
from urllib import error, parse, request

from .models import (
    CreateSessionRequest,
    ExecuteBashRequest,
    ExecuteRequest,
    ExecutionResult,
    FileMetadata,
    HealthResponse,
    JobResponse,
    ListFilesResponse,
    SessionResponse,
    UploadFilesResponse,
)


class SandboxExecutorError(RuntimeError):
    def __init__(self, status_code: int, payload: Any):
        self.status_code = status_code
        self.payload = payload
        super().__init__(
            f"Sandbox executor request failed with status {status_code}: {payload}"
        )


class SandboxExecutorClient:
    def __init__(self, base_url: str = "http://127.0.0.1:3000", timeout: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> HealthResponse:
        data = self._request("GET", "/v1/health")
        return HealthResponse.from_dict(data)

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    def create_session(self, session_id: str | None = None) -> SessionResponse:
        """Create a new sandbox session.

        Args:
            session_id: Optional custom session identifier.  If omitted the
                service will generate one automatically.

        Returns:
            A :class:`SessionResponse` with the new session details.
        """
        payload: dict[str, Any] = {}
        if session_id is not None:
            payload["session_id"] = session_id
        data = self._request("POST", "/v1/sessions", payload or None)
        return SessionResponse.from_dict(data)

    def delete_session(self, session_id: str) -> None:
        """Delete a sandbox session and all of its files.

        Args:
            session_id: The session to delete.

        Raises:
            :class:`SandboxExecutorError` on HTTP error (e.g. 404 if the
            session does not exist, 409 if it has active jobs).
        """
        self._request_no_body(
            "DELETE", f"/v1/sessions/{parse.quote(session_id, safe='')}"
        )

    # ------------------------------------------------------------------
    # File management
    # ------------------------------------------------------------------

    def upload_files(
        self,
        session_id: str,
        files: dict[str, bytes | str | os.PathLike[str]],
    ) -> UploadFilesResponse:
        """Upload one or more files into a session workspace.

        Args:
            session_id: Target session.
            files: A mapping of ``filename -> content``.  Content may be
                ``bytes`` (raw data), a ``str`` (path to a local file), or a
                :class:`os.PathLike`.  When a path is given the file is read
                and its MIME type is inferred from the extension.

        Returns:
            An :class:`UploadFilesResponse` listing every uploaded file.
        """
        boundary = uuid.uuid4().hex
        body, content_type = self._build_multipart(files, boundary)
        url = f"{self.base_url}/v1/sessions/{parse.quote(session_id, safe='')}/files"
        headers = {
            "Accept": "application/json",
            "Content-Type": content_type,
        }
        req = request.Request(url=url, data=body, headers=headers, method="POST")
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                data: dict[str, Any] = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            payload = self._read_error_payload(exc)
            raise SandboxExecutorError(exc.code, payload) from exc
        except error.URLError as exc:
            raise RuntimeError(
                f"Failed to reach sandbox executor service: {exc.reason}"
            ) from exc
        return UploadFilesResponse.from_dict(data)

    def list_files(self, session_id: str) -> ListFilesResponse:
        """List all files currently stored in a session workspace.

        Args:
            session_id: Target session.

        Returns:
            A :class:`ListFilesResponse` with file metadata for every file.
        """
        data = self._request(
            "GET", f"/v1/sessions/{parse.quote(session_id, safe='')}/files"
        )
        return ListFilesResponse.from_dict(data)

    def download_file(self, session_id: str, file_path: str) -> bytes:
        """Download the raw bytes of a single file from a session workspace.

        Args:
            session_id: Target session.
            file_path:  Relative path of the file within the workspace
                (e.g. ``"outputs/result.csv"``).

        Returns:
            Raw file contents as :class:`bytes`.

        Raises:
            :class:`SandboxExecutorError` if the file or session does not
            exist (404) or on any other HTTP error.
        """
        encoded_path = "/".join(
            parse.quote(segment, safe="") for segment in file_path.split("/")
        )
        url = (
            f"{self.base_url}/v1/sessions/{parse.quote(session_id, safe='')}"
            f"/files/{encoded_path}"
        )
        req = request.Request(url=url, headers={"Accept": "*/*"}, method="GET")
        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                return response.read()
        except error.HTTPError as exc:
            payload = self._read_error_payload(exc)
            raise SandboxExecutorError(exc.code, payload) from exc
        except error.URLError as exc:
            raise RuntimeError(
                f"Failed to reach sandbox executor service: {exc.reason}"
            ) from exc

    # ------------------------------------------------------------------
    # Jobs
    # ------------------------------------------------------------------

    def get_job(self, job_id: str) -> JobResponse:
        data = self._request("GET", f"/v1/jobs/{parse.quote(job_id, safe='')}")
        return JobResponse.from_dict(data)

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    def execute(
        self, request_data: ExecuteRequest | dict[str, Any] | None = None, /, **kwargs: Any
    ) -> ExecutionResult:
        payload = self._to_payload(request_data, kwargs)
        data = self._request("POST", "/v1/execute", payload)
        return ExecutionResult.from_dict(data)

    def execute_bash(
        self, request_data: ExecuteBashRequest | dict[str, Any] | None = None, /, **kwargs: Any
    ) -> ExecutionResult:
        payload = self._to_payload(request_data, kwargs)
        data = self._request("POST", "/v1/execute/bash", payload)
        return ExecutionResult.from_dict(data)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        body: bytes | None = None
        headers = {
            "Accept": "application/json",
        }

        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = request.Request(
            url=f"{self.base_url}{path}",
            data=body,
            headers=headers,
            method=method,
        )

        try:
            with request.urlopen(req, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            payload = self._read_error_payload(exc)
            raise SandboxExecutorError(exc.code, payload) from exc
        except error.URLError as exc:
            raise RuntimeError(
                f"Failed to reach sandbox executor service: {exc.reason}"
            ) from exc

    def _request_no_body(self, method: str, path: str) -> None:
        """Issue a request that returns no body (e.g. DELETE → 204)."""
        req = request.Request(
            url=f"{self.base_url}{path}",
            headers={"Accept": "application/json"},
            method=method,
        )
        try:
            with request.urlopen(req, timeout=self.timeout):
                pass
        except error.HTTPError as exc:
            payload = self._read_error_payload(exc)
            raise SandboxExecutorError(exc.code, payload) from exc
        except error.URLError as exc:
            raise RuntimeError(
                f"Failed to reach sandbox executor service: {exc.reason}"
            ) from exc

    @staticmethod
    def _build_multipart(
        files: dict[str, bytes | str | os.PathLike[str]],
        boundary: str,
    ) -> tuple[bytes, str]:
        """Build a multipart/form-data body for file uploads.

        Returns a ``(body_bytes, content_type_header)`` tuple.
        """
        buf = io.BytesIO()
        boundary_bytes = boundary.encode("ascii")

        for filename, content in files.items():
            if isinstance(content, (str, os.PathLike)):
                path = os.fspath(content)
                with open(path, "rb") as fh:
                    file_bytes = fh.read()
                mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
            else:
                file_bytes = content
                mime_type = (
                    mimetypes.guess_type(filename)[0] or "application/octet-stream"
                )

            buf.write(b"--" + boundary_bytes + b"\r\n")
            buf.write(
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode()
            )
            buf.write(f"Content-Type: {mime_type}\r\n".encode())
            buf.write(b"\r\n")
            buf.write(file_bytes)
            buf.write(b"\r\n")

        buf.write(b"--" + boundary_bytes + b"--\r\n")
        content_type = f"multipart/form-data; boundary={boundary}"
        return buf.getvalue(), content_type

    def _to_payload(
        self,
        request_data: ExecuteRequest | ExecuteBashRequest | dict[str, Any] | None,
        kwargs: dict[str, Any],
    ) -> dict[str, Any]:
        if kwargs:
            if request_data is not None:
                raise ValueError(
                    "Pass either a request object/dict or keyword arguments, not both"
                )
            return dict(kwargs)

        if request_data is None:
            raise ValueError("Execution request data is required")

        if hasattr(request_data, "to_payload") and callable(request_data.to_payload):
            return request_data.to_payload()

        if is_dataclass(request_data):
            return asdict(request_data)

        return dict(request_data)

    def _read_error_payload(self, exc: error.HTTPError) -> Any:
        raw = exc.read().decode("utf-8", errors="replace")

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw
