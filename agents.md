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

- Lithuanian proposal creator with live A4 preview and PDF download
- Seeded tile catalog (4 example tiles from screenshots)
- Local prompt corrections (commands + freeform clauses), no cloud LLM
- Fixed L kampų pjovimas note on every proposal
- Verified: form → preview grid → prompt clause → PDF download (Playwright on prod build)

Do not deploy without asking Alanas.
