import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";
import { computeInvestorMetrics, CashFlowPoint } from "../Core/engine/investorMetricsEngine";
import { PORT } from "./config";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"],
  })
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

function handleSimulate(req: express.Request, res: express.Response) {
  try {
    const inputs = req.body;
    const results = runProjection(inputs);
    res.json(results);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
}

app.post("/simulate", handleSimulate);

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
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
