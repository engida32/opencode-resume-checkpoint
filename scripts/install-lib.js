import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const PLUGIN = "resume-checkpoint.js"

export function defaultConfigDir(env = process.env, home = homedir()) {
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "opencode")
}

function targets(configDir, sourceDir) {
  return [
    {
      from: join(sourceDir, "dist", "plugin.js"),
      to: join(configDir, "plugins", PLUGIN),
    },
    {
      from: join(sourceDir, "commands", "resume.md"),
      to: join(configDir, "commands", "resume.md"),
    },
    {
      from: join(sourceDir, "skills", "resume", "SKILL.md"),
      to: join(configDir, "skills", "resume", "SKILL.md"),
    },
  ]
}

export function install({
  configDir = defaultConfigDir(),
  sourceDir = process.cwd(),
  dryRun = false,
  force = false,
} = {}) {
  const results = []

  for (const target of targets(configDir, sourceDir)) {
    if (!existsSync(target.from)) {
      throw new Error(
        `missing source file: ${target.from}. Run npm run build first.`,
      )
    }

    const source = readFileSync(target.from)
    const existed = existsSync(target.to)
    if (existed) {
      const current = readFileSync(target.to)
      if (current.equals(source)) {
        results.push({ ...target, action: "unchanged" })
        continue
      }
      if (!force) {
        results.push({ ...target, action: "skipped" })
        continue
      }
    }

    if (!dryRun) {
      mkdirSync(dirname(target.to), { recursive: true })
      cpSync(target.from, target.to)
    }
    results.push({
      ...target,
      action: existed ? "updated" : "created",
    })
  }

  return results
}

export function uninstall({ configDir = defaultConfigDir(), dryRun = false } = {}) {
  const results = []

  for (const target of targets(configDir, process.cwd())) {
    if (!existsSync(target.to)) {
      results.push({ ...target, action: "missing" })
      continue
    }
    if (!dryRun) rmSync(target.to)
    results.push({ ...target, action: "removed" })
  }

  if (!dryRun) {
    try {
      rmdirSync(join(configDir, "skills", "resume"))
    } catch {
      void 0
    }
  }

  return results
}
