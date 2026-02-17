# CLI
**Requirements:** R68, R70

## Knows
- configPath: string (resolved config file location)
- daemonType: "systemd" | "launchd" (detected from OS)

## Does
- init(): Run onboarding wizard — create config, set up model auth, configure channels
- start(): Load config, start Homarus (foreground or daemon)
- stop(): Send shutdown signal to running instance
- status(): Display running state (agents, queue, channels, skills)
- configValidate(): Load and validate config file, report errors
- skillList(): List all loaded skills with status
- skillAdd(path): Register a new skill directory
- installDaemon(): Generate and install systemd/launchd service file
- uninstallDaemon(): Remove daemon service file

## Collaborators
- Config: loads and validates configuration
- Homarus: starts/stops the main process
- HttpApi: queries status from running instance

## Sequences
- seq-startup.md
