import { db, telegramChats, taixiuSessions } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { getGeminiPrediction } from "../routes/gemini-prediction";

// ── Dynamic token (supports DB override) ─────────────────────────────
function getBotToken(): string | undefined {
  return process.env["TELEGRAM_BOT_TOKEN"];
}
function getApiBase(): string {
  return `https://api.telegram.org/bot${getBotToken()}`;
}

// ── Telegram API helpers ─────────────────────────────────────────────

export async function sendMessage(chatId: number, text: string): Promise<void> {
  if (!getBotToken()) return;
  try {
    await fetch(`${getApiBase()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    logger.error({ err, chatId }, "Telegram sendMessage failed");
  }
}

export async function setWebhook(webhookUrl: string): Promise<{ ok: boolean; description?: string }> {
  if (!getBotToken()) return { ok: false, description: "No bot token" };
  try {
    const res = await fetch(`${getApiBase()}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    return await res.json() as { ok: boolean; description?: string };
  } catch {
    return { ok: false, description: "Network error" };
  }
}

export async function deleteWebhook(): Promise<void> {
  if (!getBotToken()) return;
  await fetch(`${getApiBase()}/deleteWebhook`, { method: "POST" });
}

export async function getWebhookInfo(): Promise<Record<string, unknown>> {
  if (!getBotToken()) return { ok: false };
  try {
    const res = await fetch(`${getApiBase()}/getWebhookInfo`);
    return await res.json() as Record<string, unknown>;
  } catch {
    return { ok: false };
  }
}

// ── Session loading ───────────────────────────────────────────────────

interface Session {
  sessionId: number;
  result: "tai" | "xiu" | "bao";
  sum: number;
  dice1: number;
  dice2: number;
  dice3: number;
}

async function loadRecentSessions(gameType: "tx" | "md5", limit = 100): Promise<Session[]> {
  try {
    const rows = await db
      .select()
      .from(taixiuSessions)
      .where(eq(taixiuSessions.gameType, gameType))
      .orderBy(sql`${taixiuSessions.startTime} DESC`)
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}

// ── Fresh session fetch from external API ────────────────────────────

interface RawSession { rs: number[]; sessionId: number; time: number; startTime: number }

async function fetchFreshSessions(gameType: "tx" | "md5"): Promise<Session[]> {
  const url = gameType === "tx"
    ? "https://api.s6688v.xyz/tx_session_history_list"
    : "https://api.s6688v.xyz/txmd5_session_history_list";
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!res.ok) return [];
    const json = await res.json() as { d?: RawSession[] };
    return (json.d ?? []).map((s) => {
      const [d1 = 1, d2 = 1, d3 = 1] = s.rs;
      const sum = d1 + d2 + d3;
      return { sessionId: s.sessionId, result: d1 === d2 && d2 === d3 ? "bao" : sum >= 11 ? "tai" : "xiu", sum, dice1: d1, dice2: d2, dice3: d3 };
    });
  } catch { return []; }
}

// ════════════════════════════════════════════════════════════════════
// 3-METHOD PREDICTION ENGINE (replicated from prediction.ts)
// ════════════════════════════════════════════════════════════════════

// ── Method 1: Theo Xúc Xắc (Die Tracking) ───────────────────────────
function predictDieTracking(sessions: Session[]): { prediction: "tai" | "xiu" | "none"; confidence: number; predictedDice: number[]; predictedSum: number } {
  if (sessions.length < 4) return { prediction: "none", confidence: 0, predictedDice: [], predictedSum: 0 };
  const current = sessions[0];
  const past = sessions.slice(1, 19);
  const predicted = [0, 0, 0];
  let matchCount = 0;
  for (let pos = 0; pos < 3; pos++) {
    const val = current[`dice${pos + 1}` as "dice1" | "dice2" | "dice3"];
    let occ = 0;
    let found = false;
    for (let j = 0; j < past.length; j++) {
      if (past[j][`dice${pos + 1}` as "dice1" | "dice2" | "dice3"] === val) {
        occ++;
        if (occ === 2) {
          predicted[pos] = j > 0 ? past[j - 1][`dice${pos + 1}` as "dice1" | "dice2" | "dice3"] : val;
          matchCount++;
          found = true;
          break;
        }
      }
    }
    if (!found) predicted[pos] = val;
  }
  const sum = predicted[0] + predicted[1] + predicted[2];
  const prediction: "tai" | "xiu" = sum >= 11 ? "tai" : "xiu";
  const confidence = matchCount === 3 ? 0.78 : matchCount === 2 ? 0.65 : matchCount === 1 ? 0.55 : 0.48;
  return { prediction, confidence, predictedDice: predicted, predictedSum: sum };
}

