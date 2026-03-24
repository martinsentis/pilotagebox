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
import { processTaxMonth, TaxState, TaxSchedulePeriod, DEFAULT_TAX_SCHEDULES } from "./taxEngine";
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
  | "SCI_OTHER_REVENUE"
  | "SCI_CHARGES"
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

  projectStartDate: string;
  taxSchedules: TaxSchedulePeriod[];

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
  sciOtherRevenuesMonthly?: number;  // autres revenus SCI (parking, locaux annexes…)

  ccaBalanceSas: number;
  ccaBalanceSci: number;
  distributableCashRate: number;
  ccaPriorityRatio: number;
  reserveStrategicRatio: number;
  reserveAfterCcaFullyRepaid: boolean;

  rentConstraints: RentConstraints;

  // Optional layers used by other engines (currently typés larges)
  capexItems?: any[];
  assets?: any[];
  equityContributions?: any[];
  distributions?: any[];
  rentPlanPhases?: any[];
  capacityProjects?: any[];
}

interface ProjectionState {
  cash: number;
  sciCash: number;
  ccaBalanceSas: number;
  ccaBalanceSci: number;

  debts: { debt: Debt; state: DebtState }[];
  sciDebts: { debt: Debt; state: DebtState }[];

  taxStateSas: TaxState;
  taxStateSci: TaxState;
}

export interface MonthlyResult {
  monthIndex: number;
  cashEnd: number;
  sciCashEnd: number;
  dscr: number;

  // Surface — calculée par le backend, prête à afficher
  leasedSurface: number;        // m² effectivement loués ce mois
  activeSurface: number;        // m² physiquement ouverts ce mois
  leasedSurfacePercent: number; // % = leasedSurface / activeSurface (0→1), 0 si activeSurface=0

  // Amortissement SCI — répercuté depuis les inputs pour affichage direct
  sciAmortization: number;

  flows: ProjectedFlowLine[];
  projectedByCategory: Record<string, number>;
  warnings: string[];
}

// ============================
// MAIN ENGINE
// ============================

