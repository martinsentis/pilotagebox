// STRICT VERSION
// Deterministic
// Monthly-first
// Cash vs Non-cash separated
// No mutation

export interface FixedCharge {
  code: string;
  monthlyAmount: number;
  startMonth: number;
  annualIndexationRate?: number;
  isActive: boolean;
}

export interface HrPosition {
  code: string;
  monthlyGrossCost: number;
  startMonth: number;
  annualIndexationRate?: number;
  isActive: boolean;
}

export interface VariableCharge {
  code: string;
  amountPerLeasedM2: number;
  isActive: boolean;
}

export interface LeaseCharge {
  code: string;
  monthlyAmount: number;
  startMonth: number;
  isActive: boolean;
}

export interface Asset {
  assetId: string;
  capex: number;
  startMonth: number;
  usefulLifeMonths: number;
}

export interface OpexMonthResult {
  totalOpexCash: number;
  totalOpexNonCash: number;
  totalOpexAccounting: number;
  breakdown: Record<string, number>;
}

function applyAnnualIndexation(
  baseAmount: number,
  annualRate: number | undefined,
  monthIndex: number
): number {

  if (!annualRate || annualRate === 0)
    return baseAmount;

  const yearIndex = Math.floor(monthIndex / 12);

  return baseAmount * Math.pow(1 + annualRate, yearIndex);
}

function computeAssetAmortization(
  monthIndex: number,
  assets: Asset[]
): number {

  let total = 0;

  for (const asset of assets) {

    if (monthIndex < asset.startMonth)
      continue;

    const monthsElapsed =
      monthIndex - asset.startMonth;

    if (monthsElapsed >= asset.usefulLifeMonths)
      continue;

    if (asset.usefulLifeMonths <= 0)
      throw new Error("Invalid useful life");

    const monthlyAmort =
      asset.capex / asset.usefulLifeMonths;

    total += monthlyAmort;
  }

  return total;
}

export function computeOpexForMonth(
  monthIndex: number,
  leasedSurface: number,
  fixedCharges: FixedCharge[],
  variableCharges: VariableCharge[],
  hrPositions: HrPosition[],
  leases: LeaseCharge[],
  assets: Asset[]
): OpexMonthResult {

  let cashTotal = 0;
  let nonCashTotal = 0;

  const breakdown: Record<string, number> = {};

  // ================= FIXED CHARGES =================

  for (const charge of fixedCharges) {

    if (!charge.isActive)
      continue;

    if (monthIndex < charge.startMonth)
      continue;

    const amount =
      applyAnnualIndexation(
        charge.monthlyAmount,
        charge.annualIndexationRate,
        monthIndex
      );

    cashTotal += amount;
    breakdown[`FIXED_${charge.code}`] = amount;
  }

  // ================= HR =================

  for (const hr of hrPositions) {

    if (!hr.isActive)
      continue;

    if (monthIndex < hr.startMonth)
      continue;

    const amount =
      applyAnnualIndexation(
        hr.monthlyGrossCost,
        hr.annualIndexationRate,
        monthIndex
      );

    cashTotal += amount;
    breakdown[`HR_${hr.code}`] = amount;
  }

  // ================= VARIABLE =================

  for (const variable of variableCharges) {

    if (!variable.isActive)
      continue;

    const amount =
      leasedSurface *
      variable.amountPerLeasedM2;

    cashTotal += amount;
    breakdown[`VAR_${variable.code}`] = amount;
  }

  // ================= LEASES =================

  for (const lease of leases) {

    if (!lease.isActive)
      continue;

    if (monthIndex < lease.startMonth)
      continue;

    cashTotal += lease.monthlyAmount;
    breakdown[`LEASE_${lease.code}`] =
      lease.monthlyAmount;
  }

  // ================= AMORTIZATION =================

  const amortization =
    computeAssetAmortization(
      monthIndex,
      assets
    );

  nonCashTotal += amortization;
  breakdown["AMORTIZATION"] = amortization;

  return {
    totalOpexCash: cashTotal,
    totalOpexNonCash: nonCashTotal,
    totalOpexAccounting: cashTotal + nonCashTotal,
    breakdown
  };
}
