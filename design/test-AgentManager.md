# Test Design: AgentManager
**Source:** crc-AgentManager.md

## Test: spawn creates agent with correct config
**Purpose:** Verify agent is created with all config fields
**Input:** Call spawn() with prompt, model, tools, timeout
**Expected:** Agent created with matching config, tracked in agents map, agentId returned
**Refs:** crc-AgentManager.md, crc-Agent.md

## Test: max concurrent limit enforced
**Purpose:** Verify spawn rejects when at capacity
**Input:** Spawn maxConcurrent agents, attempt one more
**Expected:** Last spawn is queued or rejected, not started immediately
**Refs:** crc-AgentManager.md

## Test: cancel stops agent gracefully
**Purpose:** Verify cancellation flow
**Input:** Spawn agent, call cancel(agentId)
**Expected:** Agent state set to cancelled, agent stops after current tool
**Refs:** crc-AgentManager.md, crc-Agent.md

## Test: agent result emits event to loop
**Purpose:** Verify agent completion delivers result
**Input:** Spawn agent that completes successfully
**Expected:** agent_result event emitted to loop with correct payload
**Refs:** crc-AgentManager.md, seq-message-dispatch.md

## Test: waitForAll respects timeout
**Purpose:** Verify shutdown timeout behavior
**Input:** Spawn slow agent, call waitForAll(100ms)
**Expected:** Returns after timeout, agents cancelled
**Refs:** crc-AgentManager.md, seq-shutdown.md
