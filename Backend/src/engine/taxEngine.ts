export function computeIS(rai: number, taxRate: number): number {
    if (taxRate < 0) return 0;
    return Math.max(0, rai) * taxRate;
  }