// ── Bridge pattern engine (mirrors prediction.ts logic) ──────────────

function encodeRuns(directional: Array<"tai" | "xiu">): Array<{ side: "tai" | "xiu"; len: number }> {
  if (directional.length === 0) return [];
  const runs: Array<{ side: "tai" | "xiu"; len: number }> = [];
  let cur = directional[0];
  let len = 1;
  for (let i = 1; i < directional.length; i++) {
    if (directional[i] === cur) { len++; } else { runs.push({ side: cur, len }); cur = directional[i]; len = 1; }
  }
  runs.push({ side: cur, len });
  return runs;
}

const oppSide = (s: "tai" | "xiu"): "tai" | "xiu" => (s === "tai" ? "xiu" : "tai");

function analyzeBridgeRuns(runs: Array<{ side: "tai" | "xiu"; len: number }>): { prediction: "tai" | "xiu"; confidence: number; bridgeType: string } {
  const cur = runs[0];
  const prev = runs[1];
  const prev2 = runs[2];
  const prev3 = runs[3];
  const avgLen = runs.reduce((s, r) => s + r.len, 0) / runs.length;

  // 1. Cầu 1-1 liên tục
  if (runs.length >= 5 && runs.slice(0, 5).every((r) => r.len === 1)) {
    const cnt = runs.filter((r) => r.len === 1).length;
    return { prediction: oppSide(cur.side), confidence: Math.min(0.62 + cnt * 0.015, 0.82), bridgeType: `cầu 1-1 (${cnt} nhịp)` };
  }
  // 2. Cầu 2-2
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 2))
    return { prediction: oppSide(cur.side), confidence: 0.72, bridgeType: "cầu 2-2" };
  // 3. Cầu 3-3
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 3))
    return { prediction: oppSide(cur.side), confidence: 0.74, bridgeType: "cầu 3-3" };
  // 4. Cầu 4-4
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 4))
    return { prediction: oppSide(cur.side), confidence: 0.73, bridgeType: "cầu 4-4" };
  // 5. Cầu 1-2, 2-1, 1-3, 3-1, 2-3
  if (runs.length >= 4 && prev && prev2 && prev3) {
    const L = [cur.len, prev.len, prev2.len, prev3.len];
    if (L[0]===1&&L[1]===2&&L[2]===1&&L[3]===2) return { prediction: oppSide(cur.side), confidence: 0.66, bridgeType: "cầu 1-2" };
    if (L[0]===2&&L[1]===1&&L[2]===2&&L[3]===1) return { prediction: oppSide(cur.side), confidence: 0.66, bridgeType: "cầu 2-1" };
    if (L[0]===1&&L[1]===3&&L[2]===1&&L[3]===3) return { prediction: oppSide(cur.side), confidence: 0.65, bridgeType: "cầu 1-3" };
    if (L[0]===3&&L[1]===1&&L[2]===3&&L[3]===1) return { prediction: oppSide(cur.side), confidence: 0.65, bridgeType: "cầu 3-1" };
    if (L[0]===2&&L[1]===3&&L[2]===2&&L[3]===3) return { prediction: oppSide(cur.side), confidence: 0.64, bridgeType: "cầu 2-3" };
  }
  // 6. Cầu phẳng dài ≥ 4
  if (cur.len >= 4) return { prediction: oppSide(cur.side), confidence: Math.min(0.62+(cur.len-4)*0.05,0.86), bridgeType: `cầu phẳng ${cur.len}` };
  // 7. Cầu phẳng 3
  if (cur.len === 3) {
    if (avgLen <= 2.5) return { prediction: oppSide(cur.side), confidence: 0.60, bridgeType: "cầu phẳng 3 (bẻ)" };
    return { prediction: cur.side, confidence: 0.57, bridgeType: "cầu phẳng 3 (tiếp)" };
  }
  // 8. Chuỗi 2
  if (cur.len === 2) {
    if (prev?.len === 2) return { prediction: oppSide(cur.side), confidence: 0.62, bridgeType: "cầu 2-2 (hình thành)" };
    if (prev?.len === 1) return { prediction: oppSide(cur.side), confidence: 0.57, bridgeType: "cầu 2-1 (hình thành)" };
    return { prediction: avgLen > 2 ? cur.side : oppSide(cur.side), confidence: 0.55, bridgeType: "cầu 2 (TB)" };
  }
  // 9. Vừa đổi (len=1)
  if (cur.len === 1 && prev) {
    if (prev.len >= 5) return { prediction: cur.side, confidence: 0.60, bridgeType: `đảo cầu dài (sau ${prev.len})` };
    if (prev.len >= 3) return { prediction: oppSide(cur.side), confidence: 0.55, bridgeType: "đảo cầu ngắn" };
    if (prev.len === 1) return { prediction: oppSide(cur.side), confidence: 0.58, bridgeType: "cầu 1-1 (khởi đầu)" };
    return { prediction: cur.side, confidence: 0.54, bridgeType: "cầu 1-2 (hình thành)" };
  }
  // 10. Cầu zigzag
  const shortRuns = runs.slice(0, 8).filter((r) => r.len <= 2).length;
  if (shortRuns >= 6) return { prediction: oppSide(cur.side), confidence: 0.55, bridgeType: "cầu zigzag" };
  // 11. Tăng/giảm dần
  if (runs.length >= 3) {
    const L = runs.slice(0, 3).map(r => r.len);
    if (L[0] > L[1] && L[1] > L[2]) return { prediction: cur.side, confidence: 0.57, bridgeType: "cầu tăng dần" };
    if (L[0] < L[1] && L[1] < L[2]) return { prediction: oppSide(cur.side), confidence: 0.56, bridgeType: "cầu giảm dần" };
  }
  // 12. Fallback thống kê
  const recent = runs.slice(0, 10).flatMap((r) => Array<"tai"|"xiu">(r.len).fill(r.side)).slice(0, 20);
  const tCnt = recent.filter(r => r === "tai").length;
  const xCnt = recent.length - tCnt;
  const maj: "tai"|"xiu" = tCnt >= xCnt ? "tai" : "xiu";
  const majPct = Math.max(tCnt, xCnt) / Math.max(recent.length, 1);
  return { prediction: majPct > 0.6 ? oppSide(maj) : maj, confidence: 0.52, bridgeType: "xu hướng tổng quát" };
}

