// versioningEngine.ts
// FINAL CLEAN VERSION
// Transaction-safe (via SQL RPC)
// DB-level lock enforcement (is_locked)
// Deterministic (no partial duplication)
// No Word artifacts

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { validateVersion } from "../../Core/engine/versionIntegrityEngine";
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface VersionRow {
  id: string;
  project_id: string;
  label: string;
  description?: string | null;
  is_locked?: boolean | null;
  locked_at?: string | null;
  locked_by?: string | null;
  payload?: any; // optional: if you store the full version JSON on the row
  created_by?: string | null;
  created_at?: string | null;
}

function hashJsonStable(obj: any): string {
  const json = JSON.stringify(obj);
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Load full version payload (inputs snapshot) for integrity validation.
 * Assumption (minimal, editable):
 * - `project_versions` has a JSON column `payload` containing all inputs to validate.
 * If your DB stores payload elsewhere, adapt only this function.
 */
export async function loadFullVersion(versionId: string): Promise<any> {
  const { data, error } = await supabase
    .from("project_versions")
    .select("id, payload")
    .eq("id", versionId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Version not found");

  // If payload is absent, we cannot validate deterministically
  if (data.payload === undefined || data.payload === null) {
    throw new Error("Version payload missing (cannot validate)");
  }

  return data.payload;
}

/**
 * Create empty version row.
 * (Payload population is handled elsewhere by your app.)
 */
export async function createVersion(
  projectId: string,
  label: string,
  description?: string,
  userId?: string
): Promise<VersionRow> {
  const { data, error } = await supabase
    .from("project_versions")
    .insert({
      project_id: projectId,
      label,
      description: description ?? null,
      created_by: userId ?? null
    })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Version creation failed");

  return data as VersionRow;
}

/**
 * Atomic duplication using SQL RPC (DB must guarantee all-or-nothing copy).
 * RPC expected signature:
 * - duplicate_version_atomic(source_version_id, new_label, user_id) -> new_version_id (text/uuid)
 */
export async function duplicateVersion(
  sourceVersionId: string,
  newLabel: string,
  userId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_version_atomic", {
    source_version_id: sourceVersionId,
    new_label: newLabel,
    user_id: userId
  });

  if (error) throw error;
  if (!data) throw new Error("RPC duplicate_version_atomic returned no id");

  return String(data);
}

/**
 * Activate version AFTER integrity validation.
 * Also blocks activation of locked versions only if you want (here: allowed).
 */
export async function activateVersion(
  projectId: string,
  versionId: string
): Promise<boolean> {
  const versionData = await loadFullVersion(versionId);
  const validation = validateVersion(versionData);

  if (!validation.valid) {
    throw new Error(
      "Cannot activate invalid version: " +
        JSON.stringify(validation.errors)
    );
  }

  const { error } = await supabase
    .from("projects")
    .update({ active_version_id: versionId })
    .eq("id", projectId);

  if (error) throw error;
  return true;
}

/**
 * Lock version permanently.
 * Once locked, it should be treated as immutable by the app + RPC.
 */
export async function lockVersion(
  versionId: string,
  userId?: string
): Promise<boolean> {
  const { data, error: fetchError } = await supabase
    .from("project_versions")
    .select("id, is_locked")
    .eq("id", versionId)
    .single();

  if (fetchError) throw fetchError;
  if (!data) throw new Error("Version not found");
  if (data.is_locked) throw new Error("Version already locked");

  const { error } = await supabase
    .from("project_versions")
    .update({
      is_locked: true,
      locked_at: new Date().toISOString(),
      locked_by: userId ?? null
    })
    .eq("id", versionId);

  if (error) throw error;
  return true;
}

/**
 * Snapshot = duplicate + lock + archive minimal metrics.
 * This does NOT generate PDFs; it just creates a frozen version.
 * Table assumption (minimal):
 * - investor_snapshots(project_id, version_id, metrics, hash)
 */
export async function createSnapshotFromActive(
  projectId: string,
  userId: string,
  label: string = "SNAPSHOT"
): Promise<string> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("active_version_id")
    .eq("id", projectId)
    .single();

  if (error) throw error;
  if (!project?.active_version_id) throw new Error("No active version");

  const snapshotVersionId = await duplicateVersion(
    project.active_version_id,
    label,
    userId
  );

  await lockVersion(snapshotVersionId, userId);

  const metrics = {
    snapshot_at: new Date().toISOString(),
    source_active_version_id: project.active_version_id
  };

  const hash = hashJsonStable(metrics);

  const { error: insertError } = await supabase
    .from("investor_snapshots")
    .insert({
      project_id: projectId,
      version_id: snapshotVersionId,
      metrics,
      hash
    });

  if (insertError) throw insertError;

  return snapshotVersionId;
}