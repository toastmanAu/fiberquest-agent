# FiberQuest Agent — Cline Autonomous Development Guide

This document tells Cline (the autonomous agent) how to safely maintain FiberQuest.

## What Cline Can Do Freely ✅

- Fix failing tests
- Run `npm test`, `npm run lint`
- Format code with Prettier
- Fix ESLint warnings
- Update documentation (README, comments, guides)
- Refactor non-critical modules (validators, utilities)
- Add new test cases
- Create bug reports or improvement suggestions
- Review git history and diffs

## What Requires Your Approval ⚠️

- Changes to: `src/index.js`, `src/ckb-client.js`, `src/fiber-settler.js`, `src/signer-factory.js`
- Adding new npm dependencies
- Modifying `package.json` or `.env`
- Running external commands (curl, ssh, etc.)
- Deploying or pushing to production
- Changing critical configuration

## Core Modules — Hands Off

### `src/index.js` (Agent Orchestrator)
- Spawns subagents, manages HTTP API
- **Changes risk breaking the entire system**
- Cline: only touch if explicitly asked + approved

### `src/ckb-client.js` (CKB RPC Polling)
- Polls testnet every 12s for deposits
- **Changes risk missing transactions or polling wrong addresses**
- Only modify under supervision

### `src/fiber-settler.js` (Payment Settlement)
- Opens channels, sends prizes, closes channels
- **Wrong changes = lost money or stuck channels**
- Never touch without approval

### `src/game-validator.js` (Validation Logic)
- Pattern matching + Deepseek reasoning
- **Safe to refactor** — has tests, and failures are obvious
- OK to improve detection patterns

## Test Workflow for Cline

Every time you edit code:

```bash
npm test                    # Run all tests
npm run lint               # Check for errors
npx prettier --write .     # Format code
git diff                   # Review changes
git commit -m "[agent] module: description"
```

If tests fail: **revert and ask for help**.

## Safe Targets for Improvement

These modules are **low-risk** and good for Cline to improve:

- `src/validators/pokemon-fire-red.js` — add better bounds checking
- `src/validators/mortal-kombat-2.js` — improve health/combo validation
- `src/validators/mario-kart-64.js` — enhance lap time checking
- `src/website-api.js` — add new HTTP endpoints (with approval)
- `docs/*` — update guides, examples, architecture
- Tests — expand coverage, add edge cases

## Performance Targets

- **CKB polling:** 12s interval, detect deposits within 12-24s
- **Game validation:** <500ms pattern match + ~30s Deepseek reasoning
- **Fiber settlement:** <6s on-chain finalization
- **Database queries:** <100ms for tournament lookups
- **Test coverage:** >80% for critical paths

If Cline's changes degrade any metric, tests will fail. Trust the tests.

## Git Workflow

Cline should commit early and often:

```
[agent] validators: improve pokemon bounds checking
[agent] tests: add edge cases for MK2 combos
[agent] docs: update API reference
[agent] refactor: simplify tournament creation logic
```

This keeps history clear and makes it easy for you to review or revert.

## When Cline Gets Stuck

If a change fails tests and Cline can't figure out why:

1. Run `npm test -- --verbose` for detailed output
2. Check `ARCHITECTURE.md` for data flow diagrams
3. Review recent git history: `git log --oneline -10`
4. Ask for clarification instead of guessing

## External Services (Cline Should Request Approval)

- **CKB Testnet RPC** (`https://testnet.ckb.dev`) — read-only, safe for Cline
- **Fiber RPC** (`http://192.168.68.79:8227`) — writes channels, requires approval
- **Ollama Inference** (`http://192.168.68.79:11434`) — read-only, safe for Cline
- **Deepseek Reasoning** (via Ollama) — safe, approval already built into config

## Success Looks Like

- All tests passing ✅
- No ESLint warnings ✅
- Code formatted with Prettier ✅
- New features documented ✅
- Git history clean and clear ✅

If Cline achieves this, the tournament is stable and ready for testing.

---

**Cline: You're a junior engineer with guardrails. Stay focused, test often, and ask when unsure.** 🚀
