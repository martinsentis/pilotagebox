// versionKpiComparisonEngine.ts
// Deterministic
// No mutation
// Focused on Distribution Capacity + Final Cash

export interface VersionKpis {
    finalCash: number;
    finalSciCash: number;
  
    totalCcaRepayment: number;
    totalDividends: number;
    totalReserve: number;
  
    firstDistributionMonth: number | null;
    distributionCount: number;
  }
  
  export interface VersionKpiComparison {
    baseline: VersionKpis;
    current: VersionKpis;
    delta: {
      finalCash: number;
      totalCcaRepayment: number;
      totalDividends: number;
      totalReserve: number;
    };
  }
  
  function extractKpis(projection: any[]): VersionKpis {
  
    let totalCcaRepayment = 0;
    let totalDividends = 0;
    let totalReserve = 0;
  
    let firstDistributionMonth: number | null = null;
    let distributionCount = 0;
  
    for (const m of projection) {
  
      const cca = m.projectedByCategory?.SAS_DISTRIBUTION_CCA ?? 0;
      const div = m.projectedByCategory?.SAS_DISTRIBUTION_DIVIDENDS ?? 0;
      const res = m.projectedByCategory?.SAS_DISTRIBUTION_RESERVE ?? 0;
  
      if (cca !== 0 || div !== 0 || res !== 0) {
        distributionCount++;
        if (firstDistributionMonth === null) {
          firstDistributionMonth = m.monthIndex;
        }
      }
  
      totalCcaRepayment += -cca;
      totalDividends += -div;
      totalReserve += -res;
    }
  
    const lastMonth = projection[projection.length - 1];
  
    return {
      finalCash: lastMonth.cashEnd,
      finalSciCash: lastMonth.sciCashEnd,
      totalCcaRepayment,
      totalDividends,
      totalReserve,
      firstDistributionMonth,
      distributionCount
    };
  }
  
  export function compareVersionKpis(
    baselineProjection: any[],
    currentProjection: any[]
  ): VersionKpiComparison {
  
    const baseline = extractKpis(baselineProjection);
    const current = extractKpis(currentProjection);
  
    return {
      baseline,
      current,
      delta: {
        finalCash: current.finalCash - baseline.finalCash,
        totalCcaRepayment: current.totalCcaRepayment - baseline.totalCcaRepayment,
        totalDividends: current.totalDividends - baseline.totalDividends,
        totalReserve: current.totalReserve - baseline.totalReserve
      }
    };
  }