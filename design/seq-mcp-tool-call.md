# Sequence: MCP Tool Call

**Requirements:** R72, R75, R79, R83, R85, R87, R89, R91

```
ClaudeCode         McpProxy              McpBackendServer       McpTools           Homarus
    |                  |                       |                    |                 |
    |--CallTool------->|                       |                    |                 |
    |  {name, args}    |                       |                    |                 |
    |                  |                       |                    |                 |
    |  [if restart_backend:]                   |                    |                 |
    |                  |--backend.restart()     |                    |                 |
    |<-"Restarted"----|                        |                    |                 |
    |                  |                       |                    |                 |
    |  [otherwise:]    |                       |                    |                 |
    |                  |--POST /api/tool-call->|                    |                 |
    |                  |  {name, args}         |                    |                 |
    |                  |                       |--find tool-------->|                 |
    |                  |                       |                    |--handler(args)-->|
    |                  |                       |                    |  (e.g. search)  |
    |                  |                       |                    |<--result---------|
    |                  |                       |<--{content:[...]}--|                 |
    |                  |<--JSON response-------|                    |                 |
    |<--MCP result-----|                       |                    |                 |
```

Resource reads follow the same pattern:
```
ClaudeCode         McpProxy              McpBackendServer       McpResources       Homarus
    |                  |                       |                    |                 |
    |--ReadResource--->|                       |                    |                 |
    |  {uri}           |                       |                    |                 |
    |                  |--POST /api/resource-->|                    |                 |
    |                  |  {uri}                |                    |                 |
    |                  |                       |--find resource---->|                 |
    |                  |                       |                    |--handler()----->|
    |                  |                       |                    |<--text-----------|
    |                  |                       |<--{uri,mime,text}--|                 |
    |                  |<--JSON response-------|                    |                 |
    |<--MCP contents---|                       |                    |                 |
```
