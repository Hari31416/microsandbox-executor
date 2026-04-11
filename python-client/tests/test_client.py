import io
import json
import unittest
from unittest.mock import MagicMock, patch

from sandbox_executor_client import (
    CreateSessionRequest,
    ExecuteBashRequest,
    ExecuteRequest,
    FileMetadata,
    ListFilesResponse,
    SandboxExecutorClient,
    SandboxExecutorError,
    SessionResponse,
    UploadFilesResponse,
)


class ExecuteRequestTests(unittest.TestCase):
    def test_request_payload_roundtrip(self) -> None:
        request = ExecuteRequest(
            session_id="sess_123",
            file_paths=["inputs/example.txt"],
            code="print('hello')",
            python_profile="data-science",
            timeout_seconds=30,
            network_mode="allowlist",
            allowed_hosts=["api.openai.com"],
        )

        payload = request.to_payload()

        self.assertEqual(payload["session_id"], "sess_123")
        self.assertEqual(payload["file_paths"], ["inputs/example.txt"])
        self.assertEqual(payload["code"], "print('hello')")
        self.assertEqual(payload["python_profile"], "data-science")
        self.assertEqual(payload["timeout_seconds"], 30)
        self.assertEqual(payload["network_mode"], "allowlist")
        self.assertEqual(payload["allowed_hosts"], ["api.openai.com"])

    def test_client_default_base_url(self) -> None:
        client = SandboxExecutorClient()
        self.assertEqual(client.base_url, "http://127.0.0.1:3000")

    def test_bash_request_payload_roundtrip(self) -> None:
        request = ExecuteBashRequest(
            session_id="sess_123",
            script="echo hi",
            file_paths=["script-input.txt"],
            timeout_seconds=10,
        )

        payload = request.to_payload()

        self.assertEqual(payload["session_id"], "sess_123")
        self.assertEqual(payload["script"], "echo hi")
        self.assertEqual(payload["file_paths"], ["script-input.txt"])
        self.assertEqual(payload["timeout_seconds"], 10)


class CreateSessionRequestTests(unittest.TestCase):
    def test_empty_payload_when_no_session_id(self) -> None:
        req = CreateSessionRequest()
        self.assertEqual(req.to_payload(), {})

    def test_payload_contains_session_id_when_provided(self) -> None:
        req = CreateSessionRequest(session_id="my-session")
        self.assertEqual(req.to_payload(), {"session_id": "my-session"})


class SessionResponseTests(unittest.TestCase):
    def test_from_dict_with_expires_at(self) -> None:
        data = {
            "session_id": "abc",
            "created_at": "2024-01-01T00:00:00Z",
            "expires_at": "2024-01-02T00:00:00Z",
        }
        resp = SessionResponse.from_dict(data)
        self.assertEqual(resp.session_id, "abc")
        self.assertEqual(resp.expires_at, "2024-01-02T00:00:00Z")

    def test_from_dict_without_expires_at(self) -> None:
        data = {"session_id": "abc", "created_at": "2024-01-01T00:00:00Z"}
        resp = SessionResponse.from_dict(data)
        self.assertIsNone(resp.expires_at)


class FileMetadataTests(unittest.TestCase):
    def test_from_dict_minimal(self) -> None:
        data = {"path": "output.csv", "size": 42, "content_type": "text/csv"}
        fm = FileMetadata.from_dict(data)
        self.assertEqual(fm.path, "output.csv")
        self.assertEqual(fm.size, 42)
        self.assertEqual(fm.content_type, "text/csv")
        self.assertIsNone(fm.created_at)
        self.assertIsNone(fm.updated_at)

    def test_from_dict_full(self) -> None:
        data = {
            "path": "output.csv",
            "size": 42,
            "content_type": "text/csv",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T01:00:00Z",
        }
        fm = FileMetadata.from_dict(data)
        self.assertEqual(fm.created_at, "2024-01-01T00:00:00Z")
        self.assertEqual(fm.updated_at, "2024-01-01T01:00:00Z")


