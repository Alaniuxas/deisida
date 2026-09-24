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
- UI aligned with **deisida.lt** brand colors and DM Sans
- Plain Lithuanian only — no correction/prompt box
- Uniform form rows: labels + `h-10` controls on one baseline; kiekis with **vnt.** / **paletės** beside a full-width input
- Packaging dropdowns show **Pasirinkite** when empty; options **Taip** / **Ne**
- **Two downloads**: **Klientui** (prices, VAT 21 %) and **Gamyba** (shop-floor info)
- Piece-based pricing with paletės conversion via catalog `quantityPerPallet`
- Seeded tile catalog (4 example tiles)

Screenshots: `/cursor/stores/self/media/proposal-fullscreen/`

Do not deploy without asking Alanas.
