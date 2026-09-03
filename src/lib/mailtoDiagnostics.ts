import { isStandalonePwa } from './pwaDisplayMode'

// Mirrors BuildInfo.tsx's own formatters so a diagnostics block in an email
// reads the same as the build line already shown on-screen.
const buildDateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'short' })
const buildTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZoneName: 'short',
})

// Appends a build + client diagnostics block to a mailto: link's body, so
// someone reporting a problem via a content page's "Email us" link doesn't
// have to separately dig up and paste in which build/browser/state they were
// on. Content pages write mailto: links as plain markdown — no JSX, see
// CLAUDE.md's "Compilation" note — so this runs generically against every
// mailto: href via App.tsx's MdxA override rather than requiring each
// content author to hand-author query params. Any non-mailto: href (or
// undefined) is returned unchanged.
export function withDiagnostics(href: string): string {
  if (!href.startsWith('mailto:')) {
    return href
  }

  const builtAt = new Date(__BUILD_TIME__)
  // \r\n, not \n — the more broadly compatible mailto body line-ending
  // across mail clients.
  const diagnostics = [
    '',
    '',
    '---',
    'If you are reporting a technical problem, these details will help us diagnose',
    `Page: ${window.location.href}`,
    `Build ${__BUILD_NUMBER__} at ${buildDateFormatter.format(builtAt)}, ${buildTimeFormatter.format(builtAt)}`,
    `${navigator.onLine ? 'Online' : 'Offline'} · ${isStandalonePwa() ? 'Installed' : 'Browser'}`,
    navigator.userAgent,
  ].join('\r\n')

  const [address, query = ''] = href.slice('mailto:'.length).split('?')
  // Parsed (not hand-split) so a content author's own subject=/body= — none
  // today, but not assumed away — is preserved rather than clobbered.
  const params = new URLSearchParams(query)
  params.set('body', `${params.get('body') ?? ''}${diagnostics}`)

  // Not params.toString() — URLSearchParams encodes spaces as "+", which some
  // mail clients render literally in the body instead of decoding it back to
  // a space. encodeURIComponent uses %20 instead, which every client accepts.
  const serialized = [...params.entries()]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

  return `mailto:${address}?${serialized}`
}

// The bare recipient address out of a mailto: href (no query string) — shared
// by App.tsx's click-tracking `trackEvent` call so the event payload doesn't
// re-derive its own copy of this parsing.
export function mailtoAddress(href: string): string {
  return href.slice('mailto:'.length).split('?')[0] ?? ''
}
