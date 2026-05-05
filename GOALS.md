# RepoMind AI Goal Stack

## Completed Goal 1: Repo Chat MVP

- Import a public GitHub repository.
- Store project metadata in MongoDB.
- Scan and chunk repository files.
- Build a local vector index for retrieval.
- Ask questions about a selected project.
- Show answers with collapsible source references.
- Persist chat messages in MongoDB so refresh does not erase history.

## Next Goal 2: Multiple Chats Per Project

Create separate chat sessions under each project so conversations do not become one long thread.

Planned work:

- Add a `chats` MongoDB collection.
- Create a new chat under a selected project.
- Store messages with both `project_id` and `chat_id`.
- Show chats under each project in the sidebar.
- Switch between chats.
- Auto-title a chat from the first question.
- Keep old chat history after refresh.

## Goal 3: Chat Management And UI Polish

Planned work:

- Delete chat.
- Rename chat.
- Delete project later if needed.
- Improve responsive layout.
- Add better loading states.
- Add auto-scroll to latest answer.
- Improve empty states.
- Clean up source reference display.

## Goal 4: File Explorer And Codebase Tools

Planned work:

- Add file explorer for each imported project.
- View file contents.
- Search files.
- Add safe backend tools:
  - `list_files`
  - `read_file`
  - `search_code`
  - `create_file`
  - `edit_file`
  - `get_git_diff`

## Goal 5: Codebase Change Agent

Build an AI agent that helps manage a codebase.

Main behavior:

- User asks to create a new file or feature.
- Agent analyzes the project structure.
- Agent suggests the correct file location.
- Agent suggests required related changes such as imports, routes, exports, or integrations.
- Agent shows a change plan before editing.
- User approves the change plan.
- Agent creates or modifies files.
- App shows a diff preview.
- Agent asks permission to commit.
- If approved, agent runs git add and git commit with a meaningful commit message.

Safety rules:

- Never edit files without user approval.
- Never commit without user approval.
- Always show the proposed file path and related changes first.
- Always show the diff before commit.
- Use a meaningful commit message based on the actual changes.

Recommended implementation:

- Use LangGraph for the multi-step workflow.
- Add human approval checkpoints.
- Keep git operations scoped to the imported project directory.
- Start with local commits only.
- Add branch and pull request creation later.

