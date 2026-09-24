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
- **Atsisiųsti klientui** and **Atsisiųsti gamybai** in the page header and above the preview panel
- After download: plain confirmation `Atsisiųsta: {numeris}_Klientui.pdf` or `{numeris}_Gamyba.pdf`
- Lithuanian calendar pickers; tri-state packaging selects show **Pasirinkite**, **Taip**, **Ne**
- Client document: commercial PDF with prices (unchanged layout)
- Production document: calm one-page shop sheet — order meta, then each tile as an aligned block (no prices)
- **Two downloads** with filenames `{pasiūlymo numeris}_Klientui.pdf` and `{numeris}_Gamyba.pdf`

Screenshots: `/cursor/stores/self/media/proposal-downloads/`

Do not deploy without asking Alanas.
