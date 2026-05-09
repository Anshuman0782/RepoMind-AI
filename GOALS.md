# RepoMind AI Goal Stack

RepoMind AI is moving from repo-aware chat toward a safe agentic coding assistant.

## Completed Goal 1: Repo Chat MVP

- [x] Import a public GitHub repository.
- [x] Store project metadata in MongoDB.
- [x] Scan and chunk repository files.
- [x] Build a local vector index for retrieval.
- [x] Ask questions about a selected project.
- [x] Show answers with collapsible source references.
- [x] Persist chat messages in MongoDB so refresh does not erase history.

## Completed Goal 2: Multiple Chats Per Project

- [x] Add a `chats` MongoDB collection.
- [x] Create a new chat under a selected project.
- [x] Store messages with both `project_id` and `chat_id`.
- [x] Show chats under each project in the sidebar.
- [x] Switch between chats.
- [x] Auto-title a chat from the first question.
- [x] Keep old chat history after refresh.

## Completed Goal 3: Chat Management And UI Polish

- [x] Delete chat from MongoDB.
- [x] Rename chat.
- [x] Delete project from MongoDB.
- [x] Clean up project chats and messages when a project is deleted.
- [x] Improve responsive layout.
- [x] Add better loading states.
- [x] Add auto-scroll to latest answer.
- [x] Improve empty states.
- [x] Clean up source reference display.

## Completed Goal 4: File Explorer And Codebase Tools

Build the inspection layer the agents will use before planning or editing.

- [x] Add file explorer for each imported project.
- [x] View file contents.
- [x] Search files.
- [x] Add safe backend tools:
  - `list_files`
  - `read_file`
  - `search_code`
  - `get_git_diff`
- [x] Keep write tools out of this goal unless the UI is ready for approval flows.

## Completed Goal 5: Repo Navigator And Investigation Agent

Help users understand a repository without editing it.

- [x] Add a repo navigator mode.
- [x] Answer questions like "where is auth handled?" with files, symbols, and evidence.
- [x] Add bug investigation flow:
  - user describes a bug
  - agent searches relevant files
  - agent forms likely causes
  - agent shows evidence and suggested fix locations
- [x] Save investigation summaries into the active chat.

## Completed Goal 6: Change Planner Agent

Turn a user request into an implementation plan before any file is edited.

Planned work:

- [x] User asks for a feature, fix, refactor, or file change.
- [x] Agent analyzes project structure and relevant files.
- [x] Agent proposes:
  - files to create or edit
  - reason for each change
  - expected risks
  - suggested tests
- [x] User must approve the plan before moving to edits.
- [x] No file modifications in this goal.

## Completed Goal 7: Safe Automated Code Editing Agent

Apply approved changes with strict human control.

Safety rules:

- Never edit files without user approval.
- Never commit without user approval.
- Keep edits scoped to the imported project directory.
- Always show proposed file paths before editing.
- Always show a diff after editing.

Planned work:

- [x] Add approved write tools:
  - `create_file`
  - `edit_file`
  - `delete_file`
- [x] Add diff preview UI.
- [x] Add apply/reject flow.
- [x] Add rollback for the current proposed change set.
- [x] Start with local file edits only.
- [x] Let Planner prepare an Editor Agent handoff for concrete file requests.
- [x] After edit approval, apply the change and ask for separate approval before running Review Agent.
- [x] Keep Editor and Review tabs as visibility/fallback views instead of the main workflow.

## Completed Goal 8: Test Writer And Code Review Agent

Improve confidence after changes.

Planned work:

- [x] Generate tests for changed files or selected features.
- [x] Review diffs for bugs, regressions, risky patterns, and missing validation.
- [x] Suggest test commands based on project type.
- [x] Summarize residual risks.
- [x] Keep test execution approval-based by suggesting commands instead of running them automatically.

## Completed Goal 9: Documentation Agent

Make repositories easier to understand and maintain.

Planned work:

- [x] Generate architecture summaries.
- [x] Generate README improvements.
- [x] Generate or update `README.md` as an approval-gated edit preview when the user asks for a README file change.
- [x] Generate API docs and setup notes.
- [x] Generate onboarding guides.
- [x] Route documentation requests through Planner as an automated Documentation Agent handoff.
- [x] Support "explain this file/module" from Planner/chat requests.

Note: a dedicated file explorer "Explain" button is optional polish because the chat and Planner can already accept a file/module explanation request with the path.

## Completed Goal 10: Commit And PR Assistant

Help finish a change professionally.

Planned work:

- [x] Read the current git diff.
- [x] Generate a meaningful commit message.
- [x] Ask permission before committing.
- [x] Create local commits only at first.
- [x] Generate PR title and description.
- Add branch and pull request creation later.

## Completed Goal 11: Chat Command Center And Agent Routing

Make Chat the main place users can ask for work without knowing which specialist tab to use.

Planned work:

- [x] Route Chat requests to the right specialist agent:
  - normal repo Q&A
  - Documentation Agent
  - README file generation
  - Navigator Agent
  - Bug Investigation Agent
  - Planner Agent
  - Review Agent
  - Commit Assistant guidance
- [x] Show routed-agent context in Chat so users understand what happened.
- [x] Show approval-gated edit previews directly in Chat when Planner prepares a change set.
- [x] Let users approve/reject edits from Chat without switching tabs.
- [x] Ask for separate Review Agent approval after an edit is applied.
- [x] Show Commit Assistant draft and commit approval from the Chat action panel.
- [x] Keep Planner, Editor, Review, and Commit tabs as deeper workspaces and fallbacks.
- [x] Support natural create/delete prompts without requiring a rigid "create file path ... content ..." pattern.
- [x] Generate conservative starter content for natural create-file requests when the user does not provide content.
- [x] Redirect natural edit-file requests to Editor with the action/path prefilled, because full-file edits need safer manual control.
- [x] Expand editable text/source file support across scanner, editor, review, and commit assistant while still blocking binary files.

## Future Ideas

- Branch creation and GitHub pull request creation.
- Dependency upgrade agent.
- Architecture map visualization.
- Security review mode.
- Performance review mode.
- Multi-repo workspace support.
