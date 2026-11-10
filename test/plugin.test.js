import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  createResumeCheckpoint,
  isResumePrompt,
  messageText,
} from "../src/plugin.js"
import { createCheckpointStore } from "../src/checkpoint.js"

const SESSION = "ses_test"
const SNAPSHOT = Object.freeze({
  isRepo: true,
  branch: "main",
  head: "abc1234",
  statusShort: " M src/parser.js",
  diffStat: " src/parser.js | 2 +-",
  at: "2026-11-10T10:00:00.000Z",
})

function tempRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), "resume-plugin-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function fixture(t) {
  const stateRoot = tempRoot(t)
  const root = tempRoot(t)
  const factory = createResumeCheckpoint({
    stateRoot,
    root,
    snapshot: () => SNAPSHOT,
  })
  const hooks = await factory({ directory: root, worktree: root })
  const store = createCheckpointStore({ stateRoot })
  return { stateRoot, root, hooks, store }
}

function checkpointFor(store, root, sessionID = SESSION) {
  return JSON.parse(readFileSync(store.pathFor(root, sessionID), "utf8"))
}

function userMessage(text, id = "msg_user") {
  return {
    input: { sessionID: SESSION },
    output: {
      message: { id, sessionID: SESSION },
      parts: [{ type: "text", text }],
    },
  }
}

test("isResumePrompt recognizes the current and legacy prompts", () => {
  assert.equal(
    isResumePrompt("Resuming from the last interruption: load and follow the `resume` skill."),
    true,
  )
  assert.equal(isResumePrompt("/resume"), true)
  assert.equal(isResumePrompt("Call the `resume_checkpoint` tool first"), true)
  assert.equal(isResumePrompt("implement the parser"), false)
  assert.equal(isResumePrompt(""), false)
})

test("messageText ignores synthetic, ignored, and non-text parts", () => {
  assert.equal(
    messageText([
      { type: "text", text: "one" },
      { type: "text", text: "two", synthetic: true },
      { type: "text", text: "three", ignored: true },
      { type: "tool", text: "four" },
    ]),
    "one",
  )
})

test("chat.message records the substantive goal", async (t) => {
  const { hooks, store, root } = await fixture(t)
  const { input, output } = userMessage('  "Implement the parser"  ')
  await hooks["chat.message"](input, output)

  const checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.goal, "Implement the parser")
  assert.equal(checkpoint.lastUserMessageID, "msg_user")
  assert.match(checkpoint.goalAt, /^\d{4}-\d{2}-\d{2}T/)
})

test("chat.message does not overwrite the goal with the resume prompt", async (t) => {
  const { hooks, store, root } = await fixture(t)
  const { input, output } = userMessage(
    "Resuming from the last interruption: load and follow the `resume` skill.",
  )
  await hooks["chat.message"](input, output)
  assert.equal(store.find(SESSION, root), null)
})

test("todo.updated stores the list and its snapshot time", async (t) => {
  const { hooks, store, root } = await fixture(t)
  await hooks.event({
    event: {
      type: "todo.updated",
      properties: {
        sessionID: SESSION,
        todos: [
          { content: "Write tests", status: "in_progress", priority: "high" },
          { content: "Ship the release", status: "pending", priority: "medium" },
        ],
      },
    },
  })

  const checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.todos.length, 2)
  assert.equal(checkpoint.todos[0].content, "Write tests")
  assert.match(checkpoint.todosAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.ok(checkpoint.todosAt >= checkpoint.updatedAt)
})

test("tool hooks record a running call and its completion", async (t) => {
  const { hooks, store, root } = await fixture(t)
  await hooks["tool.execute.before"](
    { tool: "bash", sessionID: SESSION, callID: "call_1" },
    { args: { command: "npm test" } },
  )

  let checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.lastTool.name, "bash")
  assert.equal(checkpoint.lastTool.state, "running")
  assert.equal(checkpoint.recentTools[0].state, "running")
  assert.equal(checkpoint.git.branch, "main")

  await hooks["tool.execute.after"](
    { tool: "bash", sessionID: SESSION, callID: "call_1" },
    { title: "Tests", output: "all green" },
  )

  checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.lastTool.state, "completed")
  assert.equal(checkpoint.lastTool.title, "Tests")
  assert.equal(checkpoint.recentTools[0].state, "completed")
})

