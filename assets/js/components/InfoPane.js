import React from 'react'
import classNames from 'classnames'
import formatDistanceToNowStrict from 'date-fns/formatDistanceToNowStrict'
import parseISO from 'date-fns/parseISO'
import h3 from 'h3-js/dist/h3-js';

const PROJECTS = [
    { name: "Punta Abreojos, Baja", lat: 26.72, lng: -113.56, zoom: 12 },
    { name: "Punta Eugenia, Baja", lat: 27.85, lng: -115.08, zoom: 12 },
    // TODO: Pull project locations from app.buoy.fish API once projects are defined there
    { name: "Nova Scotia", lat: 45.30, lng: -64.90, zoom: 10 },
];

function InfoPane(props) {
    const [showLegendPane, setShowLegendPane] = React.useState(false)
    const [showProjectsPane, setShowProjectsPane] = React.useState(false)
    const onLegendClick = () => { setShowLegendPane(!showLegendPane); setShowProjectsPane(false); }
    const onProjectsClick = () => { setShowProjectsPane(!showProjectsPane); setShowLegendPane(false); }
    const locale = navigator.language;

    function hotspotCount() {
        return props.uplinks.length
    }

    function recentTime() {
        let sortedTimes = props.uplinks;
        sortedTimes.sort((a,b) => -a.timestamp.localeCompare(b.timestamp))

        let distTimeFull = formatDistanceToNowStrict(parseISO(sortedTimes[0].timestamp))
        
        let distTimeValue = distTimeFull.split(" ")[0]; //get the value e.g. "3 hours" => "3"
        
        let distTimeUnit = distTimeFull.split(" ")[1]; //get the unit e.g. "3 hours" => "hours"
        let distTimeUnitUppercase = distTimeUnit.charAt(0).toUpperCase() + distTimeUnit.slice(1);

        let timeInfo = {
            full: distTimeFull,
            number: distTimeValue,
            unit: distTimeUnitUppercase
        }
        return timeInfo
    }

    function uplinkDistance(uplinkLat, uplinkLng) {
        // hotspots are res8, find the parent res8 from the res9 selected hex  
        let selectedHex = h3.h3ToParent(props.hexId, 8);
        // Create the res8 from provided coordinates
        let hotspotHex = h3.geoToH3(uplinkLat, uplinkLng, 8);

        // if the mapped hex is within the hotspot hex return a null result.
        if (selectedHex == hotspotHex) {
            let result = {
                number: "–",
                unit: ""
            }
            return result
        } else { //compute the distance
            let point1 = [uplinkLat, uplinkLng];
            let point2 = h3.h3ToGeo(props.hexId);
            let result = {};
            let dist = 0;
            let unit = "km";
            if (locale == 'en-US') {
                // 🇺🇸 freedom units
                dist = h3.pointDist(point1, point2, h3.UNITS.km) / 1.609;
                unit = "mi"
            } else {
                dist = h3.pointDist(point1, point2, h3.UNITS.km); // si
            }
            if (dist < 1) {
                result = {
                    number: dist.toFixed(1),
                    unit: unit
                }
            } else {
                result = {
                    number: Math.round(dist),
                    unit: unit
                }
            }
            return result
        }
    }

    function findGatewayName(uplinks, gatewayEui) {
        const match = uplinks.find(u => u.gateway_eui === gatewayEui);
        return match ? deKebab(match.hotspot_name) : gatewayEui;
    }

    function deKebab(string){
        return string
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
        .join(' ');
    }

    return (
        <div className="info-pane">
            <div className={classNames("pane-nav", {
                 "has-subcontent": showLegendPane || showProjectsPane || props.showHexPane
            })}>
                <span className="mappers-logo" style={{fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em'}}>Buoy.Fish Coverage</span>
                <ul className="nav-links">
                    <li className="nav-link">
                        <button onClick={onLegendClick}>Legend</button>
                    </li>
                    <li className="nav-link">
                        <button onClick={onProjectsClick}>Projects</button>
                    </li>
                    <li className="nav-link">
                        <a href="https://buoy.fish" target="_blank">Buoy.Fish</a>
                    </li>
                    <li className="nav-link">
                        <a href="https://github.com/buoy-fish/mappers" target="_blank">GitHub</a>
                    </li>
                </ul>
            </div>
            { showLegendPane &&
                <div className="legend">
                    <div className="legend-line">
                        <span className="legend-item type-smallcap">RSSI</span>
                        <div className="legend-item">
                            <svg className="legend-icon legend-dBm-low" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 0L13.0622 3.5V10.5L7 14L0.937822 10.5V3.5L7 0Z" />
                            </svg>
                            <span>-120<span className="stat-unit"> dBm</span></span>
                        </div>
                        <div className="legend-item">
                            <svg className="legend-icon legend-dBm-medium" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 0L13.0622 3.5V10.5L7 14L0.937822 10.5V3.5L7 0Z" />
                            </svg>
                            <span>-100<span className="stat-unit"> dBm</span></span>
                        </div>
                        <div className="legend-item">
                            <svg className="legend-icon legend-dBm-high" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 0L13.0622 3.5V10.5L7 14L0.937822 10.5V3.5L7 0Z" />
                            </svg>
                            <span>-80<span className="stat-unit"> dBm</span></span>
                        </div>
                    </div>

                    <div className="legend-line">
                        <div className="legend-item">
                            <svg className="legend-icon legend-mapper-witness" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 0L13.0622 3.5V10.5L7 14L0.937822 10.5V3.5L7 0Z" />
                            </svg>
                            <span>Mapper Witness</span>
                        </div>
                    </div>

                    <div className="legend-line">
                        <div className="legend-item">
                            <svg className="legend-icon legend-hotspot" width="14" height="14" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 0L13.0622 3.5V10.5L7 14L0.937822 10.5V3.5L7 0Z" />
                            </svg>
                            <span>Hotspot</span>
                        </div>
                    </div>

                    <div className="legend-line gateway-toggle-line">
                        <label className="gateway-toggle">
                            <button
                                role="switch"
                                aria-checked={props.showGateways}
                                onClick={props.onToggleGateways}
                                className={`gateway-switch ${props.showGateways ? 'active' : ''}`}
                            >
                                <span className="gateway-switch-knob" />
                            </button>
                            <span>Show Gateways</span>
                        </label>
                    </div>
                    {props.showGateways &&
                        <div className="legend-line gateway-toggle-line">
                            <label className="gateway-toggle">
                                <button
                                    role="switch"
                                    aria-checked={props.hideCoverage}
                                    onClick={props.onToggleCoverage}
                                    className={`gateway-switch ${props.hideCoverage ? 'active' : ''}`}
                                >
                                    <span className="gateway-switch-knob" />
                                </button>
                                <span>Hide Coverage</span>
                            </label>
                        </div>
                    }
                </div>
            }
            { showProjectsPane &&
                <div className="projects-pane">
                    {PROJECTS.map(project => (
                        <button
                            key={project.name}
                            className="project-item"
                            onClick={() => { props.onFlyToProject(project); setShowProjectsPane(false); }}
                        >
                            {project.name}
                        </button>
                    ))}
                </div>
            }
            { props.showHexPane &&
                <div className="main-stats">
                    <div className="stats-heading">
                        <span>Hex Statistics</span>
                        { props.showHexPaneCloseButton &&
                            <button className="close-button" onClick={props.onCloseHexPaneClick}>
                                <svg className="icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M7.9998 6.54957L13.4284 1.12096C13.8289 0.720422 14.4783 0.720422 14.8789 1.12096C15.2794 1.5215 15.2794 2.1709 14.8789 2.57144L9.45028 8.00004L14.8789 13.4287C15.2794 13.8292 15.2794 14.4786 14.8789 14.8791C14.4783 15.2797 13.8289 15.2797 13.4284 14.8791L7.9998 9.45052L2.57119 14.8791C2.17065 15.2797 1.52125 15.2797 1.12072 14.8791C0.720178 14.4786 0.720178 13.8292 1.12072 13.4287L6.54932 8.00004L1.12072 2.57144C0.720178 2.1709 0.720178 1.5215 1.12072 1.12096C1.52125 0.720422 2.17065 0.720422 2.57119 1.12096L7.9998 6.54957Z" />
                                </svg>
                            </button>
                        }
                    </div>
                    <div className="h3-holder">
                        <svg className="hex-icon" width="22" height="24" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M9.5 1.86603C10.4282 1.33013 11.5718 1.33013 12.5 1.86603L19.0263 5.63397C19.9545 6.16987 20.5263 7.16025 20.5263 8.23205V15.7679C20.5263 16.8397 19.9545 17.8301 19.0263 18.366L12.5 22.134C11.5718 22.6699 10.4282 22.6699 9.5 22.134L2.97372 18.366C2.04552 17.8301 1.47372 16.8397 1.47372 15.7679V8.23205C1.47372 7.16025 2.04552 6.16987 2.97372 5.63397L9.5 1.86603Z" stroke="#FF9800" strokeWidth="2" strokeLinejoin="round" />
                        </svg>
                        <span className="h3id">{props.hexId}</span>

                    </div>
                    <div className="big-stats">
                        <div className="big-stat">
                            <div className="stat-head type-smallcap">Best RSSI</div>
                            <div className="stat-body">
                                {props.bestRssi}
                                <span className="stat-unit"> dBm</span>
                            </div>
                        </div>

                        <div className="big-stat">
                            <div className="stat-head type-smallcap">SNR</div>
                            <div className="stat-body">
                                {props.snr}
                                <span className="stat-unit"></span>
                            </div>
                        </div>

                        <div className="big-stat">
                            <div className="stat-head type-smallcap">Redundancy</div>
                            <div className="stat-body">
                                {props.uplinks && hotspotCount()}
                                <span className="stat-unit"> Hotspots</span>
                            </div>
                        </div>

                        <div className="big-stat">
                            <div className="stat-head type-smallcap">Hex Updated</div>
                            <div className="stat-body">
                                {props.uplinks && recentTime().number}
                                <span className="stat-unit"> {props.uplinks && recentTime().unit} Ago</span>
                            </div>
                        </div>

                    </div>
                    <div className="hotspots-table-container">
                        <table className="hotspots-table">
                            <thead className="hotspot-table-head type-smallcap">
                                <tr>
                                    <th className="table-left" title="Link path">Link</th>
                                    <th className="table-right" title="Received Signal Strength Indicator">RSSI</th>
                                    <th className="table-right" title="Signal to noise ratio">SNR</th>
                                    <th className="table-right" title="Distance">Dist</th>
                                </tr>
                            </thead>
                            <tbody>
                                {props.uplinks && props.uplinks.map(uplink => {
                                    const relayName = uplink.relay_gateway_eui
                                        ? findGatewayName(props.uplinks, uplink.relay_gateway_eui)
                                        : null;
                                    const linkLabel = relayName
                                        ? relayName + " \u2192 " + deKebab(uplink.hotspot_name)
                                        : "Device \u2192 " + deKebab(uplink.hotspot_name);
                                    return (
                                        <tr key={uplink.uplink_heard_id}>
                                            <td className="table-left animal-cell">{linkLabel}</td>
                                            <td className="table-right util-liga-mono tighten table-numeric">{uplink.rssi}<span className="table-unit"> dBm</span></td>
                                            <td className="table-right util-liga-mono tighten table-numeric">{uplink.snr.toFixed(2)}</td>
                                            <td className="table-right util-liga-mono tighten table-numeric">{uplinkDistance(uplink.lat, uplink.lng).number}<span className="table-unit"> {uplinkDistance(uplink.lat, uplink.lng).unit}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            }
        </div>
    );
}

export default InfoPane