// ── Method 2: Bắt Cầu (Bridge Pattern) ──────────────────────────────
function predictBatCau(sessions: Session[]): { prediction: "tai" | "xiu" | "none"; confidence: number; bridgeType: string } {
  const results = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");
  if (results.length < 4) return { prediction: "none", confidence: 0, bridgeType: "không đủ dữ liệu" };
  const runs = encodeRuns(results);
  const { prediction, confidence, bridgeType } = analyzeBridgeRuns(runs);
  return { prediction, confidence, bridgeType };
}

// ── Method 3: Nhịp Chu Kỳ (Cycle Rhythm) ────────────────────────────
function predictCycleRhythm(sessions: Session[]): { prediction: "tai" | "xiu" | "none"; confidence: number; streak: number; avgRun: number } {
  const results = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");
  if (results.length < 10) return { prediction: "none", confidence: 0, streak: 0, avgRun: 0 };

  let streak = 1;
  const cur = results[0];
  for (let i = 1; i < results.length; i++) { if (results[i] === cur) streak++; else break; }

  let runLen = 1, runTotal = 0, runCount = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i] === results[i - 1]) runLen++;
    else { runTotal += runLen; runCount++; runLen = 1; }
  }
  const avgRun = runCount > 0 ? runTotal / runCount : 2;
  const prediction: "tai" | "xiu" = streak >= avgRun ? (cur === "tai" ? "xiu" : "tai") : cur;
  const diff = Math.abs(streak - avgRun);
  const confidence = Math.min(0.5 + diff * 0.06, 0.80);
  return { prediction, confidence, streak, avgRun };
}

