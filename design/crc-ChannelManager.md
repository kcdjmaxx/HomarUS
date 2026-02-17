# ChannelManager
**Requirements:** R43, R44, R45, R47, R48

## Knows
- adapters: Map<string, ChannelAdapter> (name → adapter instance)
- routingRules: RoutingRule[] (channel/account → handler config)

## Does
- loadAdapters(config): Instantiate channel adapters from config
- connectAll(): Connect all configured adapters
- disconnectAll(): Gracefully disconnect all adapters
- send(channel, target, message): Route outbound message to correct adapter
- getAdapter(name): Return adapter by name
- getConnected(): Return all connected adapters
- healthCheck(): Check health of all adapters

## Collaborators
- ChannelAdapter: individual channel implementations
- Homarus: delivers normalized message events
- Config: provides channel configuration and routing rules

## Sequences
- seq-message-dispatch.md
- seq-startup.md
- seq-shutdown.md
