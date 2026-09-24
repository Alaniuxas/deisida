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

- UI aligned with **deisida.lt**: DM Sans, `#c14546` accent, `#484849` / `#282829` text, `#F3F3F0` surfaces — no cream/serif landing look
- **Two PDFs** from one proposal:
  - **Pasiūlymo PDF** (klientui): plytelė, baras, matmenys, pjovimo storis, kiekis vnt. (pal. pagalbinė info), vnt. kaina, suma, PVM 21 %; komentarai atskirame bloke
  - **Gamybos PDF** (cechui): operacinė info — diskas, pakavimas, likučiai, gamybos komentarai; be kainų
- Peržiūra: **Klientui** / **Gamyba** (desktop tabs + mobile)
- Local prompt corrections incl. `pakeisk klientą į …` and freeform clauses
- Seeded tile catalog (4 example tiles)
- Dev fix: `allowedDevOrigins` in `next.config.ts`

Screenshots: `/cursor/stores/self/media/proposal-brand/`

Do not deploy without asking Alanas.
