# RepoMind AI Agent Test Cases

Use these tests before moving to the next goal. Run them from the UI against the imported sample project that contains `index.html`.

The current `index.html` bug is the baseline:

- The click handler may be malformed as `button.addEventListener("click", => ()  {` or similar.
- The random color line uses `math.floor(...)` instead of `Math.floor(...)`.
- Expected working behavior after a fix: clicking `Change Color` changes the page background and the browser console has no JavaScript error.

## Test 1: Chat Agent

Tab: Chat

Prompt:

```text
What does index.html do, and why might the Change Color button fail?
```

Expected:

- Explains that `index.html` renders a centered heading and `Change Color` button.
- Mentions the script chooses a random color and sets `document.body.style.backgroundColor`.
- Identifies likely JavaScript issues around the click handler and/or `math.floor`.
- Shows source references for `index.html`.

Send me:

- The answer text.
- Whether source references appeared.

## Test 2: File Explorer Tools

Tab: Files

Actions:

1. Search for:

```text
math.floor
```

2. Open `index.html`.
3. Click `Git diff`.

Expected:

- Search finds `index.html` at the line containing `math.floor`.
- File viewer opens the full file.
- Git diff shows current uncommitted changes or `No uncommitted changes.`

Send me:

- Search result line.
- Whether file viewer opened correctly.
- Git diff result summary.

## Test 3: Navigator Agent

Tab: Navigator

Mode: Find area

Prompt:

```text
Where is the Change Color button behavior handled?
```

Expected:

- Points to `index.html`.
- Mentions the `colorBtn` button and click listener.
- Explains the color list and body background update.
- Saves result into chat.

Send me:

- The answer text.

## Test 4: Bug Investigation Agent

Tab: Navigator

Mode: Investigate bug

Prompt:

```text
The Change Color button does not change the background. Find the likely cause and suggest the fix location.
```

Expected:

- Identifies `index.html` as the fix location.
- Flags malformed click handler if present.
- Flags `math.floor` should be `Math.floor`.
- Suggests verifying by opening the page and clicking the button.
- Does not edit files.

Send me:

- The findings and suggested fix locations.

## Test 5: Planner Agent

Tab: Planner

Prompt:

```text
Fix the Change Color button bug in index.html.
```

Expected:

- Creates a change plan only.
- Mentions `index.html`.
- Includes risks and suggested tests.
- Shows an approval gate.
- If the system cannot safely create an edit preview from this broad request, that is acceptable.

Send me:

- The plan.
- Whether a diff preview appeared.

## Test 6: Planner To Editor Agent Handoff

Tab: Planner

Prompt:

```text
Create file path: agent-test.html content:
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Agent Test</title>
</head>
<body>
  <h1>Agent test page</h1>
</body>
</html>
```

Expected:

- Planner saves the plan into chat.
- Planner prepares an Editor Agent diff preview for `agent-test.html`.
- No file is created until approval.
- Button shown: `Approve edit`.

Approval test:

1. Click `Approve edit`.
2. Confirm file is created.
3. Confirm the UI then asks for `Approve Review Agent`.
4. Do not approve review yet.

Send me:

- The diff preview.
- Whether the file was created only after approval.
- Whether Review Agent waited for separate approval.

## Test 7: Review Agent Approval

Continue from Test 6.

Action:

Click `Approve Review Agent`.

Expected:

- Review Agent runs only after this approval.
- Review result is saved into chat.
- It reviews the just-applied change set.
- It suggests relevant verification, such as opening `agent-test.html`.

Send me:

- The review output.

## Test 8: Manual Editor Fallback

Tab: Editor

Action:

1. Select `create`.
2. File path:

```text
manual-editor-test.html
```

3. Full file content:

```html
<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Manual editor test</h1>
</body>
</html>
```

4. Click `Preview diff`.
5. Click `Apply approved edit`.

Expected:

- Diff preview appears before file creation.
- File is created after approval.
- Manual editor shows the review suggestion prompt.

Send me:

- The diff preview.
- Whether apply worked.

