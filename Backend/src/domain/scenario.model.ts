import { EntityId, ScenarioId, YearMonth } from "./types";

export interface Scenario {
  id: ScenarioId;
  name: string;
  description?: string;

  // Entités incluses dans le scénario
  entityIds: EntityId[];

  // Horizon de projection
  startDate: YearMonth;
  endDate: YearMonth;

  // Paramètres globaux du scénario
  inflationRate: number; // ex: 0.02 pour 2%
  indexationRate: number; // indexation loyers / prix

  createdAt: Date;
  updatedAt: Date;
}
