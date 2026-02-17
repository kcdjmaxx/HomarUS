# BrowserManager
**Requirements:** R17, R50, R54

## Knows
- browser: Browser | null (Playwright browser instance)
- context: BrowserContext | null (browser context with viewport settings)
- page: Page | null (active page for actions)
- config: BrowserConfig (headless, executablePath, proxy, viewport, timeout)
- logger: Logger
- launched: boolean (whether browser is currently running)

## Does
- launch(): Dynamically import Playwright, launch Chromium with config, create context and page
- close(): Close context and browser, reset state to null
- isLaunched(): Return whether browser is currently running
- execute(action): Dispatch a BrowserAction (navigate, click, type, screenshot, content, evaluate, back, forward, wait, scroll), auto-launching if needed

## Collaborators
- Homarus: creates BrowserManager on startup, closes on shutdown
- ToolRegistry: browser tool delegates execute() calls to BrowserManager
- Agent: calls browser tool during inference loop

## Sequences
- seq-browser-action.md
