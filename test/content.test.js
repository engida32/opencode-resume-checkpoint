import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8")
}

function body(markdown) {
  return markdown.replace(/^---[\s\S]*?\n---\s*/, "").trim()
}

test("the resume command is one short handoff sentence", () => {
  const command = read("commands/resume.md")
  assert.match(command, /^---\n/)
  assert.match(command, /\ndescription: /)
  assert.match(command, /\nagent: build/)
  assert.doesNotMatch(command, /\$ARGUMENTS/)
  assert.equal(
    body(command),
    "Resuming from the last interruption: load and follow the `resume` skill.",
  )
})

test("the resume skill reconciles stale todos before continuing", () => {
  const skill = read("skills/resume/SKILL.md")
  assert.match(skill, /^---\nname: resume/)
  assert.match(skill, /## Phase 2\.5 - Reconcile the todo list/)
  assert.ok(skill.indexOf("## Phase 2.5") < skill.indexOf("## Phase 3"))
  assert.match(skill, /todoread/)
  assert.match(skill, /todosAt/)
  assert.match(skill, /Never mark an item completed without evidence/)
  assert.match(skill, /Preserve every item/)
  assert.match(skill, /Do not silently reopen a completed item/)
  assert.match(skill, /If `todowrite` is unavailable/)
})
