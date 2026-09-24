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
  describeClientPackaging,
  formatCatalogPrice,
  formatDimensions,
  formatLineStoris,
  formatLtDate,
  formatLineQuantity,
  getLineCatalogPrice,
  getLineSubtotal,
  getProposalPricing,
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
    padding: 40,
    fontSize: 8.5,
    fontFamily: PDF_FONT_FAMILY,
    color: brand.ink,
    lineHeight: 1.4,
    backgroundColor: brand.paper,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 24,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `2pt solid ${brand.red}`,
  },
  headerBrand: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: "46%",
  },
  headerMeta: {
    flexGrow: 0,
    flexShrink: 0,
    width: "50%",
    minWidth: 190,
  },
  brand: {
    fontSize: 18,
    fontWeight: "bold",
    color: brand.red,
  },
  brandSub: {
    fontSize: 8.5,
    color: brand.muted,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
    marginBottom: 3,
    gap: 10,
  },
  metaLabel: {
    width: 96,
    textAlign: "right",
    color: brand.muted,
    flexShrink: 0,
  },
  metaValue: {
    flexGrow: 1,
    flexShrink: 1,
    fontWeight: "bold",
    textAlign: "right",
  },
  infoGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  infoBox: {
    flex: 1,
    border: `1pt solid ${brand.line}`,
    borderRadius: 3,
    padding: 8,
  },
  infoLabel: {
    fontSize: 7,
    color: brand.gray,
    letterSpacing: 0.4,
    marginBottom: 3,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: brand.gray,
    marginBottom: 6,
  },
  table: {
    border: `1pt solid ${brand.line}`,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: brand.panel,
    borderBottom: `1pt solid ${brand.line}`,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `1pt solid ${brand.line}`,
  },
  th: {
    fontSize: 7,
    fontWeight: "bold",
    color: brand.muted,
    lineHeight: 1.35,
  },
  td: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 7.5,
    lineHeight: 1.35,
  },
  colTile: { width: "20%", padding: 4 },
  colDim: { width: "17%", padding: 4 },
  colThick: { width: "13%", padding: 4 },
  colQty: { width: "12%", padding: 4, alignItems: "flex-end" },
  colUnit: { width: "18%", padding: 4, alignItems: "flex-end" },
  colSum: { width: "20%", padding: 4, alignItems: "flex-end" },
  cellRight: { textAlign: "right" },
  orderBox: {
    border: `1pt solid ${brand.line}`,
    backgroundColor: brand.panel,
    padding: 10,
    marginBottom: 12,
  },
  orderLine: {
    fontSize: 7.5,
    marginBottom: 4,
    lineHeight: 1.45,
  },
  totals: {
    alignSelf: "flex-end",
    width: "42%",
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalLabel: { color: brand.muted },
  totalStrong: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 4,
    borderTop: `1pt solid ${brand.line}`,
    fontWeight: "bold",
  },
  totalValue: { color: brand.red },
  commentBox: {
    border: `1pt solid ${brand.line}`,
    backgroundColor: brand.panel,
    padding: 10,
    marginBottom: 10,
  },
  commentTitle: {
    fontSize: 7,
    color: brand.gray,
    letterSpacing: 0.4,
    marginBottom: 6,
    fontWeight: "bold",
  },
  commentLine: {
    fontSize: 7.5,
    marginBottom: 3,
    lineHeight: 1.45,
  },
  noteBox: {
    borderTop: `1pt solid ${brand.line}`,
    paddingTop: 8,
    marginTop: 6,
  },
  noteTitle: {
    fontSize: 7,
    color: brand.red,
    letterSpacing: 0.4,
    marginBottom: 3,
    fontWeight: "bold",
  },
  noteText: {
    lineHeight: 1.45,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTop: `1pt solid ${brand.line}`,
    paddingTop: 6,
    fontSize: 6.5,
    color: brand.muted,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function ClientProposalDocument({ proposal }: { proposal: Proposal }) {
  const pricing = getProposalPricing(proposal);
  const clientPackaging = describeClientPackaging(proposal.packaging);
  const hasComments = proposal.comment || proposal.extraClauses.length > 0;

  return (
    <Document title={`Pasiūlymas ${proposal.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Text style={styles.brand}>DEISIDA</Text>
            <Text style={styles.brandSub}>Pasiūlymas klientui</Text>
          </View>
          <View style={styles.headerMeta}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Pasiūlymo Nr.</Text>
              <Text style={styles.metaValue}>{proposal.number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Galioja iki</Text>
              <Text style={styles.metaValue}>{formatLtDate(proposal.validUntil)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Paslaugos terminas</Text>
              <Text style={styles.metaValue}>
                {formatLtDate(proposal.serviceDeadline)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Klientas</Text>
            <Text>{proposal.client || "—"}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Objektas</Text>
            <Text>{proposal.object || "—"}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Pasiūlymas</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colTile}>
              <Text style={styles.th}>Plytelė</Text>
            </View>
            <View style={styles.colDim}>
              <Text style={styles.th}>Matmenys</Text>
            </View>
            <View style={styles.colThick}>
              <Text style={styles.th}>Pjovimo storis</Text>
            </View>
            <View style={styles.colQty}>
              <Text style={[styles.th, styles.cellRight]}>Kiekis</Text>
            </View>
            <View style={styles.colUnit}>
              <Text style={[styles.th, styles.cellRight]}>Kaina už vnt.</Text>
            </View>
            <View style={styles.colSum}>
              <Text style={[styles.th, styles.cellRight]}>Suma</Text>
            </View>
          </View>
          {proposal.tileLines.map((line) => {
            const tile = getTileById(line.tileId);
            return (
              <View key={line.id} style={styles.tableRow}>
                <View style={styles.colTile}>
                  <Text style={styles.td}>{tile?.name ?? "—"}</Text>
                </View>
                <View style={styles.colDim}>
                  <Text style={styles.td}>
                    {tile
                      ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                      : "—"}
                  </Text>
                </View>
                <View style={styles.colThick}>
                  <Text style={styles.td}>{formatLineStoris(line)}</Text>
                </View>
                <View style={styles.colQty}>
                  <Text style={[styles.td, styles.cellRight]}>
                    {formatLineQuantity(line)}
                  </Text>
                </View>
                <View style={styles.colUnit}>
                  <Text style={[styles.td, styles.cellRight]}>
                    {formatCatalogPrice(getLineCatalogPrice(line))}
                  </Text>
                </View>
                <View style={styles.colSum}>
                  <Text style={[styles.td, styles.cellRight]}>
                    {formatCatalogPrice(getLineSubtotal(line))}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {clientPackaging.length > 0 ? (
          <View style={styles.orderBox}>
            <Text style={styles.commentTitle}>Pakavimas</Text>
            {clientPackaging.map((item) => (
              <Text key={item} style={styles.orderLine} wrap>
                {item}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Suma be PVM</Text>
            <Text>{formatCatalogPrice(pricing.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>PVM (21 %)</Text>
            <Text>{formatCatalogPrice(pricing.vat)}</Text>
          </View>
          <View style={styles.totalStrong}>
            <Text>Suma su PVM</Text>
            <Text style={styles.totalValue}>
              {formatCatalogPrice(pricing.total)}
            </Text>
          </View>
        </View>

        {hasComments ? (
          <View style={styles.commentBox}>
            <Text style={styles.commentTitle}>Komentarai</Text>
            {proposal.comment ? (
              <Text style={styles.commentLine} wrap>
                Bendras komentaras: {proposal.comment}
              </Text>
            ) : null}
            {proposal.extraClauses.map((clause, index) => (
              <Text key={`${clause}-${index}`} style={styles.commentLine} wrap>
                Papildoma sąlyga: {clause}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Pastaba</Text>
          <Text style={styles.noteText} wrap>
            {L_CORNER_NOTE}
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · Pasiūlymas {proposal.number}</Text>
          <Text>deisida.lt</Text>
        </View>
      </Page>
    </Document>
  );
}
