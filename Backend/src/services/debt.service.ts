import { Debt } from "../domain/debt.model";
import { DebtSchedule, DebtScheduleLine } from "../domain/debt-schedule.model";
import { MonthIndex } from "../domain/types";

export class DebtService {
  public generateSchedule(debt: Debt): DebtSchedule {
    const lines: DebtScheduleLine[] = [];

    let remainingBalance = debt.principalAmount;

    for (let i = 0; i < debt.totalDurationMonths; i++) {
      const monthIndex: MonthIndex = i;

      const interest = 0;
      const principal = 0;
      const insurance = 0;
      const totalPayment = 0;

      const line: DebtScheduleLine = {
        debtId: debt.id,
        entity: debt.entity,
        monthIndex,
        openingBalance: remainingBalance,
        interest,
        principal,
        insurance,
        totalPayment,
        closingBalance: remainingBalance,
        isDefermentPeriod: false,
        isSuspensionPeriod: false,
      };

      lines.push(line);
    }

    return {
      debtId: debt.id,
      lines,
    };
  }
}