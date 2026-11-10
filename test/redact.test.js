import test from "node:test"
import assert from "node:assert/strict"

import { clip, errorMessage, redact } from "../src/redact.js"

test("redact removes private key blocks", () => {
  const value =
    "-----BEGIN RSA PRIVATE KEY-----\nnot-a-real-key\n-----END RSA PRIVATE KEY-----"
  assert.equal(redact(value), "[redacted:private-key]")
})

test("redact removes common token formats", () => {
  const value = [
    "sk-abcdefgh12345678",
    "ghp_abcdefgh12345678",
    "github_pat_abcdefgh12345678",
    "AKIAABCDEFGHIJKLMNOP",
  ].join("\n")

  const result = redact(value)
  assert.doesNotMatch(result, /abcdefgh12345678/)
  assert.doesNotMatch(result, /AKIAABCDEFGHIJKLMNOP/)
  assert.match(result, /\[redacted:sk\]/)
  assert.match(result, /\[redacted:ghp\]/)
  assert.match(result, /\[redacted:github-pat\]/)
  assert.match(result, /\[redacted:aws\]/)
})

test("redact removes bearer and key-value secrets while keeping labels", () => {
  const result = redact(
    "Authorization: Bearer abcdefgh1234\npassword=supersecret\napi_key: another-secret",
  )

  assert.doesNotMatch(result, /abcdefgh1234/)
  assert.doesNotMatch(result, /supersecret/)
  assert.doesNotMatch(result, /another-secret/)
  assert.match(result, /password=\[redacted\]/)
  assert.match(result, /api_key: \[redacted\]/)
})

test("redact keeps ordinary text unchanged", () => {
  const value = "run npm test and read src/plugin.js"
  assert.equal(redact(value), value)
})

test("clip marks truncation with the original remainder", () => {
  assert.equal(clip("abcdef", 3), "abc...[truncated 3]")
  assert.equal(clip("abc", 3), "abc")
})

test("errorMessage handles errors and plain values", () => {
  assert.equal(errorMessage(new Error("boom")), "boom")
  assert.equal(errorMessage({ message: "object message" }), "object message")
  assert.equal(errorMessage("plain"), "plain")
})
