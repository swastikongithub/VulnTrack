/**
 * Strict ObjectId shape check for ids arriving in URLs and bodies.
 * (mongoose.isValidObjectId also accepts any 12-character string.)
 */
export function isObjectIdString(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
}
