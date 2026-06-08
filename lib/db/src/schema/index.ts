import { pgTable, integer, text, smallint, bigint, index, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Accumulated Tài Xỉu game session history.
 * We poll the external API (max 100/call) and upsert here,
 * so the dataset grows continuously and gives Markov/pattern
 * algorithms thousands of samples over time.
 */
export const taixiuSessions = pgTable(
  "taixiu_sessions",
  {
    sessionId: integer("session_id").primaryKey(),
    gameType: text("game_type", { enum: ["tx", "md5"] }).notNull(),
    dice1: smallint("dice1").notNull(),
    dice2: smallint("dice2").notNull(),
    dice3: smallint("dice3").notNull(),
    sum: smallint("sum").notNull(),
    result: text("result", { enum: ["tai", "xiu", "bao"] }).notNull(),
    startTime: bigint("start_time", { mode: "number" }).notNull(),
    endTime: bigint("end_time", { mode: "number" }).notNull(),
  },
  (t) => [
    index("idx_tx_sessions_type_start").on(t.gameType, t.startTime),
  ],
);

/**
 * App-level key/value settings stored in DB (override env vars at runtime).
 * Keys: TELEGRAM_BOT_TOKEN, OPENAI_API_KEY
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Telegram chats that have subscribed to prediction broadcasts.
 * Populated via /start command in the bot.
 */
export const telegramChats = pgTable("telegram_chats", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  chatTitle: text("chat_title"),
  gameType: text("game_type", { enum: ["tx", "md5"] }).notNull().default("tx"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
