import { UUID, VersionId, EntityType, MonthIndex } from "./types";

export type DefermentType = 'NONE' | 'INTEREST_ONLY' | 'TOTAL';

export interface Debt {
  id: UUID;
  versionId: VersionId;

  entity: EntityType; // 'EXPLOITATION' | 'SCI'

  name: string;

  principalAmount: number;
  nominalRateAnnual: number;
  insuranceRateAnnual: number;

  totalDurationMonths: number;
  startMonth: MonthIndex;

  defermentMonths: number;
  defermentType: DefermentType;
  defermentExtendsDuration: boolean;

  suspensionAllowed: boolean;
  suspensionMaxPerYear: number;
  suspensionExtendsDuration: boolean;

  upfrontFees: number;

  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}