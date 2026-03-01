// realImportEngine.ts
// REAL IMPORT ENGINE — CLEAN VERSION
// Deterministic (same input -> same hash)
// No projection mutation
// Compatible Build Tracking / Real vs Projection (data-level only)
// Full traceability via import batches

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import * as crypto from "node:crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ImportInput {
  projectId: string;
  bankAccountId: string;
  fileBuffer: Buffer;
  fileName: string;
  importedBy: string;
}

type CsvRow = {
  date?: string;
  amount?: string | number;
  description?: string;
};

function normalize(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function generateHashSignature(
  transactionDate: string,
  amount: number,
  normalizedDescription: string,
  projectId: string
): string {
  const raw = `${transactionDate}_${amount}_${normalizedDescription}_${projectId}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function isDuplicate(
  projectId: string,
  hashSignature: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("id")
    .eq("project_id", projectId)
    .eq("hash_signature", hashSignature)
    .limit(1);

  if (error) throw error;
  return !!(data && data.length > 0);
}

/**
 * Minimal auto-classification:
 * - Load active categories for project
 * - For each category, load keywords
 * - Score if normalized description includes keyword
 * NOTE: This is deterministic but potentially slow (N+1). Optimizations can come later.
 */
async function classifyTransaction(
  projectId: string,
  description: string
): Promise<string | null> {
  const normalizedDesc = normalize(description);

  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("id")
    .eq("project_id", projectId)
    .eq("is_active", true);

  if (catErr) throw catErr;
  if (!categories || categories.length === 0) return null;

  let bestCategory: string | null = null;
  let bestScore = 0;

  for (const cat of categories as any[]) {
    const { data: keywords, error: kwErr } = await supabase
      .from("category_keywords")
      .select("keyword, priority")
      .eq("category_id", cat.id);

    if (kwErr) throw kwErr;
    if (!keywords) continue;

    let score = 0;

    for (const kw of keywords as any[]) {
      const k = normalize(kw.keyword);
      if (!k) continue;
      if (normalizedDesc.includes(k)) {
        score += Number(kw.priority ?? 1);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat.id;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

export async function importTransactions(
  input: ImportInput
): Promise<{ batchId: string; insertedCount: number }> {
  // 1) Parse CSV
  const records = parse(input.fileBuffer, {
    columns: true,
    skip_empty_lines: true
  }) as CsvRow[];

  // 2) Create import batch
  const { data: batch, error: batchErr } = await supabase
    .from("transaction_import_batches")
    .insert({
      project_id: input.projectId,
      bank_account_id: input.bankAccountId,
      file_name: input.fileName,
      imported_by: input.importedBy
    })
    .select("id")
    .single();

  if (batchErr) throw batchErr;
  if (!batch) throw new Error("Batch creation failed");

  let insertedCount = 0;

  // 3) Process each transaction
  for (const row of records) {
    const transactionDate = String(row.date ?? "").trim();
    const amount = Number(row.amount);
    const description = String(row.description ?? "");

    if (!transactionDate || Number.isNaN(amount)) continue;

    const normalized = normalize(description);

    const hash = generateHashSignature(
      transactionDate,
      amount,
      normalized,
      input.projectId
    );

    const duplicate = await isDuplicate(input.projectId, hash);
    if (duplicate) continue;

    const categoryId = await classifyTransaction(input.projectId, description);

    const { error: insErr } = await supabase.from("bank_transactions").insert({
      project_id: input.projectId,
      bank_account_id: input.bankAccountId,
      batch_id: batch.id,
      transaction_date: transactionDate,
      amount,
      description_raw: description,
      description_normalized: normalized,
      hash_signature: hash,

      // Classification model (per your decision: 1 active classification with status)
      category_id: categoryId,
      confirm_level_1: true,
      confirm_level_2: false
    });

    if (insErr) throw insErr;
    insertedCount += 1;
  }

  return { batchId: String(batch.id), insertedCount };
}

export async function confirmTransaction(
  transactionId: string,
  categoryId: string
): Promise<void> {
  const { error } = await supabase
    .from("bank_transactions")
    .update({
      category_id: categoryId,
      confirm_level_2: true
    })
    .eq("id", transactionId);

  if (error) throw error;
}

/**
 * Aggregation for BUILD tracking (REAL side)
 * Minimal assumption:
 * - bank_transactions joins categories with category_type
 * - amounts for build are identified by categories.category_type === "BUILD"
 */
export async function aggregateBuildCapexReal(
  projectId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("bank_transactions")
    .select(
      "amount, category_id, categories(category_type)"
    )
    .eq("project_id", projectId)
    .eq("confirm_level_2", true);

  if (error) throw error;
  if (!data) return 0;

  let totalBuild = 0;

  for (const tx of data as any[]) {
    if (tx.categories?.category_type === "BUILD") {
      totalBuild += Number(tx.amount ?? 0);
    }
  }

  return totalBuild;
}