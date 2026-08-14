// The visitor's own locale preferences, most-preferred first, with 'en-US' appended
// as a guaranteed final fallback — without it, Intl.DateTimeFormat would fall back to
// whatever the runtime's own default locale happens to be, which isn't guaranteed to
// be 'en-US'.
export function getUserLocales(): string[] {
  return [...navigator.languages, 'en-US']
}
