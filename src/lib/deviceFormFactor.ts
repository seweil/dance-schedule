// Best-effort tablet detection — neither browser exposes a direct "this is
// a tablet" signal. The "correct" modern API (Sec-CH-UA-Form-Factors) is
// Chromium-only and doesn't help here, since this app's iOS install path
// requires Safari, which never sends it — see docs/design/monitoring.md.
// Combines the two UA-string workarounds that actually cover this app's
// real traffic instead.
export function isTabletDevice(): boolean {
  // Covers older iPadOS, or an iPad manually switched to "Request Mobile
  // Website" (rare, but free to also catch here).
  if (/iPad/.test(navigator.userAgent)) return true
  // iPadOS 13+ sends a desktop Safari UA by default — indistinguishable
  // from a real Mac by UA string alone. Real Macs report
  // maxTouchPoints: 0 (no touchscreen); iPads report 10.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  // Android phones include "Mobile" in their UA; tablets omit it — a
  // long-standing convention that survived Chrome's 2026 UA-string
  // reduction, which genericized most other UA details but left this
  // token distinction intact.
  if (/Android/.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent)) return true
  return false
}
