import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/run-projection", (req, res) => {
  try {
    const inputs = req.body;

    console.log("INPUTS RECEIVED:", inputs);

    const result = runProjection(inputs);

    res.json(result);
  } catch (e) {
    console.error("ENGINE ERROR:", e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});