# Test Design: Homarus
**Source:** crc-Homarus.md

## Test: event dispatch to direct handler
**Purpose:** Verify events are dispatched to registered direct handlers
**Input:** Register a direct handler for "test_event", emit an event of that type
**Expected:** Handler is called with the event, handler receives correct payload
**Refs:** crc-Homarus.md, crc-EventBus.md

## Test: event dispatch to agent handler
**Purpose:** Verify events trigger agent spawning when agent handlers are registered
**Input:** Register an agent handler for "message", emit a message event
**Expected:** AgentManager.spawn() called with correct config
**Refs:** crc-Homarus.md, crc-AgentManager.md

## Test: multiple handlers for same event
**Purpose:** Verify all handlers fire for a single event type
**Input:** Register 2 direct handlers and 1 agent handler for "message", emit event
**Expected:** Both direct handlers called, one agent spawned
**Refs:** crc-Homarus.md, crc-EventBus.md

## Test: startup initializes subsystems in order
**Purpose:** Verify startup sequence respects dependency order
**Input:** Call start() with valid config
**Expected:** Config loads first, then identity, memory, tools, skills, channels, timers, API — in that order
**Refs:** crc-Homarus.md, seq-startup.md

## Test: graceful shutdown drains agents
**Purpose:** Verify shutdown waits for in-flight agents before stopping
**Input:** Spawn an agent, call stop() while agent is running
**Expected:** Loop waits for agent to complete (up to timeout), then shuts down
**Refs:** crc-Homarus.md, seq-shutdown.md

## Test: backpressure rejects when queue full
**Purpose:** Verify overflow strategy applies when queue is at capacity
**Input:** Fill queue to maxSize, emit one more event
**Expected:** Overflow strategy applied (drop/delay/reject based on config)
**Refs:** crc-Homarus.md, crc-EventQueue.md
