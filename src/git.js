import { execFileSync } from "node:child_process"

import { clip } from "./redact.js"

function now() {
  return new Date().toISOString()
}

export function gitSnapshot(directory, { timeout = 2000 } = {}) {
  const at = now()
  const run = (args) =>
    execFileSync("git", args, {
      cwd: directory,
      timeout,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()

  try {
    if (run(["rev-parse", "--is-inside-work-tree"]) !== "true") {
      return { isRepo: false, at }
    }

    let branch = ""
    let head = ""
    let statusShort = ""
    let diffStat = ""

    try {
      branch = run(["rev-parse", "--abbrev-ref", "HEAD"])
    } catch {
      void 0
    }
    try {
      head = run(["rev-parse", "--short", "HEAD"])
    } catch {
      void 0
    }
    try {
      statusShort = clip(run(["status", "--short", "--untracked-files=normal"]), 4000)
    } catch {
      void 0
    }
    try {
      diffStat = clip(run(["diff", "--stat"]), 4000)
    } catch {
      void 0
    }

    return { isRepo: true, branch, head, statusShort, diffStat, at }
  } catch {
    return { isRepo: false, at }
  }
}

export function createGitSnapshotCache(snapshot = gitSnapshot, ttlMs = 2000) {
  let cache = null

  return (directory) => {
    const timestamp = Date.now()
    if (cache && cache.directory === directory && timestamp - cache.timestamp < ttlMs) {
      return cache.value
    }
    const value = snapshot(directory)
    cache = { directory, timestamp, value }
    return value
  }
}
