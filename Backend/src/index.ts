
import { DEFAULT_TAX_SCHEDULES } from "../Core/engine/taxEngine";
import express from "express";
import { runProjection } from "../Core/engine/projectionEngine";
import cors from "cors";
const app = express();
app.use(cors());
app.use(express.json());

app.post("/run-projection", (req, res) => {
  try {
    const inputs = req.body;
    const result = runProjection(inputs);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});