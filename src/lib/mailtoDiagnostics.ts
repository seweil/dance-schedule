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
  // Reported live: Chrome on macOS silently drops the entire `body` when
  // handing a mailto: link off to Mail.app, past some undocumented length in
  // Chrome's own external-protocol handoff — bisected empirically (repeatedly
  // testing mailto: links of a known encoded body length directly in Chrome's
  // address bar) to somewhere between 395 and 432 characters on that one
  // combination. Deliberately NOT trimmed to duck under that, though: Chrome
  // on iOS and Android, and Safari/Firefox on the same Mac, all populate the
  // FULL body (including the user agent below) correctly — this is narrowly
  // a macOS-desktop-Chrome-only quirk, not a general mailto/RFC 6068 limit,
  // and per direct product decision isn't worth degrading the diagnostics for
  // every other platform to work around. Neither Chromium's own source
  // (`external_protocol_handler.cc`, `platform_util_mac.mm`) nor Apple's
  // NSWorkspace/NSURL docs publish a length limit for this path — whatever's
  // failing is happening inside Mail.app/Launch Services itself, with no
  // documented number to design against.
  //
  // \n, not \r\n — a separate, real, independently-confirmed bug (unrelated
  // to the length issue above): macOS/iOS Mail (14.6+) renders a mailto:
  // body's "%0D%0A" sequences as the literal text "<BR>" instead of an
  // actual line break (Apple's own explanation: rich-content support was
  // stripped from mailto handling as a security fix, and this is a side
  // effect). Bare "%0A" isn't strictly RFC 6068-compliant, but it sidesteps
  // that bug and is accepted fine by every other mail client that matters
  // here.
  const diagnostics = [
    '',
    '',
    '---',
    'Details:',
    `Page: ${window.location.href}`,
    `Build ${__BUILD_NUMBER__} at ${buildDateFormatter.format(builtAt)}, ${buildTimeFormatter.format(builtAt)}`,
    `${navigator.onLine ? 'Online' : 'Offline'} · ${isStandalonePwa() ? 'Installed' : 'Browser'}`,
    navigator.userAgent,
  ].join('\n')

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
