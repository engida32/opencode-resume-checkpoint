# Changelog

All notable changes to this project are documented here.

The format follows Keep a Changelog, and the project uses semantic versioning.

## [0.1.0] - 2026-11-10

### Added

- Rolling session checkpoints for goals, tool calls, todos, assistant text, git
  state, and session events.
- A `/resume` command that hands off to a resume skill.
- A todo reconciliation phase that checks stale todos against files, git state,
  tests, and the last tool.
- A `todosAt` snapshot time in every checkpoint.
- Secret redaction for private keys, common tokens, bearer headers, and
  key-value credential fields.
- A `resume_checkpoint` tool for reading the current session snapshot.
- An installer with dry-run, force, custom config directory, and uninstall modes.
- Unit and packaging tests covering redaction, storage, plugin hooks, content,
  build output, and installer actions.
- CI for Node 20, 22, and 24.
