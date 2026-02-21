"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebtService = void 0;
class DebtService {
    /**
     * Génère le tableau d’amortissement mensuel complet
     */
    generateSchedule(debt) {
        const lines = [];
        let remainingBalance = debt.principalAmount;
        for (let monthIndex = 0; monthIndex < debt.totalDurationMonths; monthIndex++) {
            const period = this.addMonths(debt.startDate, monthIndex);
            const interest = 0;
            const principal = 0;
            const insurance = 0;
            const totalPayment = 0;
            const line = {
                debtId: debt.id,
                entityId: debt.entityId,
                period,
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
    addMonths(start, offset) {
        const totalMonths = start.year * 12 + (start.month - 1) + offset;
        const year = Math.floor(totalMonths / 12);
        const month = (totalMonths % 12) + 1;
        return { year, month };
    }
}
exports.DebtService = DebtService;
