// projectionEngine.ts
// Canonical Stable Version
// Entity-first via prefixed category codes
// Multi-entity (SAS + SCI)
// Distribution integrated
// Forward 12 months strict
// RealVsProjection compatible
// Deterministic
// No mutation outside state

import { processDebtMonth, Debt, DebtState } from "./debtEngine";
import { solveRent, RentConstraints } from "./rentSolver";
import { processDistribution, DistributionParams } from "./distributionEngine";
import { computeRevenueForMonth } from "./revenueCapacityEngine";
import { computeIS } from "./taxEngine";

// ============================
// TYPES
// ============================

export type CategoryCode =
  | "SAS_REVENUE"
  | "SAS_OPEX"
  | "SAS_RENT"
  | "SAS_EXP_DEBT_INTEREST"
  | "SAS_EXP_DEBT_PRINCIPAL"
  | "SAS_EXP_DEBT_INSURANCE"
  | "SAS_TAX"
  | "SAS_DISTRIBUTION_CCA"
  | "SAS_DISTRIBUTION_RESERVE"
  | "SAS_DISTRIBUTION_DIVIDENDS"
  | "SCI_RENT"
  | "SCI_DEBT_INTEREST"
  | "SCI_DEBT_PRINCIPAL"
  | "SCI_DEBT_INSURANCE"
  | "SCI_TAX"
  | "SCI_DISTRIBUTION_CCA"
  | "SCI_DISTRIBUTION_RESERVE"
  | "SCI_DISTRIBUTION_DIVIDENDS";

export interface ProjectedFlowLine {
  monthIndex: number;
  categoryCode: CategoryCode;
  amount: number;
}

export interface ProjectionInputs {
  horizonMonths: number;

  initialCash: number;
  sciInitialCash: number;

  taxRate: number;
  bufferMin: number;
  dscrMin?: number;

  phases: any[];
  revenueParams: any;
  services: any[];

  operatingCharges: {
    categoryCode: CategoryCode;
    monthlyAmount: number;
    isActive: boolean;
  }[];

  debts: { debt: Debt; state: DebtState }[];
  sciDebts: { debt: Debt; state: DebtState }[];

  sciChargesCash: number;
  sciAmortization: number;

  ccaBalanceSas: number;
ccaBalanceSci: number;
  distributableCashRate: number;
  ccaPriorityRatio: number;
  reserveStrategicRatio: number;
  reserveAfterCcaFullyRepaid: boolean;

  rentConstraints: RentConstraints;
}

interface ProjectionState {
  cash: number;
  sciCash: number;
  ccaBalanceSas: number;
ccaBalanceSci: number;
  debts: { debt: Debt; state: DebtState }[];
  sciDebts: { debt: Debt; state: DebtState }[];
}

export interface MonthlyResult {
  monthIndex: number;
  cashEnd: number;
  sciCashEnd: number;
  dscr: number;
  flows: ProjectedFlowLine[];
  projectedByCategory: Record<string, number>;
  warnings: string[];
}

// ============================
// MAIN ENGINE
// ============================

