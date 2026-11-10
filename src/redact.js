export function clip(text, max) {
  const value = String(text ?? "")
  return value.length > max ? `${value.slice(0, max)}...[truncated ${value.length - max}]` : value
}

export function errorMessage(error) {
  if (error && typeof error === "object" && "message" in error) return String(error.message)
  return String(error)
}

export function redact(value) {
  let text
  if (typeof value === "string") {
    text = value
  } else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      text = String(value)
    }
  }
  return text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[redacted:private-key]",
    )
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted:sk]")
    .replace(/\bghp_[A-Za-z0-9]{8,}\b/g, "[redacted:ghp]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{8,}\b/g, "[redacted:github-pat]")
    .replace(/\bAKIA[0-9A-Z]{12,}\b/g, "[redacted:aws]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
}
