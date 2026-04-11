import unittest

from sandbox_executor_client import ExecuteBashRequest, ExecuteRequest, SandboxExecutorClient


class SandboxExecutorClientTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
