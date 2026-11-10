# Contributing

Thanks for taking the time to improve the package.

## Before you start

Open an issue for a behavior change, a new hook, or a packaging change. Small
fixes and documentation corrections can go straight to a pull request.

Do not paste real session checkpoints, secrets, or private workspace paths into
an issue. Reproduce with a temporary directory and a synthetic session ID.

## Development

```bash
npm install
npm test
npm run check
npm run pack
```

`npm test` builds the bundle and runs the tests with `node:test`. `npm run check`
runs syntax checks on the source and installer. `npm run pack` verifies the
published file list.

## Test first

Write a failing test before changing behavior. Watch it fail for the expected
reason, then write the smallest change that passes. Keep tests close to the
behavior they protect: redaction in `test/redact.test.js`, storage in
`test/checkpoint.test.js`, hooks in `test/plugin.test.js`, and installer actions
in `test/install.test.js`.

When a test cannot be written first, explain why in the pull request.

## Commit style

Use Conventional Commits:

```text
feat: add todo snapshot time
fix: keep the last tool state on idle
docs: explain checkpoint storage
test: cover redaction of bearer headers
chore: update the build script
```

Keep one logical change per commit. Put a behavior change and its test in the
same commit. Do not mix formatting, refactoring, and feature work in one commit.

## Pull requests

A pull request should explain:

- What changed.
- Why it changed.
- How you verified it.
- Any remaining risk or compatibility limit.

Run the full test suite before you ask for review. If a check fails for a reason
outside your change, say so in the pull request instead of hiding it.

## Compatibility

The package targets the OpenCode V1 plugin API used by 1.19.x. A change that
requires a newer plugin API, a new OpenCode event shape, or a new permission must
be called out in the pull request and in the changelog.

## License

By contributing, you agree that your contribution is licensed under the MIT
License in this repository.
