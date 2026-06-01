import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";
import { computeInvestorMetrics, CashFlowPoint } from "../Core/engine/investorMetricsEngine";
import { PORT } from "./config";

const app = express();

// CORS doit être AVANT express.json() pour que toutes les réponses
// d'erreur (413, 400, 500) aient bien Access-Control-Allow-Origin.
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/run-projection", (req, res) => {
  try {
    const inputs = req.body;
    const results = runProjection(inputs);

    const equityContributions: CashFlowPoint[] = (inputs.equityContributions ?? []).map(
      (e: any) => ({ monthIndex: e.monthIndex, cashFlow: -Math.abs(e.amount) })
    );

    const distributions: CashFlowPoint[] = results.flatMap((month) =>
      month.flows
        .filter((f) =>
          f.categoryCode === "SAS_DISTRIBUTION_DIVIDENDS" ||
          f.categoryCode === "SCI_DISTRIBUTION_DIVIDENDS"
        )
        .map((f) => ({ monthIndex: f.monthIndex, cashFlow: Math.abs(f.amount) }))
    );

    const investorMetrics = computeInvestorMetrics({
      equityContributions,
      distributions,
      horizonMonths: inputs.horizonMonths ?? results.length,
    });

    res.json({ results, investorMetrics });
  } catch (e) {
    const err = e as Error;
    console.error(err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
