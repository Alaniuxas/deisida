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
  formatPieceQuantity,
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
    borderBottom: `2pt solid ${brand.gray}`,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    color: brand.gray,
  },
  subtitle: {
    fontSize: 8,
    color: brand.muted,
    marginTop: 2,
  },
  metaBlock: { width: "48%" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
    gap: 6,
  },
  metaLabel: { color: brand.muted },
  metaValue: { fontWeight: "bold" },
  lineCard: {
    border: `1pt solid ${brand.line}`,
    backgroundColor: brand.panel,
    padding: 10,
    marginBottom: 10,
  },
  lineTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: brand.gray,
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  field: {
    width: "48%",
    marginBottom: 4,
  },
  fieldWide: {
    width: "100%",
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 6.5,
    color: brand.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontWeight: "bold",
  },
  fieldValue: {
    fontSize: 8,
  },
  sectionDivider: {
    borderTop: `1pt solid ${brand.line}`,
    marginTop: 6,
    paddingTop: 6,
  },
  sectionLabel: {
    fontSize: 6.5,
    color: brand.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
    fontWeight: "bold",
  },
  bullet: {
    fontSize: 7.5,
    marginBottom: 2,
  },
  prodComment: {
    marginTop: 6,
    border: `1pt solid ${brand.red}`,
    borderRadius: 2,
    backgroundColor: brand.paper,
    padding: 6,
  },
  prodCommentTitle: {
    fontSize: 6.5,
    color: brand.red,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontWeight: "bold",
  },
  globalComment: {
    border: `1pt solid ${brand.line}`,
    padding: 8,
    marginBottom: 10,
  },
  noteBox: {
    borderTop: `1pt solid ${brand.line}`,
    paddingTop: 8,
    marginTop: 4,
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

export function ProductionProposalDocument({ proposal }: { proposal: Proposal }) {
  return (
    <Document title={`Gamyba ${proposal.number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>GAMYBOS UŽDUOTIS</Text>
            <Text style={styles.subtitle}>DEISIDA · cechui ir gamybos eilei</Text>
          </View>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Užsakymo Nr.</Text>
              <Text style={styles.metaValue}>{proposal.number}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Terminas</Text>
              <Text style={styles.metaValue}>
                {formatLtDate(proposal.serviceDeadline)}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Klientas / objektas</Text>
              <Text style={styles.metaValue}>
                {proposal.client || "—"} · {proposal.object || "—"}
              </Text>
            </View>
          </View>
        </View>

        {proposal.tileLines.map((line, index) => {
          const tile = getTileById(line.tileId);
          return (
            <View key={line.id} style={styles.lineCard}>
              <Text style={styles.lineTitle}>Eilutė {index + 1}</Text>
              <View style={styles.grid}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Plytelė</Text>
                  <Text style={styles.fieldValue}>{tile?.name ?? "—"}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Baras / pjūvis</Text>
                  <Text style={styles.fieldValue}>{line.pjovimas}</Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Pjovimo storis</Text>
                  <Text style={styles.fieldValue}>
                    {line.showStoris ? `${line.storisMm} mm` : "—"}
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Kiekis</Text>
                  <Text style={styles.fieldValue}>{formatPieceQuantity(line)}</Text>
                </View>
                {tile ? (
                  <View style={styles.fieldWide}>
                    <Text style={styles.fieldLabel}>Matmenys</Text>
                    <Text style={styles.fieldValue}>
                      {formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)}
                    </Text>
                  </View>
                ) : null}
                {tile?.disc ? (
                  <View style={styles.fieldWide}>
                    <Text style={styles.fieldLabel}>Diskas</Text>
                    <Text style={styles.fieldValue}>{tile.disc}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionDivider}>
                <Text style={styles.sectionLabel}>Pakavimas ir operacijos</Text>
                {describePackagingChoices(line.packaging).map((item) => (
                  <Text key={item} style={styles.bullet}>
                    • {item}
                  </Text>
                ))}
              </View>

              {line.comment.trim() ? (
                <View style={styles.prodComment}>
                  <Text style={styles.prodCommentTitle}>Gamybos komentaras</Text>
                  <Text style={styles.fieldValue}>{line.comment.trim()}</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        {proposal.comment ? (
          <View style={styles.globalComment}>
            <Text style={styles.sectionLabel}>Bendras gamybos komentaras</Text>
            <Text style={styles.fieldValue}>{proposal.comment}</Text>
          </View>
        ) : null}

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>L-kampų pastaba</Text>
          <Text>{L_CORNER_NOTE}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>DEISIDA · Gamyba {proposal.number}</Text>
          <Text>Vidaus dokumentas</Text>
        </View>
      </Page>
    </Document>
  );
}
