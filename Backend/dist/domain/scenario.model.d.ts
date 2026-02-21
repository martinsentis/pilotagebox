import { EntityId, ScenarioId, YearMonth } from "./types";
export interface Scenario {
    id: ScenarioId;
    name: string;
    description?: string;
    entityIds: EntityId[];
    startDate: YearMonth;
    endDate: YearMonth;
    inflationRate: number;
    indexationRate: number;
    createdAt: Date;
    updatedAt: Date;
}
