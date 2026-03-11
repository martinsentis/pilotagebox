// debtEngine.ts
// STRICT CANONICAL VERSION
// Monthly-first
// Deterministic
// Bank-grade amortization
// No hidden recalculation

export interface Debt {
    principalAmount: number;
    nominalRateAnnual: number;
    insuranceRateAnnual: number;
    totalDurationMonths: number;
  
    defermentMonths?: number;
    defermentType?: "NONE" | "INTEREST_ONLY" | "TOTAL";
    defermentExtendsDuration?: boolean;
  
    suspensionAllowed?: boolean;
    suspensionMaxPerYear?: number;
    suspensionExtendsDuration?: boolean;
  }
  
  export interface DebtState {
    remainingPrincipal: number;
    remainingMonths: number;
  }
  
  export interface DebtMonthResult {
    interest: number;
    principal: number;
    insurance: number;
    totalDebtService: number;
    remainingPrincipal: number;
    remainingMonths: number;
  }
  
  function computeMonthlyRate(rateAnnual: number): number {
    return rateAnnual / 12;
  }
  
  function computeAnnuity(
    principal: number,
    monthlyRate: number,
    duration: number
  ): number {
    if (duration <= 0) {
      return principal;
    }
    if (monthlyRate === 0)
      return principal / duration;
  
    return (
      principal *
      monthlyRate /
      (1 - Math.pow(1 + monthlyRate, -duration))
    );
  }
  
  export function processDebtMonth(
    debt: Debt,
    state: DebtState,
    monthIndex: number,
    suspensionRequested: boolean
  ): DebtMonthResult {
  
    if (state.remainingPrincipal <= 0 || state.remainingMonths <= 0) {
      return {
        interest: 0,
        principal: 0,
        insurance: 0,
        totalDebtService: 0,
        remainingPrincipal: 0,
        remainingMonths: 0
      };
    }
  
    const monthlyRate =
      computeMonthlyRate(debt.nominalRateAnnual);
  
    const monthlyInsuranceRate =
      computeMonthlyRate(debt.insuranceRateAnnual);
  
      const isInDeferment =
      (debt.defermentMonths ?? 0) > 0 &&
      monthIndex < (debt.defermentMonths ?? 0);
    
    const openingPrincipal = state.remainingPrincipal;
    
    let interest =
      openingPrincipal * monthlyRate;
    
    let principal = 0;
  
    // ================= DEFERMENT =================
  
    if (isInDeferment) {
  
      if (debt.defermentType === "TOTAL") {
        // Capitalisation
        state.remainingPrincipal += interest;
        interest = 0;
      }
  
      if (debt.defermentType === "INTEREST_ONLY") {
        principal = 0;
      }
  
    } else {
      let annuity: number;
      annuity = computeAnnuity(
        state.remainingPrincipal,
        monthlyRate,
        state.remainingMonths
      );
  
      principal = annuity - interest;
  
      if (principal > state.remainingPrincipal)
        principal = state.remainingPrincipal;
    }
  
    // ================= INSURANCE =================
  
    const insurance =
    openingPrincipal * monthlyInsuranceRate;
    
    // ================= UPDATE PRINCIPAL =================
  
    state.remainingPrincipal =
      Math.max(
        0,
        state.remainingPrincipal - principal
      );
  
      const consumesOneMonth =
      !(isInDeferment && debt.defermentExtendsDuration === true);
    
    state.remainingMonths =
      Math.max(
        0,
        state.remainingMonths - (consumesOneMonth ? 1 : 0)
      );
  
    const totalDebtService =
      interest + principal + insurance;
  
    return {
      interest,
      principal,
      insurance,
      totalDebtService,
      remainingPrincipal: state.remainingPrincipal,
      remainingMonths: state.remainingMonths
    };
  }
  