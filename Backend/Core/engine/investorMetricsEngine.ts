 // ==========================================================
// INVESTOR METRICS ENGINE
// Deterministic
// Projection-based only
// Version-safe
// No mutation
// ==========================================================

export interface CashFlowPoint {
    monthIndex: number;
    cashFlow: number;
  }
  
  export interface InvestorInput {
    equityContributions: CashFlowPoint[]; // negative values
    distributions: CashFlowPoint[]; // positive values
    terminalValue?: {
      monthIndex: number;
      amount: number;
    };
    horizonMonths: number;
  }
  
  export interface InvestorMetrics {
    irrAnnual: number | null;
    irrMonthly: number | null;
    multiple: number;
    totalEquityInvested: number;
    totalCashReturned: number;
    paybackMonth: number | null;
    averageAnnualCashYield: number | null;
  }
  
  // ==========================================================
  // IRR CALCULATION (Newton method)
  // ==========================================================
  
  function computeIRR(
    cashFlows: number[],
    guess = 0.1
  ): number | null {
  
    const maxIterations = 1000;
    const tolerance = 1e-7;
  
    let rate = guess;
  
    for (let i = 0; i < maxIterations; i++) {
  
      let npv = 0;
      let derivative = 0;
  
      for (let t = 0; t < cashFlows.length; t++) {
        npv += cashFlows[t] / Math.pow(1 + rate, t);
  
        derivative -=
          (t * cashFlows[t]) /
          Math.pow(1 + rate, t + 1);
      }
  
      if (Math.abs(npv) < tolerance) {
        return rate;
      }
  
      if (derivative === 0) {
        return null;
      }
  
      rate = rate - npv / derivative;
    }
  
    return null;
  }
  
  // ==========================================================
  // MAIN FUNCTION
  // ==========================================================
  
  export function computeInvestorMetrics(
    input: InvestorInput
  ): InvestorMetrics {
  
    const cashFlowTimeline: number[] =
      new Array(input.horizonMonths).fill(0);
  
    // Equity (negative)
    for (const eq of input.equityContributions) {
      if (eq.monthIndex < input.horizonMonths) {
        cashFlowTimeline[eq.monthIndex] += eq.cashFlow;
      }
    }
  
    // Distributions (positive)
    for (const dist of input.distributions) {
      if (dist.monthIndex < input.horizonMonths) {
        cashFlowTimeline[dist.monthIndex] += dist.cashFlow;
      }
    }
  
    // Terminal value
    if (input.terminalValue) {
      const { monthIndex, amount } = input.terminalValue;
  
      if (monthIndex < input.horizonMonths) {
        cashFlowTimeline[monthIndex] += amount;
      }
    }
  
    const irrMonthly = computeIRR(cashFlowTimeline);
  
    const irrAnnual =
      irrMonthly !== null
        ? Math.pow(1 + irrMonthly, 12) - 1
        : null;
  
    const totalEquityInvested =
      input.equityContributions.reduce(
        (sum, e) => sum + Math.abs(e.cashFlow),
        0
      );
  
    const totalCashReturned =
      input.distributions.reduce(
        (sum, d) => sum + d.cashFlow,
        0
      ) + (input.terminalValue?.amount || 0);
  
    const multiple =
      totalEquityInvested === 0
        ? 0
        : totalCashReturned / totalEquityInvested;
  
    // Payback calculation
    let cumulative = 0;
    let paybackMonth: number | null = null;
  
    for (let i = 0; i < cashFlowTimeline.length; i++) {
      cumulative += cashFlowTimeline[i];
  
      if (cumulative >= 0) {
        paybackMonth = i;
        break;
      }
    }
  
    const avgAnnualCashYield =
      irrAnnual !== null ? irrAnnual : null;
  
    return {
      irrAnnual,
      irrMonthly,
      multiple,
      totalEquityInvested,
      totalCashReturned,
      paybackMonth,
      averageAnnualCashYield: avgAnnualCashYield
    };
  }