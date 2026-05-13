import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function Home() {
  const [mapsUrl, setMapsUrl] = useState('');
  const [mode, setMode] = useState('km');
  const [interval, setIntervalVal] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeStop, setActiveStop] = useState(null);
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  // Init Leaflet map
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (leafletMapRef.current) return;

    const L = window.L;
    if (!L) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView([50.85, 4.35], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19,
    }).addTo(map);
    leafletMapRef.current = map;
  }, []);

  // Render result on map
  useEffect(() => {
    if (!result || !leafletMapRef.current) return;
    const L = window.L;
    const map = leafletMapRef.current;

    // Clear old layers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }

    // Draw route polyline
    const latlngs = result.route.map(p => [p.lat, p.lng]);
    polylineRef.current = L.polyline(latlngs, {
      color: '#f5a623',
      weight: 4,
      opacity: 0.85,
    }).addTo(map);

    // Fit map to route
    map.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });

    // Draw stop markers
    result.stops.forEach((stop, i) => {
      const isSwitch = stop.type === 'switch';
      const isStart = stop.type === 'start';
      const isEnd = stop.type === 'end';

      const color = isStart ? '#4ade80' : isEnd ? '#f5a623' : '#e8673c';
      const emoji = isStart ? '🏁' : isEnd ? '🎯' : `${i}`;

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${color};
          color:#000;
          font-weight:800;
          font-family:Syne,sans-serif;
          font-size:11px;
          width:32px;height:32px;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          border:2px solid rgba(255,255,255,0.3);
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          cursor:pointer;
        ">${emoji}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);

      const stationHtml = stop.gasStations?.length
        ? stop.gasStations.map(g =>
            `<div style="margin-top:4px;font-size:10px;color:#f5a623;">⛽ ${g.name}</div>`
          ).join('')
        : '';

      marker.bindPopup(`
        <div style="font-family:DM Mono,monospace;min-width:160px;">
          <div style="font-family:Syne,sans-serif;font-weight:800;font-size:13px;margin-bottom:4px;">${stop.location}</div>
          <div style="font-size:10px;color:#888;">📍 +${stop.km_from_start} km · ⏱ ${fmt(stop.minutes_from_start)}</div>
          <div style="font-size:11px;margin-top:4px;">🚗 <strong>${stop.driver}</strong> rijdt</div>
          ${stationHtml}
          ${stop.gasStations?.length ? `<a href="https://www.google.com/maps/search/tankstation/@${stop.lat},${stop.lng},14z" target="_blank" style="display:block;margin-top:8px;font-size:10px;color:#f5a623;">Open in Google Maps →</a>` : ''}
        </div>
      `);

      // Gas station markers (small)
      (stop.gasStations || []).forEach(gs => {
        const gsIcon = L.divIcon({
          className: '',
          html: `<div style="background:#1e2330;border:1.5px solid #f5a623;border-radius:6px;padding:2px 4px;font-size:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.5);">⛽</div>`,
          iconSize: [24, 20],
          iconAnchor: [12, 10],
        });
        const gsMarker = L.marker([gs.lat, gs.lng], { icon: gsIcon }).addTo(map);
        gsMarker.bindPopup(`<div style="font-family:DM Mono,monospace;font-size:11px;"><strong>${gs.name}</strong></div>`);
        markersRef.current.push(gsMarker);
      });

      markersRef.current.push(marker);
    });
  }, [result]);

  function fmt(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!minutes) return 'Start';
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} u`;
    return `${h} u ${m} min`;
  }

  function focusStop(stop) {
    setActiveStop(stop);
    if (!leafletMapRef.current) return;
    leafletMapRef.current.setView([stop.lat, stop.lng], 13, { animate: true });
    // Open popup of matching marker
    const idx = result.stops.indexOf(stop);
    if (markersRef.current[idx]) markersRef.current[idx].openPopup();
  }

  async function planRoute() {
    setError('');
    setResult(null);
    if (!mapsUrl.trim()) { setError('Plak eerst een Google Maps routelink.'); return; }
    if (!interval || interval <= 0) { setError('Vul een geldig interval in.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: mapsUrl, interval: Number(interval), mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Onbekende fout');
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const switchCount = result ? result.stops.filter(s => s.type === 'switch').length : 0;

  return (
    <>
      <Head>
        <title>RijWissel – Plan je bestuurderswissels</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className="app">
        {/* ── Sidebar ── */}
        <div className="sidebar">
          <header>
            <div className="logo">🚗</div>
            <div>
              <h1>Rij<span>Wissel</span></h1>
              <div className="subtitle">Plan je bestuurderswissels</div>
            </div>
          </header>

          <div className="sidebar-body">
            <div className="section-label">📍 Route</div>
            <div className="input-group">
              <label>GOOGLE MAPS LINK</label>
              <input
                type="text"
                value={mapsUrl}
                onChange={e => setMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/maps/dir/..."
              />
              <div className="hint">
                Open Maps → zoek route → ⋮ → <em>Route delen</em> → kopieer link.<br/>
                ✅ Verkorte links (goo.gl) werken ook.
              </div>
            </div>

            <div className="section-label">⏱ Interval</div>
            <div className="toggle-row">
              <button className={`toggle-btn${mode === 'km' ? ' active' : ''}`} onClick={() => { setMode('km'); setIntervalVal(200); }}>📏 Per km</button>
              <button className={`toggle-btn${mode === 'time' ? ' active' : ''}`} onClick={() => { setMode('time'); setIntervalVal(2); }}>⏰ Per uur</button>
            </div>
            <div className="interval-row">
              <input type="number" value={interval} min="10" max="2000" onChange={e => setIntervalVal(e.target.value)} />
              <span className="interval-unit">{mode === 'km' ? 'km' : 'uur'} per wissel</span>
            </div>

            {error {error && <div className="error-msg">⚠️ {error}</div>}{error && <div className="error-msg">⚠️ {error}</div>} <div className="error-msg" style={{whiteSpace:"pre-wrap"}}>⚠️ {error}</div>}

            <button className="btn-primary" onClick={planRoute} disabled={loading}>
              {loading ? <><span className="spin">⟳</span> Berekenen...</> : '🗺 Plan wisselstops'}
            </button>

            {result && (
              <>
                <div className="route-pills">
                  <div className="pill"><strong>{result.total_km} km</strong><span>afstand</span></div>
                  <div className="pill"><strong>{fmt(result.total_minutes)}</strong><span>reistijd</span></div>
                  <div className="pill"><strong>{switchCount}×</strong><span>wissels</span></div>
                </div>

                <div className="section-label" style={{ marginTop: '1.25rem' }}>🚏 Stops</div>
                <div className="stops-list">
                  {result.stops.map((stop, i) => (
                    <div
                      key={i}
                      className={`stop-item${activeStop === stop ? ' active' : ''}`}
                      onClick={() => focusStop(stop)}
                    >
                      <div className={`dot ${stop.type}`}>
                        {stop.type === 'start' ? '🏁' : stop.type === 'end' ? '🎯' : i}
                      </div>
                      <div className="stop-text">
                        <div className="stop-name">{stop.location}</div>
                        <div className="stop-meta">
                          {stop.km_from_start > 0 && <span>+{stop.km_from_start} km</span>}
                          {stop.minutes_from_start > 0 && <span>{fmt(stop.minutes_from_start)}</span>}
                          <span>{stop.driver === 'Papa' ? '👨' : '🧑'} {stop.driver}</span>
                        </div>
                        {stop.suggestedStation && (
                          <div className="station-tag">⛽ {stop.suggestedStation}</div>
                        )}
                      </div>
                      <div className={`badge ${stop.type}`}>
                        {stop.type === 'start' ? 'START' : stop.type === 'end' ? 'EINDE' : 'WISSEL'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <div className="map-wrap">
          <div ref={mapRef} className="map" />
          {!result && !loading && (
            <div className="map-placeholder">
              <div className="map-msg">
                <span style={{ fontSize: '2.5rem' }}>🗺</span>
                <div>Vul een route in en klik op <strong>Plan wisselstops</strong></div>
                <div style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: '0.5rem' }}>De route en tankstations verschijnen hier</div>
              </div>
            </div>
          )}
          {loading && (
            <div className="map-placeholder">
              <div className="map-msg">
                <div className="big-spin">⟳</div>
                <div>Route berekenen...</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.5, marginTop: '0.5rem' }}>Tankstations zoeken langs de route</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        :root {
          --bg: #0d0f14;
          --surface: #161922;
          --surface2: #1e2330;
          --accent: #f5a623;
          --accent2: #e8673c;
          --text: #eceef5;
          --muted: #6b7280;
          --green: #4ade80;
          --border: rgba(255,255,255,0.07);
          --sidebar: 340px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #__next { height: 100%; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Mono', monospace;
          overflow: hidden;
        }

        .app { display: flex; height: 100vh; }

        /* ── Sidebar ── */
        .sidebar {
          width: var(--sidebar);
          flex-shrink: 0;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        header {
          padding: 1.25rem 1.25rem 1rem;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 0.75rem;
          flex-shrink: 0;
        }
        .logo {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.1rem; flex-shrink: 0;
        }
        h1 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 1.15rem; letter-spacing: -0.02em; }
        h1 span { color: var(--accent); }
        .subtitle { font-size: 0.65rem; color: var(--muted); }

        .sidebar-body {
          padding: 1.25rem;
          overflow-y: auto;
          flex: 1;
          scrollbar-width: thin;
          scrollbar-color: var(--surface2) transparent;
        }

        .section-label {
          font-size: 0.6rem; letter-spacing: 0.15em; color: var(--accent);
          text-transform: uppercase; margin-bottom: 0.6rem; font-weight: 500;
        }

        .input-group { margin-bottom: 1rem; }
        label { display: block; font-size: 0.62rem; color: var(--muted); margin-bottom: 0.35rem; letter-spacing: 0.05em; }
        input[type="text"], input[type="number"] {
          width: 100%; background: var(--surface2); border: 1px solid var(--border);
          border-radius: 9px; padding: 0.65rem 0.85rem; color: var(--text);
          font-family: 'DM Mono', monospace; font-size: 0.8rem; outline: none; transition: border-color 0.2s;
        }
        input:focus { border-color: var(--accent); }
        input::placeholder { color: var(--muted); }
        .hint { font-size: 0.62rem; color: var(--muted); margin-top: 0.35rem; line-height: 1.5; }

        .toggle-row { display: flex; gap: 0.4rem; margin-bottom: 0.75rem; }
        .toggle-btn {
          flex: 1; padding: 0.55rem; border-radius: 8px; border: 1px solid var(--border);
          background: var(--surface2); color: var(--muted); font-family: 'DM Mono', monospace;
          font-size: 0.72rem; cursor: pointer; transition: all 0.2s;
        }
        .toggle-btn.active { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 500; }

        .interval-row { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem; }
        .interval-row input { flex: 1; }
        .interval-unit { font-size: 0.7rem; color: var(--muted); white-space: nowrap; }

        .btn-primary {
          width: 100%; padding: 0.85rem;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          border: none; border-radius: 10px; color: #000;
          font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.9rem;
          cursor: pointer; transition: opacity 0.2s, transform 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          margin-bottom: 1rem;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .spin { display: inline-block; animation: spin 0.7s linear infinite; }
        .big-spin { font-size: 2rem; animation: spin 0.7s linear infinite; display: block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-msg {
          background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px; padding: 0.75rem; font-size: 0.7rem; color: #f87171;
          margin-bottom: 0.75rem; line-height: 1.6;
        }

        .route-pills { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .pill {
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 8px; padding: 0.4rem 0.7rem; font-size: 0.65rem;
          color: var(--muted); flex: 1; min-width: 70px;
        }
        .pill strong { color: var(--text); display: block; font-size: 0.8rem; }

        .stops-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .stop-item {
          display: flex; align-items: flex-start; gap: 0.75rem;
          padding: 0.75rem; border-radius: 10px;
          background: var(--surface2); border: 1px solid var(--border);
          cursor: pointer; transition: border-color 0.2s, background 0.2s;
        }
        .stop-item:hover, .stop-item.active { border-color: var(--accent); background: rgba(245,166,35,0.06); }

        .dot {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 0.75rem;
          background: var(--surface); color: var(--accent2);
        }
        .dot.start { background: rgba(74,222,128,0.15); color: var(--green); }
        .dot.end { background: rgba(245,166,35,0.15); color: var(--accent); }
        .dot.switch { background: rgba(232,103,60,0.18); color: var(--accent2); }

        .stop-text { flex: 1; min-width: 0; }
        .stop-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.8rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stop-meta { display: flex; gap: 0.5rem; font-size: 0.62rem; color: var(--muted); flex-wrap: wrap; }
        .station-tag { font-size: 0.62rem; color: var(--accent); margin-top: 0.25rem; }

        .badge {
          font-size: 0.55rem; padding: 0.15rem 0.45rem; border-radius: 4px; flex-shrink: 0;
          background: rgba(232,103,60,0.18); color: var(--accent2);
          font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; align-self: flex-start; margin-top: 2px;
        }
        .badge.start { background: rgba(74,222,128,0.12); color: var(--green); }
        .badge.end { background: rgba(245,166,35,0.12); color: var(--accent); }

        /* ── Map ── */
        .map-wrap { flex: 1; position: relative; }
        .map { width: 100%; height: 100%; }
        .map-placeholder {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(13,15,20,0.8); backdrop-filter: blur(4px); z-index: 1000;
          pointer-events: none;
        }
        .map-msg {
          text-align: center; display: flex; flex-direction: column; gap: 0.5rem;
          font-size: 0.85rem; color: var(--muted);
        }
        .map-msg strong { color: var(--accent); }

        /* Leaflet popup overrides */
        .leaflet-popup-content-wrapper {
          background: #161922 !important; border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 10px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
          color: #eceef5 !important;
        }
        .leaflet-popup-tip { background: #161922 !important; }
        .leaflet-popup-content { margin: 10px 12px !important; }

        /* Mobile */
        @media (max-width: 640px) {
          .app { flex-direction: column; overflow: auto; }
          body { overflow: auto; }
          .sidebar { width: 100%; height: auto; overflow: visible; }
          .sidebar-body { overflow: visible; }
          .map-wrap { height: 60vw; min-height: 280px; flex-shrink: 0; }
        }
      `}</style>
    </>
  );
}
