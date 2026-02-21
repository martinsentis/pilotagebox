import { Debt } from "../domain/debt.model";
import { DebtSchedule } from "../domain/debt-schedule.model";
export declare class DebtService {
    /**
     * Génère le tableau d’amortissement mensuel complet
     */
    generateSchedule(debt: Debt): DebtSchedule;
    private addMonths;
}
