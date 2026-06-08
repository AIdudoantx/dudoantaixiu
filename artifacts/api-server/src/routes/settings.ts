import { Router, type IRouter } from "express";
import { db, appSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { setWebhook } from "../lib/telegram";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ALLOWED_KEYS = ["TELEGRAM_BOT_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

// ── Runtime config cache (loaded from DB at startup) ──────────────────
const runtimeConfig: Record<string, string> = {};

export async function loadSettingsFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(appSettings);
    for (const row of rows) {
      runtimeConfig[row.key] = row.value;
      process.env[row.key] = row.value;
    }
    logger.info({ keys: rows.map((r) => r.key) }, "Settings loaded from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load settings from DB");
  }
}

// ── GET /settings — return masked values ─────────────────────────────
router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appSettings);
  const dbMap: Record<string, string> = {};
  for (const r of rows) dbMap[r.key] = r.value;

  const result: Record<string, { configured: boolean; source: "db" | "env" | "none"; masked: string }> = {};
  for (const key of ALLOWED_KEYS) {
    const dbVal = dbMap[key];
    const envVal = process.env[key];
    const val = dbVal ?? envVal;
    result[key] = {
      configured: !!val,
      source: dbVal ? "db" : envVal ? "env" : "none",
      masked: val ? `${val.slice(0, 6)}${"*".repeat(Math.max(0, val.length - 10))}${val.slice(-4)}` : "",
    };
  }
  res.json(result);
});

// ── POST /settings — save key/value ──────────────────────────────────
router.post("/settings", async (req, res): Promise<void> => {
  const updates: Partial<Record<SettingKey, string>> = req.body ?? {};
  const saved: string[] = [];

  for (const key of ALLOWED_KEYS) {
    const val = updates[key];
    if (val === undefined || val === null) continue;

    if (val === "") {
      // Delete — revert to env
      await db.delete(appSettings).where(eq(appSettings.key, key));
      delete runtimeConfig[key];
      if (process.env[key] !== undefined) {
        // Can't delete env var, just clear DB override
      }
      saved.push(key);
      continue;
    }

    await db
      .insert(appSettings)
      .values({ key, value: val, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: val, updatedAt: new Date() } });

    runtimeConfig[key] = val;
    process.env[key] = val;
    saved.push(key);
  }

  // Re-register webhook if token changed
  if (saved.includes("TELEGRAM_BOT_TOKEN")) {
    const domains = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    if (domains) {
      const webhookUrl = `https://${domains}/api/telegram/webhook`;
      setWebhook(webhookUrl).catch((e) => logger.error({ e }, "Re-webhook failed"));
    }
  }

  res.json({ ok: true, saved });
});

export default router;
