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

- UI aligned with **deisida.lt**: DM Sans, `#c14546` accent, `#484849` / `#282829` text, `#F3F3F0` surfaces
- Plain Lithuanian copy — no developer/technical phrases in the UI
- **Ką pakeisti?** box: short title, one example, **Pritaikyti** button (client phrase + free-text comment behavior unchanged)
- **Kiekis** with unit choice: **vnt.** or **paletės**; shown as entered in editor and both documents; pricing always per piece (paletės converted via katalogo `quantityPerPallet`)
- **Two downloads**: **Klientui** (prices, VAT 21 %) and **Gamyba** (shop-floor info, no prices)
- Peržiūra: **Klientui** / **Gamyba** tabs (desktop + mobile)
- Seeded tile catalog (4 example tiles)

Screenshots: `/cursor/stores/self/media/proposal-plain/`

Do not deploy without asking Alanas.
