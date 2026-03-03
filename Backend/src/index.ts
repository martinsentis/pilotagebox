import { runProjection } from "../Core/engine/projectionEngine";
function main() {
  console.log("RUNNING PROJECTION TEST... MARKER_ABCDE");

  const inputs: any = {
    horizonMonths: 24,

    initialCash: 100000,
    sciInitialCash: 50000,

    taxRate: 0.25,
    bufferMin: 20000,
    dscrMin: 1.2,

    // Revenue layer (matches revenueCapacityEngine.ts)
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

    // OPEX rule
    operatingCharges: [
      {
        categoryCode: "SAS_OPEX",
        monthlyAmount: 5000,
        isActive: true
      }
    ],

    // Debts
    debts: [],
    sciDebts: [],

    // SCI
    sciChargesCash: 5000,
    sciAmortization: 0,

    // Distribution
    ccaBalance: 30000,
    distributableCashRate: 0.5,
    ccaPriorityRatio: 0.7,
    reserveStrategicRatio: 0.2,
    reserveAfterCcaFullyRepaid: true,

    // Rent
    rentConstraints: { mode: "DESENDETTEMENT_SCI" }
  };

  const out = runProjection(inputs);

  console.log("months:", out.length);
  console.log("m0:", out[0]);
  console.log("m3:", out[3]);
  console.log("m10:", out[10]);
  console.log("last:", out[out.length - 1]);
}

main();
