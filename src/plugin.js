import { tool } from "@opencode-ai/plugin"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import {
  MAX_RECENT_TOOLS,
  MAX_TODOS,
  createCheckpointStore,
  defaultStateRoot,
  now,
} from "./checkpoint.js"
import { clip, errorMessage, redact } from "./redact.js"
import { createGitSnapshotCache, gitSnapshot } from "./git.js"

const MAX_LOG_BYTES = 200 * 1024
const SELF_TOOL = "resume_checkpoint"

function createLogger(stateRoot) {
  const logDir = join(stateRoot, "logs")
  const logFile = join(logDir, "plugin.log")

  return (message) => {
    try {
      mkdirSync(logDir, { recursive: true, mode: 0o700 })
      if (existsSync(logFile) && statSync(logFile).size > MAX_LOG_BYTES) {
        writeFileSync(logFile, "", { mode: 0o600 })
      }
      appendFileSync(logFile, `${now()} ${clip(redact(message), 1000)}\n`, { mode: 0o600 })
    } catch {
      void 0
    }
  }
}

function cleanGoal(text) {
  let value = String(text || "").trim()
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim()
    }
  }
  return value
}

export function messageText(parts) {
  return (parts || [])
    .filter((part) => part && part.type === "text" && !part.synthetic && !part.ignored)
    .map((part) => part.text || "")
    .join("\n")
}

export function isResumePrompt(text) {
  const value = String(text || "").trim()
  if (!value) return false
  return (
    value.startsWith("/resume") ||
    value.includes("Resume the work that was interrupted in this session") ||
    value.includes("Safety rule: do not edit files or run a mutating or non-idempotent tool") ||
    value.includes("Call the `resume_checkpoint` tool first") ||
    value.includes("load the `resume` skill") ||
    value.includes("Call the resume_checkpoint tool first") ||
    value.includes("load the resume skill") ||
    value.includes("Resuming from the last interruption") ||
    value.includes("follow the `resume` skill") ||
    value.includes("follow the resume skill")
  )
}

function recentToolEntry(entry) {
  return {
    name: entry.name,
    callID: entry.callID,
    state: entry.state,
    at: entry.at,
    title: entry.title,
  }
}

