# Deisida

Tile manufacturing ops platform — proposals, production queue, and shop-floor screens. Alanas is the product owner.

## Run locally

```bash
npm install
npm run db:import   # first time: import Bubble archive into SQLite
npm run db:seed-rotation   # minimal demo: users, machines, norms, rotation period
npm run db:cutting-norms   # Excel NK1/NK2/S1… cutting speeds (also `npm run db:norms`)
npm run db:seed-queue      # ~30 archive orders into the queue
npm run queue:plan         # generate Friday-style unlimited plan + lock next week
npm run dev
```

Open http://127.0.0.1:43127 — Next.js dev server binds `0.0.0.0:43127` (tmux `deisida-dev`).

Do not deploy without asking Alanas.

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

## Routes

| Path | Role | Purpose |
|------|------|---------|
| `/prisijungti` | public | Credential login |
| `/pasiulymai` | admin, pardavimai | Proposal list |
| `/plyteliu-baras` | admin, pardavimai | Tile catalog |
| `/pasiulymai/naujas` | admin, pardavimai | Create proposal |
| `/pasiulymai/[id]` | admin, pardavimai | Edit / save / confirm proposal |
| `/eile` | admin, pardavimai, cechas | Queue tabs = Excel shop codes (NK1, NK2, S1, S2, S4, SK1); only locked week |
| `/cechas` | admin, cechas | Next job, pallet log, finish |
| `/admin/konvejeriai` | admin | Rotations, assignments, Excel vnt./d. |

## Queue (P1/P2/P3)

- `jobs.storisMm` is cut-tile thickness (proposal line / `default_storis_mm`), **not** `tiles.heightMm`.
- Engine (`src/lib/queue/schedule.ts`): P1 same width+storis clustered; P2 same width; P3 deadline. Within a machine, P3 jobs sort by **nearest deadline first** (width proximity only breaks ties). Empty machine gets the **farthest** width (≥20 mm), so 101+102 stay with a 100 mm machine.
- **Work hours:** planned start/end only **Mon–Fri 08:00–17:00 Europe/Vilnius** (`src/lib/queue/work-hours.ts`). Overflow past 17:00 continues next workday at 08:00.
- Friday **00:00 Europe/Vilnius** (`vercel.json` cron `0 0 * * 5` → `/api/cron/queue-plan`). UI shows next Mon–Sun. PATCH/POST `/api/jobs/queue/override` → **403** outside that week.
- Claude Sonnet 4.6 via direct Anthropic API (`ANTHROPIC_API_KEY` in `.env.local`, model `claude-sonnet-4-6`): audit comments only on `/eile` when connected. AI block hidden until `aiSource=claude`; rerun `npm run queue:plan` after adding the key.
- ICE confirm: `POST /api/proposals/submit` still 303 `/eile`.

## API

- `GET /api/jobs/queue` — scheduled + week-filtered lanes
- `POST /api/jobs/queue/override` — move job in locked week (reason required)
- `GET /api/cron/queue-plan` — planner (Bearer `CRON_SECRET` if set)
- `GET /api/jobs/next` — next job for cechas machine
- `POST /api/jobs/:id/pallet` / `finish`
- `GET/POST /api/admin/assignments`, rotations, `PATCH /api/admin/machines/:id`

## Data

- SQLite: `data/deisida.db`
- Excel (gitignored copy): `data/2026.06.30_Deisida_normos_FINAL.xlsx` — cutting sheets **PLY1/PLY2**. Leftover sheets: SVIES, PLOK, PLYK, Kodavimas, Eur.Val Tikslai. Seed JSON: `src/lib/queue/cutting-norms.seed.json`
- Machines: shop codes NK1/NK2/S1/S2/S4/SK1 (legacy ids KNEW→NK1, KONV→SK1)
- Proposal form: editable pjovimo storis per line; confirm → `jobs.storisMm`
