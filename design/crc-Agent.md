# Agent
**Requirements:** R11, R12, R13, R16, R17, R19

## Knows
- id: string (unique agent ID)
- state: "pending" | "running" | "complete" | "failed" | "cancelled"
- config: AgentConfig (prompt, model, tools, timeout, maxTurns, etc.)
- turns: number (current inference turn count)
- startTime: number (when execution started)
- result: AgentResult | null (final output)
- executionStrategy: "embedded" | "subprocess" | "remote"

## Does
- run(): Execute the agent loop — build prompt, call model, execute tools, repeat until done or limits hit
- cancel(): Request graceful cancellation (finish current tool, then stop)
- emitProgress(progress): Send progress event to loop
- emitResult(result): Send final result to loop
- emitError(error): Send error to loop
- isTimedOut(): Check if execution exceeded timeout
- isOverTurns(): Check if turns exceeded maxTurns

## Collaborators
- AgentManager: creates this agent, monitors lifecycle
- ModelRouter: resolves model for inference calls
- ToolRegistry: provides available tools for execution
- IdentityManager: provides system prompt context
- MemoryIndex: provides memory search during execution

## Sequences
- seq-agent-execution.md
