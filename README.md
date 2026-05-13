# 🚗 RijWissel App

Plan wisselstops voor lange ritten — per km of per uur.

## Deployen op Vercel (5 minuten)

### Stap 1 — Zet op GitHub
1. Ga naar [github.com](https://github.com) → **New repository**
2. Naam: `rijwissel` → **Create repository**
3. Upload alle bestanden uit deze zip (sleep ze in de GitHub interface)

### Stap 2 — Deploy op Vercel
1. Ga naar [vercel.com](https://vercel.com) → log in met GitHub
2. Klik **Add New → Project**
3. Kies je `rijwissel` repository → klik **Import**
4. Klik **Deploy** (Vercel detecteert Next.js automatisch)

### Stap 3 — API key toevoegen ⚠️ VERPLICHT
Zonder dit werkt de app niet:

1. Ga in Vercel naar je project → **Settings → Environment Variables**
2. Voeg toe:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-...` (jouw Anthropic API key van [console.anthropic.com](https://console.anthropic.com))
3. Klik **Save**
4. Ga naar **Deployments** → klik op de drie puntjes → **Redeploy**

✅ Klaar! Je app is live op `https://rijwissel.vercel.app` (of gelijkaardig).

## Lokaal testen

```bash
npm install
# Maak een .env.local bestand aan:
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Hoe het werkt

1. Deel een Google Maps routelink
2. Kies interval (per km of per uur)
3. De app berekent wisselstops en toont tankstations in de buurt
