// pages/api/plan.js
// 1. Claude parseert de Google Maps URL en geeft ons origin/destination/waypoints als plaatsnamen
// 2. Nominatim geocodeert die naar lat/lng
// 3. OSRM geeft de exacte route (polyline + distance + duration)
// 4. We berekenen wisselstops langs die route
// 5. Overpass API zoekt tankstations nabij elke stop

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, interval, mode } = req.body;
  if (!url || !interval || !mode) return res.status(400).json({ error: 'Ontbrekende velden' });

  try {
    // ── Stap 1: Claude parseert de URL ──────────────────────────────────────
    const parsePrompt = `Je krijgt een Google Maps URL. Extraheer de vertrekplaats en bestemming.
URL: ${url}

Kijk naar /maps/dir/ORIGIN/DESTINATION in de URL path.
Decode URL-encoded tekens (%2C = komma, %20 = spatie, etc.).
Als de plaatsen niet duidelijk zijn, schat dan op basis van coördinaten in de URL.

Antwoord ALLEEN in dit JSON formaat, geen uitleg, geen markdown:
{"origin":"Stad, Land","destination":"Stad, Land","via":["Tussenstad, Land"]}

via mag een lege array zijn als er geen tussenstops zijn.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: parsePrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(500).json({ error: `Claude API fout: ${errText}` });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content.map(b => b.text || '').join('').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Claude kon de route niet lezen uit de URL.' });

    const parsed = JSON.parse(jsonMatch[0]);
    const { origin, destination, via = [] } = parsed;

    // ── Stap 2: Geocodeer alle plaatsen via Nominatim ───────────────────────
    async function geocode(place) {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'RijWisselApp/2.0' } }
      );
      const d = await r.json();
      if (!d.length) throw new Error(`Kon "${place}" niet vinden op de kaart.`);
      return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), name: d[0].display_name };
    }

    const places = [origin, ...via, destination];
    const coords = await Promise.all(places.map(geocode));

    // ── Stap 3: OSRM route ──────────────────────────────────────────────────
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
    const osrmRes = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`
    );
    const osrmData = await osrmRes.json();
    if (osrmData.code !== 'Ok') return res.status(500).json({ error: 'Route kon niet berekend worden via OSRM.' });

    const route = osrmData.routes[0];
    const totalKm = Math.round(route.distance / 1000);
    const totalMin = Math.round(route.duration / 60);
    const routeCoords = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    // ── Stap 4: Bereken wisselstops langs de route ──────────────────────────
    const intervalMeters = mode === 'km'
      ? interval * 1000
      : (interval * 60) * (route.distance / route.duration); // omzetten naar meters gebaseerd op gemiddelde snelheid

    function pointAlongRoute(routePoints, targetMeters) {
      let traveled = 0;
      for (let i = 1; i < routePoints.length; i++) {
        const prev = routePoints[i - 1];
        const curr = routePoints[i];
        const segDist = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
        if (traveled + segDist >= targetMeters) {
          const frac = (targetMeters - traveled) / segDist;
          return {
            lat: prev.lat + frac * (curr.lat - prev.lat),
            lng: prev.lng + frac * (curr.lng - prev.lng),
          };
        }
        traveled += segDist;
      }
      return routePoints[routePoints.length - 1];
    }

    function haversine(lat1, lng1, lat2, lng2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const stops = [];
    const drivers = ['Papa', 'Jij'];
    let driverIdx = 0;

    // Start
    stops.push({
      type: 'start',
      location: origin,
      lat: coords[0].lat,
      lng: coords[0].lng,
      km_from_start: 0,
      minutes_from_start: 0,
      driver: drivers[driverIdx],
    });

    // Wisselstops
    let stopNum = 1;
    let meterMark = intervalMeters;
    while (meterMark < route.distance - intervalMeters * 0.3) {
      const pt = pointAlongRoute(routeCoords, meterMark);
      driverIdx = (driverIdx + 1) % 2;
      stops.push({
        type: 'switch',
        location: `Wisselstop ${stopNum}`,
        lat: pt.lat,
        lng: pt.lng,
        km_from_start: Math.round(meterMark / 1000),
        minutes_from_start: Math.round((meterMark / route.distance) * totalMin),
        driver: drivers[driverIdx],
      });
      stopNum++;
      meterMark += intervalMeters;
    }

    // Einde
    driverIdx = stops.length % 2 === 0 ? 0 : 1;
    stops.push({
      type: 'end',
      location: destination,
      lat: coords[coords.length - 1].lat,
      lng: coords[coords.length - 1].lng,
      km_from_start: totalKm,
      minutes_from_start: totalMin,
      driver: drivers[driverIdx],
    });

    // ── Stap 5: Reverse geocode wisselstops + zoek tankstations via Overpass ─
    async function reverseGeocode(lat, lng) {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'User-Agent': 'RijWisselApp/2.0' } }
        );
        const d = await r.json();
        const addr = d.address || {};
        return addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Onbekend';
      } catch { return 'Onbekend'; }
    }

    async function findGasStations(lat, lng, radiusM = 5000) {
      try {
        const query = `[out:json][timeout:10];node["amenity"="fuel"](around:${radiusM},${lat},${lng});out 3;`;
        const r = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: query,
          headers: { 'Content-Type': 'text/plain' },
        });
        const d = await r.json();
        return (d.elements || []).slice(0, 3).map(el => ({
          id: el.id,
          lat: el.lat,
          lng: el.lon,
          name: el.tags?.name || el.tags?.brand || 'Tankstation',
          brand: el.tags?.brand || '',
        }));
      } catch { return []; }
    }

    // Verrijk switch-stops
    for (const stop of stops) {
      if (stop.type === 'switch') {
        const cityName = await reverseGeocode(stop.lat, stop.lng);
        stop.location = cityName;
        stop.gasStations = await findGasStations(stop.lat, stop.lng);
        // Snap naar dichtstbijzijnde tankstation als die bestaat
        if (stop.gasStations.length > 0) {
          stop.snapLat = stop.gasStations[0].lat;
          stop.snapLng = stop.gasStations[0].lng;
          stop.suggestedStation = stop.gasStations[0].name;
        }
      } else {
        stop.gasStations = [];
      }
    }

    return res.status(200).json({
      origin,
      destination,
      total_km: totalKm,
      total_minutes: totalMin,
      route: routeCoords,
      stops,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
