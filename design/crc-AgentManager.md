# AgentManager
**Requirements:** R6, R7, R11, R12, R14, R15, R18, R19

## Knows
- agents: Map<string, Agent> (agentId → running agent)
- maxConcurrent: number (from config)
- defaultTimeout: number (from config)
- defaultMaxTurns: number (from config)

## Does
- spawn(config: AgentConfig): Create new Agent, enforce maxConcurrent limit, start execution, return agentId
- cancel(agentId): Request graceful cancellation of an agent
- cancelAll(): Cancel all in-flight agents (for shutdown)
- getAgent(agentId): Return agent by ID
- getActive(): Return all running agents
- activeCount(): Number of in-flight agents
- canSpawn(): Whether maxConcurrent allows another agent
- waitForAll(timeout): Wait for all agents to complete (for shutdown)
- onAgentComplete(agentId, result): Handle agent completion — remove from tracking, emit result event to loop

## Collaborators
- Agent: creates and manages agent instances
- Homarus: receives spawn requests, delivers agent result events
- ModelRouter: agents need model resolution
- ToolRegistry: agents need tool access
- IdentityManager: agents need identity context

## Sequences
- seq-message-dispatch.md
- seq-agent-execution.md
- seq-shutdown.md
