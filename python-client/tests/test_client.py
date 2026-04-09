import unittest

from sandbox_executor_client import ExecuteRequest, SandboxExecutorClient


class SandboxExecutorClientTests(unittest.TestCase):
    def test_request_payload_roundtrip(self) -> None:
        request = ExecuteRequest(
            session_id="sess_123",
            file_paths=["inputs/example.txt"],
            code="print('hello')",
            timeout_seconds=30,
            network_mode="allowlist",
            allowed_hosts=["api.openai.com"],
        )

        payload = request.to_payload()

        self.assertEqual(payload["session_id"], "sess_123")
        self.assertEqual(payload["file_paths"], ["inputs/example.txt"])
        self.assertEqual(payload["code"], "print('hello')")
        self.assertEqual(payload["timeout_seconds"], 30)
        self.assertEqual(payload["network_mode"], "allowlist")
        self.assertEqual(payload["allowed_hosts"], ["api.openai.com"])

    def test_client_default_base_url(self) -> None:
        client = SandboxExecutorClient()
        self.assertEqual(client.base_url, "http://127.0.0.1:3000")


if __name__ == "__main__":
    unittest.main()
