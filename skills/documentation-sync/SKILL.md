



⸻

name: documentation-sync
description: Audit and update repository documentation based on actual implementation. Use whenever architecture, APIs, database schemas, MCP integrations, agent systems, or user flows have changed.

Documentation Sync Skill

When invoked:

1. Read AGENTS.md
2. Read CLAUDE.md
3. Read README.md
4. Read package.json
5. Scan repository structure
6. Identify implemented features
7. Compare implementation against documentation

Goals

Maintain:

* README.md
* AGENTS.md
* CLAUDE.md
* docs/

Audit Checklist

* Architecture documented
* APIs documented
* Environment variables documented
* MCP servers documented
* Agent workflows documented
* Database schema documented
* Deployment documented
* User flows documented

Rules

Code is source of truth.

Never trust documentation without verification.

Update docs immediately after architecture changes.

Generate missing documentation automatically.

Create a documentation audit summary after every run.