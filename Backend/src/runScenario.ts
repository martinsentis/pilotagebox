import { runProjection } from "./engine/projectionEngine";
import { basicScenario } from "./scenarios/basicScenario";
import { withDebtScenario } from "./scenarios/withDebtScenario";

type KpiResult = {
  months: number;

  cashMin: number;
  cashMinMonth: number;

  dscrMin: number | null;
  dscrMinMonth: number | null;

  totalCcaRepayment: number;
  totalReserve: number;
  totalDividends: number;

  firstDistributionMonth: number | null;
};

function safeNumber(x: any): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function computeKPIs(projection: any[]): KpiResult {
  let cashMin = Infinity;
  let cashMinMonth = 0;

  let dscrMin = Infinity;
  let dscrMinMonth: number | null = null;

  let totalCcaRepayment = 0;
  let totalReserve = 0;
  let totalDividends = 0;

  let firstDistributionMonth: number | null = null;

  for (const m of projection) {
    // Cash min
    if (typeof m.cashEnd === "number" && m.cashEnd < cashMin) {
      cashMin = m.cashEnd;
      cashMinMonth = m.monthIndex;
    }

    // DSCR min (ignore non-applicable months: Infinity / NaN)
    const dscrVal = safeNumber(m.dscr);
    if (dscrVal !== null) {
      if (dscrVal < dscrMin) {
        dscrMin = dscrVal;
        dscrMinMonth = m.monthIndex;
      }
    }

    // Distributions totals (outflows are negative in projectedByCategory)
    const cca = m.projectedByCategory?.SAS_DISTRIBUTION_CCA;
    const reserve = m.projectedByCategory?.SAS_DISTRIBUTION_RESERVE;
    const div = m.projectedByCategory?.SAS_DISTRIBUTION_DIVIDENDS;

    const ccaN = safeNumber(cca);
    const reserveN = safeNumber(reserve);
    const divN = safeNumber(div);

    const hasAnyDistribution =
      (ccaN !== null && ccaN !== 0) ||
      (reserveN !== null && reserveN !== 0) ||
      (divN !== null && divN !== 0);

    if (hasAnyDistribution && firstDistributionMonth === null) {
      firstDistributionMonth = m.monthIndex;
    }

    if (ccaN !== null) totalCcaRepayment += -ccaN;
    if (reserveN !== null) totalReserve += -reserveN;
    if (divN !== null) totalDividends += -divN;
  }

  return {
    months: projection.length,

    cashMin,
    cashMinMonth,

    dscrMin: dscrMin === Infinity ? null : dscrMin,
    dscrMinMonth,

    totalCcaRepayment,
    totalReserve,
    totalDividends,

    firstDistributionMonth
  };
}

function fmtMoney(x: number) {
  return x.toFixed(2);
}

function fmtMaybe(x: number | null) {
  return x === null ? "N/A" : String(x);
}

function main() {
  const scenarioName = (process.argv[2] || "basic").toLowerCase();
  const scenario = scenarioName === "debt" ? withDebtScenario : basicScenario;

  console.log("=== RUN SCENARIO ===", scenarioName);

  const projection = runProjection(scenario);
  const kpis = computeKPIs(projection);

  console.log("Months:", kpis.months);

  console.log(
    "Cash minimum:",
    fmtMoney(kpis.cashMin),
    "at month",
    kpis.cashMinMonth
  );

  console.log(
    "DSCR minimum:",
    kpis.dscrMin === null ? "N/A" : kpis.dscrMin.toFixed(4),
    "at month",
    fmtMaybe(kpis.dscrMinMonth)
  );

  console.log("First distribution month:", fmtMaybe(kpis.firstDistributionMonth));

  console.log("Total CCA repayment:", fmtMoney(kpis.totalCcaRepayment));
  console.log("Total reserve:", fmtMoney(kpis.totalReserve));
  console.log("Total dividends:", fmtMoney(kpis.totalDividends));

  console.log("First month snapshot:", projection[0]);
  console.log("Month 12 snapshot:", projection[11]);
  console.log("Last month snapshot:", projection[projection.length - 1]);
}

main();
