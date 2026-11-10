import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import {
  MAX_NOTES,
  MAX_RECENT_TOOLS,
  MAX_TODOS,
  SCHEMA,
  blankCheckpoint,
  createCheckpointStore,
  defaultStateRoot,
  normalizeCheckpoint,
  projectKey,
} from "../src/checkpoint.js"

function tempRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), "resume-checkpoint-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

test("projectKey is stable, readable, and path-safe", () => {
  const key = projectKey("/home/me/my project")
  assert.match(key, /^my-project-[a-f0-9]{12}$/)
  assert.equal(key, projectKey("/home/me/my project"))
  assert.notEqual(key, projectKey("/home/me/other project"))
  assert.doesNotMatch(key, /[/\\ ]/)
})

test("defaultStateRoot honors the environment override", () => {
  assert.equal(
    defaultStateRoot({ OPENCODE_RESUME_STATE_DIR: "/tmp/custom-state" }, "/home/me"),
    "/tmp/custom-state",
  )
  assert.equal(
    defaultStateRoot({}, "/home/me"),
    join("/home/me", ".local", "state", "opencode-resume"),
  )
})

test("blankCheckpoint starts empty and records the todo snapshot time", () => {
  const checkpoint = blankCheckpoint("/tmp/project", "ses_blank", "2026-11-10T10:00:00.000Z")
  assert.equal(checkpoint.schema, SCHEMA)
  assert.equal(checkpoint.sessionID, "ses_blank")
  assert.equal(checkpoint.goal, "")
  assert.deepEqual(checkpoint.todos, [])
  assert.equal(checkpoint.todosAt, null)
  assert.equal(checkpoint.git.isRepo, false)
  assert.equal(checkpoint.updatedAt, "2026-11-10T10:00:00.000Z")
})

test("normalizeCheckpoint caps stored arrays and preserves todosAt", () => {
  const value = {
    schema: SCHEMA,
    sessionID: "ses_normalize",
    directory: "/tmp/project",
    todos: Array.from({ length: MAX_TODOS + 10 }, (_, index) => ({
      content: `todo ${index}`,
      status: "pending",
      priority: "medium",
    })),
    recentTools: Array.from({ length: MAX_RECENT_TOOLS + 5 }, (_, index) => ({
      name: `tool ${index}`,
      state: "completed",
    })),
    notes: Array.from({ length: MAX_NOTES + 5 }, (_, index) => `note ${index}`),
    todosAt: "2026-11-10T10:00:00.000Z",
  }

  const checkpoint = normalizeCheckpoint(value, "/tmp/project", "ses_normalize")
  assert.equal(checkpoint.todos.length, MAX_TODOS)
  assert.equal(checkpoint.recentTools.length, MAX_RECENT_TOOLS)
  assert.equal(checkpoint.notes.length, MAX_NOTES)
  assert.equal(checkpoint.notes[0], "note 5")
  assert.equal(checkpoint.todosAt, "2026-11-10T10:00:00.000Z")
})

test("normalizeCheckpoint defaults todosAt to null for old records", () => {
  const checkpoint = normalizeCheckpoint(
    { schema: SCHEMA, sessionID: "ses_old", directory: "/tmp/project" },
    "/tmp/project",
    "ses_old",
  )
  assert.equal(checkpoint.todosAt, null)
})

test("store saves and finds a checkpoint with private file modes", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  const checkpoint = blankCheckpoint("/tmp/project", "ses_roundtrip", "2026-11-10T10:00:00.000Z")
  checkpoint.goal = "finish the audit"
  checkpoint.todos = [{ content: "write tests", status: "in_progress", priority: "high" }]
  checkpoint.todosAt = "2026-11-10T10:01:00.000Z"

  store.save(checkpoint)

  const file = store.pathFor("/tmp/project", "ses_roundtrip")
  assert.equal(statSync(file).mode & 0o777, 0o600)
  assert.equal(statSync(dirname(file)).mode & 0o777, 0o700)
  assert.ok(!readdirSync(dirname(file)).some((name) => name.endsWith(".tmp")))

  const loaded = store.find("ses_roundtrip", "/tmp/project")
  assert.equal(loaded.goal, "finish the audit")
  assert.deepEqual(loaded.todos, checkpoint.todos)
  assert.equal(loaded.todosAt, checkpoint.todosAt)
})

test("store finds a session checkpoint from another project directory", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  store.save(blankCheckpoint("/tmp/project-a", "ses_cross"))

  const found = store.find("ses_cross", "/tmp/project-b")
  assert.equal(found.sessionID, "ses_cross")
  assert.equal(found.directory, "/tmp/project-a")
})

test("store load returns an empty checkpoint when none exists", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  const checkpoint = store.load("/tmp/project", "ses_missing")
  assert.equal(checkpoint.sessionID, "ses_missing")
  assert.equal(checkpoint.directory, "/tmp/project")
  assert.equal(checkpoint.goal, "")
})

test("store ignores corrupt or wrong-schema records", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  store.save(blankCheckpoint("/tmp/project", "ses_corrupt"))
  writeFileSync(store.pathFor("/tmp/project", "ses_corrupt"), JSON.stringify({ schema: 999 }))
  assert.equal(store.find("ses_corrupt", "/tmp/project"), null)
})

test("store addNote redacts secrets and keeps only the latest notes", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  const checkpoint = blankCheckpoint("/tmp/project", "ses_notes")

  store.addNote(checkpoint, "password=supersecret")
  assert.equal(checkpoint.notes[0], "password=[redacted]")

  for (let index = 0; index < MAX_NOTES + 5; index += 1) {
    store.addNote(checkpoint, `note ${index}`)
  }
  assert.equal(checkpoint.notes.length, MAX_NOTES)
  assert.equal(checkpoint.notes.at(-1), `note ${MAX_NOTES + 4}`)
})

test("saved checkpoint is valid JSON with the todosAt field", (t) => {
  const stateRoot = tempRoot(t)
  const store = createCheckpointStore({ stateRoot })
  const checkpoint = blankCheckpoint("/tmp/project", "ses_json")
  checkpoint.todosAt = "2026-11-10T10:02:00.000Z"
  store.save(checkpoint)

  const value = JSON.parse(readFileSync(store.pathFor("/tmp/project", "ses_json"), "utf8"))
  assert.equal(value.todosAt, "2026-11-10T10:02:00.000Z")
})