export function runProjection(rawInputs: ProjectionInputs): MonthlyResult[] {

  const inputs: ProjectionInputs = {
    ...rawInputs,
  
    phases: rawInputs.phases ?? [],
    revenueParams: rawInputs.revenueParams ?? {
      pricePerM2: 0,
      targetLeasedSurfacePercent: 0,
      annualIndexationRate: 0,
      indexationMonth: 0
    },

    services: rawInputs.services ?? [],
    operatingCharges: rawInputs.operatingCharges ?? [],
    debts: rawInputs.debts ?? [],
    sciDebts: rawInputs.sciDebts ?? [],
  
    capexItems: rawInputs.capexItems ?? [],
    assets: rawInputs.assets ?? [],
    taxSchedules: (rawInputs.taxSchedules && rawInputs.taxSchedules.length > 0)
      ? rawInputs.taxSchedules
      : DEFAULT_TAX_SCHEDULES,
  
    equityContributions: rawInputs.equityContributions ?? [],
    distributions: rawInputs.distributions ?? [],
    rentPlanPhases: rawInputs.rentPlanPhases ?? [],
    capacityProjects: rawInputs.capacityProjects ?? [],
  
    rentConstraints: rawInputs.rentConstraints ?? { mode: "AUTONOMIE_SCI" },
  
    sciChargesCash: rawInputs.sciChargesCash ?? 0,
    sciAmortization: rawInputs.sciAmortization ?? 0,
  
    bufferMin: rawInputs.bufferMin ?? 0,
    taxRate: rawInputs.taxRate ?? 0.25,
    horizonMonths: rawInputs.horizonMonths ?? 12,
  
    initialCash: rawInputs.initialCash ?? 0,
    sciInitialCash: rawInputs.sciInitialCash ?? 0,
  
    ccaBalanceSas: rawInputs.ccaBalanceSas ?? 0,
    ccaBalanceSci: rawInputs.ccaBalanceSci ?? 0,
  
    distributableCashRate: rawInputs.distributableCashRate ?? 0,
    ccaPriorityRatio: rawInputs.ccaPriorityRatio ?? 0,
    reserveStrategicRatio: rawInputs.reserveStrategicRatio ?? 0,
    reserveAfterCcaFullyRepaid: rawInputs.reserveAfterCcaFullyRepaid ?? false,
  
    projectStartDate: (rawInputs.projectStartDate ?? "2025-01").slice(0, 7)
  };
  
  
  const results: MonthlyResult[] = [];

  const state: ProjectionState = {
    cash: inputs.initialCash,
    sciCash: inputs.sciInitialCash,
    ccaBalanceSas: inputs.ccaBalanceSas,
    ccaBalanceSci: inputs.ccaBalanceSci,
  
    debts: (inputs.debts ?? []).map((d) => ({
      debt: d.debt,
      state: { ...d.state }
    })),
    
    sciDebts: (inputs.sciDebts ?? []).map((d) => ({
      debt: d.debt,
      state: { ...d.state }
    })),
  
    taxStateSas: {
      fiscalYear: new Date(inputs.projectStartDate).getFullYear(),
      currentYearRAI: 0,
      currentYearProvisionedTax: 0,
      lossCarryForward: 0
    },
  
    taxStateSci: {
      fiscalYear: new Date(inputs.projectStartDate).getFullYear(),
      currentYearRAI: 0,
      currentYearProvisionedTax: 0,
      lossCarryForward: 0
    }
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

    const revenue = Number.isFinite(revenueOutput?.totalRevenue)
  ? revenueOutput.totalRevenue
  : 0;
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
        sciInsurance,
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
const raiRaw = ebitda - expInterest;

const rai = Number.isFinite(raiRaw) ? raiRaw : 0;

const sasTaxResult = processTaxMonth({
  monthIndex,
  projectStartDate: inputs.projectStartDate,
  raiMonth: rai,
  state: state.taxStateSas,
  schedules: inputs.taxSchedules
});
    
    const tax = sasTaxResult.taxProvisionMonth;
    state.taxStateSas = sasTaxResult.updatedState;

    pushIfNonZero(flows, monthIndex, "SAS_TAX", -tax);

    // ================= SCI TAX =================

// Logique P&L SCI :
// EBITDA_SCI = rent + autresRevenusSCI - sciChargesCash
// EBIT_SCI   = EBITDA_SCI - sciAmortization
// RAI_SCI    = EBIT_SCI - sciInterest

const sciOtherRevenuesForTax = inputs.sciOtherRevenuesMonthly ?? 0;
const sciEbitda = rent + sciOtherRevenuesForTax - inputs.sciChargesCash;
const sciEbit = sciEbitda - (inputs.sciAmortization ?? 0);
const sciRaiRaw = sciEbit - sciInterest;

const sciRai = Number.isFinite(sciRaiRaw) ? sciRaiRaw : 0;

const sciTaxResult = processTaxMonth({
  monthIndex,
  projectStartDate: inputs.projectStartDate,
  raiMonth: sciRai,
  state: state.taxStateSci,
  schedules: inputs.taxSchedules
});

const sciTax = sciTaxResult.taxProvisionMonth;
state.taxStateSci = sciTaxResult.updatedState;
pushIfNonZero(flows, monthIndex, "SCI_TAX", -sciTax);
    // ================= CASH UPDATE =================
    const safe = (v: number, name: string) => {
      if (!Number.isFinite(v)) {
        console.error("INVALID VALUE", name, v);
      }
      return v;
    };

    const revenueSafe = safe(revenue, "revenue");
    const opexSafe = safe(opex, "opex");
    const rentSafe = safe(rent, "rent");
    const taxSafe = safe(tax, "tax");

    console.log("CASH INPUTS", {
      monthIndex,
      revenue,
      opex,
      rent,
      expInterest,
      expPrincipal,
      expInsurance,
      tax,
      revenueSafe,
      opexSafe,
      rentSafe,
      taxSafe
    });

    state.cash +=
      revenue - opex - rent - expInterest - expPrincipal - expInsurance - tax;

    console.log("CASH AFTER UPDATE", {
      monthIndex,
      cash: state.cash
    });
    console.log("SCI CASH INPUTS", {
      monthIndex,
      rent,
      sciChargesCash: inputs.sciChargesCash,
      sciInterest,
      sciPrincipal,
      sciInsurance,
      sciTax,
      sciCashBefore: state.sciCash
    });

    if (
      !Number.isFinite(rent) ||
      !Number.isFinite(inputs.sciChargesCash) ||
      !Number.isFinite(sciInterest) ||
      !Number.isFinite(sciPrincipal) ||
      !Number.isFinite(sciInsurance) ||
      !Number.isFinite(sciTax) ||
      !Number.isFinite(state.sciCash)
    ) {
      console.error("SCI INVALID VALUE", {
        monthIndex,
        rent,
        sciChargesCash: inputs.sciChargesCash,
        sciInterest,
        sciPrincipal,
        sciInsurance,
        sciTax,
        sciCashBefore: state.sciCash
      });
    }

    const sciOtherRevenues = inputs.sciOtherRevenuesMonthly ?? 0;

    // Flows SCI traçables (pour affichage dans Détail Moteur)
    pushIfNonZero(flows, monthIndex, "SCI_OTHER_REVENUE", sciOtherRevenues);
    pushIfNonZero(flows, monthIndex, "SCI_CHARGES", -inputs.sciChargesCash);

    state.sciCash +=
      rent
      + sciOtherRevenues
      - inputs.sciChargesCash
      - sciInterest
      - sciPrincipal
      - sciInsurance
      - sciTax;

    if (state.cash < 0) warnings.push("sas_cash_negative");
    if (state.sciCash < 0) warnings.push("sci_cash_negative");

    if (state.cash < inputs.bufferMin) warnings.push("buffer_below_minimum");

    // ================= DSCR =================
    // Rule: DSCR is NOT applicable during construction months (before firstOperationalMonth).
    // So: no dscr_below_minimum warning during excluded months (dscrApplicable); dscr output is 0.
    // When debt service is zero, dscr is 0 (no division by zero). DSCR is always finite (JSON-safe).

    const debtServiceDscr = expInterest + expPrincipal;
    // DSCR n'est pertinent que si la période est opérationnelle
    // ET qu'il existe effectivement un service de la dette (sinon le ratio est interprété comme non applicable).
    let dscrApplicable = monthIndex >= firstOperationalMonth;
    
    console.log("DEBUG revenue =", revenue);
console.log("DEBUG opex =", opex);
console.log("DEBUG rent =", rent);
console.log("DEBUG ebitda =", ebitda);
console.log("DEBUG debtServiceDscr =", debtServiceDscr);
console.log("DEBUG EBITDA =", ebitda);
    console.log("DEBUG debtServiceDscr =", debtServiceDscr);
    let dscr: number;
    if (debtServiceDscr === 0) {
      dscr = 0;
    } else {
      dscr = !dscrApplicable ? 0 : ebitda / debtServiceDscr;
    }
    if (!Number.isFinite(dscr)) {
      dscr = 0;
    }
    console.log("DEBUG dscrApplicable =", dscrApplicable);

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
        let sciAvailableCash = state.sciCash;
        const sciCcaRepayment = Math.min(
          Math.max(0, sciDistribution.ccaRepayment),
          sciAvailableCash
        );
        sciAvailableCash -= sciCcaRepayment;
        const sciReserveAllocation = Math.min(
          Math.max(0, sciDistribution.reserveAllocation),
          sciAvailableCash
        );
        sciAvailableCash -= sciReserveAllocation;
        const sciDividends = Math.min(
          Math.max(0, sciDistribution.dividends),
          sciAvailableCash
        );

        state.sciCash -=
          sciCcaRepayment +
          sciReserveAllocation +
          sciDividends;
      
        state.ccaBalanceSci -= sciCcaRepayment;
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_CCA",
          -sciCcaRepayment
        );
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_RESERVE",
          -sciReserveAllocation
        );
      
        pushIfNonZero(
          flows,
          monthIndex,
          "SCI_DISTRIBUTION_DIVIDENDS",
          -sciDividends
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
        let sasAvailableCash = state.cash;
        const sasCcaRepayment = Math.min(
          Math.max(0, distribution.ccaRepayment),
          sasAvailableCash
        );
        sasAvailableCash -= sasCcaRepayment;
        const sasReserveAllocation = Math.min(
          Math.max(0, distribution.reserveAllocation),
          sasAvailableCash
        );
        sasAvailableCash -= sasReserveAllocation;
        const sasDividends = Math.min(
          Math.max(0, distribution.dividends),
          sasAvailableCash
        );

        state.cash -=
          sasCcaRepayment +
          sasReserveAllocation +
          sasDividends;

          state.ccaBalanceSas -= sasCcaRepayment;

        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_CCA",
          -sasCcaRepayment
        );
        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_RESERVE",
          -sasReserveAllocation
        );
        pushIfNonZero(
          flows,
          monthIndex,
          "SAS_DISTRIBUTION_DIVIDENDS",
          -sasDividends
        );
      } else {
        warnings.push(`distribution_blocked:${distribution.reason ?? "unknown"}`);
      }
    } // ✅ fermeture du if (monthIndex % 12 === 11)
    if (!Number.isFinite(state.cash)) {
      console.error("NON FINITE DETECTED", {
        monthIndex,
        cash: state.cash,
        revenue,
        opex,
        rent,
        expInterest,
        expPrincipal,
        expInsurance,
        tax
      });
    }

    if (!Number.isFinite(state.cash)) {
      throw new Error("SAS cash became non-finite");
    }
    
    if (!Number.isFinite(state.sciCash)) {
      throw new Error("SCI cash became non-finite");
    }
    console.log("DEBUG DSCR block");
