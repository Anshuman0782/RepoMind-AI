import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.language_utils import language_instruction


class LanguageInstructionTests(unittest.TestCase):
    def test_auto_language_with_english_message_requires_english(self):
        instruction = language_instruction("Explain the project structure", "auto")

        self.assertIn("answer in English", instruction)
        self.assertNotIn("same language as the user's message", instruction)

    def test_selected_language_prioritizes_meaning_structure_and_code_safety(self):
        instruction = language_instruction("Explain index.html", "hi")

        self.assertIn("Hindi", instruction)
        self.assertIn("Preserve the meaning", instruction)
        self.assertIn("natural, fluent wording", instruction)
        self.assertIn("short sections", instruction)
        self.assertIn("specific bullets", instruction)
        self.assertIn("Do not translate or rewrite code symbols", instruction)


if __name__ == "__main__":
    unittest.main()
