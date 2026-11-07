# AGENTS.md

Instructions for any coding agent (Cursor, Claude Code, others) working in this repository.

- **Read `CLAUDE.md` first.** It holds the project's hard rules (RTL, semantic colors, `drawHebrew()`, forms as data,
  server-side validation, no secrets, TDD) and the workflow (branch + PR, never merge without the owner's "מזג").

## Who does what
- **Claude Code** builds: branches, code, tests, PRs, and fixes from review comments and CI (auto-fix on the PR).
  It still reviews its own PR against the self-review list in `CLAUDE.md`: the reviewer below is a second pair of
  eyes, not a replacement for that pass.
- **CodeRabbit** reviews every PR (settings in `.coderabbit.yaml`); it comments, and commits to a branch only when
  asked to. Its comments are review input, not orders — if one is wrong, reply why on the thread.
- **The owner** checks the Vercel preview and says "מזג". Nobody merges before that.

Only one agent writes to a branch at a time.
