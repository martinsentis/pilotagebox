import { runProjection } from "./projectionEngine";

function main() {
  console.log("RUNNING PROJECTION TEST...");

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
        operationalStartMonth: 3,   // chantier 0-2, ouverture au mois 3
        rampUpStartMonth: 3,        // pas de pré-commercialisation
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

    // OPEX rule (ton choix actuel)
    opexPercentOfRevenue: 0.3,

    // Debts (empty for test)
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

    // Rent (placeholder minimal: ton rentSolver doit accepter ce mode)
    rentConstraints: {
      mode: "DESENDETTEMENT_SCI"
    }
  };

  const out = runProjection(inputs);

  console.log("months:", out.length);
  console.log("first:", out[0]);
  console.log("month 3:", out[3]); // ouverture
  console.log("last:", out[out.length - 1]);
}

main();