import React from 'react'
import classNames from 'classnames'
import format from 'date-fns/format'
import parseISO from 'date-fns/parseISO'
import { copyText } from '../utils/clipboard'
import { fetchPingCount } from '../utils/pings'

// "i" in a circle — the hover-revealed info affordance.
function InfoGlyph() {
  return (
    <svg className="project-info-glyph" width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="4.7" r="0.95" fill="currentColor" />
      <path d="M8 7v4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CopyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" xmlns="http://www.w3.org/2000/svg">
      <rect x="5.2" y="5.2" width="8" height="8" rx="1.4" />
      <path d="M3 10.8V3.6A1.6 1.6 0 0 1 4.6 2H10.8" strokeLinecap="round" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.2 8.4l3 3 6.6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// One label/value row in the card with a click-to-copy button that flashes a
// check on success. `copyValue` is what lands on the clipboard (machine-
// friendly); `children` is what's shown.
function CopyField({ label, copyValue, mono, children }) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef(null)
  React.useEffect(() => () => clearTimeout(timer.current), [])

  const onCopy = async () => {
    const ok = await copyText(copyValue)
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="pic-field">
      <span className="pic-field-label">{label}</span>
      <span className={classNames('pic-field-value', { 'util-liga-mono': mono })}>{children}</span>
      <button
        type="button"
        className={classNames('pic-copy', { copied })}
        onClick={onCopy}
        disabled={copyValue == null}
        aria-label={`Copy ${label.toLowerCase()}`}
        title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
      >
        {copied ? <CheckGlyph /> : <CopyGlyph />}
      </button>
    </div>
  )
}

// A single project entry: the name (flies to it), the ▶ Timeline launcher, and
// a hover-revealed ⓘ that, on click, pins an info card (hover gives a quick
// peek). The card shows the start date, location, and a live geographic ping
// tally — each copyable, plus a "Copy all" summary.
export default function ProjectRow({ project, start, onFlyToProject, onRunProjectTimeline, onAfterAction }) {
  const [pinned, setPinned] = React.useState(false)
  const [peek, setPeek] = React.useState(false)
  // undefined = not yet fetched, 'loading', { count, radiusKm }, or null (error)
  const [pings, setPings] = React.useState(undefined)
  const [copiedAll, setCopiedAll] = React.useState(false)
  const rootRef = React.useRef(null)
  const closeTimer = React.useRef(null)
  const allTimer = React.useRef(null)

  const open = pinned || peek

  // Lazy-load the ping count the first time the card opens for this project.
  React.useEffect(() => {
    if (!open || pings !== undefined) return
    let cancelled = false
    setPings('loading')
    fetchPingCount(project.lat, project.lng).then((r) => {
      if (!cancelled) setPings(r)
    })
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // While pinned, an outside click dismisses the card.
  React.useEffect(() => {
    if (!pinned) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setPinned(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [pinned])

  React.useEffect(() => () => { clearTimeout(closeTimer.current); clearTimeout(allTimer.current) }, [])

  // Hover bridge: a short close delay lets the pointer cross the gap between
  // the ⓘ and the card without the peek collapsing.
  const onEnter = () => { clearTimeout(closeTimer.current); setPeek(true) }
  const onLeave = () => { closeTimer.current = setTimeout(() => setPeek(false), 160) }

  const lat = Number.isFinite(project.lat) ? project.lat.toFixed(4) : null
  const lng = Number.isFinite(project.lng) ? project.lng.toFixed(4) : null
  const locValue = lat != null && lng != null ? `${lat}, ${lng}` : null

  let startDisplay = '—'
  let startCopy = null
  if (start) {
    try {
      startDisplay = format(parseISO(start), 'PP') // e.g. "May 1, 2026"
      startCopy = start
    } catch (_) {
      startDisplay = start
      startCopy = start
    }
  }

  const radiusKm = pings && pings.count != null ? pings.radiusKm : 100
  let pingDisplay
  let pingCopy = null
  if (pings === 'loading' || pings === undefined) pingDisplay = '…'
  else if (pings && pings.count != null) { pingDisplay = pings.count.toLocaleString(); pingCopy = String(pings.count) }
  else pingDisplay = '—'

  const onCopyAll = async () => {
    const lines = [
      project.name,
      `Started: ${startCopy || 'Unknown'}`,
      locValue ? `Location: ${locValue}` : null,
      pingCopy ? `Pings collected: ${pings.count.toLocaleString()} (within ${radiusKm} km)` : null,
    ].filter(Boolean)
    const ok = await copyText(lines.join('\n'))
    if (!ok) return
    setCopiedAll(true)
    clearTimeout(allTimer.current)
    allTimer.current = setTimeout(() => setCopiedAll(false), 1400)
  }

  return (
    <div className="project-row" ref={rootRef}>
      <button
        className="project-item"
        onClick={() => { onFlyToProject(project); onAfterAction && onAfterAction() }}
      >
        {project.name}
      </button>

      <span className="project-info" onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <button
          type="button"
          className={classNames('project-info-btn', { active: open })}
          aria-label={`Project details for ${project.name}`}
          aria-expanded={pinned}
          title="Project details"
          onClick={() => setPinned((p) => !p)}
        >
          <InfoGlyph />
        </button>

        {open && (
          <div
            className="project-info-card"
            role="dialog"
            aria-label={`${project.name} details`}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
          >
            <div className="pic-header">
              <span className="pic-title">{project.name}</span>
              {pinned && (
                <button className="pic-close" onClick={() => setPinned(false)} aria-label="Close details" title="Close">
                  ✕
                </button>
              )}
            </div>

            <div className="pic-fields">
              <CopyField label="Started" copyValue={startCopy}>{startDisplay}</CopyField>
              <CopyField label="Location" copyValue={locValue} mono>{locValue || '—'}</CopyField>
              <CopyField label="Pings" copyValue={pingCopy}>
                {pingDisplay}
                {pingCopy && <span className="pic-note">within {radiusKm} km</span>}
              </CopyField>
            </div>

            <button
              type="button"
              className={classNames('pic-copy-all', { copied: copiedAll })}
              onClick={onCopyAll}
            >
              {copiedAll ? 'Copied!' : 'Copy all'}
            </button>
          </div>
        )}
      </span>

      <button
        className="project-timeline-btn"
        title="Run coverage timeline for this region"
        onClick={() => { onRunProjectTimeline(project); onAfterAction && onAfterAction() }}
      >▶ Timeline</button>
    </div>
  )
}
