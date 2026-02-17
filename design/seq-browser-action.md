# Sequence: Browser Action Execution
**Requirements:** R17, R50, R54

## Participants
- Agent, ToolRegistry, BrowserTool, BrowserManager, Playwright

## Flow

```
Agent            ToolRegistry     BrowserTool      BrowserManager
 |                  |                |                |
 |--execute("browser", params, ctx)->|               |
 |                  |--checkPolicy-->|               |
 |                  |  sandbox=true? |               |
 |                  |  YES: return error "not available in sandbox mode"
 |                  |                |               |
 |                  |--execute(params, ctx)--------->|
 |                  |                |               |
 |                  |                |--execute(action)-->|
 |                  |                |               |
 |                  |                |  if !launched: |
 |                  |                |  AUTO-LAUNCH   |
```

```
BrowserManager   Playwright
 |                  |
 |==AUTO-LAUNCH (if not already launched)============|
 |                  |                                |
 |--import("playwright")                             |
 |  (dynamic import — fails if not installed)        |
 |                  |                                |
 |--chromium.launch({ headless, executablePath, proxy })-->|
 |<--browser--------|                                |
 |                  |                                |
 |--browser.newContext({ viewport })---------------->|
 |<--context--------|                                |
 |                  |                                |
 |--context.newPage()------------------------------->|
 |<--page-----------|                                |
 |                  |                                |
 |  launched = true |                                |
 |==AUTO-LAUNCH END==================================|
```

```
BrowserManager   Playwright(page)
 |                  |
 |==ACTION DISPATCH==============================|
 |                  |                            |
 |  switch(action.action):                      |
 |                  |                            |
 |  "navigate":     |                            |
 |    validate url  |                            |
 |    if missing: return {success:false, error}  |
 |--page.goto(url, {timeout})--->|               |
 |<--done-----------|                            |
 |  return {success:true, url, title, data}      |
 |                  |                            |
 |  "click":        |                            |
 |    validate selector                          |
 |--page.click(selector, {timeout})-->|          |
 |--page.waitForLoadState()---------->|          |
 |<--done-----------|                            |
 |  return {success:true, url, data}             |
 |                  |                            |
 |  "screenshot":   |                            |
 |--page.screenshot()---->|                      |
 |<--buffer----------|                           |
 |  return {success:true, screenshot:base64}     |
 |                  |                            |
 |  "content":      |                            |
 |--page.evaluate(()=>body.innerText)-->|        |
 |<--text-----------|                            |
 |  truncate if >50k chars                      |
 |  return {success:true, data}                  |
 |                  |                            |
 |  unknown action: |                            |
 |  return {success:false, error: "Unknown action"}
 |                  |                            |
 |==ACTION DISPATCH END==========================|
```

```
BrowserManager   BrowserTool      Agent
 |                  |                |
 |==ERROR PATHS==========================|
 |                  |                |
 |  Playwright throws during action: |
 |  catch err       |                |
 |  return {success:false, error: err.message, url}
 |                  |                |
 |  Missing required param (url, selector, text, script):
 |  return {success:false, error: "<param> required for <action>"}
 |                  |                |
 |  Playwright not installed:        |
 |  launch() throws "playwright is not installed"
 |                  |                |
 |==ERROR PATHS END======================|
```

```
BrowserTool      Agent
 |                  |
 |  Format result:  |
 |  success: build output string from url/title/data/screenshot
 |  failure: return {output:"", error: result.error}
 |                  |
 |<--ToolResult-----|
 |  Agent appends to messages, continues inference loop
```

## Notes
- Playwright is dynamically imported to avoid compile-time dependency — homarus builds without playwright installed
- Auto-launch is transparent: first execute() call triggers launch() if browser is not running
- The browser tool checks `context.sandbox` before delegating to BrowserManager — sandboxed agents cannot use the browser
- Page is reused across actions within the same browser session; close() resets all state
- Screenshot returns base64-encoded PNG; content truncates at 50k chars
