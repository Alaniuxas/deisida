<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Vietinis testavimas

### Paleidimas

```bash
npm install
npm run dev
```

Atidarykite [http://127.0.0.1:43127/prisijungti](http://127.0.0.1:43127/prisijungti) (`npm run dev` — hostname `127.0.0.1`, ne `0.0.0.0`).

### Prisijungimai

Visi vartotojai (ir archyvo, ir demo) naudoja slaptažodį: **`deisida`**

Admin: `danas@deisida.lt` (arba bet kuris archyvo vartotojas su role `admin`).

### DB iš archyvo (pilnas setup)

1. Išarchyvuokite `Archive.zip` į `data/archive-import/` (25 CSV failų).
2. Nukopijuokite pjovimo normas: `data/2026.06.30_Deisida_normos_FINAL.xlsx`.
3. **Sustabdykite dev serverį** prieš importą (SQLite lock).
4. Paleiskite:

```bash
$env:CUTTING_NORMS_XLSX="data/2026.06.30_Deisida_normos_FINAL.xlsx"
npm run db:import          # 40 vartotojų, 297 plytelės, 275 klientai, pjovimo normos
npm run db:seed-queue      # ~56 archyvo pasiūlymų su tikrais pločiais + datos į dabartinį langą
npm run db:seed-stress     # ~45 STRESS-* kopijos iš tikrų DEI-* DB (tie patys plotiai/kiekiai, terminai pr–pn); `--force` išvalo
npm run db:seed-queue -- --force   # perimportuoti (išvalo senus planus + pasiūlymus)
npx tsx scripts/seed-queue-from-archive.ts --force   # jei npm --force neveikia
npm run queue:plan         # savaitės planas + Claude AI auditas (tik penktadienio vakare / cron; pirmadienį be --as-of planuoja kitą savaitę)
npx tsx scripts/run-queue-plan.ts --as-of=2026-10-02T20:00:00+03:00 # penktadienio vakaro simuliacija
npx tsx scripts/reset-queue-plans.ts   # išvalyti senus planus (jei UI rodo tuščias stakles)
npx tsx scripts/run-queue-plan.ts --as-of=2026-10-02T20:00:00+03:00   # penktadienio vakaro simuliacija
npx next dev --port 3006
```

Jei reikia tik demo vartotojų (be archyvo):

```bash
npm run db:seed-rotation
```

**Eilės demo duomenys** (`db:seed-queue`): ima **tikrus archyvo plotius** (10–200 mm, ne tik 10–51 mm juostą). 100 mm neleidžiama užgožti imties (max 8 užsakymai tam pačiam pločiui), todėl eilėje lieka 65 / 95 / 102 / 115 / 120 ir kt. Kiekiai — `normalizeArchivePieces` be 800–2500 „lygintuvo“ (tik lubos 8000 vnt.). Terminai **iš archyvo**, perkelti į dabartinį užrakintos savaitės langą išlaikant tvarką ir tas pačias dienas kartu (ne dirbtiniai spal. 15–25 laipteliai). Seed pats nustato staklių magnetus **išskirstytais** imties pločiais (≥12 mm tarpas), ne 10/14/50/51 krūva. **Stress testas** (`db:seed-stress -- --force --as-of=2026-10-02T20:00:00+03:00`): kopijuoja tikrus `archive-queue-sample` pasiūlymus iš DB → `STRESS-{savaitė}-{DEI…}`; **plotiai ir kiekiai nepakeisti**, tik terminai pr–pn; **magnetų nekeičia**. Po `--force` → `queue:plan`. Patikros: `audit-changeovers.ts`, `audit-lane-widths.ts`, `audit-deadlines.ts`.

`db:seed-widths` dabar irgi ima **išskirstytus** plotius (ne top-6 visus ~100 mm). Po `db:seed-queue` paprastai nereikia — magnetai jau nustatyti. Jei vis tiek paleidžiate, po to vėl `queue:plan`.

Testavimui plotių permaišymas tarp staklių:

```bash
npm run db:seed-widths
npm run queue:plan
npm run db:seed-widths -- --seed=42
```

**Perskirstyti darbus** perkelia tik darbus, kurių plotis **±5 mm** sutampa su admin nustatytu staklių plotiu. Last-resort darbai (6–15 mm nuo magneto, su geltonu reguliavimu) šiuo mygtuku **neperkeliami**. Gavėjas priimamas tik jei iki penktadienio 17:00 lieka **≥4 produktyvios val.** (tas pats slenkstis kaip idle backfill) — pilna S4/NK2 negauna krūvos. **Po suplanuotos savaitės** lieka darbai, kurių **planuojama pradžia** yra po sekmadienio — dažniausiai dėl staklės apkrovos. Darbai **be `queue_plan_items` eilutės** rodomi `/eile` bloke **Nepriskirti darbai** (ne tyla). Archyvo terminai dabar realiai išsibarstę — dalis darbų turi terminą anksčiau nei planuojama pradžia (`audit-deadlines.ts`); tai ne seed klaida.

**Konvejerio plotis (admin magnetas):** tik **admin** (`danas@deisida.lt`). Greičiausias kelias: `/eile` → pasirinkti staklę (NK1, S2…) → viršuje matomas žalias blokas **Dabartinis konvejerio plotis (mm)** + **Išsaugoti plotį**. Alternatyva: **Konvejeriai** → `/admin/konvejeriai` → skirtukas **Staklių plotis (mm)**. **Norma pjovimui** = `piecesPerDay` iš Excel (pvz. S1 **3500 vnt./d.**). **Savaitinė rotacija** — skirtukas **Rotacijos**: pasirinktas laikotarpis (pr–pn), darbuotojai priskiriami konvejeriui (keli vienai staklei, multi-select + **Priskirti (N)**); per periodą dirba tik ten. API: `PATCH /api/admin/rotations` (periodo datos / perkėlimas).

### Claude AI (/eile puslapis)

Nukopijuokite `.env.example` → `.env.local` ir įdėkite `ANTHROPIC_API_KEY`. Be rakto AI auditas veiks mock režimu. Modelis: `ANTHROPIC_MODEL` (numatytas **`claude-sonnet-5`** — `claude-3-5-sonnet` nebepalaikomas). Kviečiama tik `auditQueuePlan` (`src/lib/queue/ai-audit.ts`) po `npm run queue:plan`.

AI pastabos **nepritaiko plano automatiškai**. `/eile` puslapyje (admin/pardavimai):
- **Perskirstyti darbus** — perkelia darbus tarp staklių pagal **admin nustatytą staklių plotį** (±5 mm), ir tik jei gavėjas turi **≥4 h** iki pn 17:00. Trukmės visur iš `durationHoursFromPlan` (produktyvios 08–12/13–17, ne `end−start`). Mygtukas **disabled**, jei `analyzeRebalanceState` neranda galiojančių perkėlimų. AI pastabos filtruojamos tomis pačiomis taisyklėmis (`alignAiCommentsWithRebalance`).
- **Laiko balansas** — `temporal-balance.ts` perkelia darbus iš vėlyvos dienos į ankstesnę (±5 mm); geltonas blokas rodo `queue_overrides.reason`.
- **Staklės gedimas** — admin forma **prie kiekvienos staklės** `/eile` (skirtukas NK1/S2/…): **Gedimas nuo** + **Numatomas sutvarkymas iki (±)**; atidarius — šiandien + dabartinis laikas (24 val.). Prieš išsaugant — `POST /api/admin/machine-downtimes/preview` simuliuoja perskirstymą; po pločio perkėlimo — `optimizeDowntimeJobPlacements` + `repairLateAssignments` (ta pati `suggest-move` / `buildBestLaneSlot` logika kaip rankiniam perkėlimui: staklė + įterpimo vieta pagal terminą). Modalas rodomas tik jei **po automatinio sutvarkymo** vis dar lieka **naujai** vėluojantys (`plannedEnd > terminas`). Kiekvienam vėluojančiam užsakymui — **checkbox** „priimti vėlavimą“ (numatytai pažymėta); **nežymėti** neperkeliami automatiškai (`excludeJobIds` → lieka ant gedimo staklės, tvarkyti rankiniu perkėlimu). Po žymėjimo `POST /api/admin/machine-downtimes` su `excludeJobIds` / `acceptedLateJobIds`; `rescheduleForMachineDowntime` perkelia tik **laukiančius** darbus, kurių **planuojama pradžia < sutvarkymo pabaiga** (išskyrus exclude); pranešime santrauka (`NK1→NK2: 4 (14 mm, 10 mm); …`), patvirtintas vėlavimas ir kiek palikta rankiniam. ±5 → ≤15 → artimiausias magnetas. Gedimo metu staklė **negauna** backfill/temporal darbų. **Atšaukus gedimą** — `replanActiveQueueRun` (pilnas plano atkūrimas). Veikia su patvirtintu planu (`ready`).
- **Patvirtinti be pakeitimų** — tik užrakina planą, skaičiai lieka tie patys
- **Atverti planą redagavimui** — po klaidingo patvirtinimo

Kiekvieno darbo kortelėje rodomas **Gamybos laikas** blokas: **Pradžia**, **Pabaiga**, **Pjovimas** (trukmė + kiekis vnt.), **Viso (su reguliavimu)**. Detalės (našumas, paletės, rankinis perkėlimas) — „Detalės ir rankinis perkėlimas“.

Eilės tvarka ant staklių: pirmiau pjaunamas plotis, artimiausias dabartiniam (P1/P2), po to **mažiausias mm žingsnis** (ne didelis šuolis NK1→70), terminas tik lygiems žingsniams. Geltonas blokas = operatoriaus reguliavimas prieš kitą pločio grupę.

**Planavimo logika (santrauka):** (1) Penktadienį užrakinta **kita** savaitė, startas pirmadienį 08:00. (2) Priskyrimo **prioritetai** (ne lubos): ±5 mm be reguliavimo → ≤15 mm su 30 min → bet koks plotis artimiausiam magnetui (`pickNearestMachineByStep`). 81/100/200 mm **nedingsta**. (3) **Apkrova pirmiau nei exact match** ±5 juostoje; `estimateJobHours` eina sekviniu setup kaip eilė (reguliavimas tik jei kitas plotis >±5 mm nuo einamojo). (4) `rebalanceMachineLoads` / **Perskirstyti** vis tiek tik ±5 mm **ir** gavėjas ≥4 h iki pn. (5) Eilėje P1/P2/P3; reguliavimas 30 min jei plotis **>±5 mm nuo einamojo setup**. (6) Idle backfill: skubus terminas (≤ savaitės pabaigos) pirmiau, tada mažiausias mm žingsnis; virš 15 mm — bet kuri staklė. (7) **Rankinis perkėlimas visada laimi** — bet koks mm, darbas keliamas į priekį (po `in_progress`); `suggest-move` priežastyje naudoja `CHANGEOVER_ASSIGN_MAX_GAP_MM` (≤15 / >15). (8) `rescheduleRemainingWeek` (paletės / užbaigimas) atnaujina laikus, neperkelia tarp staklių. `rescheduleForMachineDowntime` (gedimas) — pilnas perskirstymas + laikai.

Staklių antraštėje **Sureguliuota X mm** = admin nustatymas. **Eilėje** geltonas blokas — tik kai darbo plotis **>±5 mm nuo einamojo setup** (`nextSetupWidthAfterJob` eilėje). Segmentai grupuojami pagal darbo plotį; 60→55 mm rodomas kaip 65→55, ne 60→55.

**Greitas testinis pasiūlymas:** `npm run db:seed-quick-proposal` (arba `--width=55 --pieces=1200`) → patvirtintas `QUICK-*` pasiūlymas; po to `queue:plan`.

**Reguliavimo (geltonų blokų) testas:** `npm run db:seed-changeover -- --force --as-of=2026-10-02T20:00:00+03:00` → 5 `COV-*` pasiūlymai (55/65/70/81/90 mm, po 550 vnt., terminas pirmadienis). `--force` išvalo senus `COV-*`, `STRESS-*` ir planą; **staklių magnetų nekeičia** (lieka admin nustatymai). Po to `queue:plan` su tuo pačiu `--as-of`. Patikra: `npx tsx scripts/audit-changeovers.ts`.

**Pasiūlymai (`/pasiulymai`):** pirmi 20 įrašų SSR; scroll įkėlimas po vieną puslapį (`GET /api/proposals?limit&offset`, be auto-krovimo visų); filtrai pagal numerį/klientą/objektą/būseną; būsena keičiama lentelėje (`PATCH /api/proposals/[id]/status`); numeris — raudonas žymėjimas; trynimas su patvirtinimu. Redaktoriuje: **Išsaugoti juodraštį**, **Atsisiųsti gamybai/klientui**, **Patvirtinti**.

**Našumas (`/eile`, konvejeriai):** `/eile` ir konvejeriai — lengvas RSC shell + duomenys per API (`/api/jobs/queue`, `/api/admin/assignments`). Navigacijoje `prefetch={false}` sunkiems keliams (`/eile`, `/pasiulymai`, `/admin/konvejeriai`). **`suggest-move`** — tik po vartotojo veiksmo: `/eile` kortelėje `LazyQueueMoveDetails` (forma mountinama tik atidarius „Detalės ir rankinis perkėlimas“); pasiūlymo **Gamybos eilė** — `ProposalEnqueuePanel` krauna `/enqueue` ir `QueueMoveForm` tik išskleidus accordion. Plano kontekstas — `loadSuggestMoveContext` su `React.cache()` (viena DB užklausa per HTTP request). Gedimo **preview** — `previewLight` (be temporal balance / idle backfill / `optimizeDowntimeJobPlacements` / pilno `rescheduleAssignmentLanes`; tik gedimo staklė + gavėjai per `rebuildAssignmentLaneTimes`; be `palletLogs`; viena DB užklausa su `preload`). Plano rodymui naudoti `queue_plan_items` (tik aktyvūs darbai, ne visi 900+ įrašai) — **ne** pilnas `scheduleQueue` jei planas yra; `buildSchedule` **nekviečia** `ensureShopMachines` (tik import/plan). Gedimo pranešimai — `sessionStorage` + `history.replaceState` (ne ilgas `?notice=` URL). Pasiūlymų sąrašas — SSR 20 įrašų, be papildomo `fetch` su tuščiais filtrais.

**Pasiūlymo redaktorius:** vienas vertikalus scroll (forma + peržiūra); peržiūra dešinėje `sticky`. Mygtukas **Per vidurį** — modalinė peržiūra centre. **Gamybos eilė** sutraukta rodo santrauką; pilni duomenys ir `suggest-move` — tik išskleidus accordion (ne fone atidarius redaktorių).

**Naršyklės skirtukas:** pavadinimas „Deisida - gamybos sistema“; favicon — oficialus ženklas iš `deisida.lt` (`public/deisida-mark.svg`, `public/deisida-logo.svg`).

**Rankinis perkėlimas:** kortelėje „Iki kada supjauti“ — visos staklės tinkamos. Rekomendacija simuliuoja **visas** įterpimo vietas pagal planuotą eilę: **projektuojamas setup mm** prieš pjovimą (ne tik admin magnetas — po kelių dienų setup gali būti kitoks). Jei terminas **>3 d.** nuo ankstyviausios galimos pabaigos — renkama vieta **artimiausia terminui** (ne „kiek galima anksčiau“); skubus terminas — vėliausia pabaiga iki datos. Plotis tik informacija (reguliavimas), ne blokas. Po perkėlimo `resyncPlanLanes` su `priorityJobIds`.

### Eilės planas vs rodymas (/eile)

Po `npm run queue:plan` duomenys saugomi `queue_plan_items` (staklė, `plannedStart`/`plannedEnd`, `lockedWeek`). Penktadienį (pvz. 10-02) planuojama **kita gamybos savaitė** (pirmadienis 10-05 – **penktadienis 10-09**); pirmas kiekvienos staklės darbas prasideda **pirmadienį 08:00**. Laikai skaičiuojami **valandinės tikslumo**: gamyba **08:00–12:00** ir **13:00–17:00** (1 val. pertrauka 12:00–13:00), **8 produktyvios val./d.**; overflow į kitą darbo dieną. Pvz. 8 val. pjovimas nuo 08:00 baigiasi **17:00**, ne 16:00. Darbas **užrakintas**, jei **pradžia** pr–pn; **pabaiga** gali būti kitą savaitę (UI: „Tęsiasi kitą savaitę“).

**Tęstinumas per savaitės ribą (tas pats konvejeris):** vienas `jobs` įrašas = viena eilutė to paties užsakymo (`proposalNumber`). Plane `queue_plan_items.machineId` laiko staklę; ceche `/cechas` ima pirmą darbą iš tos pačios staklės (`getNextJobForUser`). `in_progress` darbai visada matomi eilėje ir eina pirmiau. Jei darbas prasidėjo penktadienį ir baigiasi pirmadienį — tai **tas pats darbas**, ne naujas. Perplanuojant (`queue:plan`): `in_progress` → `pinnedMachineId` iš `jobs.machineId`; nebaigti darbai iš **patvirtinto** (`accepted`) plano lieka toje pačioje staklėje (`resolvePinnedMachineId`).

**Rodymas vs užpildymas:** `/eile` rodo tik darbus, kurių **pradžia** pr–pn. Jei staklė baigia anksčiau, `backfillIdleLanes` traukia kitos savaitės darbus: skubus terminas → ±5 → ≤15 → bet koks plotis (mažiausias žingsnis). 100 mm į SK1 **dedami**, jei arčiau nieko neliko arba 100 mm terminas skubesnis. Antraštė „Po suplanuotos savaitės“ = `laterLockedCount`. `npx tsx scripts/audit-idle-fill.ts`.

**Rodymas** (`getScheduledQueue`) turi naudoti planą, ne gyvą perskaičiavimą:
- `assignmentMap` statomas **iš `queue_plan_items`**, ne iš gyvo `scheduleQueue` (kuris gali priskirti tik dalį darbų)
- Staklė ir laikai iš `queue_plan_items.plannedStart` / `plannedEnd`
- Eilės tvarka ant staklės — pagal **planuotą pradžią**, ne P1/P2/P3 (`display-order.ts`)
- Geltonas reguliavimo blokas — sekvinis setup eilėje (`requiresWidthChangeoverFromSetup`), ne kiekvienas plotio šuolis tarp darbų
- Užrakintos savaitės filtras pagal `queue_plan_items.lockedWeek`
- Su planu **nenaudoti** `recalculateLaneAssignments` — kitaip ilgi darbai stumia eilę ir darbai „dingsta“
- **AI pastabos:** jei `canRebalance=false` — tuščias sąrašas (jokių „perkelk iš X į Y“)
- **Nepriskirti:** `jobRows` be `queue_plan_items` (gyvas `scheduleQueue` overlay nebededa jų į stakles). `/eile` antraštė + gintaro blokas su sąrašu. `in_progress` visada paliekamas eilėje. **Cron** (`vercel.json` → `/api/cron/queue-plan`, penktadienis 00:00 UTC ≈ 03:00 LT) turi sugeneruoti visus 138 įrašus; jei `queue:plan` lūžta (pvz. trūksta importo), lieka senas planas ir matosi nepriskirti. Lokaliai cron neveikia — reikia `npm run queue:plan` arba `--as-of` penktadieniui.

**Konvejerio perjungimas `/eile`:** `ScrollLaneIntoView` + `Link` be `scroll={false}` — visada į puslapio viršų.

### Taisyklių sluoksniai (kad nesikirstų)

| Sluoksnis | Plotis | Kada |
|---|---|---|
| Pradinis priskyrimas | ±5 → ≤15 → artimiausias bet koks | `assign-job` / `scheduleQueue` |
| **Staklės gedimas** | ±5 → ≤15 → artimiausias bet koks | `rescheduleForMachineDowntime` — `queued` su `plannedStart < downtime.endAt` |
| Perskirstyti / temporal | tik ±5 admin + ≥4 h iki pn | valandos iš `durationHoursFromPlan` |
| Eilės reguliavimas (geltona) | ±5 nuo **einamojo setup** | `lane-segments` / `service` |
| Tuščios staklės užpildymas | skubus terminas, tada ±5 → ≤15 → bet koks žingsnis | kitos savaitės darbai, ≥4 h iki pn 17:00 |
| Rankinis perkėlimas | **bet koks mm**, visada leidžiama | keliamas į priekį (po in_progress), perskaičiuojami laikai |

Pradinis planas **nekeičia** admin magneto. Idle užpildymas ir rankinis perkėlimas gali dėti bet kokį plotį; 100 mm į SK1 eina tik jei tai teisingas prioritetas (skubus terminas arba arčiau nieko nėra).

Diagnostika plano vs UI:

```bash
npx tsx scripts/audit-queue.ts
npx tsx scripts/audit-display-order.ts   # ar kortelės chronologinės tvarkos ant staklės
```

Jei staklė tuščia, bet plane yra darbų — paleiskite auditą; dažniausiai reikia `queue:plan` iš naujo arba planas senas.

`/eile`, `/cechas`, `/admin` — po `(platform)` layout su `AppNav` (viršuje). Senas `PageShell` navigacijos baras pašalintas.

### Plytelių baras (`/plyteliu-baras`)

- Katalogas iš DB lentelių `tiles` ir `discs` (archyvas per `npm run db:import`).
- Skirtukai **Plytelės** | **Diskai**. Plytelėse rodomi diskas, kietumas, brokas juostoje/kampuose; diskų skirtuke — skersmuo, storis, tiekėjas, kaina, modelis (`work-id`).
- Archyve plytelių `disc` laukas buvo Bubble ID → `discs` lentelė (`export_All-Discs-modified_*.csv`). Importas: `npm run db:import-discs`; esamiems įrašams ID→pavadinimas: `npm run db:resolve-discs` (253 plytelės).
- **Pridėti / redaguoti plytelę** — `admin` ir `pardavimai`: diskas (pasirinkimas iš katalogo), kietumas, brokas %. API: `POST /api/tiles`, `PATCH /api/tiles/[id]`.
- **Pridėti / redaguoti diską** — tas pats vaidmuo. API: `POST /api/discs`, `PATCH /api/discs/[id]`.
- Plytelės ID generuojamas `slugify(pavadinimas)`; dubliatams `-2`, `-3`… `defaultStorisMm` = storis (kaip archyvo importe).

### Įterpimas į gamybos eilę

- **Patvirtintas pasiūlymas** sukuria `jobs`, bet ne `queue_plan_items` — darbai `/eile` bloke **Nepriskirti darbai**.
- **Įterpti / perplanuoti** — `/eile` (nepriskirti) arba `/pasiulymai/[id]#eile`: **vienas** `<details>` (**Gamybos eilė**), be antro nested accordion — plane esantis darbas rodomas tiesiai viduje (info + forma). **Perplanuoti** (`queue-move-form`) — `fetch` + JSON į `POST /api/jobs/queue/override` (ne `<form>` viduje pasiūlymo `#proposal-form`, kitaip React hydration klaida). API: `POST /api/jobs/queue/enqueue`, `POST /api/proposals/[id]/enqueue`.
- **Terminai plane:** `effectiveCutByDeadline` — ne ankstesnis už šiandieną ar planuojamą pabaigą; `GET …/enqueue` atnaujina pasenusius `jobs.deadline` (`normalizeStalePlannedDeadlines`).
- **Konvejerio rekomendacija** — `suggest-move.ts` / `buildBestLaneSlot`: simuliuoja **visas** įterpimo vietas kiekvienoje staklėje; **`fromMachineId` nenaudojamas** (nėra „lik NK1“). Setup skaičiuojamas **sekvinėje eilėje** (`walkSetupThroughJobs`) nuo admin magneto per planuotus darbus prieš įterpimą. Lyginimas: be reguliavimo → mažiausias simuliuotas setup skirtumas → pabaiga: skubus terminas = vėliausia iki datos; laisvas terminas (>3 d.) = **artimiausia terminui**.
- `/pasiulymai` sąrašas — `max-w-7xl`, „Valdyti eilę“ stulpelyje `whitespace-nowrap`.
- Planas **accepted** — pirmiausia **Atverti planą redagavimui**. Pilnas savaitės perskaičiavimas — `npm run queue:plan`.

### Prisijungimas

- `/prisijungti` — numatytas **4 skaitmenų PIN** (darbuotojams); apačioje nuoroda **„Prisijungimas su el. paštu (vadovams)”**. Nuoroda su `?next=/cechas` ir pan. išsaugo nukreipimą po PIN.
- `/cechas/prisijungti` — peradresuoja į `/prisijungti?next=/cechas`.

### Cechas (PIN + paletės log v2)

- **PIN cechas vartotojams:** `npm run db:seed-worker-pin` — numatytas **`1234`** visiems, išskyrus:
  - **Aistė** → **`1111`**
  - **Andrius** → **`2222`**
- Demo vartotojai po `npm run db:seed-rotation`: Kristina, Daiva, Jonas, Rasa — PIN **`1234`**.
- Prisijungimas: [http://127.0.0.1:43127/prisijungti?next=/cechas](http://127.0.0.1:43127/prisijungti?next=/cechas) → įveskite PIN.
- **Darbuotojas negali keisti konvejerio** — rodomas tik priskirtas įrenginys (admin gali perjungti per `ConveyorSwitchForm`).
- **Pilno ekrano UI:** numatytai rodomas tik **einamasis darbas** + greitas įvedimas; **savaitės darbai** (`cechas-week-queue.tsx`) atsidaro mygtuku „Savaitės darbai“ (`cechas-view-shell.tsx`, `getLaneJobsForUser`).
- **Greitas įvedimas:** didelis skaičiaus laukas (`inputMode="numeric"`, ne `type="number"`), mygtukai +50/+100/+200/+240/+500, `fetch` į `/api/jobs/[id]/pallet` (be pilno puslapio perkrovimo). Brokas/komentaras — **išskleistas** numatytai.
- **Atsijungimas:** `POST /api/auth/logout` — `getIronSession(request, response)` + `session.destroy()` ant redirect atsakymo. Middleware turi leisti `/api/auth/logout` (publicPaths) — kitaip `cechas` rolė redirectinama į `/cechas` prieš logout.
- **Baigti darbą:** mygtukas „Baigiau darbą“ išskleidžia formą (ne rodoma iš karto); `fetch` į `/api/jobs/[id]/finish`.
- Paletės forma: **Padaryta vnt.**, **Brokas vnt.**, komentaras privalomas jei &lt;90 % normos.
- Po kiekvienos paletės — `rescheduleRemainingWeek` su faktiniu tempu (`actual-pace.ts`).

### Admin statistika (`/admin/statistika`)

- **Prieiga:** tik `admin` (navigacijoje „Statistika“).
- **API:** `GET /api/admin/statistics?from=YYYY-MM-DD&to=YYYY-MM-DD&machine=&worker=` — agreguoja `pallet_logs`.
- **Filtrai:** `LithuanianDatePicker` (datos kaip visur svetainėje); konvejeris ir darbuotojas — **paieškos laukas** (dropdown iki 5 rezultatų); rodomi **visi** staklės (`machines`) ir ceche darbuotojai (`users.role=cechas`), ne tik tie, kas turėjo įrašų.
- **Vaizdai:** perjungiklis **Grafikai** / **Skaičiai**; „Gera vs brokas“ — visada viršuje.
- **Grafikas per dienas:** kiekviena pasirinkto intervalo diena (0 = nebuvo ceche įrašų); ne tik dienos su pjovimu.
- **Datos:** lietuviškas formatas (`2026 m. spalio 5 d.`).
- **Šiandien:** tik faktinis kiekis, be normos palyginimo.
- **Normos:** tik užbaigtos dienos su bent vienu ceche įrašu.
- Logika: `production-stats.ts`; UI: `statistics-screen.tsx`, `statistics-charts.tsx`, `statistics-search-select.tsx`.

**To paties užsakymo kelios pozicijos:** P1/P2/P3 skaičiuojamas pagal staklės plotį (ne `storis=0`). To paties užsakymo eilutės rikiuojamos mažesniu kiekiu pirmiau. Laikai grandinami nuosekliai.

**Archyvo kiekiai:** `export_All-Work-items` dažnai saugo **paletų sk.**, ne vnt. (1–5 → realiai 500–2500 vnt.). `normalizeArchivePieces` seed'e ir `npm run db:fix-quantities` esamiems darbams.

**Laikų rodymas kortelėje:** `Pradžia` = pjovimas (be reguliavimo). Jei reikia reguliavimo — rodoma `Reguliavimas nuo` + `Pjovimas nuo` (po 30 min, su pertrauka 12:00–13:00). To paties pločio P1 darbai eina iš eilės (pabaiga = kito pradžia). Laikai visada su sekundėmis.
