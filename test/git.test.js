import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createGitSnapshotCache, gitSnapshot } from "../src/git.js"

function tempRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), "resume-git-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function git(directory, args) {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim()
}

test("gitSnapshot reports a non-repository directory", (t) => {
  const directory = tempRoot(t)
  const snapshot = gitSnapshot(directory)
  assert.equal(snapshot.isRepo, false)
  assert.match(snapshot.at, /^\d{4}-\d{2}-\d{2}T/)
})

test("gitSnapshot records branch, head, and dirty files", (t) => {
  const directory = tempRoot(t)
  git(directory, ["init", "-b", "main"])
  writeFileSync(join(directory, "a.txt"), "a\n")
  git(directory, ["add", "a.txt"])
  git(directory, ["commit", "-m", "init"])
  writeFileSync(join(directory, "b.txt"), "b\n")

  const snapshot = gitSnapshot(directory)
  assert.equal(snapshot.isRepo, true)
  assert.equal(snapshot.branch, "main")
  assert.match(snapshot.head, /^[a-f0-9]+$/)
  assert.match(snapshot.statusShort, /\?\? b\.txt/)
})

test("gitSnapshotCache reuses a value for the same directory", () => {
  let calls = 0
  const cached = createGitSnapshotCache((directory) => {
    calls += 1
    return { isRepo: false, at: String(calls), directory }
  })

  assert.equal(cached("/tmp/one").at, "1")
  assert.equal(cached("/tmp/one").at, "1")
  assert.equal(calls, 1)
  assert.equal(cached("/tmp/two").at, "2")
  assert.equal(calls, 2)
})