export function createResumeCheckpoint({
  stateRoot = defaultStateRoot(),
  root = process.cwd(),
  snapshot = gitSnapshot,
} = {}) {
  const store = createCheckpointStore({ stateRoot })
  const gitSnapshotCached = createGitSnapshotCache(snapshot)
  const log = createLogger(stateRoot)

  return async ({ directory, worktree } = {}) => {
    const projectRoot = worktree || directory || root
    log(`loaded for ${projectRoot}`)

    return {
      "chat.message": async (input, output) => {
        try {
          const sessionID = output.message?.sessionID || input.sessionID
          if (!sessionID) return
          const text = messageText(output.parts).trim()
          if (!text || isResumePrompt(text)) return

          const checkpoint = store.load(projectRoot, sessionID)
          checkpoint.status = "active"
          checkpoint.goal = clip(redact(cleanGoal(text)), 2000)
          checkpoint.goalAt = now()
          checkpoint.lastUserMessageID = output.message?.id || input.messageID || null
          checkpoint.updatedAt = now()
          store.save(checkpoint)
        } catch (error) {
          log(`chat.message failed: ${errorMessage(error)}`)
        }
      },

      "tool.execute.before": async (input, output) => {
        try {
          if (input.tool === SELF_TOOL) return
          const sessionID = input.sessionID
          if (!sessionID) return

          const checkpoint = store.load(projectRoot, sessionID)
          const entry = {
            name: input.tool,
            callID: input.callID,
            state: "running",
            args: clip(redact(output.args), 4000),
            at: now(),
          }
          checkpoint.status = "active"
          checkpoint.lastTool = entry
          checkpoint.recentTools = [
            entry,
            ...(checkpoint.recentTools || []).filter(
              (item) => item.callID !== input.callID,
            ),
          ]
            .slice(0, MAX_RECENT_TOOLS)
            .map(recentToolEntry)
          checkpoint.git = gitSnapshotCached(projectRoot)
          checkpoint.updatedAt = now()
          store.save(checkpoint)
        } catch (error) {
          log(`tool.execute.before failed: ${errorMessage(error)}`)
        }
      },

      "tool.execute.after": async (input, output) => {
        try {
          if (input.tool === SELF_TOOL) return
          const sessionID = input.sessionID
          if (!sessionID) return

          const checkpoint = store.load(projectRoot, sessionID)
          const at = now()
          const title = clip(redact(output.title), 200)

          if (checkpoint.lastTool && checkpoint.lastTool.callID === input.callID) {
            checkpoint.lastTool = {
              ...checkpoint.lastTool,
              state: "completed",
              title,
              output: clip(redact(output.output), 3000),
              at,
            }
          }

          checkpoint.recentTools = (checkpoint.recentTools || []).map((entry) =>
            entry.callID === input.callID
              ? { ...entry, state: "completed", title, at }
              : entry,
          )
          checkpoint.status = "active"
          checkpoint.git = gitSnapshotCached(projectRoot)
          checkpoint.updatedAt = at
          store.save(checkpoint)
        } catch (error) {
          log(`tool.execute.after failed: ${errorMessage(error)}`)
        }
      },

      event: async ({ event }) => {
        try {
          if (event.type === "todo.updated") {
            const sessionID = event.properties?.sessionID
            if (!sessionID) return
            const checkpoint = store.load(projectRoot, sessionID)
            const at = now()
            checkpoint.todos = (event.properties.todos || [])
              .slice(0, MAX_TODOS)
              .map((todo) => ({
                content: clip(redact(todo.content), 500),
                status: String(todo.status || "unknown"),
                priority: String(todo.priority || ""),
              }))
            checkpoint.todosAt = at
            checkpoint.updatedAt = at
            store.save(checkpoint)
            return
          }

          if (event.type === "message.part.updated") {
            const part = event.properties?.part
            if (!part || part.type !== "text" || part.synthetic || part.ignored) return
            const sessionID = part.sessionID
            if (!sessionID) return
            const checkpoint = store.load(projectRoot, sessionID)
            if (part.messageID && part.messageID === checkpoint.lastUserMessageID) return
            const text = String(part.text || "").trim()
            if (!text) return
            checkpoint.assistantTail = clip(redact(text), 6000)
            checkpoint.assistantTailAt = now()
            checkpoint.updatedAt = now()
            store.save(checkpoint)
            return
          }

          if (
            event.type === "session.idle" ||
            event.type === "session.compacted" ||
            event.type === "session.error"
          ) {
            const sessionID = event.properties?.sessionID
            if (!sessionID) return
            const checkpoint = store.load(projectRoot, sessionID)

            if (event.type === "session.idle") {
              checkpoint.status = "idle"
              if (checkpoint.lastTool?.state === "running") {
                checkpoint.lastTool.state = "unknown"
                checkpoint.recentTools = (checkpoint.recentTools || []).map((entry) =>
                  entry.callID === checkpoint.lastTool.callID
                    ? { ...entry, state: "unknown" }
                    : entry,
                )
              }
            } else if (event.type === "session.compacted") {
              checkpoint.status = "compacted"
              store.addNote(
                checkpoint,
                "session.compacted: conversation history may be summarized; verify against disk",
              )
            } else {
              checkpoint.status = "error"
              const name = event.properties?.error?.name || "UnknownError"
              store.addNote(checkpoint, `session.error: ${clip(redact(String(name)), 200)}`)
            }

            checkpoint.git = gitSnapshotCached(projectRoot)
            checkpoint.updatedAt = now()
            store.save(checkpoint)
            return
          }
        } catch (error) {
          log(`event failed: ${errorMessage(error)}`)
        }
      },

      tool: {
        resume_checkpoint: tool({
          description:
            "Read the rolling checkpoint for the current session. Call this first when resuming interrupted work. It returns the last goal, last tool call and state, todos, todo snapshot time, assistant tail, git snapshot, and notes captured before the interruption.",
          args: {},
          async execute(_args, context) {
            const sessionID = context.sessionID
            const directory = context.worktree || context.directory || projectRoot
            const checkpoint = store.find(sessionID, directory)
            if (!checkpoint) {
              return {
                title: "No checkpoint",
                output: JSON.stringify(
                  {
                    found: false,
                    sessionID,
                    directory,
                    hint: "No checkpoint recorded for this session. Reconstruct from the conversation and verify against disk.",
                  },
                  null,
                  2,
                ),
              }
            }
            return {
              title: "Resume checkpoint",
              output: JSON.stringify(
                {
                  found: true,
                  checkpointPath: store.pathFor(
                    checkpoint.directory,
                    checkpoint.sessionID,
                  ),
                  ...checkpoint,
                },
                null,
                2,
              ),
              metadata: { found: true },
            }
          },
        }),
      },
    }
  }
}

export const ResumeCheckpoint = createResumeCheckpoint()
export const server = ResumeCheckpoint
export default ResumeCheckpoint
