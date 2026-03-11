// distributionEngine.ts
// Canonical Stable Version
// Deterministic
// No mutation
// Forward DSCR strict
// Bank-grade control
// Compatible ProjectionEngine V1

// ============================
// TYPES
// ============================

export interface DistributionParams {
  cashEndOfYear: number;
  bufferMin: number;

  distributableCashRate: number;

  ccaOutstanding: number;
  ccaPriorityRatio: number;

  reserveStrategicRatio: number;
  reserveAfterCcaFullyRepaid: boolean;

  dscrMin?: number;
}

export interface ForwardCheckMonth {
  monthIndex: number;   // ✅ add this
  cash: number;
  dscr: number;
}

export type DistributionBlockReason =
  | "buffer_constraint"
  | "no_distributable_cash"
  | "forward_buffer_violation"
  | "forward_dscr_violation"
  | "post_distribution_buffer_violation";

export type DistributionBlockDetail =
  | {
      type: "forward_buffer_violation";
      monthIndex: number;
      projectedCashAfterOutflow: number;
      bufferMin: number;
      totalOutflow: number;
    }
  | {
      type: "forward_dscr_violation";
      monthIndex: number;
      observedDscr: number;
      requiredDscr: number;
      totalOutflow: number;
    }
  | {
      type: "post_distribution_buffer_violation";
      cashEndOfYear: number;
      cashAfterOutflow: number;
      bufferMin: number;
      totalOutflow: number;
    }
  | {
      type: "buffer_constraint" | "no_distributable_cash";
      cashEndOfYear: number;
      bufferMin: number;
      cashAfterBuffer: number;
      distributableCashRate: number;
      theoreticalDistributable: number;
    };

export interface DistributionResult {
  allowed: boolean;
  ccaRepayment: number;
  reserveAllocation: number;
  dividends: number;
  reason?: DistributionBlockReason;
  detail?: DistributionBlockDetail; // ✅ add this
}

// ============================
// MAIN ENGINE
// ============================

export function processDistribution(
  params: DistributionParams,
  forwardProjection: ForwardCheckMonth[]
): DistributionResult {
  // =============================
  // 1️⃣ BASE CASH AFTER BUFFER
  // =============================

  const cashAfterBuffer = params.cashEndOfYear - params.bufferMin;

  if (cashAfterBuffer <= 0) {
    return blocked("buffer_constraint", {
      type: "buffer_constraint",
      cashEndOfYear: params.cashEndOfYear,
      bufferMin: params.bufferMin,
      cashAfterBuffer,
      distributableCashRate: params.distributableCashRate,
      theoreticalDistributable: 0
    });
  }

  const theoreticalDistributable = cashAfterBuffer * params.distributableCashRate;

  if (theoreticalDistributable <= 0) {
    return blocked("no_distributable_cash", {
      type: "no_distributable_cash",
      cashEndOfYear: params.cashEndOfYear,
      bufferMin: params.bufferMin,
      cashAfterBuffer,
      distributableCashRate: params.distributableCashRate,
      theoreticalDistributable
    });
  }

  let ccaRepayment = 0;
  let reserveAllocation = 0;
  let dividends = 0;

  // ====================================================
  // 2️⃣ PRIORITY MODE – FULL CCA FIRST IF REQUIRED
  // ====================================================

  if (params.reserveAfterCcaFullyRepaid && params.ccaOutstanding > 0) {
    ccaRepayment = Math.min(theoreticalDistributable, params.ccaOutstanding);
  } else {
    // =============================
    // 3️⃣ NORMAL SPLIT LOGIC
    // =============================

    const ccaPart = theoreticalDistributable * params.ccaPriorityRatio;

    ccaRepayment = Math.min(ccaPart, params.ccaOutstanding);

    const remainingAfterCca = theoreticalDistributable - ccaRepayment;

    reserveAllocation = remainingAfterCca * params.reserveStrategicRatio;

    dividends = remainingAfterCca - reserveAllocation;
  }

  const totalOutflow = ccaRepayment + reserveAllocation + dividends;

  // =============================
  // 4️⃣ FORWARD STRESS TEST
  // =============================

  for (const month of forwardProjection) {
    const projectedCashAfterOutflow = month.cash - totalOutflow;

    if (projectedCashAfterOutflow < 0) {
      return blocked("forward_buffer_violation", {
        type: "forward_buffer_violation",
        monthIndex: month.monthIndex,
        projectedCashAfterOutflow,
        bufferMin: params.bufferMin,
        totalOutflow
      });
    }
    
    if (projectedCashAfterOutflow < params.bufferMin) {
      return blocked("forward_buffer_violation", {
        type: "forward_buffer_violation",
        monthIndex: month.monthIndex,
        projectedCashAfterOutflow,
        bufferMin: params.bufferMin,
        totalOutflow
      });
    }

    if (params.dscrMin !== undefined && month.dscr < params.dscrMin) {
      return blocked("forward_dscr_violation", {
        type: "forward_dscr_violation",
        monthIndex: month.monthIndex,
        observedDscr: month.dscr,
        requiredDscr: params.dscrMin,
        totalOutflow
      });
    }
  }

  // =============================
  // 5️⃣ FINAL SAFETY CHECK
  // =============================

  const cashAfterOutflow = params.cashEndOfYear - totalOutflow;

  if (cashAfterOutflow < params.bufferMin) {
    return blocked("post_distribution_buffer_violation", {
      type: "post_distribution_buffer_violation",
      cashEndOfYear: params.cashEndOfYear,
      cashAfterOutflow,
      bufferMin: params.bufferMin,
      totalOutflow
    });
  }

  // =============================
  // 6️⃣ SUCCESS
  // =============================

  return {
    allowed: true,
    ccaRepayment,
    reserveAllocation,
    dividends
  };
}

// =============================
// INTERNAL HELPER
// =============================

function blocked(
  reason: DistributionBlockReason,
  detail?: DistributionBlockDetail
): DistributionResult {
  return {
    allowed: false,
    ccaRepayment: 0,
    reserveAllocation: 0,
    dividends: 0,
    reason,
    detail
  };
}