import { EntityId, DebtId, YearMonth } from "./types";
export type DefermentType = "NONE" | "INTEREST_ONLY" | "TOTAL";
export interface Debt {
    id: DebtId;
    entityId: EntityId;
    name: string;
    principalAmount: number;
    nominalRateAnnual: number;
    insuranceRateAnnual: number;
    totalDurationMonths: number;
    startDate: YearMonth;
    defermentMonths: number;
    defermentType: DefermentType;
    defermentExtendsDuration: boolean;
    suspensionAllowed: boolean;
    suspensionMaxPerYear: number;
    suspensionExtendsDuration: boolean;
    feesUpfront: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
