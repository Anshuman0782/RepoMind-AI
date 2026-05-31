import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.commit_assistant_service import _authenticated_remote_url, _sanitize_git_error


class CommitPushAuthTests(unittest.TestCase):
    def test_https_remote_gets_temporary_token_url(self):
        url = _authenticated_remote_url(
            "https://github.com/example/repo.git",
            {"github_access_token": "secret-token"},
        )

        self.assertEqual(url, "https://x-access-token:secret-token@github.com/example/repo.git")

    def test_ssh_remote_uses_project_metadata_for_token_url(self):
        url = _authenticated_remote_url(
            "git@github.com:example/repo.git",
            {
                "github_access_token": "secret-token",
                "github_owner": "example",
                "github_repo": "repo",
            },
        )

        self.assertEqual(url, "https://x-access-token:secret-token@github.com/example/repo.git")

    def test_git_error_redacts_token(self):
        details = "fatal: unable to access https://x-access-token:secret-token@github.com/example/repo.git"

        cleaned = _sanitize_git_error(details, {"github_access_token": "secret-token"})

        self.assertNotIn("secret-token", cleaned)
        self.assertIn("[redacted]", cleaned)


if __name__ == "__main__":
    unittest.main()
