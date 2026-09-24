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
  formatDimensions,
  formatLtDate,
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
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.35,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    borderBottom: "1pt solid #d1d5db",
    paddingBottom: 12,
  },
  brand: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#b91c1c",
  },
  brandSub: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2,
  },
  metaBlock: {
    width: "42%",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    width: 118,
    color: "#6b7280",
  },
  metaValue: {
    flex: 1,
    fontWeight: "bold",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#111827",
  },
  grid: {
    border: "1pt solid #d1d5db",
    marginBottom: 12,
  },
  gridHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottom: "1pt solid #d1d5db",
  },
  gridRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #e5e7eb",
  },
  cell: {
    padding: 6,
    borderRight: "1pt solid #e5e7eb",
  },
  cellLast: {
    padding: 6,
  },
  colNr: { width: "5%" },
  colTile: { width: "18%" },
  colDims: { width: "14%" },
  colStoris: { width: "8%" },
  colQty: { width: "8%" },
  colChoices: { width: "27%" },
  colPack: { width: "20%" },
  headerText: {
    fontSize: 8,
    fontWeight: "bold",
  },
  bodyText: {
    fontSize: 8,
  },
  noteBox: {
    backgroundColor: "#fef2f2",
    border: "1pt solid #fecaca",
    padding: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  noteTitle: {
    fontWeight: "bold",
    marginBottom: 3,
    color: "#991b1b",
  },
  clauseBox: {
    border: "1pt solid #d1d5db",
    padding: 8,
    marginBottom: 8,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    borderTop: "1pt solid #d1d5db",
    paddingTop: 8,
    fontSize: 7,
    color: "#6b7280",
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

        <Text style={styles.sectionTitle}>Kliento informacija</Text>
        <View style={[styles.grid, { marginBottom: 14 }]}>
          <View style={styles.gridRow}>
            <View style={[styles.cell, { width: "18%" }]}>
              <Text style={styles.headerText}>Klientas</Text>
            </View>
            <View style={[styles.cellLast, { width: "82%" }]}>
              <Text style={styles.bodyText}>{proposal.client || "—"}</Text>
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={[styles.cell, { width: "18%" }]}>
              <Text style={styles.headerText}>Objektas</Text>
            </View>
            <View style={[styles.cellLast, { width: "82%" }]}>
              <Text style={styles.bodyText}>{proposal.object || "—"}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Užsakymo eilutės</Text>
        <View style={styles.grid}>
          <View style={styles.gridHeader}>
            <View style={[styles.cell, styles.colNr]}>
              <Text style={styles.headerText}>Nr.</Text>
            </View>
            <View style={[styles.cell, styles.colTile]}>
              <Text style={styles.headerText}>Plytelė</Text>
            </View>
            <View style={[styles.cell, styles.colDims]}>
              <Text style={styles.headerText}>Matmenys</Text>
            </View>
            <View style={[styles.cell, styles.colStoris]}>
              <Text style={styles.headerText}>Storis</Text>
            </View>
            <View style={[styles.cell, styles.colQty]}>
              <Text style={styles.headerText}>Kiekis</Text>
            </View>
            <View style={[styles.cell, styles.colChoices]}>
              <Text style={styles.headerText}>Pasirinkimai</Text>
            </View>
            <View style={[styles.cellLast, styles.colPack]}>
              <Text style={styles.headerText}>Pakavimas</Text>
            </View>
          </View>

          {proposal.tileLines.map((line, index) => {
            const tile = getTileById(line.tileId);
            const choices = describePackagingChoices(line.packaging).slice(0, 4);
            const packaging = describePackagingChoices(line.packaging).slice(4);

            return (
              <View key={line.id} style={styles.gridRow}>
                <View style={[styles.cell, styles.colNr]}>
                  <Text style={styles.bodyText}>{index + 1}</Text>
                </View>
                <View style={[styles.cell, styles.colTile]}>
                  <Text style={styles.bodyText}>{tile?.name ?? "—"}</Text>
                  {line.comment ? (
                    <Text style={[styles.bodyText, { color: "#6b7280", marginTop: 2 }]}>
                      {line.comment}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.cell, styles.colDims]}>
                  <Text style={styles.bodyText}>
                    {tile
                      ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                      : "—"}
                  </Text>
                </View>
                <View style={[styles.cell, styles.colStoris]}>
                  <Text style={styles.bodyText}>
                    {line.showStoris ? `${line.storisMm} mm` : "—"}
                  </Text>
                </View>
                <View style={[styles.cell, styles.colQty]}>
                  <Text style={styles.bodyText}>{line.quantityPallets} pal.</Text>
                </View>
                <View style={[styles.cell, styles.colChoices]}>
                  {choices.map((item) => (
                    <Text key={item} style={styles.bodyText}>
                      {item}
                    </Text>
                  ))}
                </View>
                <View style={[styles.cellLast, styles.colPack]}>
                  {packaging.map((item) => (
                    <Text key={item} style={styles.bodyText}>
                      {item}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {proposal.comment ? (
          <>
            <Text style={styles.sectionTitle}>Komentaras</Text>
            <View style={styles.clauseBox}>
              <Text style={styles.bodyText}>{proposal.comment}</Text>
            </View>
          </>
        ) : null}

        {proposal.extraClauses.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Papildomos sąlygos</Text>
            {proposal.extraClauses.map((clause, index) => (
              <View key={`${clause}-${index}`} style={styles.clauseBox}>
                <Text style={styles.bodyText}>{clause}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Pastaba</Text>
          <Text style={styles.bodyText}>{L_CORNER_NOTE}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · Pasiūlymas {proposal.number}</Text>
          <Text>Sugeneruota vietoje · be debesies modelio</Text>
        </View>
      </Page>
    </Document>
  );
}

