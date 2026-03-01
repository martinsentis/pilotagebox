// versionIntegrityEngine.ts
// Deterministic version integrity validator
// No mutation
// No DB write
// Pure structural & business validation
// Must be executed BEFORE activateVersion()

export interface ValidationError {
    code: string;
    message: string;
  }
  
  export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
  }
  
  /**
   * Rent modes (align with rentSolver expectations).
   * Keep as string literals to avoid import cycles.
   */
  export type RentMode =
    | "DESENDETTEMENT_SCI"
    | "OPTIMISATION_EBE"
    | "OPTIMISATION_FISCALE"
    | "AUTONOMIE_SCI"
    | "FIXE";
  
  export type RentPlanType = "DYNAMIC" | "MANUAL";
  
  export interface RentPlanPhase {
    startMonth: number;
    mode: RentMode;
  }
  
  export interface DynamicRentPlan {
    type: "DYNAMIC";
    phase1: RentMode; // must be DESENDETTEMENT_SCI
    phase2: RentMode;
  }
  
  export interface ManualRentPlan {
    type: "MANUAL";
    phases: RentPlanPhase[];
  }
  
  export type RentPlan = DynamicRentPlan | ManualRentPlan;
  
  export interface VersionIntegrityInput {
    // Core
    taxRate?: number;
    bufferMin?: number;
    dscrMin?: number;
  
    // Revenue
    phases?: any[];
    revenueParams?: any;
    services?: any[];
  
    // OPEX
    opexPercentOfRevenue?: number;
  
    // Debt
    debts?: { debt: any; state: any }[];
    sciDebts?: { debt: any; state: any }[];
  
    // SCI
    sciEnabled?: boolean;
    sciChargesCash?: number;
    sciAmortization?: number;
  
    // Distribution
    ccaBalance?: number;
    distributableCashRate?: number;
    ccaPriorityRatio?: number;
    reserveStrategicRatio?: number;
    reserveAfterCcaFullyRepaid?: boolean;
  
    // Rent
    rentPlan?: RentPlan;
  
    // Build
    buildPhases?: any[];
  }
  
  export function validateVersion(
    input: VersionIntegrityInput
  ): ValidationResult {
  
    const errors: ValidationError[] = [];
  
    // =====================================================
    // 1) CORE ECONOMIC
    // =====================================================
  
    if (input.taxRate === undefined || input.taxRate < 0) {
      errors.push({
        code: "INVALID_TAX_RATE",
        message: "Tax rate must be defined and >= 0"
      });
    }
  
    if (input.bufferMin === undefined || input.bufferMin < 0) {
      errors.push({
        code: "INVALID_BUFFER",
        message: "Buffer minimum must be defined and >= 0"
      });
    }
  
    if (
      input.opexPercentOfRevenue !== undefined &&
      (input.opexPercentOfRevenue < 0 || input.opexPercentOfRevenue > 1)
    ) {
      errors.push({
        code: "INVALID_OPEX_PERCENT",
        message: "opexPercentOfRevenue must be between 0 and 1"
      });
    }
  
    // =====================================================
    // 2) REVENUE LAYER
    // =====================================================
  
    if (!input.phases || input.phases.length === 0) {
      errors.push({
        code: "NO_CAPACITY_PHASES",
        message: "At least one capacity phase required"
      });
    }
  
    if (!input.revenueParams) {
      errors.push({
        code: "MISSING_REVENUE_PARAMS",
        message: "Revenue parameters missing"
      });
    }
  
    // =====================================================
    // 3) DEBT LAYER
    // =====================================================
  
    const validateDebtArray = (arr?: { debt: any; state: any }[], label?: string) => {
      if (!arr) return;
  
      for (const d of arr) {
  
        if (!d.debt) {
          errors.push({
            code: "DEBT_OBJECT_MISSING",
            message: `${label ?? "Debt"} object missing`
          });
          continue;
        }
  
        if (!d.state) {
          errors.push({
            code: "DEBT_STATE_MISSING",
            message: `${label ?? "Debt"} state missing`
          });
        }
  
        if (d.debt.principalAmount !== undefined && d.debt.principalAmount <= 0) {
          errors.push({
            code: "INVALID_DEBT_PRINCIPAL",
            message: `${label ?? "Debt"} principal must be > 0`
          });
        }
  
        if (d.debt.totalDurationMonths !== undefined && d.debt.totalDurationMonths <= 0) {
          errors.push({
            code: "INVALID_DEBT_DURATION",
            message: `${label ?? "Debt"} duration must be > 0`
          });
        }
  
        if (d.debt.nominalRateAnnual !== undefined && d.debt.nominalRateAnnual < 0) {
          errors.push({
            code: "INVALID_DEBT_RATE",
            message: `${label ?? "Debt"} nominalRateAnnual must be >= 0`
          });
        }
      }
    };
  
    validateDebtArray(input.debts, "SAS debt");
    validateDebtArray(input.sciDebts, "SCI debt");
  
    // =====================================================
    // 4) DISTRIBUTION LAYER
    // =====================================================
  
    if (input.distributableCashRate !== undefined) {
      if (input.distributableCashRate < 0 || input.distributableCashRate > 1) {
        errors.push({
          code: "INVALID_DISTRIBUTION_RATE",
          message: "Distributable rate must be between 0 and 1"
        });
      }
    }
  
    if (input.ccaPriorityRatio !== undefined) {
      if (input.ccaPriorityRatio < 0 || input.ccaPriorityRatio > 1) {
        errors.push({
          code: "INVALID_CCA_RATIO",
          message: "CCA ratio must be between 0 and 1"
        });
      }
    }
  
    if (input.reserveStrategicRatio !== undefined) {
      if (input.reserveStrategicRatio < 0 || input.reserveStrategicRatio > 1) {
        errors.push({
          code: "INVALID_RESERVE_RATIO",
          message: "Reserve ratio must be between 0 and 1"
        });
      }
    }
  
    // =====================================================
    // 5) SCI COHERENCE
    // =====================================================
  
    if (input.sciEnabled) {
      if (input.sciChargesCash === undefined || input.sciChargesCash < 0) {
        errors.push({
          code: "SCI_CHARGES_REQUIRED",
          message: "sciChargesCash required and must be >= 0 when SCI enabled"
        });
      }
      if (input.sciAmortization === undefined || input.sciAmortization < 0) {
        errors.push({
          code: "SCI_AMORT_REQUIRED",
          message: "sciAmortization required and must be >= 0 when SCI enabled"
        });
      }
    }
  
    // =====================================================
    // 6) RENT PLAN (NEW CANON)
    // =====================================================
  
    if (!input.rentPlan) {
      errors.push({
        code: "RENT_PLAN_REQUIRED",
        message: "rentPlan is required (DYNAMIC or MANUAL)"
      });
    } else {
  
      if (input.rentPlan.type === "DYNAMIC") {
  
        // DYNAMIC = 2 phases only
        if (!input.rentPlan.phase1 || !input.rentPlan.phase2) {
          errors.push({
            code: "DYNAMIC_PHASES_REQUIRED",
            message: "DYNAMIC rentPlan requires phase1 and phase2"
          });
        } else {
  
          // MUST start with DESENDETTEMENT_SCI
          if (input.rentPlan.phase1 !== "DESENDETTEMENT_SCI") {
            errors.push({
              code: "DYNAMIC_PHASE1_MUST_BE_DESENDETTEMENT_SCI",
              message: "DYNAMIC phase1 must be DESENDETTEMENT_SCI"
            });
          }
  
          // phase2 must differ from phase1
          if (input.rentPlan.phase1 === input.rentPlan.phase2) {
            errors.push({
              code: "DYNAMIC_PHASES_MUST_DIFFER",
              message: "DYNAMIC phase1 and phase2 must be different"
            });
          }
  
          // Trigger logic depends on ccaBalance
          if (input.ccaBalance === undefined) {
            errors.push({
              code: "CCA_BALANCE_REQUIRED_FOR_DYNAMIC",
              message: "ccaBalance is required for DYNAMIC rentPlan (trigger uses <= 0)"
            });
          }
        }
  
      } else if (input.rentPlan.type === "MANUAL") {
  
        // MANUAL = unlimited phases
        if (!input.rentPlan.phases || input.rentPlan.phases.length === 0) {
          errors.push({
            code: "MANUAL_PHASES_REQUIRED",
            message: "MANUAL rentPlan requires at least 1 phase"
          });
        } else {
  
          // startMonth must be increasing strictly
          for (let i = 0; i < input.rentPlan.phases.length; i++) {
            const p = input.rentPlan.phases[i];
  
            if (p.startMonth === undefined || p.startMonth < 0) {
              errors.push({
                code: "INVALID_PHASE_START_MONTH",
                message: "Each phase.startMonth must be >= 0"
              });
            }
  
            if (!p.mode) {
              errors.push({
                code: "INVALID_PHASE_MODE",
                message: "Each phase.mode is required"
              });
            }
  
            if (i > 0) {
              const prev = input.rentPlan.phases[i - 1];
              if (p.startMonth <= prev.startMonth) {
                errors.push({
                  code: "PHASES_NOT_STRICTLY_INCREASING",
                  message: "MANUAL phases.startMonth must be strictly increasing"
                });
              }
            }
          }
        }
  
      } else {
        errors.push({
          code: "INVALID_RENT_PLAN_TYPE",
          message: "rentPlan.type must be DYNAMIC or MANUAL"
        });
      }
    }
  
    // =====================================================
    // 7) BUILD PHASES (OPTIONAL)
    // =====================================================
  
    if (input.buildPhases) {
      for (const b of input.buildPhases) {
        if (b.capex !== undefined && b.capex < 0) {
          errors.push({
            code: "NEGATIVE_CAPEX",
            message: "Build CAPEX cannot be negative"
          });
        }
  
        if (b.capacityAdded !== undefined && b.capacityAdded < 0) {
          errors.push({
            code: "NEGATIVE_CAPACITY",
            message: "Capacity added cannot be negative"
          });
        }
  
        if (b.constructionMonths !== undefined && b.constructionMonths < 0) {
          errors.push({
            code: "INVALID_CONSTRUCTION_DURATION",
            message: "Construction duration invalid"
          });
        }
      }
    }
  
    return {
      valid: errors.length === 0,
      errors
    };
  }