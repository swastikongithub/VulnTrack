/** True if the text contains ASCII control characters (C0 range or DEL). */
export function hasControlCharacters(text) {
  for (const char of String(text)) {
    const code = char.charCodeAt(0)
    if (code < 32 || code === 127) return true
  }
  return false
}
