import { UUID, VersionId, EntityType, MonthIndex } from "./types";

export interface CapacityPhase {
  id: UUID;
  versionId: VersionId;

  entity: EntityType; // 'EXPLOITATION' | 'SCI'

  surfaceM2: number; // surface ajoutée par cette phase
  commissioningMonth: MonthIndex; // mois de mise en service
  constructionDuration: number; // durée de construction en mois

  rampUpMonths: number; // durée nécessaire pour atteindre la surface louée cible

  isActive: boolean; // phase active dans la version

  createdAt?: Date;
  updatedAt?: Date;
}
