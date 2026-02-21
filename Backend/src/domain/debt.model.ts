

import { EntityId, DebtId, YearMonth } from "./types";

export type DefermentType = "NONE" | "INTEREST_ONLY" | "TOTAL";

export interface Debt {
  id: DebtId;
  entityId: EntityId;

  name: string;

  // Paramètres financiers
  principalAmount: number; // Montant initial
  nominalRateAnnual: number; // ex: 0.03 pour 3%
  insuranceRateAnnual: number; // ex: 0.002 pour 0,2%

  totalDurationMonths: number;
  startDate: YearMonth;

  // Différé
  defermentMonths: number;
  defermentType: DefermentType;
  defermentExtendsDuration: boolean;

  // Suspension
  suspensionAllowed: boolean;
  suspensionMaxPerYear: number;
  suspensionExtendsDuration: boolean;

  // Frais
  feesUpfront: number; // frais payés au mois 0

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}