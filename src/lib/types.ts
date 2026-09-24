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

export interface TileLine {
  id: string;
  tileId: string;
  quantityPallets: number;
  storisMm: number;
  showStoris: boolean;
  comment: string;
  packaging: PackagingOptions;
}

export interface Proposal {
  number: string;
  validUntil: string;
  serviceDeadline: string;
  client: string;
  object: string;
  comment: string;
  tileLines: TileLine[];
  extraClauses: string[];
}

export interface PromptResult {
  proposal: Proposal;
  messages: string[];
  appliedLocally: boolean;
}

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
