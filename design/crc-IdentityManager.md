# IdentityManager
**Requirements:** R35, R55, R56, R57, R58, R59, R60, R61, R62

## Knows
- soulContent: string (parsed soul.md)
- userContent: string (parsed user.md)
- overlays: Map<string, string> (overlay name → content)
- workspaceFiles: Map<string, string> (filename → content)
- identityDir: string (path to identity directory)
- workspaceDir: string (path to workspace directory)

## Does
- load(): Read soul.md, user.md, overlays, and workspace files from disk
- reload(): Re-read all identity files (for hot reload on change)
- buildSystemPrompt(options): Assemble system prompt in order: soul → user → overlay → workspace → task
- getSoul(): Return soul content
- getUser(): Return user profile content
- getOverlay(name): Return a specific overlay (channel or task)
- getWorkspaceFile(name): Return a workspace file by name
- listOverlays(): Return available overlay names

## Collaborators
- Agent: requests system prompt assembly
- AgentManager: passes identity context when spawning agents
- Config: provides identity and workspace directory paths

## Sequences
- seq-agent-execution.md
- seq-startup.md
