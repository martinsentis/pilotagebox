// reconcile.ts
// Moteur de rapprochement bancaire — LOGIQUE PURE (pas de Supabase, pas d'I/O)
// Réf. spec : MODULE_RAPPROCHEMENT.md
// Déterministe, testable en isolé sur un extract réel.

// ============================================================
// TYPES
// ============================================================

export type Bucket = "CA_BOX" | "CHARGE" | "EXCLU" | "UNKNOWN";

export interface RawRow {
  dateSerial: number | string; // série Excel ou "YYYY-MM-DD"
  label: string;               // libellé brut (peut contenir des \n)
  debit: number | null;        // positif
  credit: number | null;       // positif
}

export interface Categorization {
  bucket: Bucket;
  labelCode: string | null;    // code stable du label cockpit (ex: "assurance_des_box")
  category: string | null;     // catégorie cockpit (ex: "Administratif")
  vatRate: number;             // taux TVA appliqué
  isImpaye: boolean;           // pour visibilité (déduit du CA)
}

export interface ParsedLine {
  date: string;                // YYYY-MM-DD
  periodMonth: string;         // YYYY-MM
  rawLabel: string;
  signature: string;           // libellé normalisé stable (clé mémoire)
  amountTTC: number;           // SIGNÉ : crédit > 0, débit < 0
  amountHT: number;            // dérivé via vatRate (0 si EXCLU/UNKNOWN)
  cat: Categorization;
}

// ============================================================
// NORMALISATION & SIGNATURE
// ============================================================

export function normalizeLabel(raw: string): string {
  return String(raw ?? "")
    .replace(/\n/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/\s+/g, " ")
    .trim();
}

// Signature stable pour la mémoire : on retire les références volatiles
// (IDs de transaction, dates, IBAN/ICS) mais on GARDE les numéros de contrat.
export function buildSignature(raw: string): string {
  let s = normalizeLabel(raw);
  s = s
    .replace(/\bi\d{6,}\b/g, " ")              // IDs transaction "i0000960448741"
    .replace(/\b00ax\d+\b/g, " ")              // réf interne AX
    .replace(/\bfr\d{2}zzz\w+\b/g, " ")        // ICS créancier FR..ZZZ..
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, " ") // dates jj/mm/aa
    .replace(/\b\d{10,}\b/g, " ")              // longues séquences (réf paiement)
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

// ============================================================
// RÈGLES (dérivées du réel AlloBox — cf. spec §7)
// Ordre = priorité : la première qui matche gagne.
// ============================================================

interface Rule {
  any: string[];               // matche si le libellé normalisé CONTIENT l'un de ces motifs
  all?: string[];              // ET contient tous ceux-ci (discriminant, ex: n° contrat)
  bucket: Bucket;
  labelCode?: string;
  category?: string;
  vatRate?: number;
  isImpaye?: boolean;
}

const RULES: Rule[] = [
  // --- CA Box : impayés (débit → réduit le CA, visible) ---
  { any: ["impaye"], bucket: "CA_BOX", vatRate: 0.2, isImpaye: true },

  // --- Exclusions (hors exploitation) ---
  { any: ["remboursement de pret", "realisation de pret"], bucket: "EXCLU" },
  { any: ["dgfip", "b2b dgfip"], bucket: "EXCLU" },           // TVA
  { any: ["sie muret"], bucket: "EXCLU" },                    // remb. TVA DGFiP
  { any: ["sci candie", "s.c.i. candie", "web csb", "vers csb", "vir inst vers csb"], bucket: "EXCLU" }, // loyer SCI / intra
  { any: ["assu. caae pret", "caae pret profession"], bucket: "EXCLU" }, // assurance crédit (liée prêt)
  // Fournisseurs travaux / CAPEX
  { any: ["stgc", "belpro", "thirard", "color pub", "sas brunet", "bryt developpe", "mondial extincteur",
          "morgan phuc", "rumaiz sameen", "jerome salort", "ubicx developpemen "], bucket: "EXCLU" },

  // --- Charges récurrentes → labels cockpit ---
  { any: ["axa"], all: ["063704"], bucket: "CHARGE", labelCode: "assurance_des_box", category: "Administratif", vatRate: 0.2 },
  { any: ["axa"], all: ["457504"], bucket: "CHARGE", labelCode: "assurance_activite_stockage", category: "Administratif", vatRate: 0.2 },
  { any: ["axa"], bucket: "CHARGE", labelCode: "assurance_des_box", category: "Administratif", vatRate: 0.2 }, // AXA sans n° → défaut box
  { any: ["ubicx", "buxida"], bucket: "CHARGE", labelCode: "outil_gestion_erp", category: "Exploitation", vatRate: 0.2 },
  { any: ["scm local"], bucket: "CHARGE", labelCode: "abonnement_leboncoin", category: "Marketing", vatRate: 0.2 },
  { any: ["hellocse", "sylarele", "helloce"], bucket: "CHARGE", labelCode: "abonnement_plateforme_diffusion", category: "Marketing", vatRate: 0.2 },
  { any: ["google"], bucket: "CHARGE", labelCode: "google_ads", category: "Marketing", vatRate: 0.2 },
  { any: ["location-gardemeub", "location gardemeub"], bucket: "CHARGE", labelCode: "abonnement_plateforme_diffusion", category: "Marketing", vatRate: 0.2 },
  { any: ["up2pay", "location equipement de paiement", "generation de liens"], bucket: "CHARGE", labelCode: "logiciel_paiement", category: "Exploitation", vatRate: 0.2 },
  { any: ["ovh"], bucket: "CHARGE", labelCode: "hebergement_site_web", category: "Marketing", vatRate: 0.2 },
  { any: ["lovable"], bucket: "CHARGE", labelCode: "outil_creation_site", category: "Marketing", vatRate: 0.2 },

  // --- Frais bancaires (Administratif) ---
  { any: ["cotisation", "commission", "frais de rejet", "frais d'emission", "frais d emission",
          "frais de prestation", "frais de dossier", "frais enregistre", "ediweb",
          "installation vente a distance", "demande identifiant", "modification de date",
          "cotisation carte", "frais"], bucket: "CHARGE", labelCode: "frais_bancaires", category: "Administratif", vatRate: 0.2 },

  // --- Dépenses carte (variable, hétérogène) → à ventiler ---
  { any: ["depenses carte"], bucket: "UNKNOWN" },

  // --- CA Box : encaissements ---
  { any: ["avis de prelevement emis", "remise carte", "mangopay", "stripe", "costockage",
          "decottignies"], bucket: "CA_BOX", vatRate: 0.2 },
];

