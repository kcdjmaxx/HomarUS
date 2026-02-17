# Test Design: BrowserManager
**Source:** crc-BrowserManager.md

## Test: launch and close lifecycle
**Purpose:** Verify browser launches and closes cleanly
**Input:** Call launch(), verify isLaunched(), call close(), verify !isLaunched()
**Expected:** isLaunched() returns true after launch, false after close
**Refs:** crc-BrowserManager.md

## Test: auto-launch on first execute
**Purpose:** Verify execute() auto-launches browser if not already running
**Input:** Call execute({ action: "navigate", url: "https://example.com" }) without calling launch() first
**Expected:** Browser is launched automatically, action succeeds, isLaunched() returns true
**Refs:** crc-BrowserManager.md, seq-browser-action.md

## Test: navigate requires url parameter
**Purpose:** Verify param validation for navigate action
**Input:** execute({ action: "navigate" }) with no url
**Expected:** Returns { success: false, error: "url required for navigate" }
**Refs:** crc-BrowserManager.md

## Test: click requires selector parameter
**Purpose:** Verify param validation for click action
**Input:** execute({ action: "click" }) with no selector
**Expected:** Returns { success: false, error: "selector required for click" }
**Refs:** crc-BrowserManager.md

## Test: unknown action returns error
**Purpose:** Verify unknown actions are rejected
**Input:** execute({ action: "fly" } as any)
**Expected:** Returns { success: false, error: "Unknown action: fly" }
**Refs:** crc-BrowserManager.md

## Test: sandbox mode denies browser tool
**Purpose:** Verify browser tool rejects execution in sandbox mode
**Input:** Call browser tool execute() with context.sandbox = true
**Expected:** Returns { output: "", error: "browser tool is not available in sandbox mode" }
**Refs:** crc-BrowserManager.md, seq-browser-action.md

## Test: Playwright error is caught and returned
**Purpose:** Verify Playwright errors produce graceful BrowserResult
**Input:** execute({ action: "navigate", url: "https://example.com" }) where page.goto throws
**Expected:** Returns { success: false, error: <message from thrown error> }
**Refs:** crc-BrowserManager.md, seq-browser-action.md
