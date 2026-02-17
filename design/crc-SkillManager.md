# SkillManager
**Requirements:** R20, R21, R22, R25, R26, R27

## Knows
- skills: Map<string, Skill> (name → loaded skill)
- searchPaths: string[] (directories to scan for skills)
- watcher: FSWatcher | null (for hot reload)

## Does
- loadAll(): Scan searchPaths, read manifests, instantiate skills
- load(path): Load a single skill from a directory
- unload(name): Gracefully stop and remove a skill
- reload(name): Unload then re-load a skill (hot reload)
- get(name): Return a skill by name
- getAll(): Return all loaded skills
- getTools(): Aggregate all tools from all skills
- startWatching(): Watch skill directories for changes, trigger reload
- stopWatching(): Stop filesystem watcher

## Collaborators
- Skill: manages individual skill instances
- EventBus: registers skill event handlers
- ToolRegistry: registers skill-provided tools
- Homarus: notified on skill load/unload

## Sequences
- seq-startup.md
- seq-skill-callback.md