export function runProjection(inputs: ProjectionInputs): MonthlyResult[] {
  const results: MonthlyResult[] = [];

  const state: ProjectionState = {
    cash: inputs.initialCash,
    sciCash: inputs.sciInitialCash,
    ccaBalanceSas: inputs.ccaBalanceSas,
ccaBalanceSci: inputs.ccaBalanceSci,
    debts: inputs.debts.map((d) => ({ debt: d.debt, state: { ...d.state } })),
    sciDebts: inputs.sciDebts.map((d) => ({ debt: d.debt, state: { ...d.state } })),
  };

  // DSCR exclusion window: before earliest operational start of active phases
  const activePhases = (inputs.phases || []).filter((p: any) => p?.isActive);
  const firstOperationalMonth =
    activePhases.length === 0
      ? 0
      : Math.min(...activePhases.map((p: any) => p.operationalStartMonth ?? 0));

  for (let monthIndex = 0; monthIndex < inputs.horizonMonths; monthIndex++) {
    const flows: ProjectedFlowLine[] = [];
    const warnings: string[] = [];

    // ================= REVENUE =================

    const revenueOutput = computeRevenueForMonth(
      monthIndex,
      inputs.phases,
      inputs.revenueParams,
      inputs.services
    );

    const revenue = revenueOutput.totalRevenue;
    pushFlow(flows, monthIndex, "SAS_REVENUE", revenue);

    // ================= OPERATING CHARGES =================

let opex = 0;

for (const charge of inputs.operatingCharges) {
  if (!charge.isActive) continue;

  opex += charge.monthlyAmount;

  pushFlow(
    flows,
    monthIndex,
    charge.categoryCode,
    -charge.monthlyAmount
  );
}
    // ================= EXPLOITATION DEBT =================

    let expInterest = 0;
    let expPrincipal = 0;
    let expInsurance = 0;

    for (const d of state.debts) {
      const r = processDebtMonth(d.debt, d.state, monthIndex, false);
      expInterest += r.interest;
      expPrincipal += r.principal;
      expInsurance += r.insurance;
    }

    pushIfNonZero(flows, monthIndex, "SAS_EXP_DEBT_INTEREST", -expInterest);
    pushIfNonZero(flows, monthIndex, "SAS_EXP_DEBT_PRINCIPAL", -expPrincipal);
    pushIfNonZero(flows, monthIndex, "SAS_EXP_DEBT_INSURANCE", -expInsurance);

    // ================= SCI DEBT =================

    let sciInterest = 0;
    let sciPrincipal = 0;
    let sciInsurance = 0;

    for (const d of state.sciDebts) {
      const r = processDebtMonth(d.debt, d.state, monthIndex, false);
      sciInterest += r.interest;
      sciPrincipal += r.principal;
      sciInsurance += r.insurance;
    }

    pushIfNonZero(flows, monthIndex, "SCI_DEBT_INTEREST", -sciInterest);
    pushIfNonZero(flows, monthIndex, "SCI_DEBT_PRINCIPAL", -sciPrincipal);
    pushIfNonZero(flows, monthIndex, "SCI_DEBT_INSURANCE", -sciInsurance);

    // ================= RENT =================

    const rentResult = solveRent(
      {
        revenue,
        opex,
        expInterest,
        expPrincipal,
        cashStart: state.cash,
        taxRate: inputs.taxRate,
      },
      {
        chargesCash: inputs.sciChargesCash,
        sciInterest,
        sciPrincipal,
        cashStart: state.sciCash,
        taxRate: inputs.taxRate,
        amortization: inputs.sciAmortization,
      },
      inputs.rentConstraints,
      state.ccaBalanceSci <= 0
    );

    const rent = rentResult.rent;

    pushFlow(flows, monthIndex, "SAS_RENT", -rent);
    pushFlow(flows, monthIndex, "SCI_RENT", rent);

    // ================= TAX =================

    const ebitda = revenue - opex - rent;
    const rai = ebitda - expInterest;
    const tax = computeIS(rai, inputs.taxRate);

    pushIfNonZero(flows, monthIndex, "SAS_TAX", -tax);

    // ================= SCI TAX =================

// Logique P&L SCI (simplifiée mais correcte) :
// EBITDA_SCI = rent - sciChargesCash
// EBIT_SCI   = EBITDA_SCI - sciAmortization
// RAI_SCI    = EBIT_SCI - sciInterest
const sciEbitda = rent - inputs.sciChargesCash;
const sciEbit = sciEbitda - (inputs.sciAmortization ?? 0);
const sciRai = sciEbit - sciInterest;

const sciTax = computeIS(sciRai, inputs.taxRate);
pushIfNonZero(flows, monthIndex, "SCI_TAX", -sciTax);
    // ================= CASH UPDATE =================

    state.cash +=
      revenue - opex - rent - expInterest - expPrincipal - expInsurance - tax;
    state.sciCash +=
    rent
    - inputs.sciChargesCash
    - sciInterest
    - sciPrincipal
    - sciInsurance
    - sciTax;

    if (state.cash < 0) throw new Error("SAS cash invariant violated");
    if (state.sciCash < 0) throw new Error("SCI cash invariant violated");

    if (state.cash < inputs.bufferMin) warnings.push("buffer_below_minimum");

    // ================= DSCR =================
    // Rule: DSCR is NOT applicable during construction months (before firstOperationalMonth).
    // So:
    // - dscr = Infinity during excluded months
    // - no dscr_below_minimum warning during excluded months

    const debtServiceDscr = expInterest + expPrincipal;
    const dscrApplicable = monthIndex >= firstOperationalMonth;

    const dscr = !dscrApplicable
      ? Infinity
      : debtServiceDscr === 0
        ? Infinity
        : ebitda / debtServiceDscr;

    if (dscrApplicable && inputs.dscrMin !== undefined && dscr < inputs.dscrMin) {
      warnings.push("dscr_below_minimum");
    }

    // ================= DISTRIBUTION =================

    if (monthIndex % 12 === 11) {
      const forward = simulateForward12Months(
        monthIndex,
        state,
        inputs,
        firstOperationalMonth
      );

      const sciDistributionParams: DistributionParams = {
        cashEndOfYear: state.sciCash,
        bufferMin: inputs.bufferMin,
        distributableCashRate: inputs.distributableCashRate,
        ccaOutstanding: state.ccaBalanceSci,
        ccaPriorityRatio: inputs.ccaPriorityRatio,
        reserveStrategicRatio: inputs.reserveStrategicRatio,
        reserveAfterCcaFullyRepaid: inputs.reserveAfterCcaFullyRepaid,
        dscrMin: inputs.dscrMin,
      };
      
      const sciDistribution = processDistribution(sciDistributionParams, forward.sci);

      if (sciDistribution.allowed) {
        state.sciCash -=
          sciDistribution.ccaRepayment +
          sciDistribution.reserveAllocation +
          sciDistribution.dividends;
      
        state.ccaBalanceSci -= sciDistribution.ccaRepayment;
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_CCA",
          -sciDistribution.ccaRepayment
        );
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_RESERVE",
          -sciDistribution.reserveAllocation
        );
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_DIVIDENDS",
          -sciDistribution.dividends
        );
      }

      const distributionParams: DistributionParams = {
        cashEndOfYear: state.cash,
        bufferMin: inputs.bufferMin,
        distributableCashRate: inputs.distributableCashRate,
        ccaOutstanding: state.ccaBalanceSas,
        ccaPriorityRatio: inputs.ccaPriorityRatio,
        reserveStrategicRatio: inputs.reserveStrategicRatio,
        reserveAfterCcaFullyRepaid: inputs.reserveAfterCcaFullyRepaid,
        dscrMin: inputs.dscrMin,
      };

      const distribution = processDistribution(distributionParams, forward.sas);

      if (distribution.allowed) {
        state.cash -=
          distribution.ccaRepayment +
          distribution.reserveAllocation +
          distribution.dividends;

          state.ccaBalanceSas -= distribution.ccaRepayment;

        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_CCA",
          -distribution.ccaRepayment
        );
        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_RESERVE",
          -distribution.reserveAllocation
        );
        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_DIVIDENDS",
          -distribution.dividends
        );
      } else {
        warnings.push(`distribution_blocked:${distribution.reason ?? "unknown"}`);
      }
    } // ✅ fermeture du if (monthIndex % 12 === 11)

    results.push({
      monthIndex,
      cashEnd: state.cash,
      sciCashEnd: state.sciCash,
      dscr,
      flows,
      projectedByCategory: aggregateByCategory(flows),
      warnings,
    });
  } // ✅ fermeture du for

  return results;
} // ✅ fermeture de runProjection

