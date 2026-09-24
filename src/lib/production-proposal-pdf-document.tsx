import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describePackagingChoices,
  formatDimensions,
  formatLineStoris,
  formatLtDate,
  formatLineQuantity,
  formatProductionPackagingSummary,
  formatYesNo,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";
import { PDF_FONT_FAMILY, registerPdfFonts } from "@/lib/pdf-fonts";

registerPdfFonts();

const brand = {
  red: "#c14546",
  gray: "#484849",
  ink: "#282829",
  muted: "#767676",
  line: "#e8e8e4",
  panel: "#f3f3f0",
  paper: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY,
    color: brand.ink,
    lineHeight: 1.45,
    backgroundColor: brand.paper,
  },
  hero: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: `2pt solid ${brand.gray}`,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: brand.gray,
    letterSpacing: 0.4,
  },
  heroSub: {
    marginTop: 4,
    fontSize: 9,
    color: brand.muted,
  },
  metaCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: brand.panel,
    borderRadius: 4,
    border: `1pt solid ${brand.line}`,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottom: `0.5pt solid ${brand.line}`,
  },
  detailRowLast: {
    borderBottom: "none",
  },
  detailLabel: {
    width: 96,
    paddingRight: 8,
    fontSize: 7,
    color: brand.muted,
    letterSpacing: 0.3,
    fontWeight: "bold",
    flexShrink: 0,
  },
  detailValue: {
    flex: 1,
    fontSize: 9.5,
    color: brand.ink,
    lineHeight: 1.4,
  },
  lineBlock: {
    marginBottom: 12,
    border: `1pt solid ${brand.line}`,
    borderRadius: 4,
    overflow: "hidden",
  },
  lineHeader: {
    backgroundColor: brand.gray,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  lineHeaderText: {
    fontSize: 10,
    fontWeight: "bold",
    color: brand.paper,
  },
  lineBody: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: brand.paper,
  },
  orderBlock: {
    marginTop: 4,
    marginBottom: 12,
    border: `1pt solid ${brand.line}`,
    borderRadius: 4,
    backgroundColor: brand.panel,
    padding: 12,
  },
  orderTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: brand.gray,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  orderLine: {
    fontSize: 8,
    marginBottom: 4,
    lineHeight: 1.45,
  },
  noteBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1pt solid ${brand.line}`,
  },
  noteTitle: {
    fontSize: 7,
    color: brand.red,
    letterSpacing: 0.3,
    marginBottom: 4,
    fontWeight: "bold",
  },
  noteText: {
    fontSize: 8,
    color: brand.muted,
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTop: `1pt solid ${brand.line}`,
    paddingTop: 6,
    fontSize: 7,
    color: brand.muted,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last ? styles.detailRowLast : undefined]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} wrap>
        {value}
      </Text>
    </View>
  );
}

export function ProductionProposalDocument({ proposal }: { proposal: Proposal }) {
  return (
    <Document title={`Gamyba ${proposal.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>GAMYBA</Text>
          <Text style={styles.heroSub}>Darbo lapas cechui</Text>

          <View style={styles.metaCard}>
            <DetailRow label="Užsakymo Nr." value={proposal.number} />
            <DetailRow label="Klientas" value={proposal.client || "—"} />
            <DetailRow label="Objektas" value={proposal.object || "—"} />
            <DetailRow
              label="Terminas"
              value={formatLtDate(proposal.serviceDeadline)}
              last
            />
          </View>
        </View>

        {proposal.tileLines.map((line, index) => {
          const tile = getTileById(line.tileId);
          const rows = [
            { label: "Plytelė", value: tile?.name ?? "—" },
            {
              label: "Matmenys",
              value: tile
                ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                : "—",
            },
            { label: "Pjovimo storis", value: formatLineStoris(line) },
            { label: "Kiekis", value: formatLineQuantity(line) },
            { label: "Diskas", value: tile?.disc ?? "—" },
          ];

          return (
            <View key={line.id} style={styles.lineBlock} wrap={false}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineHeaderText}>Eilutė {index + 1}</Text>
              </View>
              <View style={styles.lineBody}>
                {rows.map((row, rowIndex) => (
                  <DetailRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    last={rowIndex === rows.length - 1}
                  />
                ))}
              </View>
            </View>
          );
        })}

        <View style={styles.orderBlock}>
          <Text style={styles.orderTitle}>Baras ir pakavimas</Text>
          <Text style={styles.orderLine} wrap>
            Baras: {proposal.pjovimas}
          </Text>
          <Text style={styles.orderLine} wrap>
            Pakavimas: {formatProductionPackagingSummary(proposal.packaging)}
          </Text>
          <Text style={styles.orderLine} wrap>
            Likučiai: {formatYesNo(proposal.packaging.needLeftovers)}
          </Text>
          {describePackagingChoices(proposal.packaging).map((item) => (
            <Text key={item} style={styles.orderLine} wrap>
              {item}
            </Text>
          ))}
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>L-kampų pastaba</Text>
          <Text style={styles.noteText} wrap>
            {L_CORNER_NOTE}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · {proposal.number}</Text>
          <Text>Gamyba</Text>
        </View>
      </Page>
    </Document>
  );
}