// ── Build broadcast message with all 3 predictions ───────────────────

function buildBroadcastMessage(gameType: "tx" | "md5", sessions: Session[]): string {
  const fresh = sessions;
  const m1 = predictDieTracking(fresh);
  const m2 = predictBatCau(sessions);
  const m3 = predictCycleRhythm(sessions);

  const label = (p: "tai" | "xiu" | "none") => p === "tai" ? "🔴 TÀI" : p === "xiu" ? "🔵 XỈU" : "⚪ Chưa rõ";
  const pct = (c: number) => `${Math.round(c * 100)}%`;

  // Consensus
  const votes = [m1.prediction, m2.prediction, m3.prediction].filter((p) => p !== "none");
  const taiVotes = votes.filter((v) => v === "tai").length;
  const xiuVotes = votes.filter((v) => v === "xiu").length;
  const consensus: "tai" | "xiu" | "none" = taiVotes > xiuVotes ? "tai" : xiuVotes > taiVotes ? "xiu" : "none";

  // Streak stats
  const results = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");
  let streak = 1;
  const streakType = results[0];
  for (let i = 1; i < results.length; i++) { if (results[i] === streakType) streak++; else break; }
  const last30 = results.slice(0, 30);
  const taiPct = Math.round(last30.filter((r) => r === "tai").length / Math.max(last30.length, 1) * 100);
  const xiuPct = 100 - taiPct;

  const diceStr = m1.predictedDice.length === 3
    ? ` [${m1.predictedDice.join("-")}] = ${m1.predictedSum}`
    : "";

  return [
    `🎲 <b>DỰ ĐOÁN ${gameType.toUpperCase()} — ${label(consensus)}</b>`,
    ``,
    `━━━ 3 PHƯƠNG PHÁP ━━━`,
    `1️⃣ <b>Theo Xúc Xắc</b>${diceStr}`,
    `   → ${label(m1.prediction)}  (${pct(m1.confidence)})`,
    ``,
    `2️⃣ <b>Bắt Cầu</b> (${m2.bridgeType})`,
    `   → ${label(m2.prediction)}  (${pct(m2.confidence)})`,
    ``,
    `3️⃣ <b>Nhịp Chu Kỳ</b> (chuỗi ${m3.streak} / TB ${m3.avgRun.toFixed(1)})`,
    `   → ${label(m3.prediction)}  (${pct(m3.confidence)})`,
    ``,
    `━━━ THỐNG KÊ ━━━`,
    `📊 Chuỗi: <b>${streak} ${streakType === "tai" ? "TÀI" : "XỈU"}</b> liên tiếp`,
    `📈 Tỉ lệ 30 phiên: TÀI ${taiPct}% · XỈU ${xiuPct}%`,
    ``,
    `🏆 <b>ĐỒNG THUẬN: ${taiVotes}/3 TÀI · ${xiuVotes}/3 XỈU</b>`,
    `⚠️ Chỉ tham khảo, không đảm bảo kết quả`,
  ].join("\n");
}

// ── Build "new result + next prediction" message ─────────────────────

