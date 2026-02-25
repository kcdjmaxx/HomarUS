# McpResources
**Requirements:** R92, R93, R94, R95
**Refs:** ref-homaruscc-mcp-resources

## Knows
- resources: McpResourceDef[] (built from Homarus subsystem references)

## Does
- createMcpResources(loop): Factory function returning McpResourceDef[] array
- Each resource has: uri, name, description, mimeType, handler() -> text
- identity://soul: Return identityManager.getSoul()
- identity://user: Return identityManager.getUser()
- config://current: Return JSON.stringify of config with secrets redacted
- events://recent: Return JSON.stringify of last 20 events

## Collaborators
- Homarus: getIdentityManager, getConfig, getEventHistory

## Sequences
- seq-mcp-tool-call.md (resource reads use same proxy forwarding pattern)