## Test 9: Documentation Agent

Tab: Planner

Prompt:

```text
Explain file: index.html
```

Expected:

- Routes to Documentation Agent.
- Explains page structure, styles, script responsibility, and known risks.
- Does not create an edit preview.
- Saves result into chat.

Send me:

- The documentation answer.

## Test 10: README Or Setup Documentation

Tab: Planner

Prompt:

```text
Generate setup notes for this project.
```

Expected:

- Routes to Documentation Agent.
- Generates setup notes only from visible repo evidence.
- Says what is unknown if setup evidence is thin.
- Does not create/edit files.

Send me:

- The generated setup notes.

## Test 11: Delete Approval

Tab: Planner

Prompt:

```text
Delete file: agent-test.html
```

Expected:

- Planner prepares a delete diff preview if `agent-test.html` exists.
- File is not deleted until `Approve edit`.
- After approval, asks separately before Review Agent.

Send me:

- The delete diff preview.
- Whether separate review approval appeared.

## Test 12: Chat Routes To Planner With Inline Approval

Tab: Chat

Prompt:

```text
Fix the Change Color button bug in index.html.
```

Expected:

- Chat says RepoMind routed the request to Planner Agent.
- Chat shows a plan or file-change explanation.
- If a concrete edit preview can be prepared, the Chat response shows:
  - `View diff`
  - `Approve edit`
  - `Reject`
- No file changes before approval.
- Planner tab mirrors the same change set if opened.

Send me:

- Whether the Chat action panel appeared.
- Whether the diff matched the intended file.

## Test 13: Natural Create File From Chat

Tab: Chat

Prompt:

```text
create calculator.c++
```

Expected:

- Chat routes to Planner Agent.
- Planner generates conservative starter C++ content automatically.
- Chat shows an approval-gated diff preview for `calculator.c++`.
- No rigid `path:` or `content:` syntax is required.
- `calculator.c++` is not created until `Approve edit`.

Send me:

- The first few diff lines.
- Whether the file was created only after approval.

## Test 14: Natural Delete File From Chat

Prerequisite: `calculator.c++` exists from Test 13.

Tab: Chat

Prompt:

```text
remove calculator.c++
```

Expected:

- Chat routes to Planner Agent.
- Chat shows an approval-gated delete diff for `calculator.c++`.
- The file is not deleted until `Approve edit`.
- After approval, Chat offers separate Review Agent approval.

Send me:

- Whether the delete diff appeared.
- Whether the file was deleted only after approval.

## Test 15: Edit Request Redirects To Editor

Tab: Chat

Prompt:

```text
edit index.html and change the title
```

Expected:

- Chat routes to Planner Agent.
- Chat does not guess and apply a full-file edit.
- Chat shows `Editor handoff ready`.
- Clicking `Open Editor` opens the Editor tab.
- Editor action is `edit` and file path is prefilled as `index.html`.
- User can load current file, edit manually, preview diff, and approve.

Send me:

- Whether the Editor handoff appeared.
- Whether Editor opened with the expected action/path.

## Test 16: README File Generation From Chat

Tab: Chat

Prompt:

```text
Generate README improvements
```

Expected:

- Chat routes to Documentation Agent.
- Chat prepares an approval-gated `README.md` edit preview.
- The README is created or updated only after `Approve edit`.
- Commit Assistant draft appears after the edit is applied.

Send me:

- Whether the README diff appeared in Chat.
- Whether commit draft appeared after approval.

## Pass Criteria

- Chat answers with source references.
- Chat routes specialist requests to the right agent.
- Chat shows inline edit approval when an agent prepares a change set.
- Navigator finds relevant files and evidence.
- Planner creates plans and does not edit broad requests without approval.
- Concrete and natural create/delete requests create a diff preview.
- Natural edit requests redirect to Editor instead of guessing risky full-file edits.
- Editor applies only after approval.
- Review Agent does not run until separately approved.
- Documentation Agent handles docs/explain requests from Planner and Chat.
- README file generation creates approval-gated `README.md` changes.
- All results are saved into the active chat.
