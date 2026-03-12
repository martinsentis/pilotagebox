import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/run-projection", (req, res) => {
  try {
    const inputs = req.body;

    const result = runProjection(inputs);

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: e.message,
      stack: e.stack
    });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});