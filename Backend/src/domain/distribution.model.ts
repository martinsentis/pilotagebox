import { UUID, VersionId, Percentage } from "./types";

export interface DistributionRules {
  id: UUID;
  versionId: VersionId;

  // Priorité remboursement CCA (0 → 1)
  ccaPriorityRatio: Percentage;

  // Part du cash distribuable mise en réserve (0 → 1)
  reserveRatio: Percentage;

  // Si true : aucun dividende / réserve tant que CCA > 0
  reserveAfterCca: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}
