# EventBus
**Requirements:** R3, R4, R5

## Knows
- directHandlers: Map<string, DirectHandler[]> (event type → handler functions)
- agentHandlers: Map<string, AgentHandlerConfig[]> (event type → agent configs)

## Does
- registerDirect(eventType, handler): Add a synchronous handler for an event type
- registerAgent(eventType, config): Add an agent-spawning handler for an event type
- unregister(eventType, handlerId): Remove a handler by ID
- getHandlers(eventType): Return all handlers (direct + agent) for an event type
- hasHandlers(eventType): Check if any handlers registered for event type

## Collaborators
- Homarus: receives handler registrations, queried during dispatch

## Sequences
- seq-message-dispatch.md
