import express from "express";
import cors from "cors";
import { runProjection } from "../Core/engine/projectionEngine";

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"],
  })
);

app.use(express.json());

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
app.post("/run-projection", handleSimulate);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});