export type UUID = string;
export type EntityId = UUID;
export type ScenarioId = UUID;
export type DebtId = UUID;
export type Year = number;
export type Month = number;
export interface YearMonth {
    year: Year;
    month: Month;
}
export interface Money {
    amount: number;
}
