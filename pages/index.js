import { useState } from 'react';
import Head from 'next/head';

export default function Home() {
  const [mapsUrl, setMapsUrl] = useState('');
  const [mode, setMode] = useState('km');
  const [interval, setInterval] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} u`;
    return `${h} u ${m} min`;
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
        body: JSON.stringify({ url: mapsUrl, interval, mode }),
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

  const switchStops = result ? result.stops.filter(s => s.type === 'switch').length : 0;

  return (
    <>
      <Head>
        <title>RijWissel – Plan je bestuurderswissels</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className="noise" />

      <header>
        <div className="logo">🚗</div>
        <div>
          <h1>Rij<span>Wissel</span></h1>
          <div className="subtitle">Plan je bestuurderswissels op de route</div>
        </div>
      </header>

      <main>
        <div className="card">
          <div className="section-label">📍 Route instellen</div>

          <div className="input-group">
            <label>GOOGLE MAPS LINK (deel een route)</label>
            <input
              type="text"
              value={mapsUrl}
              onChange={e => setMapsUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
            />
          </div>

          <div className="instruction-box">
            <strong>Hoe je de link deelt:</strong><br />
            Open Google Maps → zoek je route → klik op ⋮ → <em>Route delen of insluiten</em> → kopieer de link en plak hem hier.
          </div>

          <div className="section-label">⏱ Wisselinterval</div>

          <div className="toggle-row">
            <button
              className={`toggle-btn${mode === 'km' ? ' active' : ''}`}
              onClick={() => { setMode('km'); setInterval(200); }}
            >📏 Per km</button>
            <button
              className={`toggle-btn${mode === 'time' ? ' active' : ''}`}
              onClick={() => { setMode('time'); setInterval(2); }}
            >⏰ Per uur</button>
          </div>

          <div className="interval-row">
            <input
              type="number"
              value={interval}
              min="10"
              max="2000"
              onChange={e => setInterval(parseFloat(e.target.value))}
            />
            <span className="interval-unit">
              {mode === 'km' ? 'km per wissel' : 'uur per wissel'}
            </span>
          </div>

          <br />

          {error && <div className="error-msg">{error}</div>}

          <button className="btn-primary" onClick={planRoute} disabled={loading}>
            {loading ? 'Bezig...' : '🗺 Plan wisselstops'}
          </button>
        </div>

        {loading && (
          <div className="loader">
            <div className="spinner" />
            Route wordt verwerkt...
          </div>
        )}

        {result && (
          <div id="results">
            <div className="section-label">🚏 Jouw wisselstops</div>

            <div className="route-info">
              <div className="info-pill"><strong>{result.total_km} km</strong>totale afstand</div>
              <div className="info-pill"><strong>{formatDuration(result.total_minutes)}</strong>reistijd</div>
              <div className="info-pill"><strong>{switchStops}x</strong>wissels</div>
            </div>

            <div className="instruction-box">
              <strong>👨‍👦 Plan:</strong> Wisselen elke <strong>{mode === 'km' ? `${interval} km` : `${interval} uur`}</strong> — {result.stops.length - 1} stops totaal.<br />
              <strong>Papa rijdt eerst</strong> 🚗 · Tik op een wisselstop om tankstations in de buurt te zoeken.
            </div>

            <div className="stops-list">
              {result.stops.map((stop, i) => {
                const numClass = stop.type === 'start' ? 'start' : stop.type === 'end' ? 'end' : 'switch';
                const numLabel = stop.type === 'start' ? '🏁' : stop.type === 'end' ? '🎯' : `${i}`;
                const badge = stop.type === 'start' ? 'START' : stop.type === 'end' ? 'EINDE' : 'WISSEL';
                const driverIcon = stop.driver === 'Papa' ? '👨' : '🧑';
                const kmStr = stop.km_from_start > 0 ? `+${stop.km_from_start} km` : 'Vertrek';
                const timeStr = stop.minutes_from_start > 0 ? `na ${formatDuration(stop.minutes_from_start)}` : 'Start';

                let mapsLink;
                if (stop.type === 'start') mapsLink = `https://www.google.com/maps/search/tankstation+${encodeURIComponent(stop.location)}`;
                else if (stop.type === 'end') mapsLink = `https://www.google.com/maps/search/${encodeURIComponent(stop.location)}`;
                else mapsLink = `https://www.google.com/maps/search/tankstation/@${stop.lat},${stop.lng},13z`;

                return (
                  <div key={i}>
                    {i > 0 && <div className="timeline-connector" />}
                    <div
                      className="stop-card"
                      onClick={() => window.open(mapsLink, '_blank')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`stop-number ${numClass}`}>{numLabel}</div>
                      <div className="stop-info">
                        <div className="stop-title">{stop.location}</div>
                        <div className="stop-meta">
                          <span>📍 {kmStr}</span>
                          <span>⏱ {timeStr}</span>
                          <span>{driverIcon} {stop.driver} rijdt</span>
                        </div>
                      </div>
                      <div className={`badge ${numClass === 'switch' ? '' : numClass}`}>{badge}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="maps-hint">
              Tik op een stop om tankstations in de buurt te zoeken in Google Maps.
            </div>
          </div>
        )}
      </main>

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
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Mono', monospace;
          min-height: 100vh;
          overflow-x: hidden;
        }
        .noise {
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none; z-index: 999;
        }
        header {
          padding: 2rem 2rem 1rem;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; gap: 1rem;
        }
        .logo {
          width: 40px; height: 40px;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.2rem;
        }
        h1 { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 1.3rem; letter-spacing: -0.02em; }
        h1 span { color: var(--accent); }
        .subtitle { font-size: 0.7rem; color: var(--muted); margin-top: 2px; }
        main { padding: 2rem; max-width: 600px; margin: 0 auto; }
        .section-label {
          font-size: 0.65rem; letter-spacing: 0.15em; color: var(--accent);
          text-transform: uppercase; margin-bottom: 0.75rem; font-weight: 500;
        }
        .card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem;
        }
        .input-group { margin-bottom: 1.2rem; }
        label { display: block; font-size: 0.7rem; color: var(--muted); margin-bottom: 0.4rem; letter-spacing: 0.05em; }
        input[type="text"], input[type="number"] {
          width: 100%; background: var(--surface2); border: 1px solid var(--border);
          border-radius: 10px; padding: 0.75rem 1rem; color: var(--text);
          font-family: 'DM Mono', monospace; font-size: 0.85rem; outline: none; transition: border-color 0.2s;
        }
        input:focus { border-color: var(--accent); }
        input::placeholder { color: var(--muted); }
        .toggle-row { display: flex; gap: 0.5rem; margin-bottom: 1.2rem; }
        .toggle-btn {
          flex: 1; padding: 0.65rem; border-radius: 10px; border: 1px solid var(--border);
          background: var(--surface2); color: var(--muted); font-family: 'DM Mono', monospace;
          font-size: 0.75rem; cursor: pointer; transition: all 0.2s; letter-spacing: 0.03em;
        }
        .toggle-btn.active { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 500; }
        .interval-row { display: flex; align-items: center; gap: 0.75rem; }
        .interval-row input { flex: 1; }
        .interval-unit { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
        .btn-primary {
          width: 100%; padding: 1rem;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          border: none; border-radius: 12px; color: #000;
          font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.95rem;
          cursor: pointer; letter-spacing: 0.02em; transition: opacity 0.2s, transform 0.15s;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .route-info { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .info-pill {
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.72rem; color: var(--muted);
        }
        .info-pill strong { color: var(--text); display: block; font-size: 0.85rem; }
        .stops-list { display: flex; flex-direction: column; gap: 0; margin-bottom: 1rem; }
        .stop-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 14px; padding: 1.2rem 1.5rem;
          display: flex; align-items: center; gap: 1.2rem;
          cursor: pointer; transition: border-color 0.2s, transform 0.15s;
          position: relative; overflow: hidden;
        }
        .stop-card::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: linear-gradient(to bottom, var(--accent), var(--accent2));
          border-radius: 3px 0 0 3px;
        }
        .stop-card:hover { border-color: var(--accent); transform: translateX(3px); }
        .stop-number {
          width: 36px; height: 36px; background: var(--surface2); border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 0.85rem; flex-shrink: 0;
        }
        .stop-number.start { background: rgba(74,222,128,0.15); color: var(--green); }
        .stop-number.end { background: rgba(245,166,35,0.15); color: var(--accent); }
        .stop-number.switch { background: rgba(232,103,60,0.2); color: var(--accent2); }
        .stop-info { flex: 1; min-width: 0; }
        .stop-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 0.9rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .stop-meta { font-size: 0.68rem; color: var(--muted); display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .stop-meta span { display: flex; align-items: center; gap: 0.3rem; }
        .badge {
          font-size: 0.6rem; padding: 0.2rem 0.5rem; border-radius: 4px;
          background: rgba(232,103,60,0.2); color: var(--accent2);
          font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; flex-shrink: 0;
        }
        .badge.start { background: rgba(74,222,128,0.15); color: var(--green); }
        .badge.end { background: rgba(245,166,35,0.15); color: var(--accent); }
        .maps-hint {
          font-size: 0.67rem; color: var(--muted); text-align: center;
          margin-top: 1rem; padding: 0.75rem; background: var(--surface2);
          border-radius: 8px; line-height: 1.6;
        }
        .loader { text-align: center; padding: 2rem; color: var(--muted); font-size: 0.75rem; }
        .spinner {
          width: 24px; height: 24px; border: 2px solid var(--surface2);
          border-top-color: var(--accent); border-radius: 50%;
          animation: spin 0.8s linear infinite; margin: 0 auto 1rem;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .error-msg {
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 10px; padding: 1rem; font-size: 0.75rem; color: #f87171;
          margin-bottom: 1rem; line-height: 1.6;
        }
        .instruction-box {
          background: rgba(245,166,35,0.07); border: 1px solid rgba(245,166,35,0.2);
          border-radius: 10px; padding: 0.9rem 1rem; font-size: 0.72rem;
          line-height: 1.7; color: var(--muted); margin-bottom: 1.5rem;
        }
        .instruction-box strong { color: var(--accent); }
        .timeline-connector { width: 2px; height: 12px; background: var(--border); margin-left: 29px; }
        #results { margin-top: 0; }
      `}</style>
    </>
  );
}
