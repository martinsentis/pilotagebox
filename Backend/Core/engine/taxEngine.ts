// taxEngine.ts
// V2 — annual fiscal logic with monthly processing
// Deterministic
// Entity-first
// No mutation
// Fiscal year = Jan → Dec
// First fiscal year = projectStartDate → Dec
// Supports dated progressive tax schedules + loss carry-forward

// ============================
// TYPES
// ============================

export interface TaxBracket {
  /**
   * Upper bound of the bracket, included.
   * Use null for the last bracket (infinite upper bound).
   */
  upTo: number | null;
  rate: number; // decimal, e.g. 0.15
}

export interface TaxSchedulePeriod {
  startDate: string; // YYYY-MM
  endDate?: string;  // YYYY-MM inclusive
  brackets: TaxBracket[];
}

export interface TaxState {
  /**
   * Fiscal year currently being accumulated.
   * Example: 2026
   */
  fiscalYear: number;

  /**
   * Cumulative RAI (résultat avant impôt) for the current fiscal year.
   */
  currentYearRAI: number;

  /**
   * Cumulative tax already provisioned during the current fiscal year.
   */
  currentYearProvisionedTax: number;

  /**
   * Tax loss carry-forward available at the start of the current fiscal year.
   */
  lossCarryForward: number;
}

export interface TaxMonthParams {
  /**
   * Simulation month index starting from 0.
   */
  monthIndex: number;

  /**
   * Project simulation start date.
   * Example: "2026-04"
   */
  projectStartDate: string;

  /**
   * Monthly RAI for the entity.
   */
  raiMonth: number;

  /**
   * Current fiscal state of the entity.
   */
  state: TaxState;

  /**
   * Tax schedules ordered or unordered.
   * The engine selects the schedule active at the current month date.
   */
  schedules: TaxSchedulePeriod[];
}

export interface TaxMonthResult {
  /**
   * Tax expense / provision for the current month.
   * Can be negative if the annual estimate decreases.
   */
  taxProvisionMonth: number;

  /**
   * Estimated annual tax after processing this month.
   */
  estimatedAnnualTax: number;

  /**
   * Estimated taxable base after carry-forward application.
   */
  estimatedTaxableBase: number;

  /**
   * Carry-forward position after annual estimation.
   * Informational during the year; final at fiscal year end.
   */
  estimatedLossCarryForwardEndOfYear: number;

  /**
   * True if current month closes the fiscal year (December).
   */
  isFiscalYearEnd: boolean;

  /**
   * Fiscal year currently processed.
   */
  fiscalYear: number;

  /**
   * Updated state to carry into next month.
   */
  updatedState: TaxState;
}

// ============================
// DEFAULT SCHEDULE (FRANCE)
// ============================

export const DEFAULT_TAX_SCHEDULES: TaxSchedulePeriod[] = [
  {
    startDate: "2024-01",
    brackets: [
      { upTo: 42500, rate: 0.15 },
      { upTo: null, rate: 0.25 },
    ],
  },
];

// ============================
// PUBLIC HELPERS
// ============================

export function createInitialTaxState(projectStartDate: string): TaxState {
  const { year } = parseYearMonth(projectStartDate);

  return {
    fiscalYear: year,
    currentYearRAI: 0,
    currentYearProvisionedTax: 0,
    lossCarryForward: 0,
  };
}

export function computeAnnualTaxFromSchedules(
  taxableBase: number,
  schedules: TaxSchedulePeriod[],
  date: string
): number {
  if (!Number.isFinite(taxableBase) || taxableBase <= 0) return 0;

  const schedule = pickScheduleForDate(schedules, date);
  return computeProgressiveTax(taxableBase, schedule.brackets);
}