function buildNewResultMessage(
  gameType: "tx" | "md5",
  latestSession: Session,
  sessions: Session[],
  gemini?: { prediction: "tai" | "xiu" | "none"; confidence: "LOW" | "MEDIUM" | "HIGH"; reasoning: string; available: boolean } | null,
): string {
  const resEmoji = latestSession.result === "tai" ? "🔴" : latestSession.result === "xiu" ? "🔵" : "🎰";
  const resLabel = latestSession.result === "tai" ? "TÀI" : latestSession.result === "xiu" ? "XỈU" : "BÁO";
  const diceStr = `[${latestSession.dice1}-${latestSession.dice2}-${latestSession.dice3}]`;

  // Now compute prediction for NEXT session using all accumulated data
  const fresh = sessions;
  const m1 = predictDieTracking(fresh);
  const m2 = predictBatCau(sessions);
  const m3 = predictCycleRhythm(sessions);

  const label = (p: "tai" | "xiu" | "none") => p === "tai" ? "🔴 TÀI" : p === "xiu" ? "🔵 XỈU" : "⚪ Chưa rõ";
  const pct = (c: number) => `${Math.round(c * 100)}%`;

  const allPredictions = [m1.prediction, m2.prediction, m3.prediction];
  if (gemini?.available && gemini.prediction !== "none") allPredictions.push(gemini.prediction);
  const votes = allPredictions.filter((p) => p !== "none");
  const taiV = votes.filter((v) => v === "tai").length;
  const xiuV = votes.filter((v) => v === "xiu").length;
  const total = taiV + xiuV;
  const consensus: "tai" | "xiu" | "none" = taiV > xiuV ? "tai" : xiuV > taiV ? "xiu" : "none";

  const diceNext = m1.predictedDice.length === 3
    ? ` [${m1.predictedDice.join("-")}]=${m1.predictedSum}`
    : "";

  const geminiLine = gemini?.available && gemini.prediction !== "none"
    ? [``, `4️⃣ <b>AI Gemini</b> (${gemini.confidence})`, `   → ${label(gemini.prediction)}  · ${gemini.reasoning}`]
    : [];

  return [
    `${resEmoji} <b>PHIÊN #${latestSession.sessionId} — ${resLabel}</b>`,
    `🎲 Xúc xắc: <code>${diceStr}</code> = ${latestSession.sum}`,
    ``,
    `━━━ DỰ ĐOÁN PHIÊN TIẾP ━━━`,
    `1️⃣ <b>Theo Xúc Xắc</b>${diceNext}`,
    `   → ${label(m1.prediction)}  (${pct(m1.confidence)})`,
    ``,
    `2️⃣ <b>Bắt Cầu</b> (${m2.bridgeType})`,
    `   → ${label(m2.prediction)}  (${pct(m2.confidence)})`,
    ``,
    `3️⃣ <b>Nhịp Chu Kỳ</b>`,
    `   → ${label(m3.prediction)}  (${pct(m3.confidence)})`,
    ...geminiLine,
    ``,
    `🏆 <b>ĐỒNG THUẬN: ${taiV}/${total} TÀI · ${xiuV}/${total} XỈU → ${consensus !== "none" ? (consensus === "tai" ? "TÀI" : "XỈU") : "Hoà"}</b>`,
    `⚠️ Chỉ tham khảo`,
  ].join("\n");
}

// ── Broadcast to all subscribed chats ────────────────────────────────

export async function broadcastPrediction(gameType: "tx" | "md5" = "tx"): Promise<number> {
  const chats = await db
    .select()
    .from(telegramChats)
    .where(sql`${telegramChats.active} = true AND ${telegramChats.gameType} = ${gameType}`);

  if (chats.length === 0) return 0;

  const [fresh, historical] = await Promise.all([
    fetchFreshSessions(gameType),
    loadRecentSessions(gameType, 200),
  ]);
  const sessions = historical.length >= fresh.length ? historical : fresh;
  if (sessions.length === 0) return 0;

  const msg = buildBroadcastMessage(gameType, sessions);

  let sent = 0;
  for (const chat of chats) {
    await sendMessage(chat.chatId, msg);
    sent++;
  }
  return sent;
}

// ── Real-time session poller ──────────────────────────────────────────
// Polls fresh API every POLL_INTERVAL_MS. When a new session is detected,
// immediately sends "result + next prediction" to all subscribed chats.

const lastSeenId: Record<"tx" | "md5", number> = { tx: 0, md5: 0 };

async function pollOnce(gameType: "tx" | "md5"): Promise<void> {
  try {
    const chats = await db
      .select()
      .from(telegramChats)
      .where(sql`${telegramChats.active} = true AND ${telegramChats.gameType} = ${gameType}`);

    if (chats.length === 0) return; // no subscribers for this type

    const fresh = await fetchFreshSessions(gameType);
    if (fresh.length === 0) return;

    const newest = fresh[0]; // newest-first
    if (newest.sessionId <= lastSeenId[gameType]) return; // already processed

    // New session detected
    lastSeenId[gameType] = newest.sessionId;

    // Use fresh data for prediction (supplement with DB if fresh is small)
    const historical = await loadRecentSessions(gameType, 200);
    const sessions = historical.length >= fresh.length ? historical : fresh;

    const gemini = await getGeminiPrediction(gameType).catch(() => null);
    const msg = buildNewResultMessage(gameType, newest, sessions, gemini);

    for (const chat of chats) {
      await sendMessage(chat.chatId, msg);
    }

    logger.info(
      { gameType, sessionId: newest.sessionId, chats: chats.length },
      "New session detected — broadcast sent",
    );
  } catch (err) {
    logger.error({ err, gameType }, "Session poller error");
  }
}

