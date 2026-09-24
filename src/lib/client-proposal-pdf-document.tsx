import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describePackagingChoices,
  formatCatalogPrice,
  formatDimensions,
  formatLineStoris,
  formatLtDate,
  formatLineQuantity,
  getLineSubtotal,
  getLineUnitPrice,
  getProposalPricing,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

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
    fontFamily: "Helvetica",
    color: brand.ink,
    lineHeight: 1.35,
    backgroundColor: brand.paper,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `2pt solid ${brand.red}`,
  },
  brand: {
    fontSize: 18,
    fontWeight: "bold",
    color: brand.red,
  },
  brandSub: {
    fontSize: 8,
    color: brand.muted,
    marginTop: 2,
  },
  metaBlock: { width: "46%" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
    gap: 6,
  },
  metaLabel: { color: brand.muted },
  metaValue: { fontWeight: "bold" },
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
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
    padding: 5,
    fontSize: 6.5,
    fontWeight: "bold",
    color: brand.muted,
    textTransform: "uppercase",
  },
  td: {
    padding: 5,
    fontSize: 7.5,
  },
  colTile: { width: "20%" },
  colDim: { width: "20%" },
  colThick: { width: "12%" },
  colQty: { width: "16%", textAlign: "right" },
  colUnit: { width: "14%", textAlign: "right" },
  colSum: { width: "18%", textAlign: "right" },
  orderBox: {
    border: `1pt solid ${brand.line}`,
    backgroundColor: brand.panel,
    padding: 10,
    marginBottom: 12,
  },
  orderLine: {
    fontSize: 7.5,
    marginBottom: 2,
  },
  totals: {
    alignSelf: "flex-end",
    width: "38%",
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
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    fontWeight: "bold",
  },
  commentLine: {
    fontSize: 7.5,
    marginBottom: 3,
  },
  noteBox: {
    borderTop: `1pt solid ${brand.line}`,
    paddingTop: 8,
    marginTop: 6,
  },
  noteTitle: {
    fontSize: 7,
    color: brand.red,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
    fontWeight: "bold",
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
  const hasComments = proposal.comment || proposal.extraClauses.length > 0;

  return (
    <Document title={`Pasiūlymas ${proposal.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>DEISIDA</Text>
            <Text style={styles.brandSub}>Pasiūlymas klientui</Text>
          </View>
          <View style={styles.metaBlock}>
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
            <Text style={[styles.th, styles.colTile]}>Plytelė</Text>
            <Text style={[styles.th, styles.colDim]}>Matmenys</Text>
            <Text style={[styles.th, styles.colThick]}>Pjovimo storis</Text>
            <Text style={[styles.th, styles.colQty]}>Kiekis</Text>
            <Text style={[styles.th, styles.colUnit]}>Kaina už vnt.</Text>
            <Text style={[styles.th, styles.colSum]}>Suma</Text>
          </View>
          {proposal.tileLines.map((line) => {
            const tile = getTileById(line.tileId);
            return (
              <View key={line.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colTile]}>{tile?.name ?? "—"}</Text>
                <Text style={[styles.td, styles.colDim]}>
                  {tile
                    ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                    : "—"}
                </Text>
                <Text style={[styles.td, styles.colThick]}>
                  {formatLineStoris(line)}
                </Text>
                <Text style={[styles.td, styles.colQty]}>
                  {formatLineQuantity(line)}
                </Text>
                <Text style={[styles.td, styles.colUnit]}>
                  {formatCatalogPrice(getLineUnitPrice(line))}
                </Text>
                <Text style={[styles.td, styles.colSum]}>
                  {formatCatalogPrice(getLineSubtotal(line))}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.orderBox}>
          <Text style={styles.commentTitle}>Gamyba ir pakavimas</Text>
          <Text style={styles.orderLine}>Baras: {proposal.pjovimas}</Text>
          {describePackagingChoices(proposal.packaging).map((item) => (
            <Text key={item} style={styles.orderLine}>
              {item}
            </Text>
          ))}
        </View>

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
              <Text style={styles.commentLine}>
                Bendras komentaras: {proposal.comment}
              </Text>
            ) : null}
            {proposal.extraClauses.map((clause, index) => (
              <Text key={`${clause}-${index}`} style={styles.commentLine}>
                Papildoma sąlyga: {clause}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Pastaba</Text>
          <Text>{L_CORNER_NOTE}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · Pasiūlymas {proposal.number}</Text>
          <Text>deisida.lt</Text>
        </View>
      </Page>
    </Document>
  );
}
