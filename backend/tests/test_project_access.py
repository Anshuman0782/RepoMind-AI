import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.repo_service import (
    READ_ONLY_ACCESS,
    WRITE_ENABLED_ACCESS,
    github_repo_metadata,
    project_access_mode,
    project_has_write_access,
    project_write_error,
)


class ProjectAccessTests(unittest.TestCase):
    def test_missing_access_mode_defaults_to_read_only(self):
        project = {"github_permissions": {"pull": True, "push": False}}

        self.assertEqual(project_access_mode(project), READ_ONLY_ACCESS)
        self.assertFalse(project_has_write_access(project))
        self.assertIn("GitHub login", project_write_error(project))

    def test_write_enabled_requires_push_permission(self):
        project = {
            "access_mode": WRITE_ENABLED_ACCESS,
            "github_permissions": {"pull": True, "push": False},
        }

        self.assertFalse(project_has_write_access(project))

        project["github_permissions"]["push"] = True
        self.assertTrue(project_has_write_access(project))
        self.assertIsNone(project_write_error(project))

    def test_write_access_with_github_user(self):
        # Even if the project is marked read_only, a user with a github_access_token should have write access.
        project = {
            "access_mode": READ_ONLY_ACCESS,
            "github_permissions": {"pull": True, "push": False},
        }
        user = {"github_access_token": "mock-token-xyz"}
        self.assertTrue(project_has_write_access(project, user=user))
        self.assertIsNone(project_write_error(project, user=user))

    def test_github_metadata_extracts_owner_and_repo(self):
        metadata = github_repo_metadata("https://github.com/openai/example-repo.git")

        self.assertEqual(metadata["owner"], "openai")
        self.assertEqual(metadata["repo"], "example-repo")


if __name__ == "__main__":
    unittest.main()
