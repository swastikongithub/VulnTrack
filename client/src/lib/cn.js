/** Join class names, skipping falsy values. */
export function cn(...values) {
  return values.filter(Boolean).join(' ')
}
