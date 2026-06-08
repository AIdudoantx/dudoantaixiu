import { Router, type IRouter } from "express";
import { db, telegramChats } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { handleUpdate, setWebhook, getWebhookInfo, broadcastPrediction } from "../lib/telegram";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Webhook receiver ─────────────────────────────────────────────────
router.post("/telegram/webhook", async (req, res): Promise<void> => {
  try {
    await handleUpdate(req.body);
  } catch (err) {
    logger.error({ err }, "Telegram webhook error");
  }
  res.json({ ok: true });
});

// ── Register webhook ─────────────────────────────────────────────────
router.post("/telegram/setup-webhook", async (req, res): Promise<void> => {
  const domains = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (!domains) {
    res.status(400).json({ ok: false, error: "REPLIT_DOMAINS not set" });
    return;
  }
  const webhookUrl = `https://${domains}/api/telegram/webhook`;
  const result = await setWebhook(webhookUrl);
  res.json({ ...result, webhookUrl });
});

// ── Webhook info ─────────────────────────────────────────────────────
router.get("/telegram/webhook-info", async (_req, res): Promise<void> => {
  const info = await getWebhookInfo();
  res.json(info);
});

// ── List subscribed chats ─────────────────────────────────────────────
router.get("/telegram/chats", async (_req, res): Promise<void> => {
  const chats = await db.select().from(telegramChats).orderBy(sql`${telegramChats.createdAt} DESC`);
  res.json(chats);
});

// ── Broadcast now ─────────────────────────────────────────────────────
router.post("/telegram/broadcast", async (req, res): Promise<void> => {
  const gameType = req.body?.gameType === "md5" ? "md5" : "tx";
  const sent = await broadcastPrediction(gameType);
  res.json({ ok: true, sent });
});

// ── Remove a chat ─────────────────────────────────────────────────────
router.delete("/telegram/chats/:chatId", async (req, res): Promise<void> => {
  const chatId = Number(req.params.chatId);
  if (isNaN(chatId)) { res.status(400).json({ ok: false }); return; }
  await db.update(telegramChats).set({ active: false }).where(eq(telegramChats.chatId, chatId));
  res.json({ ok: true });
});

export default router;
