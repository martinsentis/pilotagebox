// Test du moteur de rapprochement sur l'extract AlloBox réel.
// Usage : node scripts/testReconciliation.cjs "<chemin xlsx>"
const path = require("path");
const XLSX = require("xlsx");

// charge le module compilé (dist) si présent, sinon transpile à la volée non géré ici
const { parseRow, buildMonthlySynthesis } = require("../dist/Core/engine/reconciliation/reconcile.js");

const FILE =
  process.argv[2] ||
  "/Users/admin/Library/CloudStorage/GoogleDrive-martin.sentis@gmail.com/Mon Drive/Perso Lenovo/1 - Immobilier/Contrôle de gestion & pilotage/Extracts/Extract AlloBox.xlsx";

const wb = XLSX.readFile(FILE);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

// Trouver la ligne d'en-tête "Date | Libellé | Débit | Crédit"
let headerIdx = rows.findIndex(
  (r) => Array.isArray(r) && String(r[0]).toLowerCase() === "date" && String(r[1]).toLowerCase().includes("libell")
);
if (headerIdx < 0) headerIdx = 11;

const dataRows = rows.slice(headerIdx + 1).filter((r) => {
  if (!r || !r[1]) return false;
  // ignorer les lignes d'en-tête répétées (pagination de l'export bancaire)
  if (String(r[1]).trim().toLowerCase() === "libellé") return false;
  if (String(r[0]).trim().toLowerCase() === "date") return false;
  // la date doit être un nombre (série Excel) ou contenir des chiffres
  if (typeof r[0] !== "number" && !/\d/.test(String(r[0] ?? ""))) return false;
  return true;
});

const parsed = dataRows.map((r) =>
  parseRow({ dateSerial: r[0], label: r[1], debit: r[2], credit: r[3] })
);

console.log(`Lignes parsées : ${parsed.length}`);

// Répartition par bucket
const buckets = {};
for (const l of parsed) buckets[l.cat.bucket] = (buckets[l.cat.bucket] || 0) + 1;
console.log("Répartition par bucket :", buckets);

const synth = buildMonthlySynthesis(parsed);
const fmt = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

for (const m of synth) {
  console.log("\n========================================");
  console.log(`MOIS ${m.periodMonth}`);
  console.log("========================================");
  console.log(`  CA Box net HT       : ${fmt(m.caBoxNetHT)}`);
  console.log(`  (dont impayés TTC)  : ${fmt(m.impayesTTC)}`);
  console.log(`  Charges :`);
  for (const [code, c] of Object.entries(m.chargesByLabel)) {
    console.log(`    - ${code.padEnd(34)} [${c.category}] HT ${fmt(c.ht)}  (TTC ${fmt(c.ttc)})`);
  }
  console.log(`  Total charges HT    : ${fmt(m.totalChargesHT)}`);
  console.log(`  EBE avant loyer HT  : ${fmt(m.ebeAvantLoyerHT)}`);
  console.log(`  Exclus (info)       : ${fmt(m.exclusTTC)}`);
  if (m.unknown.length) {
    console.log(`  ⚠️  À ventiler (${m.unknown.length}) :`);
    for (const u of m.unknown) console.log(`      ${u.date}  ${fmt(u.amountTTC)}  ${u.label.slice(0, 50)}`);
  }
}
