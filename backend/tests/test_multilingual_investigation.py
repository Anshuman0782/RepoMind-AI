import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.investigation_service import _direct_bug_answer
from app.services.language_utils import MULTILINGUAL_BUG_TERMS, contains_any_term


CALCULATOR_HTML = """<!DOCTYPE html>
<html lang="en">
<body>
  <button class="clear" onclick="clearDisplay()">C</button>
  <button class="equal" onclick="calculate()">=</button>
  <script>
    const display = .getElementById("display");

    function (){
      display.value = "";
    }

    function calcualte (){
      try{
        display.value = eval(display.value);
      }
      catch (error){
        display.value = "Error";
      }
    }
  </script>
</body>
</html>
"""


class MultilingualInvestigationTests(unittest.TestCase):
    def test_bengali_bug_prompt_routes_to_bug_investigation(self):
        message = "\u0986\u09aa\u09a8\u09bf \u0995\u09bf \u098f\u0987 \u09ab\u09be\u0987\u09b2\u09c7 \u09a4\u09cd\u09b0\u09c1\u099f\u09bf\u099f\u09bf \u0996\u09c1\u0981\u099c\u09c7 \u09ac\u09c7\u09b0 \u0995\u09b0\u09a4\u09c7 \u09aa\u09be\u09b0\u09ac\u09c7\u09a8?"

        self.assertTrue(contains_any_term(message, MULTILINGUAL_BUG_TERMS))

    def test_bengali_calculator_bug_answer_uses_current_syntax_evidence(self):
        message = "\u0986\u09aa\u09a8\u09bf \u0995\u09bf \u098f\u0987 \u09ab\u09be\u0987\u09b2\u09c7 \u09a4\u09cd\u09b0\u09c1\u099f\u09bf\u099f\u09bf \u0996\u09c1\u0981\u099c\u09c7 \u09ac\u09c7\u09b0 \u0995\u09b0\u09a4\u09c7 \u09aa\u09be\u09b0\u09ac\u09c7\u09a8?"
        chunks = [
            {
                "file_path": "index.html",
                "start_line": 1,
                "end_line": len(CALCULATOR_HTML.splitlines()),
                "content": CALCULATOR_HTML,
            }
        ]

        answer = _direct_bug_answer(chunks, message, "auto")

        self.assertIsNotNone(answer)
        self.assertIn("calculate()", answer)
        self.assertIn("calcualte", answer)
        self.assertIn("clearDisplay", answer)
        self.assertIn("document.getElementById", answer)
        self.assertNotIn("grid-template-columns", answer)
        self.assertNotIn("5 columns", answer)

    def test_selected_spanish_language_formats_direct_bug_answer_in_spanish(self):
        message = "Can you find the error in this file?"
        chunks = [
            {
                "file_path": "index.html",
                "start_line": 1,
                "end_line": len(CALCULATOR_HTML.splitlines()),
                "content": CALCULATOR_HTML,
            }
        ]

        answer = _direct_bug_answer(chunks, message, "es")

        self.assertIsNotNone(answer)
        self.assertIn("**Problema**", answer)
        self.assertIn("Evidencia", answer)
        self.assertIn("Solución", answer)
        self.assertIn("el botón llama", answer)
        self.assertNotIn("**Problem**", answer)


if __name__ == "__main__":
    unittest.main()