console.log("ebitda =", ebitda);
console.log("debtServiceDscr =", debtServiceDscr);
console.log("dscrApplicable =", dscrApplicable);
console.log("computed dscr =", dscr);
if (dscrApplicable && !Number.isFinite(dscr)) {
  throw new Error("DSCR became non-finite");
}

    const leasedSurface  = revenueOutput?.leasedSurface  ?? 0;
    const activeSurface  = revenueOutput?.activeSurface  ?? 0;

    results.push({
      monthIndex,
      cashEnd:    state.cash,
      sciCashEnd: state.sciCash,
      dscr,
      leasedSurface,
      activeSurface,
      leasedSurfacePercent: activeSurface > 0 ? leasedSurface / activeSurface : 0,
      sciAmortization: inputs.sciAmortization ?? 0,
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
  
    taxStateSas: { ...state.taxStateSas },
    taxStateSci: { ...state.taxStateSci }
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

    const revenue = Number.isFinite(revenueOutput?.totalRevenue)
  ? revenueOutput.totalRevenue
  : 0;
    let opex = 0;

for (const charge of inputs.operatingCharges) {
  if (!charge.isActive) continue;
  opex += charge.monthlyAmount;
}

    let expInterest = 0;
    let expPrincipal = 0;
    let expInsurance = 0;

     for (const d of snapshot.debts) {
      const r = processDebtMonth(d.debt, d.state, month, false);
      expInterest += r.interest;
      expPrincipal += r.principal;
      expInsurance += r.insurance;
    }
     let sciInterest = 0;
     let sciPrincipal = 0;
     let sciInsurance = 0;

     for (const d of snapshot.sciDebts) {
      const r = processDebtMonth(d.debt, d.state, month, false);
      sciInterest += r.interest;
      sciPrincipal += r.principal;
      sciInsurance += r.insurance;
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
        sciInsurance,
        cashStart: snapshot.sciCash,
        taxRate: inputs.taxRate,
        amortization: inputs.sciAmortization,
      },
      inputs.rentConstraints,
      snapshot.ccaBalanceSci <= 0
    );
    
    const rent = Number.isFinite(rentResult.rent)
  ? rentResult.rent
  : 0;
  const ebitda = revenue - opex - rent;

  const raiRaw = ebitda - expInterest;
  const rai = Number.isFinite(raiRaw) ? raiRaw : 0;
  
  const sasTaxResult = processTaxMonth({
    monthIndex: month,
    projectStartDate: inputs.projectStartDate,
    raiMonth: rai,
    state: snapshot.taxStateSas,
    schedules: inputs.taxSchedules
  });
    
    const tax = sasTaxResult.taxProvisionMonth;
    snapshot.taxStateSas = sasTaxResult.updatedState;

    const sciEbitda = rent - inputs.sciChargesCash;
    const sciEbit = sciEbitda - (inputs.sciAmortization ?? 0);
    
    const sciRaiRaw = sciEbit - sciInterest;
    const sciRai = Number.isFinite(sciRaiRaw) ? sciRaiRaw : 0;
    
    const sciTaxResult = processTaxMonth({
      monthIndex: month,
      projectStartDate: inputs.projectStartDate,
      raiMonth: sciRai,
      state: snapshot.taxStateSci,
      schedules: inputs.taxSchedules
    });

const sciTax = sciTaxResult.taxProvisionMonth;
snapshot.taxStateSci = sciTaxResult.updatedState;

    const dscrBase = expInterest + expPrincipal;
    const dscrApplicable = month >= firstOperationalMonth;

    let dscr: number;
    if (dscrBase === 0) {
      dscr = 0;
    } else {
      dscr = !dscrApplicable ? 0 : ebitda / dscrBase;
    }
    if (!Number.isFinite(dscr)) {
      dscr = 0;
    }

        snapshot.cash +=
  revenue - opex - rent - expInterest - expPrincipal - expInsurance - tax;

snapshot.sciCash +=
  rent - inputs.sciChargesCash - sciInterest - sciPrincipal - sciInsurance - sciTax;
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