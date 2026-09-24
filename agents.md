# Deisida

Tile manufacturing ops, currently in Bubble at app.deisida.lt. Alanas is the product owner.

Current slice: convenient proposal creation (storis, packaging choices, L-corner cutting note). Production-queue scheduling on the conveyor comes after the proposal slice.

## Run locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43127 — Next.js dev server binds `0.0.0.0:43127`.

## App status (2026-09-24)

- Full-screen working layout: **Pasiūlymo duomenys**, **Plytelės**, **Gamyba ir pakavimas**, **Peržiūra** (Klientui / Gamyba)
- Lithuanian calendar pickers for **Pasiūlymo galiojimo pabaiga** and **Paslaugos atlikimo terminas** (Monday week start, LT month/weekday names, dropdown month/year)
- Chosen dates shown as e.g. `2026 m. spalio 24 d.`
- Next.js dev indicator disabled (`devIndicators: false`); runtime errors fixed (broken Baras select JSX, controlled Select values)
- Packaging tri-state selects show only **Pasirinkite**, **Taip**, **Ne** — no English yes/no/unset in UI, previews, or PDFs
- Uniform form rows (`FormField` grid) with aligned labels, inputs, selects, and checkboxes
- **vnt.** / **paletės** quantity choice with piece-based pricing
- **Two downloads**: **Klientui** and **Gamyba**
- Seeded tile catalog (4 example tiles)

Audit screenshots: `/cursor/stores/self/media/proposal-audit/`

Do not deploy without asking Alanas.
