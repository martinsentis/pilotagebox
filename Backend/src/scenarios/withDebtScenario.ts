import { ProjectionInputs } from "../../Core/engine/projectionEngine";

export const withDebtScenario: ProjectionInputs = {
  horizonMonths: 24,

  initialCash: 100000,
  sciInitialCash: 50000,

  taxRate: 0.25,
  bufferMin: 20000,
  dscrMin: 1.2,

  // ======================
  // REVENUE
  // ======================

  phases: [
    {
      phaseId: "P1",
      totalSurface: 1000,
      operationalStartMonth: 3,
      rampUpStartMonth: 3,
      rampUpDurationMonths: 6,
      isActive: true
    }
  ],

  revenueParams: {
    pricePerM2: 25,
    targetLeasedSurfacePercent: 0.85,
    annualIndexationRate: 0.02,
    indexationMonth: 0
  },

  services: [
    {
      code: "SERVICE_STD",
      monthlyAmountPerLeasedM2: 2,
      isActive: true
    }
  ],

  // ======================
  // OPEX
  // ======================

  operatingCharges: [
    {
      categoryCode: "SAS_OPEX",
      monthlyAmount: 5000,
      isActive: true
    }
  ],

  // ======================
  // DEBTS (SAS)
  // ======================

  debts: [
    {
      debt: {
        principalAmount: 200000,
        nominalRateAnnual: 0.045,
        totalDurationMonths: 60,

        // champs généralement présents dans ton debtEngine
        startMonth: 0,
        defermentMonths: 0,
        insuranceRateAnnual: 0.003
      } as any,
      state: {
        remainingPrincipal: 200000,
        remainingMonths: 60
      } as any
    }
  ],

  sciDebts: [],

  // ======================
  // SCI
  // ======================

  sciChargesCash: 5000,
  sciAmortization: 0,

  // ======================
  // DISTRIBUTION
  // ======================

  ccaBalance: 30000,
  distributableCashRate: 0.5,
  ccaPriorityRatio: 0.7,
  reserveStrategicRatio: 0.2,
  reserveAfterCcaFullyRepaid: true,

  // ======================
  // RENT
  // ======================

  rentConstraints: {
    mode: "DESENDETTEMENT_SCI"
  }
};