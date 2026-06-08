import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taixiuRouter from "./taixiu";
import predictionRouter from "./prediction";
import aiAnalysisRouter from "./ai-analysis";
import telegramRouter from "./telegram";
import settingsRouter from "./settings";
import geminiPredictionRouter from "./gemini-prediction";

const router: IRouter = Router();

router.use(healthRouter);
router.use(taixiuRouter);
router.use(predictionRouter);
router.use(aiAnalysisRouter);
router.use(telegramRouter);
router.use(settingsRouter);
router.use(geminiPredictionRouter);

// Expose Expo Go URL for the Settings QR code
router.get("/expo-url", (_req, res) => {
  const expoDomain = process.env["REPLIT_EXPO_DEV_DOMAIN"];
  const expoUrl = expoDomain ? `exp://${expoDomain}` : null;
  res.json({ expoUrl, domain: expoDomain ?? null });
});

export default router;
