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

- Redesigned quote UI: warm stone palette, DM Sans + Source Serif 4, charcoal header
- Main document lines show only **plytelė · pjūvis · kiekis · kaina** (catalog price)
- Storis, packaging, specs, comments, L-kampų note in side appendix (editor + PDF)
- Mobile tabs: **Redaguoti** / **Dokumentas** (preview always reachable)
- Local prompt corrections incl. `pakeisk klientą į …` and freeform clauses
- Seeded tile catalog (4 example tiles)
- Dev fix: `allowedDevOrigins` in `next.config.ts`

Screenshots: `/cursor/stores/self/media/proposal-redesign/`

Do not deploy without asking Alanas.