export function startSessionPoller(pollIntervalMs = 30_000): void {
  // Warm-up: seed lastSeenId so we don't re-broadcast old results on startup
  const warmup = async () => {
    for (const gt of ["tx", "md5"] as const) {
      const fresh = await fetchFreshSessions(gt);
      if (fresh.length > 0) {
        lastSeenId[gt] = fresh[0].sessionId;
        logger.info({ gameType: gt, lastSeenId: lastSeenId[gt] }, "Poller warm-up");
      }
    }
  };

  warmup().catch((e) => logger.error({ e }, "Poller warm-up failed"));

  setInterval(async () => {
    await Promise.all([pollOnce("tx"), pollOnce("md5")]);
  }, pollIntervalMs);

  logger.info({ pollIntervalMs }, "Session poller started");
}

// ── Handle incoming webhook update ───────────────────────────────────

interface TelegramUpdate {
  message?: {
    chat: { id: number; title?: string; first_name?: string; type: string };
    text?: string;
  };
}

async function getPredictionMessage(chatId: number): Promise<string> {
  const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, chatId)).limit(1);
  const gameType = (chat?.gameType ?? "tx") as "tx" | "md5";
  const [fresh, historical] = await Promise.all([fetchFreshSessions(gameType), loadRecentSessions(gameType, 100)]);
  const sessions = historical.length >= fresh.length ? historical : fresh;
  if (sessions.length === 0) return "⚠️ Chưa có dữ liệu. Vui lòng thử lại sau.";
  return buildBroadcastMessage(gameType, sessions);
}

export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const chatTitle = msg.chat.title ?? msg.chat.first_name ?? String(chatId);
  const text = msg.text.trim();

  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const gameType: "tx" | "md5" = parts[1] === "md5" ? "md5" : "tx";

    await db
      .insert(telegramChats)
      .values({ chatId, chatTitle, gameType, active: true })
      .onConflictDoUpdate({
        target: telegramChats.chatId,
        set: { active: true, gameType, chatTitle, updatedAt: new Date() },
      });

    const gameLabel = gameType === "tx" ? "TX" : "MD5";
    await sendMessage(
      chatId,
      `✅ <b>Đăng ký thành công! Bàn ${gameLabel}</b>\n\n` +
      `Bot sẽ gửi <b>3 dự đoán</b> mỗi 5 phút.\n\n` +
      `📌 Lệnh:\n/start tx · /start md5\n/predict — dự đoán ngay\n/stop — huỷ đăng ký`,
    );
    // Send first prediction immediately
    const predMsg = await getPredictionMessage(chatId);
    await sendMessage(chatId, predMsg);
    return;
  }

  if (text.startsWith("/stop")) {
    await db.update(telegramChats).set({ active: false, updatedAt: new Date() }).where(eq(telegramChats.chatId, chatId));
    await sendMessage(chatId, "🔕 Đã huỷ đăng ký. Gõ /start để bật lại.");
    return;
  }

  if (text.startsWith("/predict")) {
    const predMsg = await getPredictionMessage(chatId);
    await sendMessage(chatId, predMsg);
    return;
  }

  if (text.startsWith("/status")) {
    const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, chatId)).limit(1);
    if (!chat || !chat.active) {
      await sendMessage(chatId, "❌ Chưa đăng ký. Gõ /start để bắt đầu.");
    } else {
      await sendMessage(chatId, `✅ Đang theo dõi bàn <b>${chat.gameType.toUpperCase()}</b>\nDự đoán gửi mỗi 5 phút.`);
    }
    return;
  }
}
