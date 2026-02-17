# ToolRegistry
**Requirements:** R49, R50, R51, R52, R53, R54

## Knows
- tools: Map<string, ToolDefinition> (name → tool)
- policies: ToolPolicy[] (ordered policy chain)
- groups: Map<string, string[]> (group name → tool names)

## Does
- register(tool): Add a tool definition
- unregister(name): Remove a tool
- get(name): Return tool by name
- getAll(): Return all registered tools
- getForAgent(agentConfig): Return tools filtered by agent's policy context
- execute(name, params, context): Execute a tool with parameter validation, timeout, and sandboxing
- registerGroup(name, toolNames): Define a tool group shorthand
- resolveGroup(groupName): Expand a group into individual tool names
- checkPolicy(toolName, context): Evaluate policy chain for tool access

## Collaborators
- Agent: requests tool execution during inference
- SkillManager: registers skill-provided tools
- Config: provides global policy and group definitions

## Sequences
- seq-agent-execution.md
