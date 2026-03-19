import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/run-projection", (req, res) => {
  try {
    console.log("ROUTE HIT /run-projection");
    const inputs = req.body;

    const result = runProjection(inputs);

    res.json(result);
  } catch (e) {
    const err = e as Error;
  
    console.error(err);
  
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
});

app.listen(3001, () => {
  console.log("Backend running on port 3001");
});