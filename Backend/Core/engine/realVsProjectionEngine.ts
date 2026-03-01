// realVsProjectionEngine.ts
// Canonical entity-first version
// Deterministic
// No mutation
// Compatible ProjectionEngine Option A
// Separate SAS / SCI comparison

export type RealStatus = "CONFIRMED" | "SUGGESTED";

export type AggregationMode =
  | "PILOTAGE"   // confirmed + suggested
  | "REPORTING"; // confirmed only

export type EntityType = "SAS" | "SCI";

export interface RealTransaction {
  monthIndex: number;
  categoryCode: string;
  amount: number;
  status: RealStatus;
  entity: EntityType;
}

export interface ProjectionMonth {
  monthIndex: number;
  projectedByCategory: Record<string, number>;
}

export interface CategoryComparison {
  categoryCode: string;
  projected: number;
  actual: number;
  variance: number;
  variancePct: number | null;
}

export interface EntityMonthResult {
  entity: EntityType;
  categories: CategoryComparison[];
  totalProjected: number;
  totalActual: number;
  totalVariance: number;
}

export interface RealVsProjectionMonthResult {
  monthIndex: number;
  sas: EntityMonthResult;
  sci: EntityMonthResult;
}

function aggregateByEntity(
  entity: EntityType,
  projMonth: ProjectionMonth,
  realTransactions: RealTransaction[],
  mode: AggregationMode
): EntityMonthResult {

  // 1️⃣ Filter real transactions for entity + month
  const monthTransactions = realTransactions.filter(t =>
    t.entity === entity &&
    (
      mode === "PILOTAGE" ||
      (mode === "REPORTING" && t.status === "CONFIRMED")
    )
  );

  // 2️⃣ Aggregate actual by category
  const actualByCategory: Record<string, number> = {};

  for (const tx of monthTransactions) {
    if (!actualByCategory[tx.categoryCode]) {
      actualByCategory[tx.categoryCode] = 0;
    }
    actualByCategory[tx.categoryCode] += tx.amount;
  }

  // 3️⃣ Filter projected categories belonging to this entity
  const projectedForEntity: Record<string, number> = {};

  for (const [categoryCode, value] of Object.entries(projMonth.projectedByCategory)) {
    if (categoryCode.startsWith(entity + "_")) {
      projectedForEntity[categoryCode] = value;
    }
  }

  const allCategoryCodes = new Set<string>([
    ...Object.keys(projectedForEntity),
    ...Object.keys(actualByCategory)
  ]);

  const comparisons: CategoryComparison[] = [];

  let totalProjected = 0;
  let totalActual = 0;

  for (const categoryCode of allCategoryCodes) {

    const projected = projectedForEntity[categoryCode] ?? 0;
    const actual = actualByCategory[categoryCode] ?? 0;

    const variance = actual - projected;

    const variancePct =
      projected === 0
        ? null
        : variance / Math.abs(projected);

    comparisons.push({
      categoryCode,
      projected,
      actual,
      variance,
      variancePct
    });

    totalProjected += projected;
    totalActual += actual;
  }

  return {
    entity,
    categories: comparisons,
    totalProjected,
    totalActual,
    totalVariance: totalActual - totalProjected
  };
}

export function computeRealVsProjection(
  projection: ProjectionMonth[],
  realTransactions: RealTransaction[],
  mode: AggregationMode
): RealVsProjectionMonthResult[] {

  const results: RealVsProjectionMonthResult[] = [];

  for (const projMonth of projection) {

    const monthIndex = projMonth.monthIndex;

    const monthTransactions = realTransactions.filter(
      t => t.monthIndex === monthIndex
    );

    const sasResult = aggregateByEntity(
      "SAS",
      projMonth,
      monthTransactions,
      mode
    );

    const sciResult = aggregateByEntity(
      "SCI",
      projMonth,
      monthTransactions,
      mode
    );

    results.push({
      monthIndex,
      sas: sasResult,
      sci: sciResult
    });
  }

  return results;
}
