# Security

## Supported versions

Security fixes are provided for the latest `0.1.x` release.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that exposes session data,
credentials, or local files. Use the repository's private security advisory
form on GitHub:

```text
https://github.com/engida32/opencode-resume-checkpoint/security/advisories/new
```

Include the affected version, a minimal reproduction, and the impact. If the
form is unavailable, contact the maintainer through the GitHub profile.

## What the plugin stores

The plugin writes session checkpoints under
`~/.local/state/opencode-resume` by default. A checkpoint can contain:

- The last substantive user goal.
- The last assistant text.
- Tool names, arguments, output summaries, and status.
- Todo items.
- Git branch, HEAD, short status, and diff stat.
- Compaction and error notes.

The files are local. The plugin makes no network requests.

## Redaction limits

The plugin redacts private key blocks, common token formats, bearer headers, and
key-value fields such as `password`, `token`, `secret`, `api_key`, and
`authorization`. This is a safety net, not a guarantee. A secret in an unusual
format, split across lines, or encoded in a tool result may survive.

Do not put secrets in prompts, tool arguments, or command output. Treat the
checkpoint as sensitive local data.

If a secret is captured:

1. Stop using the session.
2. Rotate the credential.
3. Remove the affected checkpoint file.
4. Report the capture path if the redaction rule should have caught it.

## File permissions

On POSIX systems the state directory is created with mode `0700` and checkpoint
files with mode `0600`. The plugin chmods the directory and file after creation
when the platform allows it. Windows does not use POSIX modes.

## Trust boundary

Checkpoint content comes from prompts, tool output, and assistant text. Treat it
as untrusted when reading it back. The resume skill treats transcript and tool
content as evidence, not instructions.
