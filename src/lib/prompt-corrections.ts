import type { PackagingOptions, Proposal, PromptResult, TileLine } from "./types";
import { createEmptyTileLine, formatLineQuantity } from "./proposal-utils";
import { getTileById, TILE_CATALOG } from "./tiles";

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["taip", "yes", "true", "1"].includes(normalized)) return true;
  if (["ne", "no", "false", "0"].includes(normalized)) return false;
  return null;
}

function setPackagingFlag(
  packaging: PackagingOptions,
  key: keyof PackagingOptions,
  value: boolean,
): PackagingOptions {
  return { ...packaging, [key]: value };
}

function updateLine(
  lines: TileLine[],
  index: number,
  updater: (line: TileLine) => TileLine,
): TileLine[] {
  if (index < 0 || index >= lines.length) return lines;
  return lines.map((line, idx) => (idx === index ? updater(line) : line));
}

function findTileIdByName(text: string): string | undefined {
  const normalized = text.trim().toLowerCase();
  const exact = TILE_CATALOG.find(
    (tile) => tile.name.toLowerCase() === normalized,
  );
  if (exact) return exact.id;
  return TILE_CATALOG.find((tile) =>
    tile.name.toLowerCase().includes(normalized),
  )?.id;
}

export function applyPromptCorrection(
  proposal: Proposal,
  prompt: string,
): PromptResult {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      proposal,
      messages: ["Įveskite pataisos tekstą."],
      appliedLocally: false,
    };
  }

  const messages: string[] = [];
  let next: Proposal = { ...proposal, tileLines: [...proposal.tileLines] };
  let matched = false;
  const lower = trimmed.toLowerCase();

  const lineIndexMatch = lower.match(/(?:eilut[eė]|line)\s*(\d+)/);
  const lineIndex = lineIndexMatch
    ? Number(lineIndexMatch[1]) - 1
    : next.tileLines.length - 1;

  if (
    /(pasl[eė]pti|nerodyti|hide)\s+stori/.test(lower) ||
    lower === "storis ne"
  ) {
    next.tileLines = updateLine(next.tileLines, lineIndex, (line) => ({
      ...line,
      showStoris: false,
    }));
    messages.push("Storis neberodomas.");
    matched = true;
  }

  if (/(rodyti|show|atstatyti)\s+stori/.test(lower) || lower === "storis taip") {
    next.tileLines = updateLine(next.tileLines, lineIndex, (line) => ({
      ...line,
      showStoris: true,
    }));
    messages.push("Storis rodomas.");
    matched = true;
  }

  const clientMatch =
    trimmed.match(/(?:keisti\s+klient[aą]|klientas)\s*[:\-]?\s*(.+)$/i) ??
    trimmed.match(/pakeisk\s+klient[aą]\s+[įi]\s+(.+)$/i);
  if (clientMatch?.[1]) {
    next.client = clientMatch[1].trim().replace(/^["']|["']$/g, "");
    messages.push(`Klientas pakeistas į „${next.client}“.`);
    matched = true;
  }

  const objectMatch =
    trimmed.match(/(?:keisti\s+objekt[aą]|objektas)\s*[:\-]?\s*(.+)$/i) ??
    trimmed.match(/pakeisk\s+objekt[aą]\s+[įi]\s+(.+)$/i);
  if (objectMatch?.[1]) {
    next.object = objectMatch[1].trim().replace(/^["']|["']$/g, "");
    messages.push(`Objektas pakeistas į „${next.object}“.`);
    matched = true;
  }

  const validUntilMatch = trimmed.match(
    /(?:galiojimo\s+data|galiojimas|valid)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (validUntilMatch?.[1]) {
    next.validUntil = validUntilMatch[1];
    messages.push(`Galiojimo data pakeista į ${next.validUntil}.`);
    matched = true;
  }

  const deadlineMatch = trimmed.match(
    /(?:paslaugos\s+terminas|terminas|deadline)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
  );
  if (deadlineMatch?.[1]) {
    next.serviceDeadline = deadlineMatch[1];
    messages.push(`Paslaugos terminas pakeistas į ${next.serviceDeadline}.`);
    matched = true;
  }

  const quantityMatch = trimmed.match(
    /(?:kiekis|palet[eė]s?|vnt\.?|vienet[aą]?)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
  );
  if (quantityMatch?.[1]) {
    const quantity = Number(quantityMatch[1].replace(",", "."));
    const usePieces = /vnt|vienet/i.test(trimmed);
    const quantityUnit = usePieces ? "pieces" : "pallets";
    next.tileLines = updateLine(next.tileLines, lineIndex, (line) => ({
      ...line,
      quantity,
      quantityUnit,
    }));
    messages.push(
      `Eilutė ${lineIndex + 1}: kiekis pakeistas į ${formatLineQuantity(next.tileLines[lineIndex])}.`,
    );
    matched = true;
  }

  const storisMatch = trimmed.match(/(?:storis|storio)\s*[:\-]?\s*(\d+)/i);
  if (storisMatch?.[1] && !/(pasl[eė]pti|rodyti|hide|show)/.test(lower)) {
    const storis = Number(storisMatch[1]);
    next.tileLines = updateLine(next.tileLines, lineIndex, (line) => ({
      ...line,
      storisMm: storis,
      showStoris: true,
    }));
    messages.push(`Eilutė ${lineIndex + 1}: storis pakeistas į ${storis} mm.`);
    matched = true;
  }

  const tileMatch = trimmed.match(
    /(?:keisti\s+plytel[eę]|plytel[eę]|tile)\s*[:\-]?\s*(.+)$/i,
  );
  if (tileMatch?.[1]) {
    const tileId = findTileIdByName(tileMatch[1]);
    if (tileId) {
      const tile = getTileById(tileId)!;
      next.tileLines = updateLine(next.tileLines, lineIndex, (line) => ({
        ...line,
        tileId,
        storisMm: tile.defaultStorisMm,
      }));
      messages.push(`Eilutė ${lineIndex + 1}: plytelė pakeista į „${tile.name}“.`);
      matched = true;
    }
  }

  const packagingRules: Array<{
    pattern: RegExp;
    key: keyof PackagingOptions;
    label: string;
    isToggle?: boolean;
  }> = [
    {
      pattern: /pakuoti\s+tik\s+neskilusi\s*[:\-]?\s*(taip|ne)/i,
      key: "packOnlyIntact",
      label: "Pakuoti tik neskilusi",
    },
    {
      pattern: /(?:2\s+dalis|dvi\s+dalys|skilusi\s+i\s+2)\s*[:\-]?\s*(taip|ne)/i,
      key: "packTwoParts",
      label: "Pakuoti į 2 dalis skilusi",
    },
    {
      pattern: /(?:daugiau\s+nei\s+2|visa\s+d[uū][žz][iį])\s*[:\-]?\s*(taip|ne)/i,
      key: "packMoreThanTwoParts",
      label: "Pakuoti daugiau nei į 2 dalis",
    },
    {
      pattern: /(?:liku[cč]iai|viduriukui)\s*[:\-]?\s*(taip|ne)/i,
      key: "needLeftovers",
      label: "Ar reikalingi likučiai",
    },
    {
      pattern: /(?:bazin[eė]\s+apsauga|base\s+protection)/i,
      key: "baseProtection",
      label: "Bazinė apsauga",
      isToggle: true,
    },
    {
      pattern: /(?:apatinis\s+perklojimas|bottom\s+interlayer)/i,
      key: "bottomInterlayer",
      label: "Apatinis perklojimas",
      isToggle: true,
    },
    {
      pattern: /(?:kiekvienos\s+eil[eė]s\s+perklojimas|row\s+interlayer)/i,
      key: "rowInterlayer",
      label: "Kiekvienos eilės perklojimas",
      isToggle: true,
    },
  ];

  for (const rule of packagingRules) {
    const match = trimmed.match(rule.pattern);
    if (!match) continue;

    next.tileLines = updateLine(next.tileLines, lineIndex, (line) => {
      if (rule.isToggle) {
        const enabled = match[1]
          ? parseBoolean(match[1]) ?? true
          : !line.packaging[rule.key];
        return {
          ...line,
          packaging: setPackagingFlag(line.packaging, rule.key, enabled),
        };
      }

      const parsed = parseBoolean(match[1]);
      if (parsed === null) return line;
      return {
        ...line,
        packaging: { ...line.packaging, [rule.key]: parsed },
      };
    });

    messages.push(`Eilutė ${lineIndex + 1}: atnaujinta parinktis „${rule.label}“.`);
    matched = true;
  }

  if (/(prid[eė]ti|add)\s+(?:eilut[eę]|line)/i.test(trimmed)) {
    next.tileLines = [...next.tileLines, createEmptyTileLine()];
    messages.push("Pridėta nauja plytelių eilutė.");
    matched = true;
  }

  if (/(pa[sš]alinti|remove)\s+(?:eilut[eę]|line)/i.test(trimmed)) {
    if (next.tileLines.length > 1) {
      next.tileLines = next.tileLines.filter((_, idx) => idx !== lineIndex);
      messages.push(`Pašalinta eilutė ${lineIndex + 1}.`);
      matched = true;
    } else {
      messages.push("Negalima pašalinti paskutinės eilutės.");
      matched = true;
    }
  }

  if (!matched) {
    next = {
      ...next,
      extraClauses: [...next.extraClauses, trimmed],
    };
    messages.push("Pridėta papildoma sąlyga.");
  }

  return {
    proposal: next,
    messages,
    appliedLocally: true,
  };
}
