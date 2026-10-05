export interface Disc {
  id: string;
  name: string;
  description?: string;
  diameterMm?: number;
  thicknessMm?: number;
  supplier?: string;
  priceEur?: number;
  workId?: string;
}

export interface Tile {
  id: string;
  name: string;
  supplier: string;
  manufacturer?: string;
  priceEur: number;
  quantityPerPallet: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  defaultStorisMm: number;
  description?: string;
  discId?: string;
  disc?: string;
  hardness?: number;
  fragilityStrip?: string;
  fragilityCorner?: string;
}

export interface PackagingOptions {
  packOnlyIntact: boolean | null;
  packTwoParts: boolean | null;
  packMoreThanTwoParts: boolean | null;
  needLeftovers: boolean | null;
  baseProtection: boolean;
  bottomInterlayer: boolean;
  rowInterlayer: boolean;
}

export type QuantityUnit = "pieces" | "pallets";

export interface TileLine {
  id: string;
  tileId: string;
  quantity: number;
  quantityUnit: QuantityUnit;
  storisMm?: number;
}

export interface Proposal {
  number: string;
  validUntil: string;
  serviceDeadline: string;
  client: string;
  object: string;
  address: string;
  comment: string;
  pjovimas: string;
  packaging: PackagingOptions;
  tileLines: TileLine[];
  extraClauses: string[];
}

export interface PromptResult {
  proposal: Proposal;
  messages: string[];
  appliedLocally: boolean;
}

export const PJUVIS_OPTIONS = [
  "Pjovimas plytelėmis",
  "Pjovimas L kampu",
  "Atpjovimas nuo L kampo likučio",
  "Horizontalus kampas",
  "Nežinau",
  "Kita",
] as const;

export type PjovimasOption = (typeof PJUVIS_OPTIONS)[number];

export const defaultPackaging = (): PackagingOptions => ({
  packOnlyIntact: null,
  packTwoParts: null,
  packMoreThanTwoParts: null,
  needLeftovers: null,
  baseProtection: false,
  bottomInterlayer: false,
  rowInterlayer: false,
});

export const L_CORNER_NOTE =
  "Sveikų L kampų pjovimas (kiekis viršijantis 5 % ribą – apmokamas papildomai).";
