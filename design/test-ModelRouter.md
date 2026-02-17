# Test Design: ModelRouter
**Source:** crc-ModelRouter.md

## Test: resolve alias to full model ID
**Purpose:** Verify alias resolution
**Input:** Configure alias "smart" → "anthropic/claude-opus-4-5", resolve("smart")
**Expected:** Returns "anthropic/claude-opus-4-5"
**Refs:** crc-ModelRouter.md

## Test: resolve falls through to default
**Purpose:** Verify fallback to default model
**Input:** resolve(undefined)
**Expected:** Returns config default model
**Refs:** crc-ModelRouter.md

## Test: failover on auth error rotates profile
**Purpose:** Verify auth failure triggers profile rotation
**Input:** Chat request fails with 401, provider has 2 auth profiles
**Expected:** Retries with second profile, first profile gets cooldown
**Refs:** crc-ModelRouter.md, crc-ModelProvider.md

## Test: failover on rate limit tries next model
**Purpose:** Verify rate limit triggers model failover
**Input:** Chat request fails with 429, fallback chain configured
**Expected:** Retries with next model in fallback chain
**Refs:** crc-ModelRouter.md

## Test: token usage tracked per model
**Purpose:** Verify usage tracking
**Input:** Make chat requests to two different models
**Expected:** tokenUsage map has entries for both models with correct counts
**Refs:** crc-ModelRouter.md

## Test: budget limit stops work
**Purpose:** Verify budget enforcement
**Input:** Set budget limit to 1000 tokens, exceed it
**Expected:** checkBudget() returns true, next chat request rejected
**Refs:** crc-ModelRouter.md
