# SkillTransport
**Requirements:** R23, R24

## Knows
- type: "http" | "stdio" | "direct"
- config: TransportConfig (port, endpoint, or function reference)

## Does
- send(event): Send an event to the skill
- onEvent(handler): Register handler for events from the skill
- connect(): Establish the transport connection
- disconnect(): Close the transport connection
- isConnected(): Check if transport is active

## Collaborators
- Skill: uses transport for bidirectional communication
- Homarus: skill events routed through to the loop

## Sequences
- seq-skill-callback.md
