# API Contract — pilotagebox Backend

Base URL (local) : `http://localhost:3001`  
Base URL (Railway) : voir variable d'environnement `RAILWAY_URL`

---

## GET /health

Vérifie que le serveur est en ligne.

**Réponse 200**
```json
{ "status": "ok" }
```

---

## POST /run-projection

Lance la simulation financière complète (SAS + SCI) et retourne les résultats mois par mois ainsi que les métriques investisseur.

### Corps de la requête

```jsonc
{
  // ── Horizon ────────────────────────────────────────────────────────────────
  "horizonMonths": 24,          // nombre de mois à simuler (entier ≥ 1)
  "projectStartDate": "2025-01", // YYYY-MM — mois 0 de la simulation

  // ── Trésorerie initiale ────────────────────────────────────────────────────
  "initialCash": 50000,    // trésorerie de départ SAS (€)
  "sciInitialCash": 20000, // trésorerie de départ SCI (€)

  // ── Fiscalité ──────────────────────────────────────────────────────────────
  // ⚠️  OBLIGATOIRE et NON VIDE. Doit couvrir toute la période simulée.
  // Le moteur sélectionne le schedule actif à chaque mois.
  // Pour la France : taux réduit 15 % jusqu'à 42 500 €, puis 25 %.
  "taxSchedules": [
    {
      "startDate": "2025-01", // YYYY-MM — début de validité
      "endDate": null,         // YYYY-MM ou null (= valable indéfiniment)
      "brackets": [
        { "upTo": 42500, "rate": 0.15 }, // tranche 1 : jusqu'à 42 500 € à 15 %
        { "upTo": null,  "rate": 0.25 }  // tranche 2 : au-delà à 25 %
      ]
    }
  ],
  "taxRate": 0.25, // taux marginal utilisé par le rentSolver (decimal)

  // ── Phases de capacité ─────────────────────────────────────────────────────
  // Chaque phase = une tranche de boxes.
  // ⚠️  targetLeasedSurfacePercent est en décimal (0.80 = 80 %), PAS en entier.
  "phases": [
    {
      "phaseId": "p1",                    // identifiant unique (string)
      "isActive": true,
      "totalSurface": 1000,               // surface totale de la phase (m²)
      "operationalStartMonth": 2,         // mois d'activation physique (0-based)
      "rampUpStartMonth": 2,              // mois de début de commercialisation (0-based)
      "rampUpDurationMonths": 6,          // durée de montée en charge (mois)
      "rampCurve": "LINEAR"               // "LINEAR" | "SLOW_START" | "FAST_START"
    }
  ],

  // ── Paramètres de revenu ───────────────────────────────────────────────────
  "revenueParams": {
    "pricePerM2": 15,                        // loyer mensuel par m² (€)
    "targetLeasedSurfacePercent": 0.80,      // ⚠️  décimal 0→1 (PAS 0→100)
    "annualIndexationRate": 0.02,            // indexation annuelle (décimal)
    "indexationMonth": 1                     // mois d'application de l'indexation (0-based)
  },

  // ── Services additionnels ──────────────────────────────────────────────────
  "services": [
    // optionnel — revenus complémentaires par m² loué
    {
      "code": "ASSURANCE",
      "monthlyAmountPerLeasedM2": 0.5,
      "isActive": true
    }
  ],

  // ── Charges d'exploitation (SAS) ──────────────────────────────────────────
  // Toutes les charges sont pushées en SAS_OPEX quelle que soit la valeur
  // de categoryCode envoyée — le moteur ignore ce champ et force SAS_OPEX.
  "operatingCharges": [
    { "categoryCode": "SAS_OPEX", "monthlyAmount": 3000, "isActive": true },
    { "categoryCode": "SAS_OPEX", "monthlyAmount": 1500, "isActive": false }
  ],

  // ── Dettes SAS (exploitation) ─────────────────────────────────────────────
  "debts": [
    {
      "debt": {
        "principalAmount": 500000,
        "nominalRateAnnual": 0.045,          // taux nominal annuel (décimal)
        "insuranceRateAnnual": 0.003,        // taux assurance annuel (décimal)
        "totalDurationMonths": 180,
        "defermentMonths": 6,                // optionnel
        "defermentType": "INTEREST_ONLY",    // "NONE" | "INTEREST_ONLY" | "TOTAL"
        "defermentExtendsDuration": false,
        "suspensionAllowed": false
      },
      "state": {
        "remainingPrincipal": 500000,        // capital restant dû au mois 0
        "remainingMonths": 180
      }
    }
  ],

  // ── Dettes SCI (immobilier) ───────────────────────────────────────────────
  "sciDebts": [], // même structure que debts

  // ── Charges SCI ───────────────────────────────────────────────────────────
  "sciChargesCash": 500,     // charges cash mensuelles SCI (€)
  "sciAmortization": 200,    // dotation amortissement mensuelle SCI (€, non-cash)

  // ── Loyer inter-entités ────────────────────────────────────────────────────
  "rentConstraints": {
    "mode": "AUTONOMIE_SCI",   // "DESENDETTEMENT_SCI" | "OPTIMISATION_FISCALE"
                                // "AUTONOMIE_SCI" | "OPTIMISATION_EBE_EXPLOITATION"
                                // "FIXE"
    "fixedRentAmount": 2000,   // requis si mode = "FIXE" (€/mois)
    "marketMin": 500,           // optionnel — plancher de marché (€)
    "marketMax": 5000           // optionnel — plafond de marché (€)
  },

  // ── Comptes courants d'associés (CCA) ─────────────────────────────────────
  "ccaBalanceSas": 100000,  // solde CCA SAS à rembourser (€)
  "ccaBalanceSci": 50000,   // solde CCA SCI à rembourser (€)

  // ── Règles de distribution (annuelle, mois 11, 23, …) ─────────────────────
  "distributableCashRate": 0.6,        // fraction de la tréso distribuable (0→1)
  "ccaPriorityRatio": 0.4,             // part du distributable allouée au CCA (0→1)
  "reserveStrategicRatio": 0.1,        // part mise en réserve (0→1)
  "reserveAfterCcaFullyRepaid": false, // activer la réserve seulement après CCA soldé

  // ── Seuils de pilotage ─────────────────────────────────────────────────────
  "bufferMin": 5000,   // trésorerie minimale à maintenir (€) — déclenche un warning
  "dscrMin": 1.2,      // DSCR minimum acceptable — déclenche un warning + bloque distribution

  // ── Métriques investisseur ─────────────────────────────────────────────────
  // Utilisé pour calculer TRI / multiple / payback.
  // Laisser [] si pas d'equity track.
  "equityContributions": [
    { "monthIndex": 0, "amount": 200000 } // montant positif (le moteur le transforme en négatif)
  ]
}
```

