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
  describeLineSideInfo,
  formatCatalogPrice,
  formatLtDate,
  getLineCatalogPrice,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 44,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1c1917",
    lineHeight: 1.4,
    backgroundColor: "#fffdf9",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottom: "1pt solid #d8cfc0",
  },
  brand: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#c42026",
  },
  brandSub: {
    fontSize: 8,
    color: "#6b645a",
    marginTop: 3,
  },
  metaBlock: {
    width: "44%",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 3,
    gap: 8,
  },
  metaLabel: {
    color: "#6b645a",
  },
  metaValue: {
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 8,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  infoBox: {
    flex: 1,
    border: "1pt solid #d8cfc0",
    borderRadius: 4,
    padding: 10,
  },
  infoLabel: {
    fontSize: 7,
    color: "#6b645a",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  table: {
    border: "1pt solid #d8cfc0",
    marginBottom: 14,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f7f2ea",
    borderBottom: "1pt solid #d8cfc0",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #e5ddd1",
  },
  th: {
    padding: 8,
    fontSize: 7,
    fontWeight: "bold",
    color: "#6b645a",
    textTransform: "uppercase",
  },
  td: {
    padding: 8,
    fontSize: 8,
  },
  colTile: { width: "32%" },
  colCut: { width: "34%" },
  colQty: { width: "14%", textAlign: "right" },
  colPrice: { width: "20%", textAlign: "right" },
  sidePanel: {
    border: "1pt dashed #d8cfc0",
    backgroundColor: "#faf7f2",
    padding: 10,
    marginBottom: 12,
  },
  sideTitle: {
    fontSize: 7,
    color: "#6b645a",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sideLineGroup: {
    marginBottom: 8,
  },
  sideText: {
    fontSize: 7.5,
    marginBottom: 2,
  },
  clauseBox: {
    border: "1pt solid #d8cfc0",
    padding: 8,
    marginBottom: 8,
  },
  noteBox: {
    borderTop: "1pt solid #d8cfc0",
    paddingTop: 10,
    marginTop: 8,
  },
  noteTitle: {
    fontSize: 7,
    color: "#c42026",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    borderTop: "1pt solid #d8cfc0",
    paddingTop: 8,
    fontSize: 7,
    color: "#6b645a",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function ProposalDocument({ proposal }: { proposal: Proposal }) {
  return (
    <Document title={`Pasiūlymas ${proposal.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>DEISIDA</Text>
            <Text style={styles.brandSub}>Plytelių pjovimo ir paruošimo paslaugos</Text>
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

        <Text style={styles.sectionTitle}>Pasiūlymo eilutės</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colTile]}>Plytelė</Text>
            <Text style={[styles.th, styles.colCut]}>Pjūvis</Text>
            <Text style={[styles.th, styles.colQty]}>Kiekis</Text>
            <Text style={[styles.th, styles.colPrice]}>Kaina</Text>
          </View>
          {proposal.tileLines.map((line) => {
            const tile = getTileById(line.tileId);
            return (
              <View key={line.id} style={styles.tableRow}>
                <Text style={[styles.td, styles.colTile]}>{tile?.name ?? "—"}</Text>
                <Text style={[styles.td, styles.colCut]}>{line.pjovimas}</Text>
                <Text style={[styles.td, styles.colQty]}>
                  {line.quantityPallets} pal.
                </Text>
                <Text style={[styles.td, styles.colPrice]}>
                  {formatCatalogPrice(getLineCatalogPrice(line))}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.sidePanel}>
          <Text style={styles.sideTitle}>Techninė ir operacinė informacija</Text>
          {proposal.tileLines.map((line, index) => (
            <View key={line.id} style={styles.sideLineGroup}>
              {describeLineSideInfo(line, index).map((item) => (
                <Text key={item} style={styles.sideText}>
                  {item}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {proposal.comment ? (
          <>
            <Text style={styles.sectionTitle}>Komentaras</Text>
            <View style={styles.clauseBox}>
              <Text>{proposal.comment}</Text>
            </View>
          </>
        ) : null}

        {proposal.extraClauses.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Papildomos sąlygos</Text>
            {proposal.extraClauses.map((clause, index) => (
              <View key={`${clause}-${index}`} style={styles.clauseBox}>
                <Text>{clause}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Pastaba</Text>
          <Text>{L_CORNER_NOTE}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · Pasiūlymas {proposal.number}</Text>
          <Text>Sugeneruota vietoje · be debesies modelio</Text>
        </View>
      </Page>
    </Document>
  );
}
