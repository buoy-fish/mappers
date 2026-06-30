// Shared clipboard helper. Mirrors the pattern in TimelineControl's
// onCopyLink: prefer the async Clipboard API in secure contexts, fall back to
// a hidden <textarea> + execCommand for http/localhost where navigator
// .clipboard is unavailable. Returns true on success so callers can flash a
// "Copied!" affordance.
export async function copyText(text) {
  if (text == null) return false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(String(text))
      return true
    }
  } catch (_) {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = String(text)
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch (_) {
    return false
  }
}