### Champs obligatoires vs optionnels

| Champ | Obligatoire | Défaut si absent |
|---|---|---|
| `horizonMonths` | non | 12 |
| `projectStartDate` | non | `"2025-01"` |
| `initialCash` | non | 0 |
| `sciInitialCash` | non | 0 |
| `taxSchedules` | **OUI** ⚠️ | — lève une erreur |
| `taxRate` | non | 0.25 |
| `phases` | non | `[]` |
| `revenueParams` | non | prix/surface à 0 |
| `revenueParams.targetLeasedSurfacePercent` | **décimal 0→1** ⚠️ | — lève une erreur si > 1 |
| `services` | non | `[]` |
| `operatingCharges` | non | `[]` |
| `debts` | non | `[]` |
| `sciDebts` | non | `[]` |
| `sciChargesCash` | non | 0 |
| `sciAmortization` | non | 0 |
| `rentConstraints` | non | `{ mode: "AUTONOMIE_SCI" }` |
| `rentConstraints.fixedRentAmount` | si mode=FIXE ⚠️ | — |
| `ccaBalanceSas` | non | 0 |
| `ccaBalanceSci` | non | 0 |
| `distributableCashRate` | non | 0 |
| `ccaPriorityRatio` | non | 0 |
| `reserveStrategicRatio` | non | 0 |
| `reserveAfterCcaFullyRepaid` | non | false |
| `bufferMin` | non | 0 |
| `dscrMin` | non | pas de seuil |
| `equityContributions` | non | `[]` |

### Erreurs connues et leurs causes

