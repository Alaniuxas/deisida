# Deisida · Pasiūlymo kūrimas

Lietuviškas pasiūlymų kūrimo įrankis pardavimo vadybininkams. Kuria tvarkingą A4 PDF su plytelių eilutėmis, storiu, pakavimo pasirinkimais ir vietinėmis pataisomis (be debesies modelio).

## Paleidimas

```bash
npm install
npm run dev
```

Atidarykite [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Kas įdiegta šiame etape

- Pasiūlymo forma: numeris, galiojimas, paslaugos terminas, klientas, objektas, komentaras
- Plytelių eilutės su seeded katalogu (AARHUS weisgrau, Bellbrook Red Multi, Kolumba K58, Alu klinkerinės)
- Storis (atskiras laukas nuo aukščio), pakavimo pasirinkimai ir L kampų pastaba
- Gyva peržiūra ir PDF atsisiuntimas
- Pataisų laukas su vietinėmis komandomis ir laisvu tekstu kaip papildoma sąlyga

## Stack

Next.js, TypeScript, Tailwind CSS, shadcn/ui, @react-pdf/renderer

## Pastaba

Gamybos eilė ir pilnas plytelių katalogas dar neimplementuoti — duomenų struktūra paruošta vėlesniam plėtimui.
