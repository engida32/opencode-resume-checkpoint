import test from "node:test"
import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  defaultConfigDir,
  install,
  uninstall,
} from "../scripts/install-lib.js"

function tempRoot(t) {
  const directory = mkdtempSync(join(tmpdir(), "resume-install-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function sourceTree(t) {
  const source = tempRoot(t)
  mkdirSync(join(source, "dist"), { recursive: true })
  mkdirSync(join(source, "commands"), { recursive: true })
  mkdirSync(join(source, "skills", "resume"), { recursive: true })
  writeFileSync(join(source, "dist", "plugin.js"), "export const server = true\n")
  writeFileSync(join(source, "commands", "resume.md"), "---\nagent: build\n---\n\nResume.\n")
  writeFileSync(join(source, "skills", "resume", "SKILL.md"), "---\nname: resume\n---\n")
  return source
}

test("defaultConfigDir honors XDG_CONFIG_HOME", () => {
  assert.equal(
    defaultConfigDir({ XDG_CONFIG_HOME: "/tmp/xdg" }, "/home/me"),
    join("/tmp/xdg", "opencode"),
  )
  assert.equal(
    defaultConfigDir({}, "/home/me"),
    join("/home/me", ".config", "opencode"),
  )
})

test("install creates the plugin, command, and skill", (t) => {
  const sourceDir = sourceTree(t)
  const configDir = tempRoot(t)

  const result = install({ sourceDir, configDir })
  assert.deepEqual(result.map((item) => item.action), ["created", "created", "created"])
  assert.equal(
    readFileSync(join(configDir, "plugins", "resume-checkpoint.js"), "utf8"),
    "export const server = true\n",
  )
  assert.ok(existsSync(join(configDir, "commands", "resume.md")))
  assert.ok(existsSync(join(configDir, "skills", "resume", "SKILL.md")))
})

test("install reports unchanged and skips modified files without force", (t) => {
  const sourceDir = sourceTree(t)
  const configDir = tempRoot(t)
  install({ sourceDir, configDir })

  assert.deepEqual(
    install({ sourceDir, configDir }).map((item) => item.action),
    ["unchanged", "unchanged", "unchanged"],
  )

  writeFileSync(join(sourceDir, "commands", "resume.md"), "changed\n")
  const skipped = install({ sourceDir, configDir })
  assert.deepEqual(skipped.map((item) => item.action), ["unchanged", "skipped", "unchanged"])
  assert.match(readFileSync(join(configDir, "commands", "resume.md"), "utf8"), /agent: build/)

  const updated = install({ sourceDir, configDir, force: true })
  assert.deepEqual(updated.map((item) => item.action), ["unchanged", "updated", "unchanged"])
  assert.equal(readFileSync(join(configDir, "commands", "resume.md"), "utf8"), "changed\n")
})

test("dry-run does not write files", (t) => {
  const sourceDir = sourceTree(t)
  const configDir = tempRoot(t)
  const result = install({ sourceDir, configDir, dryRun: true })
  assert.deepEqual(result.map((item) => item.action), ["created", "created", "created"])
  assert.equal(existsSync(join(configDir, "plugins", "resume-checkpoint.js")), false)
})

test("install fails clearly when the build is missing", (t) => {
  const sourceDir = tempRoot(t)
  const configDir = tempRoot(t)
  assert.throws(
    () => install({ sourceDir, configDir }),
    /missing source file: .*dist\/plugin\.js/,
  )
})

test("uninstall removes installed files", (t) => {
  const sourceDir = sourceTree(t)
  const configDir = tempRoot(t)
  install({ sourceDir, configDir })

  assert.deepEqual(
    uninstall({ configDir }).map((item) => item.action),
    ["removed", "removed", "removed"],
  )
  assert.equal(existsSync(join(configDir, "plugins", "resume-checkpoint.js")), false)
  assert.deepEqual(
    uninstall({ configDir }).map((item) => item.action),
    ["missing", "missing", "missing"],
  )
})

test("uninstall dry-run leaves files in place", (t) => {
  const sourceDir = sourceTree(t)
  const configDir = tempRoot(t)
  install({ sourceDir, configDir })

  assert.deepEqual(
    uninstall({ configDir, dryRun: true }).map((item) => item.action),
    ["removed", "removed", "removed"],
  )
  assert.ok(existsSync(join(configDir, "plugins", "resume-checkpoint.js")))
})
