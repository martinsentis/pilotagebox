// revenueCapacityEngine.ts
// STRICT CANONICAL VERSION
// Deterministic
// Multi-phase
// Capacity-safe
// No mutation
// No pre-commercialisation allowed

export interface CapacityPhase {
  phaseId: string;
  totalSurface: number;
  operationalStartMonth: number;   // Physical activation
  rampUpStartMonth: number;        // Commercial start
  rampUpDurationMonths: number;
  isActive: boolean;
}

export interface RevenueParams {
  pricePerM2: number;
  targetLeasedSurfacePercent: number; // 0 → 1
  annualIndexationRate?: number;
  indexationMonth?: number;
}

export interface Service {
  code: string;
  monthlyAmountPerLeasedM2: number;
  isActive: boolean;
}

export interface RevenueMonthResult {
  totalRevenue: number;
  leasedSurface: number;
  activeSurface: number;
  revenueFromSurface: number;
  revenueFromServices: number;
}

function applyIndexation(
  basePrice: number,
  annualRate: number,
  monthIndex: number,
  indexationMonth: number
): number {

  if (!annualRate || annualRate === 0)
    return basePrice;

  const yearsElapsed =
    Math.floor((monthIndex - indexationMonth) / 12);

  if (yearsElapsed <= 0)
    return basePrice;

  return basePrice * Math.pow(1 + annualRate, yearsElapsed);
}

function computeRampUpPercent(
  monthIndex: number,
  phase: CapacityPhase,
  targetPercent: number
): number {

  if (!phase.isActive)
    return 0;

  // No revenue before physical opening
  if (monthIndex < phase.operationalStartMonth)
    return 0;

  // Guard rail: no pre-commercialisation
  if (phase.rampUpStartMonth < phase.operationalStartMonth)
    throw new Error(
      "Ramp-up cannot start before operational start"
    );

  // Before commercial ramp start
  if (monthIndex < phase.rampUpStartMonth)
    return 0;

  const monthsSinceRampStart =
    monthIndex - phase.rampUpStartMonth;

  if (phase.rampUpDurationMonths <= 0)
    return targetPercent;

  const rampRatio =
    Math.min(
      1,
      monthsSinceRampStart / phase.rampUpDurationMonths
    );

  return rampRatio * targetPercent;
}

export function computeRevenueForMonth(
  monthIndex: number,
  phases: CapacityPhase[],
  revenueParams: RevenueParams,
  services: Service[]
): RevenueMonthResult {

  const targetPercent =
    revenueParams.targetLeasedSurfacePercent;

  if (targetPercent < 0 || targetPercent > 1)
    throw new Error(
      "Invalid target_leased_surface_percent"
    );

  let activeSurface = 0;
  let leasedSurface = 0;

  for (const phase of phases) {

    if (!phase.isActive)
      continue;

    activeSurface += phase.totalSurface;

    const phasePercent =
      computeRampUpPercent(
        monthIndex,
        phase,
        targetPercent
      );

    const phaseLeased =
      phase.totalSurface * phasePercent;

    leasedSurface += phaseLeased;
  }

  // HARD CAPACITY INVARIANT
  if (leasedSurface > activeSurface + 1e-6)
    throw new Error("Surface invariant violated");

  const indexedPrice =
    applyIndexation(
      revenueParams.pricePerM2,
      revenueParams.annualIndexationRate ?? 0,
      monthIndex,
      revenueParams.indexationMonth ?? 0
    );

  const revenueFromSurface =
    leasedSurface * indexedPrice;

  let revenueFromServices = 0;

  for (const service of services) {

    if (!service.isActive)
      continue;

    revenueFromServices +=
      leasedSurface *
      service.monthlyAmountPerLeasedM2;
  }

  const totalRevenue =
    revenueFromSurface +
    revenueFromServices;

  return {
    totalRevenue,
    leasedSurface,
    activeSurface,
    revenueFromSurface,
    revenueFromServices
  };
}

