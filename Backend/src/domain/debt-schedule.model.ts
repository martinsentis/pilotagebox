import { DebtId, EntityType, MonthIndex } from "./types";

export interface DebtScheduleLine {
  debtId: DebtId;
  entity: EntityType;

  monthIndex: MonthIndex;

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
