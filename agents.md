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

- **Per line:** plytelė, auto pjovimo storis (from tile aukštis), kiekis with **vnt./paletės**, read-only kaina už vnt.
- **Once per order (form):** baras (pjūvis) and full pakavimas block
- **Client preview/PDF:** no baras; optional **Pakavimas** block shows only affirmative choices (Taip tri-states + selected checkboxes). Omits the block when nothing applies. No yes/no dump.
- **Production preview/PDF:** baras and full packaging detail for the floor (unchanged)
- **Typography:** DM Sans (latin-ext) in on-screen previews and PDFs via `public/fonts/DMSans-*.woff`; Lithuanian letters (ą č ę ė į š ų ū ž) render correctly
- **Layout:** proposal headers use two clear columns; table headers and packaging lines show full words with word-boundary wrapping (e.g. „1 paletė“, „Plytelė“, „Kaina už vnt.“)
- Client PDF rows: plytelė, matmenys, auto storis, kiekis, kaina, suma
- Production PDF: each tile shows auto storis, kiekis, diskas — baras and pakavimas once for the order (no prices)
- **Downloads:** single working pair in page header only (`Atsisiųsti klientui` / `Atsisiųsti gamybai`); filenames `{numeris}_Klientui.pdf` / `{numeris}_Gamyba.pdf`; plain confirmation on success; validation errors shown in header area

Screenshots: `/cursor/stores/self/media/proposal-lines/`, `/cursor/stores/self/media/proposal-downloads/`, `/cursor/stores/self/media/proposal-type/` (`client.png`, `production.png`)

Do not deploy without asking Alanas.
