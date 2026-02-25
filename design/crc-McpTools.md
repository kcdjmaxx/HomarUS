# McpTools
**Requirements:** R79, R80, R81, R82, R83, R84, R85, R86, R87, R88, R89, R90, R91
**Refs:** ref-homaruscc-mcp-tools

## Knows
- tools: McpToolDef[] (built from Homarus subsystem references)

## Does
- createMcpTools(loop): Factory function returning McpToolDef[] array
- Each tool has: name, description, inputSchema (JSON Schema object), handler(params) -> { content: [{type, text}] }
- telegram_send: Send via channelManager.send("telegram", chatId, {text})
- telegram_read: Get adapter, call getRecentMessages(limit)
- telegram_typing: Get adapter, call sendTyping(chatId)
- telegram_react: Get adapter, call setReaction(chatId, messageId, emoji)
- memory_search: Call memoryIndex.search(query, {limit})
- memory_store: Call memoryIndex.store(content, key)
- timer_schedule: Call timerService.add({name, type, schedule, prompt, timezone})
- timer_cancel: Call timerService.remove(name)
- get_status: Call loop.getStatus()
- get_events: Call loop.getEventHistory().slice(-limit)
- wait_for_event: Call loop.waitForEvent(timeout)
- dashboard_send: Call channelManager.send("dashboard", "chat", {text})

## Collaborators
- Homarus: getChannelManager, getMemoryIndex, getTimerService, getEventHistory, waitForEvent, getStatus
- TelegramChannelAdapter: sendTyping, setReaction, getRecentMessages

## Sequences
- seq-mcp-tool-call.md
