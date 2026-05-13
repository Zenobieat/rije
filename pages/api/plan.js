// pages/api/plan.js
// 100% GRATIS — geen betaalde APIs nodig
// 1. Verkorte links uitbreiden (redirect follow)
// 2. URL zelf parsen (regex op alle bekende Google Maps formaten)
// 3. Nominatim geocoding (gratis OpenStreetMap)
// 4. OSRM routing (gratis)
// 5. Wisselstops berekenen langs route
// 6. Overpass API voor tankstations (gratis)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, interval, mode } = req.body;
  if (!url || !interval || !mode) return res.status(400).json({ error: 'Ontbrekende velden' });

  try {
    // ── Stap 1: Verkorte link uitbreiden ─────────────────────────────────────
    let expandedUrl = url.trim();
    if (/goo\.gl|maps\.app\.goo\.gl/.test(expandedUrl)) {
      try {
        const r = await fetch(expandedUrl, {
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RijWisselBot/2.0)' },
        });
        if (r.url && r.url !== expandedUrl) expandedUrl = r.url;
      } catch {
        try {
          const r = await fetch(expandedUrl, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RijWisselBot/2.0)' },
          });
          if (r.url && r.url !== expandedUrl) expandedUrl = r.url;
        } catch { /* ga door met originele URL */ }
      }
    }

    // ── Stap 2: URL parsen — alle Google Maps formaten ───────────────────────
    let origin = null, destination = null, via = [];
    let originCoord = null, destCoord = null;

    try {
      const u = new URL(expandedUrl);
      const path = u.pathname;

      // Formaat A: /maps/dir/Plaats+A/Plaats+B
      const dirMatch = path.match(/\/maps\/dir\/(.+)/);
      if (dirMatch) {
        const parts = dirMatch[1]
          .split('/')
          .map(p => decodeURIComponent(p).replace(/\+/g, ' ').trim())
          .filter(p => p && !p.startsWith('@') && p.length > 1 && !/^\d+\.\d+,\d+\.\d+$/.test(p));
        if (parts.length >= 2) {
          origin = parts[0];
          destination = parts[parts.length - 1];
          via = parts.slice(1, -1);
        }
      }

      // Formaat B: ?saddr / daddr params
      if (!origin) {
        const saddr = u.searchParams.get('saddr') || u.searchParams.get('origin');
        const daddr = u.searchParams.get('daddr') || u.searchParams.get('destination');
        if (saddr && daddr) { origin = saddr; destination = daddr; }
      }

      // Formaat C: /maps/place/Naam
      if (!origin) {
        const placeMatch = path.match(/\/maps\/place\/([^/@]+)/);
        if (placeMatch) {
          destination = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
          origin = 'Huidige locatie';
        }
      }

      // Extract coördinaten uit URL als fallback
      const allCoords = [...(expandedUrl).matchAll(/(-?\d{1,3}\.\d{5,}),(-?\d{1,3}\.\d{5,})/g)];
      if (allCoords.length >= 2) {
        originCoord = { lat: parseFloat(allCoords[0][1]), lng: parseFloat(allCoords[0][2]) };
        destCoord = { lat: parseFloat(allCoords[allCoords.length - 1][1]), lng: parseFloat(allCoords[allCoords.length - 1][2]) };
      }

    } catch (e) {
      console.error('URL parse error:', e.message);
    }

    if (!origin && !originCoord) {
      return res.status(400).json({
        error: 'Kan de route niet lezen uit deze link.\n\nGebruik een volledige routelink:\nGoogle Maps → zoek route → tik op ⋮ → "Route delen" → kopieer die link.',
      });
    }

    // ── Stap 3: Geocodeer plaatsnamen via Nominatim ──────────────────────────
    async function geocode(place) {
      await sleep(350); // Nominatim: max 1 req/sec
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1&accept-language=nl`,
        { headers: { 'User-Agent': 'RijWisselApp/2.0' } }
      );
      const d = await r.json();
      if (!d.length) throw new Error(`"${place}" niet gevonden. Controleer de spelling of gebruik een andere link.`);
      return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), name: d[0].display_name };
    }

    async function reverseGeocode(lat, lng) {
      try {
        await sleep(350);
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=nl`,
          { headers: { 'User-Agent': 'RijWisselApp/2.0' } }
        );
        const d = await r.json();
        const addr = d.address || {};
        return addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state || 'Tussenstop';
      } catch { return 'Tussenstop'; }
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // Bouw coords array
    let coords = [];
    if (originCoord && destCoord && (!origin || origin === 'Huidige locatie') && !destination) {
      const [originName, destName] = await Promise.all([
        reverseGeocode(originCoord.lat, originCoord.lng),
        reverseGeocode(destCoord.lat, destCoord.lng),
      ]);
      origin = originName;
      destination = destName;
      coords = [
        { lat: originCoord.lat, lng: originCoord.lng, name: originName },
        { lat: destCoord.lat, lng: destCoord.lng, name: destName },
      ];
    } else {
      const places = [origin, ...via, destination].filter(Boolean);
      // Geocodeer sequentieel om Nominatim rate limit te respecteren
      for (const place of places) {
        const c = await geocode(place);
        coords.push(c);
      }
    }

    if (coords.length < 2) {
      return res.status(400).json({ error: 'Niet genoeg locaties gevonden om een route te berekenen.' });
    }

    // ── Stap 4: OSRM route ───────────────────────────────────────────────────
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`
    );
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok') {
      return res.status(500).json({ error: 'Route kon niet berekend worden via OSRM. Probeer een andere link.' });
    }

    const route = osrmData.routes[0];
    const totalKm = Math.round(route.distance / 1000);
    const totalMin = Math.round(route.duration / 60);
    const routeCoords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    // ── Stap 5: Wisselstops berekenen ────────────────────────────────────────
    const avgSpeedMs = route.distance / route.duration;
    const intervalMeters = mode === 'km'
      ? interval * 1000
      : interval * 3600 * avgSpeedMs;

    function haversine(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function pointAlongRoute(pts, targetM) {
      let traveled = 0;
      for (let i = 1; i < pts.length; i++) {
        const seg = haversine(pts[i-1].lat, pts[i-1].lng, pts[i].lat, pts[i].lng);
        if (traveled + seg >= targetM) {
          const frac = (targetM - traveled) / seg;
          return {
            lat: pts[i-1].lat + frac * (pts[i].lat - pts[i-1].lat),
            lng: pts[i-1].lng + frac * (pts[i].lng - pts[i-1].lng),
          };
        }
        traveled += seg;
      }
      return pts[pts.length - 1];
    }

    const stops = [];
    const drivers = ['Papa', 'Jij'];
    let driverIdx = 0;

    stops.push({
      type: 'start', location: origin,
      lat: coords[0].lat, lng: coords[0].lng,
      km_from_start: 0, minutes_from_start: 0,
      driver: drivers[driverIdx], gasStations: [],
    });

    let meterMark = intervalMeters;
    let stopNum = 1;
    while (meterMark < route.distance - intervalMeters * 0.25) {
      const pt = pointAlongRoute(routeCoords, meterMark);
      driverIdx = (driverIdx + 1) % 2;
      stops.push({
        type: 'switch', location: `Wisselstop ${stopNum}`,
        lat: pt.lat, lng: pt.lng,
        km_from_start: Math.round(meterMark / 1000),
        minutes_from_start: Math.round((meterMark / route.distance) * totalMin),
        driver: drivers[driverIdx], gasStations: [],
      });
      stopNum++;
      meterMark += intervalMeters;
    }

    stops.push({
      type: 'end', location: destination,
      lat: coords[coords.length - 1].lat, lng: coords[coords.length - 1].lng,
      km_from_start: totalKm, minutes_from_start: totalMin,
      driver: drivers[(stops.length) % 2], gasStations: [],
    });

    // ── Stap 6: Tankstations zoeken via Overpass ─────────────────────────────
    async function findGasStations(lat, lng, radiusM = 6000) {
      try {
        const query = `[out:json][timeout:15];(node["amenity"="fuel"](around:${radiusM},${lat},${lng});way["amenity"="fuel"](around:${radiusM},${lat},${lng}););out center 5;`;
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', body: query,
          headers: { 'Content-Type': 'text/plain' },
        });
        const d = await r.json();
        return (d.elements || []).slice(0, 4).map(el => ({
          id: el.id,
          lat: el.lat ?? el.center?.lat,
          lng: el.lon ?? el.center?.lon,
          name: el.tags?.name || el.tags?.brand || el.tags?.operator || 'Tankstation',
          brand: el.tags?.brand || '',
        })).filter(g => g.lat && g.lng);
      } catch { return []; }
    }

    // Verrijk wisselstops — reverse geocode + tankstations
    for (const stop of stops) {
      if (stop.type === 'switch') {
        const [cityName, stations] = await Promise.all([
          reverseGeocode(stop.lat, stop.lng),
          findGasStations(stop.lat, stop.lng),
        ]);
        stop.location = cityName;
        stop.gasStations = stations;
        if (stations.length > 0) {
          stop.suggestedStation = stations[0].name;
          stop.suggestedLat = stations[0].lat;
          stop.suggestedLng = stations[0].lng;
        }
      }
    }

    return res.status(200).json({ origin, destination, total_km: totalKm, total_minutes: totalMin, route: routeCoords, stops });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
