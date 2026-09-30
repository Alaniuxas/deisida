import type { Proposal, QuantityUnit, TileLine } from "@/lib/types";
import { defaultPackaging, PJUVIS_OPTIONS } from "@/lib/types";
import { createEmptyTileLine, createLineId } from "@/lib/proposal-utils";

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function collectTileLines(form: FormData): TileLine[] {
  const lines: TileLine[] = [];
  for (let index = 0; index < 10; index += 1) {
    const tileId = str(form, `lineTile-${index}`);
    const rawQty = form.get(`lineQty-${index}`);
    const hasTileField =
      form.has(`lineTile-${index}`) || Boolean(tileId);
    if (!hasTileField && !form.has(`lineQty-${index}`)) {
      continue;
    }
    if (!tileId) {
      continue;
    }
    const quantity = Number(rawQty ?? 1);
    const unitRaw = str(form, `lineUnit-${index}`);
    const quantityUnit: QuantityUnit =
      unitRaw === "pieces" ? "pieces" : "pallets";
    lines.push({
      id: createLineId(),
      tileId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      quantityUnit,
    });
  }
  return lines;
}

export function proposalFromFormData(form: FormData): Proposal {
  const tileLines = collectTileLines(form);
  const pjovimas = str(form, "pjovimas") || PJUVIS_OPTIONS[0];

  return {
    number: str(form, "number"),
    validUntil: str(form, "validUntil"),
    serviceDeadline: str(form, "serviceDeadline"),
    client: str(form, "client"),
    object: str(form, "object"),
    address: str(form, "address"),
    comment: String(form.get("comment") ?? ""),
    pjovimas,
    packaging: defaultPackaging(),
    tileLines:
      tileLines.length > 0 ? tileLines : [createEmptyTileLine()],
    extraClauses: [],
  };
}

export function proposalToQueryString(proposal: Proposal): string {
  const params = new URLSearchParams();
  params.set("number", proposal.number);
  params.set("client", proposal.client);
  params.set("object", proposal.object);
  params.set("address", proposal.address);
  params.set("comment", proposal.comment);
  params.set("pjovimas", proposal.pjovimas);
  params.set("validUntil", proposal.validUntil);
  params.set("serviceDeadline", proposal.serviceDeadline);
  params.set("lines", String(Math.max(proposal.tileLines.length, 1)));
  proposal.tileLines.forEach((line, index) => {
    params.set(`lineTile-${index}`, line.tileId);
    params.set(`lineQty-${index}`, String(line.quantity));
    params.set(`lineUnit-${index}`, line.quantityUnit);
  });
  return params.toString();
}
