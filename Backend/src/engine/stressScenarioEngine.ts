// stressScenarioEngine.ts
// STRESS SCENARIO ENGINE
// Deterministic
// No mutation (clones inputs)
// Compatible ProjectionEngine
// NOTE: this engine applies a one-shot shock on params; temporal window kept for future extension.

import { runProjection } from "./projectionEngine";

export interface StressScenario {
  revenueShockPercent?: number;      // ex: -0.1 = -10%
  opexShockPercent?: number;         // ex: +0.1 = +10%
  occupancyShockPercent?: number;    // ex: -0.15
  durationMonths?: number;           // shock duration (reserved)
  startMonth?: number;               // default = 0 (reserved)
}

export interface StressResult {
  cashMinimum: number;
  monthOfCashBreach: number | null;
  dscrMinimum: number;
  monthOfDscrBreach: number | null;
  survivalMonths: number;
  stressedProjection: any[];
}

export function runStressScenario(
  projectionInputs: any,
  scenario: StressScenario
): StressResult {

  const stressedInputs = JSON.parse(JSON.stringify(projectionInputs));

  // Reserved (not used yet, but kept to avoid changing interface)
  const _startMonth = scenario.startMonth ?? 0;
  const _duration = scenario.durationMonths ?? 12;
  void _startMonth;
  void _duration;

  // ======================
  // REVENUE SHOCK
  // ======================

  if (
    scenario.revenueShockPercent !== undefined &&
    stressedInputs.revenueParams?.basePricePerM2 !== undefined
  ) {
    stressedInputs.revenueParams.basePricePerM2 *=
      (1 + scenario.revenueShockPercent);
  }

  if (
    scenario.occupancyShockPercent !== undefined &&
    stressedInputs.revenueParams?.occupancyTarget !== undefined
  ) {
    stressedInputs.revenueParams.occupancyTarget *=
      (1 + scenario.occupancyShockPercent);
  }

  // ======================
  // OPEX SHOCK
  // ======================

  const opexShock = scenario.opexShockPercent;

  if (opexShock !== undefined && Array.isArray(stressedInputs.fixedCharges)) {
    stressedInputs.fixedCharges =
      stressedInputs.fixedCharges.map((c: any) => ({
        ...c,
        base_amount: c.base_amount * (1 + opexShock)
      }));
  }

  // ======================
  // RUN PROJECTION
  // ======================

  const projection = runProjection(stressedInputs);

  // ======================
  // ANALYSIS
  // ======================

  let cashMin = Infinity;
  let cashBreach: number | null = null;

  let dscrMin = Infinity;
  let dscrBreach: number | null = null;

  for (const month of projection) {

    if (month.cashEnd < cashMin) cashMin = month.cashEnd;

    if (month.cashEnd < 0 && cashBreach === null) {
      cashBreach = month.monthIndex;
    }

    if (month.dscr < dscrMin) dscrMin = month.dscr;

    if (
      stressedInputs.dscrMin !== undefined &&
      month.dscr < stressedInputs.dscrMin &&
      dscrBreach === null
    ) {
      dscrBreach = month.monthIndex;
    }
  }

  const survivalMonths =
    cashBreach !== null ? cashBreach : projection.length;

  return {
    cashMinimum: cashMin,
    monthOfCashBreach: cashBreach,
    dscrMinimum: dscrMin,
    monthOfDscrBreach: dscrBreach,
    survivalMonths,
    stressedProjection: projection
  };
}