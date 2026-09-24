import type { Tile } from "./types";

export const TILE_CATALOG: Tile[] = [
  {
    id: "aarhus-weisgrau",
    name: "AARHUS weisgrau",
    supplier: "UAB Jolivis",
    manufacturer: "ROBEN",
    priceEur: 2,
    quantityPerPallet: 576,
    lengthMm: 240,
    widthMm: 115,
    heightMm: 52,
    defaultStorisMm: 25,
    description: "Labai kietos, su kiaurymėmis viduje.",
    disc: "Mėlynas 350mm - minkšto metalo, kietoms plytoms.",
    hardness: 5,
    fragilityStrip: "5.0%",
    fragilityCorner: "5.0%",
  },
  {
    id: "bellbrook-red-multi",
    name: "Bellbrook Red Multi",
    supplier: "Wieneberger",
    manufacturer: "",
    priceEur: 0.83,
    quantityPerPallet: 660,
    lengthMm: 215,
    widthMm: 102,
    heightMm: 65,
    defaultStorisMm: 25,
    description:
      "Pjauta su NK1. Per dieną supjaunama apie 3500 vnt plytų, apie 7000 vnt plytelių. Minkšta, jautri plyta.",
    disc: "DC PUL 350mm",
    hardness: 2,
    fragilityStrip: "4.0%",
    fragilityCorner: "3.0%",
  },
  {
    id: "kolumba-k58",
    name: "Kolumba - K58",
    supplier: "Petersen Tegl",
    manufacturer: "Petersen Tegl",
    priceEur: 8,
    quantityPerPallet: 240,
    lengthMm: 528,
    widthMm: 108,
    heightMm: 37,
    defaultStorisMm: 25,
    description:
      "Iš vienos plytos galima pjauti 3 plyteles, kai plytelės storis 25 mm. Sunkiausia pjauti kalibracinį pjūvį.",
    disc: "DC PUL 300mm",
    hardness: 5,
    fragilityStrip: "1.0%",
    fragilityCorner: "1.0%",
  },
  {
    id: "alu-klinkerines",
    name: "Alu klinkerinės",
    supplier: "Deisida",
    manufacturer: "",
    priceEur: 0,
    quantityPerPallet: 500,
    lengthMm: 240,
    widthMm: 115,
    heightMm: 52,
    defaultStorisMm: 25,
    description: "Klinkerinės plytelės – pavyzdys iš formos.",
  },
];

export function getTileById(id: string): Tile | undefined {
  return TILE_CATALOG.find((tile) => tile.id === id);
}
