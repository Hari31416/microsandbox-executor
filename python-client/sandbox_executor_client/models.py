from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


JobStatus = Literal["queued", "running", "completed", "failed"]
NetworkMode = Literal["none", "allowlist", "public"]
PythonProfile = Literal["default", "data-science"]


@dataclass(slots=True)
class ExecuteRequest:
    session_id: str
    code: str
    file_paths: list[str] | None = None
    job_id: str | None = None
    entrypoint: str = "main.py"
    python_profile: PythonProfile = "default"
    timeout_seconds: int | None = None
    cpu_limit: int | None = None
    memory_mb: int | None = None
    network_mode: NetworkMode = "none"
    allowed_hosts: list[str] = field(default_factory=list)
    environment: dict[str, str] = field(default_factory=dict)
    restricted_exec: bool | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "session_id": self.session_id,
            "code": self.code,
            "entrypoint": self.entrypoint,
            "python_profile": self.python_profile,
            "network_mode": self.network_mode,
            "allowed_hosts": self.allowed_hosts,
            "environment": self.environment,
        }

        if self.file_paths is not None:
            payload["file_paths"] = self.file_paths
        if self.job_id is not None:
            payload["job_id"] = self.job_id
        if self.timeout_seconds is not None:
            payload["timeout_seconds"] = self.timeout_seconds
        if self.cpu_limit is not None:
            payload["cpu_limit"] = self.cpu_limit
        if self.memory_mb is not None:
            payload["memory_mb"] = self.memory_mb
        if self.restricted_exec is not None:
            payload["restricted_exec"] = self.restricted_exec

        return payload


@dataclass(slots=True)
class ExecuteBashRequest:
    session_id: str
    script: str
    file_paths: list[str] | None = None
    job_id: str | None = None
    entrypoint: str = "main.sh"
    timeout_seconds: int | None = None
    cpu_limit: int | None = None
    memory_mb: int | None = None
    network_mode: NetworkMode = "none"
    allowed_hosts: list[str] = field(default_factory=list)
    environment: dict[str, str] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "session_id": self.session_id,
            "script": self.script,
            "entrypoint": self.entrypoint,
            "network_mode": self.network_mode,
            "allowed_hosts": self.allowed_hosts,
            "environment": self.environment,
        }

        if self.file_paths is not None:
            payload["file_paths"] = self.file_paths
        if self.job_id is not None:
            payload["job_id"] = self.job_id
        if self.timeout_seconds is not None:
            payload["timeout_seconds"] = self.timeout_seconds
        if self.cpu_limit is not None:
            payload["cpu_limit"] = self.cpu_limit
        if self.memory_mb is not None:
            payload["memory_mb"] = self.memory_mb

        return payload


@dataclass(slots=True)
class JobResponse:
    job_id: str
    session_id: str
    status: JobStatus
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int | None
    files_uploaded: list[str]
    created_at: str
    started_at: str | None
    completed_at: str | None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JobResponse":
        return cls(
            job_id=data["job_id"],
            session_id=data["session_id"],
            status=data["status"],
            exit_code=data.get("exit_code"),
            stdout=data.get("stdout", ""),
            stderr=data.get("stderr", ""),
            duration_ms=data.get("duration_ms"),
            files_uploaded=list(data.get("files_uploaded", [])),
            created_at=data["created_at"],
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
        )


@dataclass(slots=True)
class ExecutionResult(JobResponse):
    pass


@dataclass(slots=True)
class HealthComponent:
    ok: bool
    configured: bool | None
    details: str
    runtime: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "HealthComponent":
        return cls(
            ok=data["ok"],
            configured=data.get("configured"),
            details=data["details"],
            runtime=data.get("runtime"),
        )


@dataclass(slots=True)
class HealthResponse:
    status: str
    runtime: HealthComponent
    storage: HealthComponent
    metadata: HealthComponent | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "HealthResponse":
        return cls(
            status=data["status"],
            runtime=HealthComponent.from_dict(data["runtime"]),
            storage=HealthComponent.from_dict(data["storage"]),
            metadata=(
                HealthComponent.from_dict(data["metadata"])
                if "metadata" in data
                else None
            ),
        )
