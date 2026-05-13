# 🚗 RijWissel v2

Plan wisselstops voor lange ritten — met echte kaart, route en tankstations.

## Wat de app doet

1. Parseer een Google Maps routelink via Claude AI
2. Geocodeert via Nominatim (OpenStreetMap) — gratis
3. Berekent de exacte route via OSRM — gratis
4. Zoekt tankstations langs de route via Overpass API — gratis
5. Toont alles op een interactieve Leaflet kaart

**Enige vereiste API key:** Anthropic (voor stap 1 — route parsen uit de URL)

---

## Deployen op Vercel

### 1. Zet op GitHub

1. Ga naar [github.com](https://github.com) → **New repository** → naam `rijwissel`
2. Upload alle bestanden uit deze zip

### 2. Deploy op Vercel

1. Ga naar [vercel.com](https://vercel.com) → login met GitHub
2. **Add New → Project** → kies `rijwissel` → **Import**
3. Framework: **Next.js** (auto-detected) → klik **Deploy**

### 3. ⚠️ API key instellen

1. Vercel → jouw project → **Settings → Environment Variables**
2. Voeg toe:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-...` (van [console.anthropic.com](https://console.anthropic.com))
3. **Save** → daarna **Deployments → Redeploy**

---

## Lokaal testen

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
