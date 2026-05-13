# 🚗 RijWissel v2 — 100% Gratis

Plan wisselstops voor lange ritten. Geen betaalde APIs, geen API key nodig.

## Gebruikte services (allemaal gratis)
- **Nominatim** — OpenStreetMap geocoding
- **OSRM** — Open Source Routing Machine (exacte routes)
- **Overpass API** — tankstations uit OpenStreetMap
- **Leaflet** — interactieve kaart

## Deployen op Vercel (gratis, ~3 minuten)

### 1. Zet op GitHub
1. Ga naar github.com → New repository → naam `rijwissel`
2. Sleep alle bestanden uit deze zip naar de GitHub interface
3. Klik Commit changes

### 2. Deploy op Vercel
1. Ga naar vercel.com → login met GitHub
2. Add New → Project → kies `rijwissel` → Import
3. Framework: Next.js (automatisch gedetecteerd)
4. Klik Deploy — geen environment variables nodig!

Je app is live op https://rijwissel.vercel.app

## Lokaal testen
npm install
npm run dev

Open http://localhost:3000