test("session.idle converts an unfinished tool call to unknown", async (t) => {
  const { hooks, store, root } = await fixture(t)
  await hooks["tool.execute.before"](
    { tool: "bash", sessionID: SESSION, callID: "call_2" },
    { args: { command: "long-running" } },
  )
  await hooks.event({ event: { type: "session.idle", properties: { sessionID: SESSION } } })

  const checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.status, "idle")
  assert.equal(checkpoint.lastTool.state, "unknown")
  assert.equal(checkpoint.recentTools[0].state, "unknown")
})

test("compaction and errors leave notes for resume", async (t) => {
  const { hooks, store, root } = await fixture(t)
  await hooks.event({
    event: { type: "session.compacted", properties: { sessionID: SESSION } },
  })
  await hooks.event({
    event: {
      type: "session.error",
      properties: { sessionID: SESSION, error: { name: "ProviderStall" } },
    },
  })

  const checkpoint = checkpointFor(store, root)
  assert.equal(checkpoint.status, "error")
  assert.ok(checkpoint.notes.some((note) => note.includes("session.compacted")))
  assert.ok(checkpoint.notes.some((note) => note.includes("ProviderStall")))
})

test("message.part.updated records only assistant text", async (t) => {
  const { hooks, store, root } = await fixture(t)
  const { input, output } = userMessage("Implement the parser", "msg_user")
  await hooks["chat.message"](input, output)

  await hooks.event({
    event: {
      type: "message.part.updated",
      properties: {
        part: {
          type: "text",
          sessionID: SESSION,
          messageID: "msg_assistant",
          text: "I changed src/parser.js",
        },
      },
    },
  })
  assert.equal(checkpointFor(store, root).assistantTail, "I changed src/parser.js")

  await hooks.event({
    event: {
      type: "message.part.updated",
      properties: {
        part: {
          type: "text",
          sessionID: SESSION,
          messageID: "msg_user",
          text: "The user message must not become the assistant tail",
        },
      },
    },
  })
  assert.equal(checkpointFor(store, root).assistantTail, "I changed src/parser.js")
})

test("resume_checkpoint returns the stored snapshot and todosAt", async (t) => {
  const { hooks, store, root } = await fixture(t)
  const { input, output } = userMessage("Implement the parser")
  await hooks["chat.message"](input, output)
  await hooks.event({
    event: {
      type: "todo.updated",
      properties: {
        sessionID: SESSION,
        todos: [{ content: "Write tests", status: "in_progress", priority: "high" }],
      },
    },
  })

  const result = await hooks.tool.resume_checkpoint.execute(
    {},
    { sessionID: SESSION, worktree: root, directory: root },
  )
  const payload = JSON.parse(result.output)
  assert.equal(payload.found, true)
  assert.equal(payload.goal, "Implement the parser")
  assert.equal(payload.todos[0].content, "Write tests")
  assert.match(payload.todosAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(payload.checkpointPath, store.pathFor(root, SESSION))
})

test("resume_checkpoint reports a missing checkpoint", async (t) => {
  const { hooks, root } = await fixture(t)
  const result = await hooks.tool.resume_checkpoint.execute(
    {},
    { sessionID: "ses_missing", worktree: root, directory: root },
  )
  const payload = JSON.parse(result.output)
  assert.equal(payload.found, false)
  assert.equal(payload.sessionID, "ses_missing")
})

test("the checkpoint tool does not record itself as the last tool", async (t) => {
  const { hooks, store, root } = await fixture(t)
  await hooks["tool.execute.before"](
    { tool: "resume_checkpoint", sessionID: SESSION, callID: "call_self" },
    { args: {} },
  )
  assert.equal(store.find(SESSION, root), null)
})
