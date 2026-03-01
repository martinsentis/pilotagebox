// versionComparisonEngine.ts
// Deterministic
// No mutation
// Entity-first
// Baseline vs Current projection comparison
// UI consolidation only

export type EntityType = "SAS" | "SCI";

export interface ProjectionMonth {
  monthIndex: number;
  projectedByCategory: Record<string, number>;
}

export interface VersionCategoryComparison {
  categoryCode: string;
  baseline: number;
  current: number;
  variance: number;
  variancePct: number | null;
}

export interface VersionEntityMonthResult {
  entity: EntityType;
  categories: VersionCategoryComparison[];
  totalBaseline: number;
  totalCurrent: number;
  totalVariance: number;
}

export interface VersionMonthResult {
  monthIndex: number;
  sas: VersionEntityMonthResult;
  sci: VersionEntityMonthResult;
}

function aggregateByEntity(
  entity: EntityType,
  baselineMonth: ProjectionMonth,
  currentMonth: ProjectionMonth
): VersionEntityMonthResult {

  const baselineForEntity: Record<string, number> = {};
  const currentForEntity: Record<string, number> = {};

  for (const [code, value] of Object.entries(baselineMonth.projectedByCategory)) {
    if (code.startsWith(entity + "_")) {
      baselineForEntity[code] = value;
    }
  }

  for (const [code, value] of Object.entries(currentMonth.projectedByCategory)) {
    if (code.startsWith(entity + "_")) {
      currentForEntity[code] = value;
    }
  }

  const allCategoryCodes = new Set<string>([
    ...Object.keys(baselineForEntity),
    ...Object.keys(currentForEntity)
  ]);

  const comparisons: VersionCategoryComparison[] = [];

  let totalBaseline = 0;
  let totalCurrent = 0;

  for (const categoryCode of allCategoryCodes) {

    const baseline = baselineForEntity[categoryCode] ?? 0;
    const current = currentForEntity[categoryCode] ?? 0;

    const variance = current - baseline;

    const variancePct =
      baseline === 0
        ? null
        : variance / Math.abs(baseline);

    comparisons.push({
      categoryCode,
      baseline,
      current,
      variance,
      variancePct
    });

    totalBaseline += baseline;
    totalCurrent += current;
  }

  return {
    entity,
    categories: comparisons,
    totalBaseline,
    totalCurrent,
    totalVariance: totalCurrent - totalBaseline
  };
}

export function compareProjectionVersions(
  baseline: ProjectionMonth[],
  current: ProjectionMonth[]
): VersionMonthResult[] {

  if (baseline.length !== current.length) {
    throw new Error("Baseline and current projection must have same horizon");
  }

  const results: VersionMonthResult[] = [];

  for (let i = 0; i < baseline.length; i++) {

    const baselineMonth = baseline[i];
    const currentMonth = current[i];

    if (baselineMonth.monthIndex !== currentMonth.monthIndex) {
      throw new Error("Month index mismatch between versions");
    }

    results.push({
      monthIndex: baselineMonth.monthIndex,
      sas: aggregateByEntity("SAS", baselineMonth, currentMonth),
      sci: aggregateByEntity("SCI", baselineMonth, currentMonth)
    });
  }

  return results;
}