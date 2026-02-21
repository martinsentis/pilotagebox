import { UUID, VersionId, Percentage } from "./types";

export interface RevenueParameters {
  id: UUID;
  versionId: VersionId;

  basePricePerM2: number; // prix de base au m²
  annualIndexation: Percentage; // ex: { value: 0.02 } pour 2% / an

  targetLeasedSurfacePercent: Percentage; 
  // 0 → 1 (ex: { value: 0.9 } = 90% de surface louée cible)

  createdAt?: Date;
  updatedAt?: Date;
}
