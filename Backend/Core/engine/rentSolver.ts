// rentSolver.ts
// Canonical stable version
// Deterministic
// No mutation
// Compatible ProjectionEngine V1
// Dynamic mode via ccaFullyRepaid flag

// ============================
// TYPES
// ============================

export type RentMode =
  | "DESENDETTEMENT_SCI"
  | "OPTIMISATION_FISCALE"
  | "AUTONOMIE_SCI"
  | "OPTIMISATION_EBE_EXPLOITATION"
  | "FIXE";

export interface ExploitationRentInputs {
  revenue: number;
  opex: number;
  expInterest: number;
  expPrincipal: number;
  cashStart: number;
  taxRate: number;
}

export interface SciRentInputs {
  chargesCash: number;
  sciInterest: number;
  sciPrincipal: number;
  cashStart: number;
  taxRate: number;
  amortization: number;
}

export interface RentConstraints {
  mode: RentMode;
  fixedRentAmount?: number;

  marketMin?: number;
  marketMax?: number;
}

export interface RentResult {
  rent: number;
}

// ============================
// MAIN SOLVER
// ============================

export function solveRent(
  exploitation: ExploitationRentInputs,
  sci: SciRentInputs,
  constraints: RentConstraints,
  ccaFullyRepaid: boolean
): RentResult {

  let rent = 0;

  switch (constraints.mode) {

    // ==========================================
    // 1️⃣ DESENDETTEMENT SCI
    // ==========================================

    case "DESENDETTEMENT_SCI":
      if (!ccaFullyRepaid) {
        rent =
          sci.chargesCash +
          sci.sciInterest +
          sci.sciPrincipal;
      } else {
        const sciRaiAutonomie =
          0 - sci.amortization;
    
        const sciTaxAutonomie =
          computeISLocal(sciRaiAutonomie, sci.taxRate);
    
        rent =
          sci.chargesCash +
          sci.sciInterest +
          sci.sciPrincipal +
          sciTaxAutonomie;
      }
      break;

    // ==========================================
    // 2️⃣ AUTONOMIE SCI
    // ==========================================

    case "AUTONOMIE_SCI":

      // objectif : SCI autonome en cash
      // couvre charges + dette + IS

      const sciRaiAutonomie =
        0 - sci.amortization; // résultat fiscal nul

      const sciTaxAutonomie =
        computeISLocal(sciRaiAutonomie, sci.taxRate);

      rent =
        sci.chargesCash +
        sci.sciInterest +
        sci.sciPrincipal +
        sciTaxAutonomie;

      break;

    // ==========================================
    // 3️⃣ OPTIMISATION FISCALE
    // ==========================================

    case "OPTIMISATION_FISCALE":

      // On transfère le résultat vers SCI
      // On vise RAI exploitation proche de 0

      const ebitda =
        exploitation.revenue -
        exploitation.opex;

      const raiBeforeRent =
        ebitda -
        exploitation.expInterest;

      rent = raiBeforeRent;

      if (rent < 0)
        rent = 0;

      break;

    // ==========================================
    // 4️⃣ OPTIMISATION EBE EXPLOITATION
    // ==========================================

    case "OPTIMISATION_EBE_EXPLOITATION":

      // On limite le rent au strict minimum dette SCI
      rent =
        sci.sciInterest +
        sci.sciPrincipal;

      break;

    // ==========================================
    // 5️⃣ FIXE
    // ==========================================

    case "FIXE":

      if (constraints.fixedRentAmount === undefined)
        throw new Error("Fixed rent amount required");

      rent = constraints.fixedRentAmount;
      break;

    default:
      throw new Error("Unknown rent mode");
  }

  // ==========================================
  // MARKET INFORMATION (non bloquant)
  // ==========================================

  if (constraints.marketMin !== undefined) {
    if (rent < constraints.marketMin) {
      // info only, non blocking
    }
  }

  if (constraints.marketMax !== undefined) {
    if (rent > constraints.marketMax) {
      // info only, non blocking
    }
  }

  // ==========================================
  // SAFETY
  // ==========================================

  if (rent < 0)
    rent = 0;

  return { rent };
}

// ============================
// INTERNAL TAX HELPER
// ============================

function computeISLocal(
  rai: number,
  taxRate: number
): number {
  if (rai <= 0) return 0;
  return rai * taxRate;
}
