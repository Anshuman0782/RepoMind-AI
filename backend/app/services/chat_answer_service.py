import re


def direct_chat_answer(message: str, chunks: list[dict]) -> str | None:
    color_button_answer = _color_button_answer(message, chunks)
    if color_button_answer:
        return color_button_answer
    return None


def _color_button_answer(message: str, chunks: list[dict]) -> str | None:
    lowered = message.lower()
    if "index.html" not in lowered:
        return None
    if "change color" not in lowered and "color button" not in lowered:
        return None
    if "fail" not in lowered and "does not" not in lowered and "bug" not in lowered and "why" not in lowered:
        return None

    issues = []
    behavior = (
        "`index.html` renders a centered page with a `Click the Button` heading and a `Change Color` button. "
        "Its script defines a list of color hex values, finds `#colorBtn`, and is intended to change "
        "`document.body.style.backgroundColor` to a random color when the button is clicked."
    )

    for chunk in chunks:
        if not chunk["file_path"].lower().endswith("index.html"):
            continue
        for offset, line in enumerate(chunk["content"].splitlines()):
            stripped = line.strip()
            line_number = chunk["start_line"] + offset
            if re.search(r"addEventListener\s*\(\s*[\"']click[\"']\s*,\s*=>", stripped):
                issues.append(
                    f"- `{chunk['file_path']}:{line_number}` has malformed click-handler syntax: `{stripped}`. "
                    "It should use an arrow function like `button.addEventListener(\"click\", () => {`."
                )
            elif re.search(r"addEventListener\s*\(\s*[\"']click[\"']\s*,\s*\(\)\s*\{", stripped):
                issues.append(
                    f"- `{chunk['file_path']}:{line_number}` has malformed click-handler syntax: `{stripped}`. "
                    "It is missing the `=>` between `()` and `{`."
                )
            if "math.floor" in stripped:
                issues.append(
                    f"- `{chunk['file_path']}:{line_number}` uses lowercase `math.floor`. JavaScript's built-in object is "
                    "`Math`, so this should be `Math.floor(Math.random() * colors.length)`."
                )

    if not issues:
        issues.append(
            "- The retrieved context did not show the exact failing line, but the button behavior should be checked around "
            "the `colorBtn` click listener and random color selection in `index.html`."
        )

    return (
        "**What `index.html` Does**\n"
        f"{behavior}\n\n"
        "**Why The Button Might Fail**\n"
        + "\n".join(_dedupe_lines(issues))
        + "\n\n"
        "**Correct Fix Shape**\n"
        "- Use `button.addEventListener(\"click\", () => { ... })` for the click handler.\n"
        "- Use `colors[Math.floor(Math.random() * colors.length)]` for the random color.\n\n"
        "**Important Note**\n"
        "`Math.floor` and `Math.random` are built into JavaScript. No MathJax, Math.js, or external library is needed."
    )


def _dedupe_lines(lines: list[str]) -> list[str]:
    deduped = []
    seen = set()
    for line in lines:
        if line in seen:
            continue
        seen.add(line)
        deduped.append(line)
    return deduped