// ============================
// FORWARD SIMULATION
// ============================

function simulateForward12Months(
  startMonth: number,
  state: ProjectionState,
  inputs: ProjectionInputs,
  firstOperationalMonth: number
) {
  const snapshot: ProjectionState = {
    cash: state.cash,
    sciCash: state.sciCash,
    ccaBalanceSas: state.ccaBalanceSas,
    ccaBalanceSci: state.ccaBalanceSci,
    debts: snapshotDebts(state.debts),
    sciDebts: snapshotDebts(state.sciDebts),
  };

  const forwardSas: { monthIndex: number; cash: number; dscr: number }[] = [];
const forwardSci: { monthIndex: number; cash: number; dscr: number }[] = [];

  for (let i = 1; i <= 12; i++) {

    const month = startMonth + i;

    const revenueOutput = computeRevenueForMonth(
      month,
      inputs.phases,
      inputs.revenueParams,
      inputs.services
    );

    const revenue = revenueOutput.totalRevenue;
    let opex = 0;

for (const charge of inputs.operatingCharges) {
  if (!charge.isActive) continue;
  opex += charge.monthlyAmount;
}

    let expInterest = 0;
    let expPrincipal = 0;

    for (const d of snapshot.debts) {
      const r = processDebtMonth(d.debt, d.state, month, false);
      expInterest += r.interest;
      expPrincipal += r.principal;
    }
    let sciInterest = 0;
let sciPrincipal = 0;

for (const d of snapshot.sciDebts) {
  const r = processDebtMonth(d.debt, d.state, month, false);
  sciInterest += r.interest;
  sciPrincipal += r.principal;
}
    const rentResult = solveRent(
      {
        revenue,
        opex,
        expInterest,
        expPrincipal,
        cashStart: snapshot.cash,
        taxRate: inputs.taxRate,
      },
      {
        chargesCash: inputs.sciChargesCash,
        sciInterest,
        sciPrincipal,
        cashStart: snapshot.sciCash,
        taxRate: inputs.taxRate,
        amortization: inputs.sciAmortization,
      },
      inputs.rentConstraints,
      snapshot.ccaBalanceSci <= 0
    );
    
    const rent = rentResult.rent;
    const ebitda = revenue - opex - rent;

    const dscrBase = expInterest + expPrincipal;
    const dscrApplicable = month >= firstOperationalMonth;

    const dscr =
      !dscrApplicable
        ? Infinity
        : (dscrBase === 0 ? Infinity : ebitda / dscrBase);

        snapshot.cash += revenue - opex - rent - expInterest - expPrincipal;
        snapshot.sciCash += rent - inputs.sciChargesCash - sciInterest - sciPrincipal;
        forwardSas.push({
          monthIndex: month,
          cash: snapshot.cash,
          dscr
        });
        
        forwardSci.push({
          monthIndex: month,
          cash: snapshot.sciCash,
          dscr
        });
  }

  return {
    sas: forwardSas,
    sci: forwardSci
  };
}

// ============================
// HELPERS
// ============================

function snapshotDebts(list: { debt: Debt; state: DebtState }[]) {
  return list.map((d) => ({ debt: d.debt, state: { ...d.state } }));
}

function pushFlow(
  flows: ProjectedFlowLine[],
  monthIndex: number,
  categoryCode: CategoryCode,
  amount: number
) {
  flows.push({ monthIndex, categoryCode, amount });
}

function pushIfNonZero(
  flows: ProjectedFlowLine[],
  monthIndex: number,
  categoryCode: CategoryCode,
  amount: number
) {
  if (amount !== 0) {
    flows.push({ monthIndex, categoryCode, amount });
  }
}

function aggregateByCategory(flows: ProjectedFlowLine[]): Record<string, number> {
  const agg: Record<string, number> = {};

  for (const f of flows) {
    agg[f.categoryCode] = (agg[f.categoryCode] || 0) + f.amount;
  }

  return agg;
} // ✅ fermeture de aggregateByCategory