import { runProjection, ProjectionInputs } from "../../Core/engine/projectionEngine";
import { DEFAULT_TAX_SCHEDULES } from "../../Core/engine/taxEngine";

const payload: ProjectionInputs = {
  horizonMonths: 24,

  initialCash: 100000,
  sciInitialCash: 50000,

  projectStartDate: "2026-01",
  taxSchedules: DEFAULT_TAX_SCHEDULES,
  taxRate: 0.25,
  bufferMin: 20000,
  dscrMin: 1.2,

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

  operatingCharges: [
    {
      categoryCode: "SAS_OPEX",
      monthlyAmount: 5000,
      isActive: true
    }
  ],

  debts: [],
  sciDebts: [],

  sciChargesCash: 5000,
  sciAmortization: 0,

  ccaBalanceSas: 30000,
  ccaBalanceSci: 0,
  distributableCashRate: 0.5,
  ccaPriorityRatio: 0.7,
  reserveStrategicRatio: 0.2,
  reserveAfterCcaFullyRepaid: true,

  rentConstraints: {
    mode: "DESENDETTEMENT_SCI"
  }
};

console.log("RUN PROJECTION DEBUG START");
const out = runProjection(payload);
console.log("RUN PROJECTION DEBUG OK", {
  months: out.length,
  first: out[0],
  last: out[out.length - 1]
});