export function processTaxMonth(params: TaxMonthParams): TaxMonthResult {
  const { monthIndex, projectStartDate, raiMonth, state, schedules } = params;

  if (!Number.isFinite(raiMonth)) {
    throw new Error("Invalid raiMonth");
  }

  const currentDate = addMonths(projectStartDate, monthIndex);
  const { year, month } = parseYearMonth(currentDate);

  // Guard rail: state must be aligned with current simulated fiscal year
  if (state.fiscalYear !== year) {
    throw new Error(
      `TaxState fiscalYear mismatch. Expected ${year}, got ${state.fiscalYear}`
    );
  }

  const cumulativeRAI = state.currentYearRAI + raiMonth;

  const estimatedSettlement = settleLossCarryForward(
    cumulativeRAI,
    state.lossCarryForward
  );

  const estimatedAnnualTax = computeAnnualTaxFromSchedules(
    estimatedSettlement.taxableBase,
    schedules,
    currentDate
  );

  // Monthly provision adjustment:
  // make cumulative provision equal to current annual estimate
  const taxProvisionMonth =
    estimatedAnnualTax - state.currentYearProvisionedTax;

  const isFiscalYearEnd = month === 12;

  if (!isFiscalYearEnd) {
    return {
      taxProvisionMonth,
      estimatedAnnualTax,
      estimatedTaxableBase: estimatedSettlement.taxableBase,
      estimatedLossCarryForwardEndOfYear:
        estimatedSettlement.updatedLossCarryForward,
      isFiscalYearEnd: false,
      fiscalYear: year,
      updatedState: {
        fiscalYear: state.fiscalYear,
        currentYearRAI: cumulativeRAI,
        currentYearProvisionedTax:
          state.currentYearProvisionedTax + taxProvisionMonth,
        lossCarryForward: state.lossCarryForward,
      },
    };
  }

  // Year-end settlement
  const finalSettlement = settleLossCarryForward(
    cumulativeRAI,
    state.lossCarryForward
  );

  const finalAnnualTax = computeAnnualTaxFromSchedules(
    finalSettlement.taxableBase,
    schedules,
    currentDate
  );

  // At year-end, the monthly provision should already equal finalAnnualTax,
  // because taxProvisionMonth was computed from the latest annual estimate.
  // We still expose final values and reset the state for next fiscal year.
  return {
    taxProvisionMonth,
    estimatedAnnualTax: finalAnnualTax,
    estimatedTaxableBase: finalSettlement.taxableBase,
    estimatedLossCarryForwardEndOfYear:
      finalSettlement.updatedLossCarryForward,
    isFiscalYearEnd: true,
    fiscalYear: year,
    updatedState: {
      fiscalYear: year + 1,
      currentYearRAI: 0,
      currentYearProvisionedTax: 0,
      lossCarryForward: finalSettlement.updatedLossCarryForward,
    },
  };
}

// ============================
// INTERNAL HELPERS
// ============================

function parseYearMonth(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error(`Invalid YYYY-MM date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in date: ${value}`);
  }

  return { year, month };
}

function formatYearMonth(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}`;
}

function addMonths(startDate: string, monthOffset: number): string {
  const { year, month } = parseYearMonth(startDate);

  const zeroBased = (year * 12 + (month - 1)) + monthOffset;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = (zeroBased % 12) + 1;

  return formatYearMonth(newYear, newMonth);
}

function compareYearMonth(a: string, b: string): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);

  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.month - pb.month;
}

function pickScheduleForDate(
  schedules: TaxSchedulePeriod[],
  date: string
): TaxSchedulePeriod {
  if (!schedules || schedules.length === 0) {
    throw new Error("No tax schedules provided");
  }

  const matching = schedules.filter((schedule) => {
    const afterStart = compareYearMonth(date, schedule.startDate) >= 0;
    const beforeEnd =
      !schedule.endDate || compareYearMonth(date, schedule.endDate) <= 0;

    return afterStart && beforeEnd;
  });

  if (matching.length === 0) {
    throw new Error(`No tax schedule found for date ${date}`);
  }

  // If several match, keep the most recent startDate
  matching.sort((a, b) => compareYearMonth(b.startDate, a.startDate));
  return matching[0];
}

function settleLossCarryForward(
  annualRAI: number,
  openingLossCarryForward: number
): {
  taxableBase: number;
  updatedLossCarryForward: number;
} {
  if (annualRAI < 0) {
    return {
      taxableBase: 0,
      updatedLossCarryForward:
        openingLossCarryForward + Math.abs(annualRAI),
    };
  }

  const taxableBase = Math.max(0, annualRAI - openingLossCarryForward);
  const updatedLossCarryForward = Math.max(
    0,
    openingLossCarryForward - annualRAI
  );

  return {
    taxableBase,
    updatedLossCarryForward,
  };
}

function computeProgressiveTax(
  taxableBase: number,
  brackets: TaxBracket[]
): number {
  if (!Number.isFinite(taxableBase) || taxableBase <= 0) return 0;
  if (!brackets || brackets.length === 0) {
    throw new Error("Tax brackets are empty");
  }

  let remaining = taxableBase;
  let previousUpper = 0;
  let totalTax = 0;

  for (const bracket of brackets) {
    const upper = bracket.upTo;

    if (upper === null) {
      totalTax += remaining * bracket.rate;
      remaining = 0;
      break;
    }

    const bandWidth = Math.max(0, upper - previousUpper);
    const taxableInBand = Math.min(remaining, bandWidth);

    if (taxableInBand > 0) {
      totalTax += taxableInBand * bracket.rate;
      remaining -= taxableInBand;
    }

    previousUpper = upper;

    if (remaining <= 0) break;
  }

  return totalTax;
}