class UploadFilesResponseTests(unittest.TestCase):
    def test_from_dict(self) -> None:
        data = {
            "session_id": "sess_abc",
            "file_paths": ["a.txt", "b.csv"],
            "files": [
                {"path": "a.txt", "size": 10, "content_type": "text/plain"},
                {"path": "b.csv", "size": 20, "content_type": "text/csv"},
            ],
        }
        resp = UploadFilesResponse.from_dict(data)
        self.assertEqual(resp.session_id, "sess_abc")
        self.assertEqual(resp.file_paths, ["a.txt", "b.csv"])
        self.assertEqual(len(resp.files), 2)
        self.assertIsInstance(resp.files[0], FileMetadata)


class ListFilesResponseTests(unittest.TestCase):
    def test_from_dict(self) -> None:
        data = {
            "session_id": "sess_xyz",
            "files": [
                {"path": "main.py", "size": 100, "content_type": "text/x-python"}
            ],
        }
        resp = ListFilesResponse.from_dict(data)
        self.assertEqual(resp.session_id, "sess_xyz")
        self.assertEqual(len(resp.files), 1)
        self.assertEqual(resp.files[0].path, "main.py")


class MultipartBuilderTests(unittest.TestCase):
    def test_single_file_bytes(self) -> None:
        boundary = "testboundary"
        body, content_type = SandboxExecutorClient._build_multipart(
            {"hello.txt": b"hello world"}, boundary
        )
        self.assertIn(b"--testboundary", body)
        self.assertIn(b'filename="hello.txt"', body)
        self.assertIn(b"hello world", body)
        self.assertIn(b"--testboundary--", body)
        self.assertEqual(content_type, f"multipart/form-data; boundary={boundary}")

    def test_multiple_files(self) -> None:
        boundary = "multi"
        body, _ = SandboxExecutorClient._build_multipart(
            {"a.txt": b"aaa", "b.txt": b"bbb"}, boundary
        )
        self.assertEqual(body.count(b"--multi\r\n"), 2)


class ClientDownloadFileTests(unittest.TestCase):
    def _make_response(self, content: bytes) -> MagicMock:
        resp = MagicMock()
        resp.read.return_value = content
        resp.__enter__ = lambda s: s
        resp.__exit__ = MagicMock(return_value=False)
        return resp

    def test_download_file_returns_bytes(self) -> None:
        client = SandboxExecutorClient(base_url="http://localhost:3000")
        expected = b"col1,col2\n1,2\n"
        mock_response = self._make_response(expected)

        with patch(
            "sandbox_executor_client.client.request.urlopen", return_value=mock_response
        ):
            result = client.download_file("sess_abc", "output/data.csv")

        self.assertEqual(result, expected)

    def test_download_file_raises_on_http_error(self) -> None:
        from urllib.error import HTTPError

        client = SandboxExecutorClient()
        exc = HTTPError(url="", code=404, msg="Not Found", hdrs=MagicMock(), fp=io.BytesIO(b'{"error":"File not found"}'))  # type: ignore[arg-type]

        with patch("sandbox_executor_client.client.request.urlopen", side_effect=exc):
            with self.assertRaises(SandboxExecutorError) as ctx:
                client.download_file("sess_abc", "missing.txt")

        self.assertEqual(ctx.exception.status_code, 404)


class ClientDeleteSessionTests(unittest.TestCase):
    def test_delete_session_calls_correct_url(self) -> None:
        client = SandboxExecutorClient(base_url="http://localhost:3000")
        mock_response = MagicMock()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch(
            "sandbox_executor_client.client.request.urlopen", return_value=mock_response
        ) as mock_open:
            client.delete_session("sess_to_delete")

        called_req = mock_open.call_args[0][0]
        self.assertIn("/v1/sessions/sess_to_delete", called_req.full_url)
        self.assertEqual(called_req.method, "DELETE")


if __name__ == "__main__":
    unittest.main()
