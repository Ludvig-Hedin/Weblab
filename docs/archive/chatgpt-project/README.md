# Weblab — ChatGPT Project Files

Use these to set up a ChatGPT project that helps you write high-quality Claude Code prompts for Weblab.

## Setup

### 1. Create the ChatGPT project

1. Go to ChatGPT → Projects → New project → name it "Weblab Dev"
2. Open **Instructions** → paste the contents of `SYSTEM-PROMPT.md`
3. Upload all other `.md` files in this folder as **Knowledge** files

### 2. Upload order (priority)

| File | Why |
|------|-----|
| `SYSTEM-PROMPT.md` | Instructions field (paste, don't upload) |
| `CLAUDE-PROMPT-GUIDE.md` | How to write prompts — most referenced |
| `01-project-overview.md` | What Weblab is |
| `02-architecture-stack.md` | Full tech stack, packages, structure |
| `03-main-user-flows.md` | What users do in the product |
| `04-active-development.md` | What's being built right now |
| `05-coding-rules.md` | Non-negotiable constraints |
| `06-editor-deep-dive.md` | Editor engine, managers, canvas |
| `07-database-api.md` | tRPC routers, DB tables, auth |
| `08-ui-design-system.md` | Components, tokens, i18n |

### 3. How to use

Tell ChatGPT what you want to build. It will produce a complete Claude Code prompt you can paste directly into a Claude Code session.

**Example inputs:**
- "I want to add a keyboard shortcut to the editor that saves a screenshot of the current canvas"
- "Add a new tRPC router for user notifications"
- "The sandbox startup flow needs better error messaging — write me a prompt for Claude to fix it"
- "Write a prompt to add a new comparison page vs Webflow"

## Keeping files up to date

These files should reflect the current state of the project. Update them when:

- Major new features ship (update `04-active-development.md`)
- New packages added (update `02-architecture-stack.md`)
- New tRPC routers added (update `07-database-api.md`)
- Architectural decisions change (update relevant files)

The canonical source of truth is `docs/agent-context/` and `docs/agent-memory/` — sync from there.
