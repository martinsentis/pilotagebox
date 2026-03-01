// projection.orchestrator.ts
// Coordination layer between Supabase persistence and projection engine
// No business logic here

import { MonthlyResult } from "../engine/projectionEngine";

export interface ProjectionRunResult {
  versionId: string;
  results: MonthlyResult[];
}

export async function runProjectionForVersion(
  versionId: string
): Promise<ProjectionRunResult> {

  // =========================
  // 1️⃣ Load version data (TODO: Supabase queries)
  // =========================

  // TODO:
  // - load revenue_parameters
  // - load capacity_phases
  // - load services
  // - load opex
  // - load debts
  // - load distribution_rules
  // - load rent_constraints

  // throw new Error("Supabase loading not implemented yet");

  // =========================
  // 2️⃣ Build ProjectionInputs
  // =========================

  /*
  const projectionInputs: ProjectionInputs = {
    horizonMonths: 240,
    initialCash: 0,
    taxRate: 0.25,
    bufferMin: 0,

    phases: [],
    revenueParams: {},
    services: [],

    fixedCharges: [],
    variableCharges: [],
    hrPositions: [],
    leases: [],
    bankingFees: 0,

    debts: [],
    sciChargesCash: 0,
    sciAmortization: 0,
    sciDebts: [],
    sciInitialCash: 0,

    ccaBalance: 0,
    distributableCashRate: 1,
    ccaPriorityRatio: 1,
    reserveStrategicRatio: 0,
    reserveAfterCcaFullyRepaid: true,

    rentConstraints: {
      mode: "AUTONOMY_SCI",
      buffer: 0
    }
  };
  */

  // =========================
  // 3️⃣ Run projection
  // =========================

  /*
  const results = runProjection(projectionInputs);

  // =========================
  // 4️⃣ Persist projected_monthly_results
  // =========================

  // TODO: bulk insert into Supabase

  return {
    versionId,
    results
  };
  */
  return {
    versionId,
    results: [] as MonthlyResult[]
  };
}