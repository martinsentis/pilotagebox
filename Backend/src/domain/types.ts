export type UUID = string;

export type ProjectId = UUID;
export type VersionId = UUID;
export type EntityId = UUID;
export type ScenarioId = UUID;
export type DebtId = UUID;

export type EntityType = 'EXPLOITATION' | 'SCI';

export type Year = number;
export type MonthIndex = number; // 0 = mois de départ du projet

export interface YearMonth {
  year: Year;
  month: number; // 1 - 12
}

export interface Money {
  amount: number; // en euros
}

export interface Percentage {
  value: number; // 0 → 1 (ex: 0.9 = 90%)
}

export interface Range {
  start: MonthIndex;
  end?: MonthIndex; // undefined = open ended
}