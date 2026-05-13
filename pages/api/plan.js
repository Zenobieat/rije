export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, interval, mode } = req.body;

  if (!url || !interval || !mode) {
    return res.status(400).json({ error: 'Ontbrekende velden' });
  }

  const modeStr = mode === 'km' ? `${interval} km` : `${interval} uur`;
  const modeWord = mode === 'km' ? 'kilometer' : 'tijdsduur';

  const prompt = `Je bent een reisplanner. De gebruiker heeft een Google Maps route link gedeeld:
${url}

De gebruikers willen elke ${modeStr} (per ${modeWord}) wisselen van bestuurder.

Jouw taak:
1. Schat de totale afstand in km en reistijd in minuten van deze route op basis van plaatsnamen in de URL of typische Europese routes.
2. Bereken hoeveel wisselstops er nodig zijn op basis van het interval.
3. Geef voor elke wisselstop een concrete locatie op de route (stad, dorp of regio).
4. Geef de geschatte GPS-coördinaten (benadering) voor elke stop.

Antwoord ALLEEN in dit JSON formaat, geen tekst erbuiten:
{
  "origin": "vertrekpunt naam",
  "destination": "bestemming naam",
  "total_km": 450,
  "total_minutes": 280,
  "stops": [
    {
      "index": 0,
      "type": "start",
      "name": "Vertrekpunt",
      "location": "Stad, Land",
      "km_from_start": 0,
      "minutes_from_start": 0,
      "lat": 51.5,
      "lng": 4.3,
      "driver": "Papa"
    },
    {
      "index": 1,
      "type": "switch",
      "name": "Wisselstop 1",
      "location": "Stad, Land",
      "km_from_start": 200,
      "minutes_from_start": 120,
      "lat": 51.0,
      "lng": 5.0,
      "driver": "Jij"
    },
    {
      "index": 2,
      "type": "end",
      "name": "Bestemming",
      "location": "Stad, Land",
      "km_from_start": 450,
      "minutes_from_start": 280,
      "lat": 50.8,
      "lng": 4.3,
      "driver": "Papa"
    }
  ]
}

Maak afwisselend "Papa" en "Jij" de bestuurder, begin met "Papa". Zorg dat de stops realistisch zijn op de eigenlijke route.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Anthropic API fout: ' + err });
    }

    const data = await response.json();
    const text = data.content.map((i) => i.text || '').join('');

    let clean = text.replace(/```json|```/g, '').trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      clean = clean.slice(jsonStart, jsonEnd + 1);
    }

    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
