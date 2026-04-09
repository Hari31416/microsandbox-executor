from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from typing import Any
from urllib import error, parse, request

from .models import ExecuteRequest, ExecutionResult, HealthResponse, JobResponse


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

    def health(self) -> HealthResponse:
        data = self._request("GET", "/v1/health")
        return HealthResponse.from_dict(data)

    def get_job(self, job_id: str) -> JobResponse:
        data = self._request("GET", f"/v1/jobs/{parse.quote(job_id, safe='')}")
        return JobResponse.from_dict(data)

    def execute(
        self, request_data: ExecuteRequest | dict[str, Any] | None = None, /, **kwargs: Any
    ) -> ExecutionResult:
        payload = self._to_payload(request_data, kwargs)
        data = self._request("POST", "/v1/execute", payload)
        return ExecutionResult.from_dict(data)

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

    def _to_payload(
        self, request_data: ExecuteRequest | dict[str, Any] | None, kwargs: dict[str, Any]
    ) -> dict[str, Any]:
        if kwargs:
            if request_data is not None:
                raise ValueError(
                    "Pass either a request object/dict or keyword arguments, not both"
                )
            return dict(kwargs)

        if request_data is None:
            raise ValueError("Execution request data is required")

        if isinstance(request_data, ExecuteRequest):
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
