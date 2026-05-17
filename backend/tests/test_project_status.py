import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.repo_service import project_status_error


class ProjectStatusTests(unittest.TestCase):
    def test_indexed_project_is_ready_for_chat(self):
        self.assertIsNone(project_status_error({"status": "indexed"}))

    def test_running_project_statuses_ask_user_to_wait(self):
        for status in ("importing", "indexing"):
            with self.subTest(status=status):
                message = project_status_error({"status": status})
                self.assertIsNotNone(message)
                self.assertIn("still importing/indexing", message)

    def test_interrupted_statuses_are_actionable(self):
        import_message = project_status_error({"status": "import_interrupted"})
        index_message = project_status_error({"status": "index_interrupted"})

        self.assertIn("interrupted", import_message)
        self.assertIn("Re-index or import", import_message)
        self.assertIn("interrupted", index_message)
        self.assertIn("Index button", index_message)

    def test_failed_statuses_are_actionable(self):
        import_message = project_status_error({"status": "import_failed"})
        index_message = project_status_error({"status": "index_failed"})

        self.assertIn("import failed", import_message)
        self.assertIn("indexing failed", index_message)

    def test_unknown_status_is_not_treated_as_ready(self):
        message = project_status_error({"status": "queued"})

        self.assertIn("not ready", message)
        self.assertIn("queued", message)


if __name__ == "__main__":
    unittest.main()
