# opencode-resume-checkpoint

Resume interrupted OpenCode sessions from the last verified stopping point.

OpenCode can stop in the middle of a tool call, lose a provider stream, compact
its history, or restart. When that happens, the next session often starts with a
stale todo list and an unclear picture of what reached disk. This package keeps a
rolling checkpoint for the session, then gives `/resume` a procedure that checks
the checkpoint against the real workspace before it continues.

It has three parts:

- A plugin that records the goal, tool calls, todos, assistant tail, git state,
  and session events.
- A `/resume` command and skill that reconstruct the last task and verify it.
- A todo reconciliation phase that prevents a stale checklist from being trusted
  as current state.

## Requirements

- OpenCode 1.19.x with the V1 plugin API.
- Node.js 20 or newer for the installer and tests. The plugin itself runs inside
  OpenCode.

The plugin declares `@opencode-ai/plugin` as a peer dependency in the range
`>=1.18.0 <2`. It is not tested against the OpenCode V2 plugin API.

## Install

From a source checkout:

```bash
git clone https://github.com/engida32/opencode-resume-checkpoint.git
cd opencode-resume-checkpoint
npm install
npm run build
node scripts/install.js
```

From npm, once the package is published:

```bash
npm install -g opencode-resume-checkpoint
opencode-resume-checkpoint install
```

The installer writes three files under `~/.config/opencode` or
`$XDG_CONFIG_HOME/opencode`:

- `plugins/resume-checkpoint.js`
- `commands/resume.md`
- `skills/resume/SKILL.md`

Restart OpenCode or open a new session after installing. A running session may
keep the old command template and plugin code in memory.

Useful installer options:

```bash
opencode-resume-checkpoint --dry-run
opencode-resume-checkpoint --force
opencode-resume-checkpoint --config-dir /path/to/opencode
opencode-resume-checkpoint --uninstall
```

`--force` overwrites files that differ from the package copies. Without it, the
installer reports `skipped` and exits with a non-zero status.

## Use

Run:

```text
/resume
```

The command is one short sentence. The `resume` skill does the work. It calls
`resume_checkpoint` first, then reports:

1. The interrupted goal.
2. The interruption type and last tool state.
3. What is done, with file or command evidence.
4. Todo reconciliation, with evidence.
5. What is still in flight or uncertain.
6. Discrepancies between the checkpoint, the conversation, and the disk.
7. The next action.
8. Blockers or questions.
9. A confidence level.

The skill does not edit files or run a mutating tool until that brief is
complete. It never silently repeats an unsafe call. If a tool was interrupted,
it checks whether the effect already exists before replaying it.

### Stale todos

The checkpoint stores the last todo list and the time it was captured in
`todosAt`. That timestamp is a snapshot time, not proof that the list is current.

During resume the skill:

- Reads the list with `todoread` when available.
- Falls back to the checkpoint's `todos`, then to the last `todowrite` call.
- Checks each item against files, git state, tests, and the last tool.
- Never marks an item completed without evidence.
- Never silently reopens a completed item. It flags the conflict and asks.
- Preserves every item and its wording.
- Updates the list once with `todowrite` after the brief.

If the evidence is ambiguous, the skill asks instead of guessing. It cannot know
what you intended, only what the workspace and checkpoint show.

## How it works

The plugin subscribes to these OpenCode hooks:

- `chat.message` records the substantive user goal. It ignores the `/resume`
  prompt so the prompt does not replace the real task.
- `tool.execute.before` and `tool.execute.after` record the last tool call and
  whether it completed.
- `event` handles `todo.updated`, assistant text updates, `session.idle`,
  `session.compacted`, and `session.error`.
- The `resume_checkpoint` tool returns the stored snapshot for the current
  session.

Checkpoints are JSON files under:

```text
~/.local/state/opencode-resume/
  <project>-<hash>/
    <sessionID>.json
  logs/
    plugin.log
```

Set `OPENCODE_RESUME_STATE_DIR` to use a different root.

Each checkpoint contains:

- Schema version, session ID, project key, and directory.
- Status (`active`, `idle`, `compacted`, `error`).
- Last substantive goal and when it was recorded.
- Assistant tail and when it was updated.
- Todos, `todosAt`, and the last tool call.
- Recent tool calls, capped at 20.
- Git branch, HEAD, short status, and diff stat.
- Notes added by compaction or error events.

Writes are atomic within the state directory. Directories use mode `0700` and
files use mode `0600` on systems that support POSIX modes.

Secret redaction covers private key blocks, common token formats, bearer
headers, and key-value fields such as `password`, `token`, `secret`,
`api_key`, and `authorization`. Redaction is a safety net, not a guarantee.
Do not put secrets in prompts, commands, or tool output.

The plugin makes no network requests.

## Uninstall

```bash
opencode-resume-checkpoint --uninstall
```

This removes the installed plugin, command, and skill. It does not remove the
state directory. Delete it yourself if you want a clean slate:

```bash
rm -rf ~/.local/state/opencode-resume
```

## Troubleshooting

### `/resume` is missing

Restart OpenCode, then check that the command is registered:

```bash
opencode debug config
```

Confirm these files exist:

```text
~/.config/opencode/commands/resume.md
~/.config/opencode/skills/resume/SKILL.md
~/.config/opencode/plugins/resume-checkpoint.js
```

### The command still shows an old template

OpenCode keeps command and plugin code in memory for the running session.
Restart OpenCode or start a new session.

### `resume_checkpoint` is unavailable

The plugin probably did not load. Check:

```bash
node --check ~/.config/opencode/plugins/resume-checkpoint.js
tail -n 50 ~/.local/state/opencode-resume/logs/plugin.log
```

Also confirm that the global `plugin` configuration is not denying the file.

### There is no checkpoint for this session

The plugin was not loaded while the session was running, or the session ID does
not match. The skill then reconstructs from the conversation. If the history was
also compacted, it uses the fallback export procedure in the skill.

### The installer reports `skipped`

The target file differs from the package copy. Inspect the difference, then run
with `--force` if you want to replace it.

## Development

```bash
npm install
npm test
npm run check
npm run pack
```

`npm test` builds the bundle and runs the `node:test` suite. `npm run pack`
checks the published file list without writing a tarball.

The source layout:

```text
src/plugin.js       plugin hooks and the resume_checkpoint tool
src/checkpoint.js   checkpoint paths, schema, storage, and todo snapshots
src/redact.js       secret redaction and text helpers
src/git.js          git state capture and short-lived cache
commands/resume.md  the one-line /resume command
skills/resume/      the resume procedure and todo reconciliation
scripts/            installer library and CLI
test/               unit and packaging tests
docs/architecture.md
```

Pull requests should keep one logical change per commit, include a test for
behavior changes, and pass `npm test` and `npm run check`.

## License

MIT. See [LICENSE](LICENSE).
