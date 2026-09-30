# Deisida

Tile manufacturing ops platform — proposals, production queue, and shop-floor screens. Alanas is the product owner.

## Run locally

```bash
npm install
npm run db:import   # first time: import Bubble archive into SQLite
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
| `/pasiulymai/naujas` | admin, pardavimai | Create proposal (catalog from Bricks import) |
| `/pasiulymai/[id]` | admin, pardavimai | Edit / save / confirm proposal |
| `/eile` | admin, pardavimai | Production queue (scheduleQueue planner) |
| `/cechas` | admin, cechas | Next job, pallet log, finish |
| `/admin/konvejeriai` | admin | Machine assignments + KONV/KNEW settings |

## API stubs (for agents / shop UI)

- `GET /api/jobs/queue` — scheduled queue via `scheduleQueue(machines, jobs)`
- `GET /api/jobs/next` — next job for logged-in cechas user’s assigned machine
- `POST /api/jobs/:id/pallet` — log +1 paletė
- `POST /api/jobs/:id/finish` — complete job; &lt;90 % → alert
- `GET/POST /api/admin/assignments` — people ↔ machine
- `PATCH /api/admin/machines/:id` — `dailyRate`, `rotationHours`, `currentWidthMm`

## Data

- SQLite: `data/deisida.db` (Drizzle schema in `src/lib/db/schema.ts`)
- Import: `scripts/import-archive.ts` from Bubble archive zip
- Machines: **KONV** 240/day, **KNEW** 720/day (placeholder rates)
- Discs table empty (Alanas adds manually later)

## Proposal slice (unchanged behaviour)

- Per line: plytelė, auto pjovimo storis, kiekis vnt./paletės, kaina už vnt.
- PDF downloads: `{numeris}_Klientui.pdf` / `{numeris}_Gamyba.pdf`
- Confirm proposal → one job per tile line

Do not deploy without asking Alanas.
