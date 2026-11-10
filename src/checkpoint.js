import { createHash } from "node:crypto"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"

import { clip, redact } from "./redact.js"

export const SCHEMA = 1
export const MAX_RECENT_TOOLS = 20
export const MAX_NOTES = 20
export const MAX_TODOS = 50

export function now() {
  return new Date().toISOString()
}

export function defaultStateRoot(env = process.env, home = homedir()) {
  return env.OPENCODE_RESUME_STATE_DIR || join(home, ".local", "state", "opencode-resume")
}

export function projectKey(directory) {
  const name =
    basename(directory || "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 40) || "project"
  const hash = createHash("sha256").update(String(directory || "")).digest("hex").slice(0, 12)
  return `${name}-${hash}`
}

export function checkpointPath(stateRoot, directory, sessionID) {
  return join(stateRoot, projectKey(directory), `${sessionID}.json`)
}

export function blankCheckpoint(directory, sessionID, at = now()) {
  return {
    schema: SCHEMA,
    sessionID,
    project: projectKey(directory),
    directory,
    updatedAt: at,
    status: "active",
    goal: "",
    goalAt: null,
    lastUserMessageID: null,
    assistantTail: "",
    assistantTailAt: null,
    todos: [],
    todosAt: null,
    lastTool: null,
    recentTools: [],
    git: { isRepo: false, at },
    notes: [],
  }
}

export function normalizeCheckpoint(value, directory, sessionID) {
  const base = blankCheckpoint(directory, sessionID)
  const merged = { ...base, ...value }
  return {
    ...merged,
    schema: SCHEMA,
    sessionID,
    directory: value.directory || directory,
    project: value.project || projectKey(value.directory || directory),
    todos: Array.isArray(value.todos) ? value.todos.slice(0, MAX_TODOS) : [],
    recentTools: Array.isArray(value.recentTools)
      ? value.recentTools.slice(0, MAX_RECENT_TOOLS)
      : [],
    notes: Array.isArray(value.notes) ? value.notes.slice(-MAX_NOTES) : [],
    git: value.git && typeof value.git === "object" ? value.git : base.git,
    todosAt: value.todosAt || null,
  }
}

function readCheckpointFile(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"))
    if (!value || value.schema !== SCHEMA || !value.sessionID) return null
    return normalizeCheckpoint(value, value.directory || "", value.sessionID)
  } catch {
    return null
  }
}

export function findCheckpoint(stateRoot, sessionID, directory) {
  if (!sessionID) return null

  const primary = checkpointPath(stateRoot, directory, sessionID)
  if (existsSync(primary)) {
    const checkpoint = readCheckpointFile(primary)
    if (checkpoint) return checkpoint
  }

  try {
    const entries = readdirSync(stateRoot, { withFileTypes: true })
    const matches = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = join(stateRoot, entry.name, `${sessionID}.json`)
      if (!existsSync(file)) continue
      const checkpoint = readCheckpointFile(file)
      if (checkpoint) matches.push(checkpoint)
    }
    if (matches.length === 0) return null
    if (directory) {
      const exact = matches.find(
        (checkpoint) => resolve(checkpoint.directory || "") === resolve(directory),
      )
      if (exact) return exact
    }
    return matches[0]
  } catch {
    return null
  }
}

export function saveCheckpoint(stateRoot, checkpoint) {
  if (!checkpoint?.directory || !checkpoint?.sessionID) {
    throw new TypeError("checkpoint requires directory and sessionID")
  }

  const file = checkpointPath(stateRoot, checkpoint.directory, checkpoint.sessionID)
  const folder = dirname(file)
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  try {
    chmodSync(folder, 0o700)
  } catch {
    void 0
  }

  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), { mode: 0o600 })
  renameSync(tmp, file)
  try {
    chmodSync(file, 0o600)
  } catch {
    void 0
  }
  return checkpoint
}

export function addNote(checkpoint, note) {
  checkpoint.notes = [...(checkpoint.notes || []), clip(redact(note), 500)].slice(-MAX_NOTES)
  return checkpoint
}

export function createCheckpointStore({ stateRoot = defaultStateRoot() } = {}) {
  return {
    stateRoot,
    pathFor(directory, sessionID) {
      return checkpointPath(stateRoot, directory, sessionID)
    },
    find(sessionID, directory) {
      return findCheckpoint(stateRoot, sessionID, directory)
    },
    load(directory, sessionID) {
      return findCheckpoint(stateRoot, sessionID, directory) || blankCheckpoint(directory, sessionID)
    },
    save(checkpoint) {
      return saveCheckpoint(stateRoot, checkpoint)
    },
    addNote(checkpoint, note) {
      return addNote(checkpoint, note)
    },
  }
}
