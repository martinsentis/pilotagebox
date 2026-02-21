

import { UUID, VersionId, EntityType, MonthIndex } from "./types";

export type BuildTriggerType = 'DATE' | 'OCCUPANCY';

export interface BuildPhase {
  id: UUID;
  versionId: VersionId;

  entity: EntityType; // généralement 'SCI'

  triggerType: BuildTriggerType;
  triggerValue: number;
  // Si DATE → MonthIndex
  // Si OCCUPANCY → % de surface louée (0 → 1)

  capex: number; // montant total de l'investissement
  constructionMonths: number; // durée de construction
  capacityAdded: number; // surface ajoutée en m²

  isActivated: boolean; // activation figée dans la version
  activationMonth?: MonthIndex;
  operationalStartMonth?: MonthIndex;

  createdAt?: Date;
  updatedAt?: Date;
}