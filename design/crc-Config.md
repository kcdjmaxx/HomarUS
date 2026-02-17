# Config
**Requirements:** R63, R64, R65, R66, R67

## Knows
- data: ConfigData (parsed, validated config)
- configPath: string (path to config file)
- schema: JSONSchema (validation schema)
- watcher: FSWatcher | null (for hot reload)

## Does
- load(path?): Read config file, resolve env vars, validate against schema
- get(key): Return a config value by dotted path (e.g., "models.default")
- getSection(section): Return a full config section (e.g., "channels")
- validate(): Validate current config against schema, throw on unknown keys
- resolveEnvVars(value): Replace ${VAR_NAME} references with environment values
- loadEnvFile(): Load .env file from config directory
- startWatching(): Watch config file for changes, apply safe changes, warn on unsafe
- stopWatching(): Stop config file watcher
- isSafeChange(oldConfig, newConfig): Determine if a config diff can be hot-applied

## Collaborators
- Homarus: provides config to all subsystems
- All managers: read their configuration sections

## Sequences
- seq-startup.md
