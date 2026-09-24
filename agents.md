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
- **Once per order:** baras (pjūvis) and full pakavimas block
- Client PDF rows: plytelė, matmenys, auto storis, kiekis, kaina, suma — baras and pakavimas once below the table
- Production PDF: each tile shows auto storis, kiekis, diskas — baras and pakavimas once for the order (no prices)
- Downloads in header and preview panel with plain confirmation message

Screenshots: `/cursor/stores/self/media/proposal-lines/`, `/cursor/stores/self/media/proposal-downloads/`

Do not deploy without asking Alanas.