export function categorize(rawLabel: string): Categorization {
  const n = normalizeLabel(rawLabel);
  for (const r of RULES) {
    const hitAny = r.any.some((p) => n.includes(p));
    if (!hitAny) continue;
    if (r.all && !r.all.every((p) => n.includes(p))) continue;
    return {
      bucket: r.bucket,
      labelCode: r.labelCode ?? null,
      category: r.category ?? null,
      vatRate: r.vatRate ?? 0,
      isImpaye: r.isImpaye ?? false,
    };
  }
  return { bucket: "UNKNOWN", labelCode: null, category: null, vatRate: 0, isImpaye: false };
}

// ============================================================
// PARSING
// ============================================================

// Date série Excel → "YYYY-MM-DD" (epoch Excel = 1899-12-30)
function excelSerialToDate(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function toDate(v: number | string): string {
  if (typeof v === "number") return excelSerialToDate(v);
  const s = String(v).trim();
  // déjà ISO ?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // jj/mm/aaaa
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (m) {
    const yy = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${yy}-${m[2]}-${m[1]}`;
  }
  return s.slice(0, 10);
}

export function parseRow(row: RawRow): ParsedLine {
  const date = toDate(row.dateSerial);
  const periodMonth = date.slice(0, 7);
  const credit = Number(row.credit ?? 0);
  const debit = Number(row.debit ?? 0);
  const amountTTC = credit > 0 ? credit : -debit; // signé
  const cat = categorize(row.label);
  const amountHT =
    cat.bucket === "EXCLU" || cat.bucket === "UNKNOWN" || cat.vatRate === 0
      ? amountTTC
      : amountTTC / (1 + cat.vatRate);
  return {
    date,
    periodMonth,
    rawLabel: String(row.label ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
    signature: buildSignature(row.label),
    amountTTC: round2(amountTTC),
    amountHT: round2(amountHT),
    cat,
  };
}

// ============================================================
// SYNTHÈSE MENSUELLE
// ============================================================

export interface MonthlySynthesis {
  periodMonth: string;
  caBoxNetHT: number;        // CA Box net HT (encaissements − impayés − remboursements)
  impayesTTC: number;        // montant impayés du mois (positif, pour visibilité)
  chargesByLabel: Record<string, { category: string; ht: number; ttc: number }>;
  totalChargesHT: number;
  ebeAvantLoyerHT: number;   // CA Box HT − charges HT (loyer SCI exclu, traité à part)
  exclusTTC: number;         // somme exclusions (info)
  unknown: { date: string; label: string; amountTTC: number }[]; // à ventiler
}

export function buildMonthlySynthesis(lines: ParsedLine[]): MonthlySynthesis[] {
  const byMonth = new Map<string, ParsedLine[]>();
  for (const l of lines) {
    if (!byMonth.has(l.periodMonth)) byMonth.set(l.periodMonth, []);
    byMonth.get(l.periodMonth)!.push(l);
  }

  const out: MonthlySynthesis[] = [];
  for (const [periodMonth, ls] of [...byMonth.entries()].sort()) {
    let caBoxNetHT = 0;
    let impayesTTC = 0;
    let exclusTTC = 0;
    let totalChargesHT = 0;
    const chargesByLabel: MonthlySynthesis["chargesByLabel"] = {};
    const unknown: MonthlySynthesis["unknown"] = [];

    for (const l of ls) {
      switch (l.cat.bucket) {
        case "CA_BOX":
          caBoxNetHT += l.amountHT;
          if (l.cat.isImpaye) impayesTTC += Math.abs(l.amountTTC);
          break;
        case "CHARGE": {
          const code = l.cat.labelCode ?? "autre";
          if (!chargesByLabel[code]) chargesByLabel[code] = { category: l.cat.category ?? "Autre", ht: 0, ttc: 0 };
          // charge = sortie (débit, montant négatif) → on cumule en valeur absolue
          chargesByLabel[code].ht += Math.abs(l.amountHT);
          chargesByLabel[code].ttc += Math.abs(l.amountTTC);
          totalChargesHT += Math.abs(l.amountHT);
          break;
        }
        case "EXCLU":
          exclusTTC += Math.abs(l.amountTTC);
          break;
        case "UNKNOWN":
          unknown.push({ date: l.date, label: l.rawLabel, amountTTC: l.amountTTC });
          break;
      }
    }

    out.push({
      periodMonth,
      caBoxNetHT: round2(caBoxNetHT),
      impayesTTC: round2(impayesTTC),
      chargesByLabel,
      totalChargesHT: round2(totalChargesHT),
      ebeAvantLoyerHT: round2(caBoxNetHT - totalChargesHT),
      exclusTTC: round2(exclusTTC),
      unknown,
    });
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
