# Test Design: SkillManager
**Source:** crc-SkillManager.md

## Test: load skill from directory
**Purpose:** Verify skill loading from manifest
**Input:** Create skill directory with valid skill.json, call load(path)
**Expected:** Skill created, tools registered, event handlers registered
**Refs:** crc-SkillManager.md, crc-Skill.md

## Test: skill tools available after load
**Purpose:** Verify skill tools are in the registry
**Input:** Load skill that defines 2 tools
**Expected:** ToolRegistry has both tools, getTools() includes them
**Refs:** crc-SkillManager.md, crc-ToolRegistry.md

## Test: hot reload replaces skill
**Purpose:** Verify hot reload cycle
**Input:** Load skill, modify manifest, trigger reload
**Expected:** Old instance stopped, new instance started, tools re-registered
**Refs:** crc-SkillManager.md

## Test: invalid manifest rejected
**Purpose:** Verify manifest validation
**Input:** Skill directory with malformed skill.json
**Expected:** Load fails with descriptive error, no partial registration
**Refs:** crc-SkillManager.md

## Test: skill event handler registered
**Purpose:** Verify skills can handle events
**Input:** Load skill that handles "order_submitted", emit that event
**Expected:** Event delivered to skill via its transport
**Refs:** crc-SkillManager.md, crc-Skill.md, seq-skill-callback.md
