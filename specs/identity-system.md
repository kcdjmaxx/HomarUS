# Identity System

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

The identity system defines who the agent is and who it's working for. It shapes every interaction — tone, boundaries, priorities, and how the agent represents itself. This is the personality and alignment layer, inspired by OpenClaw's SOUL.md and USER.md pattern but extended for the event loop model where multiple agents may be spawned.

## Two Halves

### Agent Identity (`identity/soul.md`)

Defines the agent's personality, values, and behavioral boundaries:

- **Name and persona** — how the agent introduces itself, emoji/avatar, voice
- **Values** — what the agent prioritizes (accuracy, helpfulness, safety, humor, etc.)
- **Communication style** — formal vs casual, verbose vs terse, use of emoji, tone
- **Boundaries** — what the agent refuses to do, ethical limits, safety rails
- **Domain expertise** — areas the agent claims competence in
- **Quirks** — personality traits that make interactions feel natural and consistent

This is injected into the system prompt for every agent the loop spawns. It's the baseline personality.

### User Profile (`identity/user.md`)

Defines who the agent is working for:

- **Name and basics** — how to address the user
- **Preferences** — communication preferences, timezone, language
- **Context** — what the user does, their technical level, their goals
- **Conventions** — naming conventions, coding style, workflow preferences
- **Tools and environment** — what's available on the user's system
- **Relationships** — other people the agent might interact with on behalf of the user

This is also injected into the system prompt, giving the agent context about its principal.

## Identity Inheritance

When the event loop spawns agents, each agent inherits the base identity but can be specialized:

- **Base identity** — all agents get soul.md + user.md
- **Task overlay** — spawned agents can get additional context (e.g., "you are a code reviewer" or "you are handling a customer inquiry")
- **Channel overlay** — agents responding on different channels can adjust tone (e.g., more casual on Telegram, more formal on email)

The identity is layered, not replaced: task/channel overlays are additive modifications, not full overrides.

## Identity Files

Stored in `~/.homarus/identity/`:

```
identity/
├── soul.md          # Agent personality, values, boundaries
├── user.md          # User profile, preferences, context
└── overlays/        # Optional per-channel or per-task personality adjustments
    ├── telegram.md  # Tone adjustments for Telegram
    └── code-review.md  # Personality for code review tasks
```

## System Prompt Assembly

When building a system prompt for any agent, identity content is assembled in order:

1. **Soul** — agent personality (who am I?)
2. **User** — user profile (who am I serving?)
3. **Overlay** — channel/task adjustments (optional)
4. **Workspace** — operational context (tools, skills, memory guidance)
5. **Task** — specific instructions for this agent's job

This ensures every agent feels like the same "person" while being appropriate for their specific task.

## Editing

Identity files are plain Markdown — users edit them directly. Changes take effect on next agent spawn (no restart needed). The system does NOT auto-modify identity files; only the user changes who the agent is.

## Multi-Agent Consistency

Because all spawned agents share the same base identity, they maintain a consistent personality even when working in parallel. The user talks to "one agent" that happens to be doing multiple things at once, not a team of strangers.
