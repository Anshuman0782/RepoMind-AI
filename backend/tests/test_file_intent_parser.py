import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.planner_service import parse_file_intent


class FileIntentParserTests(unittest.TestCase):
    def test_create_with_separate_name_path_and_content(self):
        intent = parse_file_intent(
            "Create file name helper.ts path src/utils content: export const x = 1;"
        )

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/utils/helper.ts")
        self.assertEqual(intent.content, "export const x = 1;")
        self.assertEqual(intent.missing_fields, ())

    def test_create_requires_content(self):
        intent = parse_file_intent("create file app.py in src")

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/app.py")
        self.assertIn("file content", intent.missing_fields)

    def test_create_accepts_inline_with_content(self):
        intent = parse_file_intent("create src/index.js with console.log(1)")

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/index.js")
        self.assertEqual(intent.content, "console.log(1)")
        self.assertEqual(intent.missing_fields, ())

    def test_create_accepts_fenced_content(self):
        intent = parse_file_intent(
            "make file src/main.py content:\n```python\nprint('hello')\n```"
        )

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/main.py")
        self.assertEqual(intent.content, "print('hello')")
        self.assertEqual(intent.missing_fields, ())

    def test_create_missing_path_and_content(self):
        intent = parse_file_intent("create a new file")

        self.assertEqual(intent.action, "create")
        self.assertIsNone(intent.path)
        self.assertIn("file path", intent.missing_fields)
        self.assertIn("file content", intent.missing_fields)

    def test_create_with_windows_path_is_normalized(self):
        intent = parse_file_intent(
            r"new file src\utils\math.js content: export const add = (a, b) => a + b;"
        )

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/utils/math.js")
        self.assertEqual(intent.content, "export const add = (a, b) => a + b;")

    def test_edit_with_change_request(self):
        intent = parse_file_intent("edit src/App.jsx and change title to RepoMind")

        self.assertEqual(intent.action, "edit")
        self.assertEqual(intent.path, "src/App.jsx")
        self.assertEqual(intent.change_request, "change title to RepoMind")
        self.assertEqual(intent.missing_fields, ())

    def test_replace_prompt_routes_to_edit_not_create(self):
        intent = parse_file_intent("replace old with new in src/a.txt")

        self.assertEqual(intent.action, "edit")
        self.assertEqual(intent.path, "src/a.txt")
        self.assertEqual(intent.change_request, "replace old with new")

    def test_update_prompt_without_file_word_routes_to_edit(self):
        intent = parse_file_intent("update README.md to add setup instructions")

        self.assertEqual(intent.action, "edit")
        self.assertEqual(intent.path, "README.md")
        self.assertEqual(intent.change_request, "to add setup instructions")
        self.assertEqual(intent.missing_fields, ())

    def test_root_level_file_edit_prompt(self):
        intent = parse_file_intent("edit README.md and replace Old Title with New Title")

        self.assertEqual(intent.action, "edit")
        self.assertEqual(intent.path, "README.md")
        self.assertEqual(intent.change_request, "replace Old Title with New Title")
        self.assertEqual(intent.missing_fields, ())

    def test_root_level_file_create_prompt(self):
        intent = parse_file_intent('create package.json content: {"scripts":{"test":"echo ok"}}')

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "package.json")
        self.assertEqual(intent.content, '{"scripts":{"test":"echo ok"}}')
        self.assertEqual(intent.missing_fields, ())

    def test_edit_missing_change_request(self):
        intent = parse_file_intent("edit src/App.jsx")

        self.assertEqual(intent.action, "edit")
        self.assertEqual(intent.path, "src/App.jsx")
        self.assertIn("change request", intent.missing_fields)

    def test_delete_requires_only_path(self):
        intent = parse_file_intent("delete file src/old.js")

        self.assertEqual(intent.action, "delete")
        self.assertEqual(intent.path, "src/old.js")
        self.assertEqual(intent.missing_fields, ())

    def test_language_instruction_is_ignored(self):
        intent = parse_file_intent(
            "create src/message.txt content: hello\n\n"
            "Language requirement: answer in English."
        )

        self.assertEqual(intent.action, "create")
        self.assertEqual(intent.path, "src/message.txt")
        self.assertEqual(intent.content, "hello")


if __name__ == "__main__":
    unittest.main()
