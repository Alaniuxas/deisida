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

- **Per line:** plytelė, auto pjovimo storis (from tile aukštis), kiekis with **vnt./paletės**, read-only **Kaina už vnt.**
- **Pricing:** catalog `Kaina` is **per brick (vnt.)**. Display stays **8,00 €** for Kolumba regardless of vnt./paletės. **vnt.** line total = kiekis × katalogo kaina (100 vnt. → 800,00 €). **paletės** line total = kiekis × plytų kiekis paletėje × katalogo kaina (1 paletė Kolumba 240 → 1 920,00 €). Line totals, VAT, and sum rounded to cents.
- **Once per order (form):** baras (pjūvis) and full pakavimas block
- **Client preview/PDF:** no baras; optional **Pakavimas** block shows only affirmative choices. Price column **Kaina už vnt.** with catalog price; totals include 21 % PVM.
- **Production preview/PDF:** baras and full packaging detail for the floor (no prices)
- **Typography:** DM Sans (latin-ext) in on-screen previews and PDFs via `public/fonts/DMSans-*.woff`
- **Layout:** proposal headers use two clear columns; table headers and packaging lines show full words with word-boundary wrapping
- **Downloads:** single working pair in page header only; filenames `{numeris}_Klientui.pdf` / `{numeris}_Gamyba.pdf`

Screenshots: `/cursor/stores/self/media/proposal-lines/`, `/cursor/stores/self/media/proposal-downloads/`, `/cursor/stores/self/media/proposal-type/`, `/cursor/stores/self/media/proposal-price/` (`restored-vnt.png`)

Do not deploy without asking Alanas.
