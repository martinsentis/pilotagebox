import { DebtId, EntityId, YearMonth } from "./types";
export interface DebtScheduleLine {
    debtId: DebtId;
    entityId: EntityId;
    period: YearMonth;
    openingBalance: number;
    interest: number;
    principal: number;
    insurance: number;
    totalPayment: number;
    closingBalance: number;
    isDefermentPeriod: boolean;
    isSuspensionPeriod: boolean;
}
export interface DebtSchedule {
    debtId: DebtId;
    lines: DebtScheduleLine[];
}
