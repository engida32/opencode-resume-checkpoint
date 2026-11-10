# Architecture

The package has a small runtime and a thin delivery layer.

## Components

`src/plugin.js` contains the OpenCode plugin. It registers the session hooks and
the `resume_checkpoint` tool. It owns the policy for what to record and when to
mark a tool call unknown.

`src/checkpoint.js` owns the checkpoint schema, path calculation, atomic writes,
reads, and the recent-notes cap. It also provides the `todosAt` field used by
todo reconciliation.

`src/redact.js` owns text clipping, error formatting, and secret redaction.

`src/git.js` owns the git snapshot and a two-second cache. The cache prevents a
burst of tool calls from running git repeatedly against the same directory.

`commands/resume.md` is a one-line command. It hands control to the skill.

`skills/resume/SKILL.md` is the procedure. It reconstructs the task, verifies it
against disk, reconciles todos, handles interrupted tools, and reports a brief
before continuing.

`scripts/install-lib.js` and `scripts/install.js` copy the built plugin, command,
and skill into an OpenCode config directory. The installer can run in dry-run
mode, overwrite differing files, or uninstall.

## Data flow

1. The user sends a normal message.
2. The plugin's `chat.message` hook records the goal unless the text is a resume
   prompt.
3. Tool hooks record the call before execution and the result after it.
4. `todo.updated` stores the current list and sets `todosAt`.
5. Assistant text updates the assistant tail.
6. Idle, compaction, and error events update the session status and add notes.
7. The user runs `/resume`.
8. The command loads the skill.
9. The skill calls `resume_checkpoint`.
10. The skill compares the checkpoint with the conversation and disk.
11. The skill reconciles the todo list.
12. The skill reports a brief and continues from the last verified step.

## Checkpoint schema

A checkpoint is JSON with these top-level fields:

| Field | Meaning |
| --- | --- |
| `schema` | Schema version, currently `1`. |
| `sessionID` | OpenCode session identifier. |
| `project` | Project key built from the directory name and a hash. |
| `directory` | Working directory at capture time. |
| `updatedAt` | Last write time. |
| `status` | `active`, `idle`, `compacted`, or `error`. |
| `goal` | Last substantive user goal. |
| `goalAt` | Goal capture time. |
| `lastUserMessageID` | Message ID used to keep assistant text separate. |
| `assistantTail` | Last assistant text, clipped. |
| `assistantTailAt` | Assistant text capture time. |
| `todos` | Last todo list, capped at 50 items. |
| `todosAt` | Todo snapshot time. |
| `lastTool` | Last tool call, including args and state. |
| `recentTools` | Recent calls, capped at 20, without args or output. |
| `git` | Branch, HEAD, short status, diff stat, and capture time. |
| `notes` | Compaction and error notes, capped at 20. |

The schema is versioned because the plugin must tolerate records from older
installs. `normalizeCheckpoint` fills missing fields and caps arrays on read.

## Storage

The state root defaults to `~/.local/state/opencode-resume`. The environment
variable `OPENCODE_RESUME_STATE_DIR` overrides it.

Paths use a readable project name plus a hash of the full directory path. The
hash keeps two projects with the same basename separate. Session IDs are used as
file names because OpenCode session IDs are already safe identifiers.

Saves write a temporary file in the destination directory, then rename it. This
keeps a crash from leaving a half-written JSON file. The directory is created
with mode `0700`; the file is written with mode `0600` and chmodded again after
the rename.

## Todo reconciliation

The plugin records `todosAt` whenever `todo.updated` fires. The skill treats that
timestamp as evidence of when the list was captured, not as proof that every item
is still accurate.

The skill follows four rules:

- Preserve the list and its wording.
- Require evidence before marking an item completed.
- Do not silently reopen a completed item.
- Ask when the evidence cannot settle the status.

An `in_progress` item is checked against its expected effect. If the effect is
missing, the item stays as the next action or becomes pending with a note. If the
last tool was interrupted, the label is not trusted over the workspace.

## Packaging

The OpenCode plugin is bundled into one ESM file with esbuild. The bundle keeps
`@opencode-ai/plugin` external because OpenCode provides it at runtime. The
installer copies `dist/plugin.js` to the global plugins directory, so the
installed file has no relative imports.

The npm package exposes the bundle through `main` and the `./server` export. The
named `server` export and default export both point at the plugin function. This
matches the pattern used by other OpenCode plugins and leaves room for the loader
to choose either form.

The command and skill are shipped as files. OpenCode does not discover skills
inside npm packages automatically, so the installer copies them into the user's
config directory.

## Failure modes

Plugin load failure: no checkpoint is written. The skill still works from the
conversation, and the fallback export path handles compacted history.

No checkpoint for a session: the plugin was not loaded when the session ran, or
the session ID does not match. The skill reports the gap and reconstructs from
the transcript.

Stale checkpoint: the skill re-checks the git state and relevant files. Disk wins
over the checkpoint.

Interrupted tool call: the checkpoint marks a running call as `unknown` on idle.
The skill checks for the effect before replaying the call.

Compaction: the plugin adds a note. The skill treats summaries as secondary
evidence and verifies their claims against disk.

Concurrent sessions: checkpoints are keyed by session ID. A lookup scans other
project directories only when the primary path is missing.

## Security boundaries

The plugin is local code inside the OpenCode process. It can read the working
directory and run git. It does not make network requests.

Checkpoint content comes from prompts, tool arguments, tool output, and assistant
text. Treat it as untrusted when reading it back. Redaction reduces accidental
secret capture but cannot catch every secret format.

State files are readable by the current user. They are not encrypted. Do not use
the state directory as a secret store.
