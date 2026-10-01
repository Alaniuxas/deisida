# Deisida

Tile manufacturing ops platform — proposals, production queue, and shop-floor screens. Alanas is the product owner.

## Run locally

```bash
npm install
npm run db:import   # first time: import Bubble archive into SQLite
npm run db:seed-rotation   # minimal demo: users, machines, norms, rotation period
npm run db:norms    # import darbo normos from CSV
npm run dev
```

Open http://127.0.0.1:43127 — Next.js dev server binds `0.0.0.0:43127`.

## Login (seeded from archive)

Starter password for all imported users: **`deisida`**

| Role | Email | Notes |
|------|-------|-------|
| admin | danas@deisida.lt | Administratorius |
| admin | andrius@deisida.lt | Benas |
| admin | vaidas@deisida.lt | |
| admin | palmyra@digroup.lt | |
| pardavimai | pardavimai@deisida.lt | Rinaldas |
| cechas | kristina@deisida.lt | Darbuotojas |
| cechas | daiva@deisida.lt | |
| cechas | *(+ 30 more @deisida.lt / test.lt)* | Darbuotojas |

Full user list: run `npm run db:import` and inspect `data/deisida.db`, or query `users` table.

## Routes

| Path | Role | Purpose |
|------|------|---------|
| `/prisijungti` | public | Credential login |
| `/pasiulymai` | admin, pardavimai | Proposal list |
| `/plyteliu-baras` | admin, pardavimai | Tile catalog (~296 from Bricks import) |
| `/pasiulymai/naujas` | admin, pardavimai | Create proposal (catalog from Bricks import) |
| `/pasiulymai/[id]` | admin, pardavimai | Edit / save / confirm proposal |
| `/eile` | admin, pardavimai, cechas | Production queue by conveyor lane (KONV/KNEW) |
| `/cechas` | admin, cechas | Next job, pallet log, finish |
| `/admin/konvejeriai` | admin | Rotacijos periodai, priskyrimai, darbo normos, KONV/KNEW nustatymai |

## API stubs (for agents / shop UI)

- `GET /api/jobs/queue` — scheduled queue via `scheduleQueue(machines, jobs)`
- `GET /api/jobs/next` — next job for logged-in cechas user’s assigned machine
- `POST /api/jobs/:id/pallet` — log +1 paletė
- `POST /api/jobs/:id/finish` — complete job; &lt;90 % → alert
- `GET/POST /api/admin/assignments` — people ↔ machine (fallback be aktyvaus periodo)
- `GET/POST/PATCH /api/admin/rotations` — rotacijos periodai, perkėlimas su priežastimi
- `PATCH /api/admin/machines/:id` — `dailyRate`, `rotationHours`, `currentWidthMm`, `shopCode`

## Data

- SQLite: `data/deisida.db` (Drizzle schema in `src/lib/db/schema.ts`)
- Import: `scripts/import-archive.ts` from Bubble archive zip
- Machines: **KONV** = Senas konvejeris (`id-code` **SK1** → `shop_code`, unique in machines CSV). **KNEW** = Naujas konvejeris; `id-code` is **NK1 and NK2** (same `identifier` KNEW) so `shop_code` is left empty — do not invent sk1/sk2. Pal./d. from machines CSV: KONV `goal_daily_rate_per_employee` 240, KNEW `goal_daily_rate` 720.
- Eilės vnt./d.: tik KONV iš `Darbo_normos` eilutės „Plytų pjovimas plytelėmis – konvejeriu“ (2700). „Staklytėm“ 1700 **nėra** KNEW (CSV mašinos `STAK` / Staklytės). KNEW vnt./d. nerodomas — Bubble `Normas` turi daug KNEW* eilučių su skirtingais min kiekiais.
- `/eile`: lipnūs **nuorodos**-tabai `?konvejeris=KONV|KNEW` (veikia be JS). Tabo antraštė — `machines.title` (Senas/Naujas konvejeris), po juo kodas + mm + pal./d. · vnt./d. jei yra. Numatytasis — pirmas konvejeris su darbais, kitaip KONV.
- Demo eilė: `npm run db:seed-queue` importuoja ~30 jau patvirtintų Bubble pasiūlymų (esami nerūšiuojami).
- Konvejerio rotacijos: periodai (`rotation_periods`), priskyrimai, istorija su priežastimi; demo: `npm run db:seed-rotation`
- Cechas naudoja aktyvų rotacijos priskyrimą šiandienai; fallback — `machine_assignments`
- Proposal form includes **adresas** (object address), persisted on `proposals.address`
- `/eile`, `/cechas`, `/admin/konvejeriai` load data server-side (no client fetch/HMR dependency behind Cloudflare tunnel)
- Gamybos eilė: `scheduleQueue` / `pickMachine` naudoja **DB** `machines.current_width_mm` (ne plotį iš eilės). Pirmiausia visi darbai, kurių plotis = konvejerio W, eina į tą konvejerį (globaliai, ne pagal užsakymą). Likę — į konvejerį su mažiausiu `|currentWidth − jobWidth|`, lygios → ankstesnis laisvumas. `splitAcrossMachines` nebėra: tas pats užsakymas gali likti viename konvejeryje, jei arčiau. Konvejeryje: `orderJobsByWidthCorrection` (nearest-neighbor nuo dabartinio pločio).
- `/eile`: viršuje lipnūs KONV/KNEW tabai su tikrais pavadinimais; matomas tik pasirinktas konvejeris. Antraštė: „Kitas darbas pagal konvejerį ir plotį.“
- Admin ir `/eile` naudoja tą patį efektyvų konvejerio plotį (`getEffectiveMachineWidth`: DB → aktyvus darbas → eilėje).
- Pjūviai (baras): native `<select>` su „Nežinau“.
- `Pridėti eilutę`: GET `formMethod` ant to paties formos (RT4). **Patvirtinti** / juodraštis — native `POST /api/proposals/submit` (303 `/eile`), veikia be JS.
- Cechas „Baigti darbą“: native `<select name="reasonPreset">` + papildomas tekstas; privaloma, jei neužbaigtas planas.
- Login `/prisijungti` uses native form POST (303 relative redirect; works without JS/HMR)
- `/cechas` write actions (paletė, baigti, keisti įrenginį) use native `<form method="post">` + 303 redirect
- Patvirtinti → one gamybos darbas per plytelių eilutė (E2: 2 tipai → 2 darbai)
- Discs table empty (Alanas adds manually later)

## Proposal slice (unchanged behaviour)

- Per line: plytelė, auto pjovimo storis, kiekis vnt./paletės, kaina už vnt.
- PDF downloads: `{numeris}_Klientui.pdf` / `{numeris}_Gamyba.pdf`
- Confirm proposal → one job per tile line

Do not deploy without asking Alanas.
