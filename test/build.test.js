import test from "node:test"
import assert from "node:assert/strict"

test("the built bundle exports a plugin function", async () => {
  const mod = await import("../dist/plugin.js")
  assert.equal(typeof mod.default, "function")
  assert.equal(typeof mod.ResumeCheckpoint, "function")
  assert.equal(mod.server, mod.ResumeCheckpoint)
})