| Message d'erreur | Cause |
|---|---|
| `No tax schedules provided` | `taxSchedules` est vide ou absent |
| `No tax schedule found for date YYYY-MM` | Aucun schedule ne couvre la période simulée |
| `Tax brackets are empty` | Un schedule existe mais son tableau `brackets` est vide |
| `Invalid target_leased_surface_percent` | `revenueParams.targetLeasedSurfacePercent` > 1 (envoyé en %, doit être en décimal) |
| `SAS cash invariant violated` | La trésorerie SAS passe en négatif — revoir bufferMin ou les charges |
| `SCI cash invariant violated` | La trésorerie SCI passe en négatif — revoir sciChargesCash ou le loyer |

### Réponse 200

```jsonc
{
  "results": [
    {
      "monthIndex": 0,           // mois (0-based)
      "cashEnd": 45000,          // trésorerie SAS en fin de mois (€)
      "sciCashEnd": 20000,       // trésorerie SCI en fin de mois (€)
      "dscr": 0.0,               // DSCR du mois (0 si pas de dette ou hors période opérationnelle)
      "flows": [
        // liste de tous les flux du mois
        { "monthIndex": 0, "categoryCode": "SAS_REVENUE", "amount": 12000 },
        { "monthIndex": 0, "categoryCode": "SAS_OPEX",    "amount": -4500 },
        { "monthIndex": 0, "categoryCode": "SAS_RENT",    "amount": -500  },
        { "monthIndex": 0, "categoryCode": "SCI_RENT",    "amount": 500   }
        // ... SAS_TAX, SAS_EXP_DEBT_*, SCI_DEBT_*, SAS_DISTRIBUTION_*, SCI_DISTRIBUTION_*
      ],
      "projectedByCategory": {
        // agrégat des flows par code — pratique pour l'affichage front
        "SAS_REVENUE": 12000,
        "SAS_OPEX": -4500,
        "SAS_RENT": -500,
        "SCI_RENT": 500
      },
      "warnings": []
      // warnings possibles :
      // "buffer_below_minimum"          — trésorerie < bufferMin
      // "dscr_below_minimum"            — DSCR < dscrMin (période opérationnelle)
      // "distribution_blocked:<reason>" — distribution annuelle bloquée
    }
    // ... un objet par mois jusqu'à horizonMonths - 1
  ],

  "investorMetrics": {
    "irrAnnual": 0.142,            // TRI annualisé (null si non calculable)
    "irrMonthly": 0.011,           // TRI mensuel (null si non calculable)
    "multiple": 1.8,               // multiple sur mise (totalCashReturned / totalEquityInvested)
    "totalEquityInvested": 200000, // somme des equity contributions (€)
    "totalCashReturned": 360000,   // somme des dividendes versés + valeur terminale (€)
    "paybackMonth": 38,            // mois de retour sur investissement (null si non atteint)
    "averageAnnualCashYield": 0.142 // = irrAnnual
  }
}
```

### Codes de catégorie possibles dans `flows`

| Code | Entité | Sens |
|---|---|---|
| `SAS_REVENUE` | SAS | + revenus locatifs et services |
| `SAS_OPEX` | SAS | − toutes les charges d'exploitation |
| `SAS_RENT` | SAS | − loyer versé à la SCI |
| `SAS_EXP_DEBT_INTEREST` | SAS | − intérêts dette exploitation |
| `SAS_EXP_DEBT_PRINCIPAL` | SAS | − capital remboursé dette exploitation |
| `SAS_EXP_DEBT_INSURANCE` | SAS | − assurance dette exploitation |
| `SAS_TAX` | SAS | − impôt sur les sociétés |
| `SAS_DISTRIBUTION_CCA` | SAS | − remboursement CCA |
| `SAS_DISTRIBUTION_RESERVE` | SAS | − mise en réserve |
| `SAS_DISTRIBUTION_DIVIDENDS` | SAS | − dividendes versés |
| `SCI_RENT` | SCI | + loyer reçu de la SAS |
| `SCI_DEBT_INTEREST` | SCI | − intérêts dette immobilière |
| `SCI_DEBT_PRINCIPAL` | SCI | − capital remboursé dette immobilière |
| `SCI_DEBT_INSURANCE` | SCI | − assurance dette immobilière |
| `SCI_TAX` | SCI | − impôt SCI |
| `SCI_DISTRIBUTION_CCA` | SCI | − remboursement CCA SCI |
| `SCI_DISTRIBUTION_RESERVE` | SCI | − mise en réserve SCI |
| `SCI_DISTRIBUTION_DIVIDENDS` | SCI | − dividendes SCI |

### Réponse 500

```json
{ "error": "message d'erreur", "stack": "..." }
```
