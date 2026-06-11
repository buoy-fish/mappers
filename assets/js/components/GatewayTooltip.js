import React from 'react'
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'
import parseISO from 'date-fns/parseISO'

const DAY_MS = 24 * 60 * 60 * 1000;

// last_heard arrives as an ISO-8601 string (utc_datetime_usec via Jason) from
// either API path, or null/undefined for a provisioned-but-silent gateway.
function lastHeardInfo(lastHeard) {
    if (!lastHeard) return { label: "No uplinks recorded", fresh: false, exact: null };
    const date = parseISO(lastHeard);
    if (isNaN(date.getTime())) return { label: "No uplinks recorded", fresh: false, exact: null };
    return {
        label: formatDistanceToNowStrict(date) + " ago",
        fresh: Date.now() - date.getTime() < DAY_MS,
        exact: date.toLocaleString(),
    };
}

// "April 2, 2026" from an ISO date(-time) string, or null when absent/invalid.
function installedLabel(installedAt) {
    if (!installedAt) return null;
    const date = parseISO(installedAt);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Tooltip body for a gateway marker. Pure presentational — Map.js owns the
// Popup wrapper and the show/hide interaction (hover/click on desktop,
// long-press on touch). `gw` carries the marker's feature properties:
// { name, last_heard, installed_at, role, description, altitude } — everything
// but name may be missing (the degraded uplinks_heard fallback path has no
// role/altitude/installed_at), so each row renders only when its datum exists.
// Identifier internals (EUI, concentrator GWIDs) are deliberately NOT shown —
// they drive the identity matching but aren't operator-relevant at a glance.
function GatewayTooltip(props) {
    const gw = props.gw;
    const heard = lastHeardInfo(gw.last_heard);
    const installed = installedLabel(gw.installed_at);

    return (
        <div className="gateway-card">
            <div className="gateway-card-head">
                <span className={"gateway-card-status" + (heard.fresh ? " fresh" : "")} />
                <span className="gateway-card-name">{gw.name}</span>
                {gw.role && <span className="gateway-card-role">{gw.role}</span>}
                <button className="gateway-card-close" aria-label="Close gateway info" onClick={props.onClose}>
                    <svg width="10" height="10" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.9998 6.54957L13.4284 1.12096C13.8289 0.720422 14.4783 0.720422 14.8789 1.12096C15.2794 1.5215 15.2794 2.1709 14.8789 2.57144L9.45028 8.00004L14.8789 13.4287C15.2794 13.8292 15.2794 14.4786 14.8789 14.8791C14.4783 15.2797 13.8289 15.2797 13.4284 14.8791L7.9998 9.45052L2.57119 14.8791C2.17065 15.2797 1.52125 15.2797 1.12072 14.8791C0.720178 14.4786 0.720178 13.8292 1.12072 13.4287L6.54932 8.00004L1.12072 2.57144C0.720178 2.1709 0.720178 1.5215 1.12072 1.12096C1.52125 0.720422 2.17065 0.720422 2.57119 1.12096L7.9998 6.54957Z" />
                    </svg>
                </button>
            </div>
            <dl className="gateway-card-rows">
                <div className="gateway-card-row">
                    <dt className="type-smallcap">Last heard</dt>
                    <dd className={heard.fresh ? "gateway-card-fresh" : ""} title={heard.exact || undefined}>{heard.label}</dd>
                </div>
                {installed &&
                    <div className="gateway-card-row">
                        <dt className="type-smallcap">Installed</dt>
                        <dd>{installed}</dd>
                    </div>
                }
                {gw.altitude != null &&
                    <div className="gateway-card-row">
                        <dt className="type-smallcap">Altitude</dt>
                        <dd>{gw.altitude}<span className="stat-unit"> m</span></dd>
                    </div>
                }
            </dl>
            {gw.description && <p className="gateway-card-desc">{gw.description}</p>}
        </div>
    );
}

export default GatewayTooltip
