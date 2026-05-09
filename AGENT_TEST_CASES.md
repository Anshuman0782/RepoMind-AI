# RepoMind AI User Manual And Capability Checklist

This document explains what RepoMind AI can do after you import a repository. Use it as a user guide, a demo script, and a manual checklist before shipping new agent features.

RepoMind is built around one simple workflow:

1. Import or select a repository.
2. Ask questions in Chat or open a focused workspace.
3. Let the right agent prepare answers, maps, plans, edits, reviews, or commit text.
4. Approve file changes only after reviewing the diff.

## Core Workspaces

### Chat

Use Chat when you want a natural language entry point. Chat can answer questions directly or route your request to a specialist agent.

Example prompts:

```text
What does this repository do?
```

```text
Where is authentication handled?
```

```text
Show me this repo architecture.
```

```text
Add me a README.md file.
```

Expected behavior:

- General questions get a grounded answer with source references when evidence is available.
- Architecture-style requests open the Architecture workspace.
- File-change requests route to Planner, README Agent, or Editor handoff.
- No file is changed without an approval-gated diff preview.

### Architecture

Use Architecture to visually inspect the repository structure.

Supported request words from Chat:

- `architecture`
- `file structure`
- `folder structure`
- `project structure`
- `repo structure`
- `diagram`
- `ER diagram`
- `ERD`
- `data model`
- `schema diagram`
- `system map`
- `dependency map`

Example prompts:

```text
Can you view me this repo architecture?
```

```text
Show file structure.
```

```text
Open ER diagram.
```

Expected behavior:

- Chat routes to Architecture Agent.
- The app opens the Architecture tab.
- The diagram groups files into layers such as interface, client code, backend code, data/content, docs/tests, and project setup.
- The fullscreen button opens a larger diagram view.
- Clicking a node shows related files in the inspector.

### Files

Use Files to browse, search, and inspect repository content.

Actions:

1. Filter files by name.
2. Search code text.
3. Open a file.
4. Read the current git diff.

Expected behavior:

- File search returns matching file paths and lines.
- Opening a result loads the file viewer.
- Git diff shows uncommitted changes or `No uncommitted changes.`

### Navigator

Use Navigator to find where a feature, behavior, route, or symbol is implemented.

Example prompts:

```text
Where is login handled?
```

```text
Find the area responsible for saving projects.
```

```text
Where does the frontend call the backend API?
```

Expected behavior:

- Navigator points to likely files and responsibilities.
- Result is saved into the active chat.
- Sources are shown when available.

### Bug Investigation

Use Navigator's Investigate bug mode when something fails and you want likely causes.

Example prompts:

```text
The import button is slow. Find the likely cause.
```

```text
The page opens but the button does nothing.
```

Expected behavior:

- Bug Investigation Agent explains likely causes and fix locations.
- It does not edit files.
- It suggests verification steps.
- Result is saved into chat.

### Planner

Use Planner for change requests. Planner should create a plan and, when safe, prepare an approval-gated edit preview.

Example prompts:

```text
Add loading feedback while a repository is importing.
```

```text
Create file docs/architecture.md with a short architecture overview.
```

```text
Delete file docs/old-notes.md.
```

Expected behavior:

- Broad requests produce a plan, risks, and suggested tests.
- Concrete create/delete requests can produce a diff preview.
- No file is created, edited, or deleted until `Approve edit`.
- After applying an edit, Review Agent approval is offered separately.

### Editor

Use Editor for manual, full-file changes.

Common workflow:

1. Choose `create`, `edit`, or `delete`.
2. Enter the file path.
3. For create/edit, provide full file content.
4. Click `Preview diff`.
5. Review the diff.
6. Click `Apply approved edit`.

Expected behavior:

- Diff preview appears before any file change.
- Applying happens only after approval.
- After apply, the app suggests Review Agent.

### Review

Use Review to inspect current changes or a just-applied change set.

Example prompts:

```text
Review the current changes.
```

```text
Review the Planner-approved edit.
```

Expected behavior:

- Review Agent focuses on bugs, regressions, risks, and missing tests.
- It does not change files.
- Review output is saved into chat.

### Commit

Use Commit to draft commit and pull request text from the current diff.

Example prompt:

```text
Draft commit and PR copy for the current changes.
```

Expected behavior:

- Commit Assistant summarizes changed files.
- It drafts a commit message, PR title, and PR description.
- Actual commit/push requires user approval.

### README Agent

Use README Agent to create or improve README documentation.

Example prompts:

```text
Add me a README.md file.
```

```text
Generate README improvements.
```

```text
Update README setup notes.
```

Expected behavior:

- Chat routes to README Agent.
- README Agent prepares a `README.md` create/edit preview.
- The README is not written until `Approve edit`.
- After approval, Commit Assistant can draft commit/PR copy.

### Documentation Agent

Use Documentation Agent for explanations, setup notes, onboarding notes, or API docs that do not need direct file edits.

Example prompts:

```text
Explain this repository architecture.
```

```text
Generate setup notes for this project.
```

```text
Explain file: src/main.js
```

Expected behavior:

- Documentation is grounded in available repository evidence.
- Unknown details are called out instead of invented.
- No edit preview is created unless the prompt asks for a README file change.

## Routing Checklist

Use these prompts to confirm Chat routes to the right agent.

| Prompt | Expected route | Expected workspace |
| --- | --- | --- |
| `Show file structure` | Architecture Agent | Architecture |
| `Open ER diagram` | Architecture Agent | Architecture |
| `Show me this repo architecture` | Architecture Agent | Architecture |
| `Explain repo architecture` | Documentation Agent | Chat |
| `Add me a README.md file` | README Agent | Planner approval |
| `Create docs/notes.md` | Planner Agent | Planner approval |
| `Edit src/main.js and change the title` | Planner Agent with Editor handoff | Editor |
| `Review current changes` | Review Agent | Review |
| `Draft PR description` | Commit Assistant | Commit |
| `Where is login handled?` | Navigator Agent | Navigator |

## Approval Rules

RepoMind should follow these safety rules:

- Chat answers can be immediate.
- Investigation, Navigator, Documentation, and Review do not edit files.
- Planner, README Agent, and Editor may prepare file changes.
- File changes must show a diff preview before applying.
- User must approve before create/edit/delete changes are written.
- Review Agent runs only after separate approval when offered.
- Commit and push require explicit approval.

## General Test Flow

Run this flow against any imported repository:

1. Ask Chat: `What does this repository do?`
2. Ask Chat: `Show file structure.`
3. Use Architecture fullscreen and click at least one node.
4. Search for a common term in Files.
5. Ask Navigator: `Where is the main app entry point?`
6. Ask Documentation: `Generate setup notes for this project.`
7. Ask Chat: `Add me a README.md file.`
8. Confirm a README diff preview appears.
9. Reject or approve the edit depending on the test goal.
10. If approved, run Review Agent before committing.

## Pass Criteria

- Import returns quickly and project status updates while indexing continues.
- Files workspace can browse and search repository files.
- Architecture workspace shows a useful diagram for different repo shapes.
- Architecture fullscreen keeps nodes and arrows aligned.
- Chat routes specialist requests to the right agent.
- README requests create approval-gated README diffs.
- Planner creates safe plans and approval-gated changes.
- Editor supports manual create/edit/delete with preview.
- Review does not run without explicit approval.
- Commit Assistant drafts useful commit and PR text.
- Results are saved into the active chat when appropriate.
