import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import {
  GetTaixiuHistoryQueryParams,
  GetTaixiuHistoryResponse,
  GetTaixiuStatsResponse,
  GetTaixiuPatternQueryParams,
  GetTaixiuPatternResponse,
  GetTaixiuTopResponse,
} from "@workspace/api-zod";
import { db, taixiuSessions } from "@workspace/db";

const router: IRouter = Router();

const TX_HISTORY_URL = "https://api.s6688v.xyz/tx_session_history_list";
const MD5_HISTORY_URL = "https://api.s6688v.xyz/txmd5_session_history_list";
const TOP_URL = "https://api.s6688v.xyz/sand999_top_one";

interface RawSession {
  rs: number[];
  startTime: number;
  _id: string;
  sessionId: number;
  time: number;
}

interface RawHistoryResponse {
  d: RawSession[];
}

function classifyResult(dice: number[]): "tai" | "xiu" | "bao" {
  const [a, b, c] = dice;
  if (a === b && b === c) return "bao";
  const sum = a + b + c;
  return sum >= 11 ? "tai" : "xiu";
}

function computeSum(dice: number[]): number {
  return dice.reduce((acc, d) => acc + d, 0);
}

// ── External API fetch ───────────────────────────────────────────────
async function fetchFromApi(type: "tx" | "md5"): Promise<RawSession[]> {
  const url = type === "tx" ? TX_HISTORY_URL : MD5_HISTORY_URL;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as RawHistoryResponse;
    return Array.isArray(json.d) ? json.d : [];
  } catch {
    return [];
  }
}

// ── Persist new sessions to DB (upsert – ignore duplicates) ──────────
async function saveSessionsToDB(sessions: RawSession[], gameType: "tx" | "md5"): Promise<void> {
  if (sessions.length === 0) return;
  try {
    const rows = sessions.map((s) => ({
      sessionId: s.sessionId,
      gameType,
      dice1: s.rs[0] ?? 1,
      dice2: s.rs[1] ?? 1,
      dice3: s.rs[2] ?? 1,
      sum: computeSum(s.rs),
      result: classifyResult(s.rs),
      startTime: s.startTime,
      endTime: s.time,
    }));
    // Insert in batches of 50, ignore conflicts on sessionId
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      await db
        .insert(taixiuSessions)
        .values(batch)
        .onConflictDoNothing();
    }
  } catch {
    // Non-fatal – we still return the fresh API data
  }
}

// ── Load all accumulated sessions from DB, newest first ─────────────
interface DbSession {
  sessionId: number;
  dice: number[];
  sum: number;
  result: "tai" | "xiu" | "bao";
  startTime: number;
  endTime: number;
  gameType: "tx" | "md5";
}

async function loadAllFromDB(gameType: "tx" | "md5"): Promise<DbSession[]> {
  try {
    const rows = await db
      .select()
      .from(taixiuSessions)
      .where(sql`${taixiuSessions.gameType} = ${gameType}`)
      .orderBy(sql`${taixiuSessions.startTime} DESC`);
    return rows.map((r) => ({
      sessionId: r.sessionId,
      dice: [r.dice1, r.dice2, r.dice3],
      sum: r.sum,
      result: r.result,
      startTime: Number(r.startTime),
      endTime: Number(r.endTime),
      gameType: r.gameType,
    }));
  } catch {
    return [];
  }
}

// ── Fetch + accumulate: poll API then merge with DB ──────────────────
async function fetchAndAccumulate(type: "tx" | "md5"): Promise<{
  fresh: RawSession[];
  allFromDB: DbSession[];
}> {
  const [fresh] = await Promise.all([
    fetchFromApi(type),
  ]);
  // Fire-and-forget persist (don't block response on DB write)
  saveSessionsToDB(fresh, type).catch(() => {});
  const allFromDB = await loadAllFromDB(type);
  return { fresh, allFromDB };
}

// ── Map RawSession → API response shape ─────────────────────────────
function rawToSessionResult(raw: RawSession, gameType: "tx" | "md5") {
  return {
    sessionId: raw.sessionId,
    dice: raw.rs,
    sum: computeSum(raw.rs),
    result: classifyResult(raw.rs),
    startTime: raw.startTime,
    endTime: raw.time,
    gameType,
  };
}

// ── Stats computation ────────────────────────────────────────────────
function computeGameStats(sessions: Array<{ result: string; sum: number }>) {
  const total = sessions.length;
  if (total === 0) {
    return {
      total: 0, taiCount: 0, xiuCount: 0, baoCount: 0,
      taiPercent: 0, xiuPercent: 0, baoPercent: 0,
      avgSum: 0, mostCommonSum: 0, lastUpdated: Date.now(),
    };
  }
  let taiCount = 0, xiuCount = 0, baoCount = 0, sumTotal = 0;
  const sumFreq: Record<number, number> = {};
  for (const s of sessions) {
    const sum = s.sum;
    sumTotal += sum;
    sumFreq[sum] = (sumFreq[sum] ?? 0) + 1;
    if (s.result === "tai") taiCount++;
    else if (s.result === "xiu") xiuCount++;
    else baoCount++;
  }
  const mostCommonSum = Object.entries(sumFreq).reduce(
    (best, [sum, count]) => (count > (sumFreq[best] ?? 0) ? Number(sum) : best), 3,
  );
  return {
    total, taiCount, xiuCount, baoCount,
    taiPercent: Math.round((taiCount / total) * 1000) / 10,
    xiuPercent: Math.round((xiuCount / total) * 1000) / 10,
    baoPercent: Math.round((baoCount / total) * 1000) / 10,
    avgSum: Math.round((sumTotal / total) * 10) / 10,
    mostCommonSum, lastUpdated: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────────────
// Multi-algorithm ensemble prediction engine.
//
// Uses ALL accumulated DB sessions (grows over time as the server polls)
// so Markov chains have more samples → higher statistical confidence.
//
// Data convention: sessions[0] = MOST RECENT, sessions[N-1] = OLDEST.
// Markov transition: sessions[i+1] (older) → sessions[i] (newer).
//
// 5 algorithms:
//   1. Streak analysis          — streak continuation / reversal heuristic
//   2. 1st-order Markov chain   — P(next | current)
//   3. 2nd-order Markov chain   — P(next | prev, current)
//   4. 3-gram pattern suffix    — find matching 3-suffix in history
//   5. Recent frequency bias    — reversion-to-mean over last 30 results
// ────────────────────────────────────────────────────────────────────
function computePattern(sessions: Array<{ result: "tai" | "xiu" | "bao"; sum: number }>) {
  const results = sessions.map((s) => s.result);
  const directional = results.filter((r): r is "tai" | "xiu" => r !== "bao");
  const n = directional.length;

  // ── Streak ──────────────────────────────────────────────────────
  const first = results[0];
  let streakCount = 0;
  for (const r of results) {
    if (r === first) streakCount++;
    else break;
  }
  const streakType = first ?? "none";

  const recentPattern = results.slice(0, 20).map((r) =>
    r === "tai" ? "T" : r === "xiu" ? "X" : "B",
  );

  // ── Algorithm 1: Streak Analysis ────────────────────────────────
  let streakVote: "tai" | "xiu" | "none" = "none";
  let streakWeight = 0;
  if (first && first !== "bao" && streakCount >= 1) {
    const ft = first as "tai" | "xiu";
    if (streakCount === 1)      { streakVote = ft;                            streakWeight = 0.08; }
    else if (streakCount === 2) { streakVote = ft;                            streakWeight = 0.15; }
    else if (streakCount === 3) { streakVote = ft === "tai" ? "xiu" : "tai"; streakWeight = 0.22; }
    else if (streakCount === 4) { streakVote = ft === "tai" ? "xiu" : "tai"; streakWeight = 0.38; }
    else {
      streakVote = ft === "tai" ? "xiu" : "tai";
      streakWeight = Math.min(0.50 + (streakCount - 5) * 0.06, 0.88);
    }
  }

  // ── Algorithm 2: 1st-order Markov Chain ─────────────────────────
  const trans1: Record<"tai" | "xiu", Record<"tai" | "xiu", number>> = {
    tai: { tai: 0, xiu: 0 },
    xiu: { tai: 0, xiu: 0 },
  };
  for (let i = 0; i < n - 1; i++) {
    const from = directional[i + 1]; // older
    const to = directional[i];       // newer (came next in time)
    trans1[from][to]++;
  }
  let markov1Vote: "tai" | "xiu" | "none" = "none";
  let markov1Weight = 0;
  const lastD = directional[0];
  if (lastD) {
    const tC = trans1[lastD].tai;
    const xC = trans1[lastD].xiu;
    const tot = tC + xC;
    // Lower threshold as data grows (more data → more reliable signal)
    const minSamples = Math.min(15, Math.max(8, Math.floor(n / 20)));
    const minRatio = n > 500 ? 0.52 : n > 200 ? 0.53 : 0.55;
    if (tot >= minSamples) {
      const tP = tC / tot;
      const xP = xC / tot;
      if (tP >= minRatio) { markov1Vote = "tai"; markov1Weight = (tP - 0.5) * 2.8; }
      else if (xP >= minRatio) { markov1Vote = "xiu"; markov1Weight = (xP - 0.5) * 2.8; }
    }
  }

  // ── Algorithm 3: 2nd-order Markov Chain ─────────────────────────
  const trans2: Record<string, Record<"tai" | "xiu", number>> = {};
  for (let i = 0; i < n - 2; i++) {
    const prev = directional[i + 2]; // oldest
    const curr = directional[i + 1]; // middle
    const next = directional[i];     // newest
    const key = `${prev}|${curr}`;
    if (!trans2[key]) trans2[key] = { tai: 0, xiu: 0 };
    trans2[key][next]++;
  }
  let markov2Vote: "tai" | "xiu" | "none" = "none";
  let markov2Weight = 0;
  if (n >= 2) {
    const key = `${directional[1]}|${directional[0]}`;
    const c2 = trans2[key];
    if (c2) {
      const tot = c2.tai + c2.xiu;
      const minSamples = n > 500 ? 8 : n > 200 ? 6 : 4;
      const minRatio = n > 500 ? 0.55 : n > 200 ? 0.57 : 0.60;
      if (tot >= minSamples) {
        const tP = c2.tai / tot;
        const xP = c2.xiu / tot;
        if (tP >= minRatio) { markov2Vote = "tai"; markov2Weight = (tP - 0.5) * 3.2; }
        else if (xP >= minRatio) { markov2Vote = "xiu"; markov2Weight = (xP - 0.5) * 3.2; }
      }
    }
  }

  // ── Algorithm 4: 3-gram Pattern Suffix ──────────────────────────
  let patternVote: "tai" | "xiu" | "none" = "none";
  let patternWeight = 0;
  if (n >= 8) {
    const suf = directional.slice(0, 3);
    let taiFollow = 0, xiuFollow = 0;
    for (let i = 3; i < n - 2; i++) {
      if (directional[i] === suf[0] && directional[i + 1] === suf[1] && directional[i + 2] === suf[2]) {
        const nxt = directional[i - 1];
        if (nxt === "tai") taiFollow++;
        else if (nxt === "xiu") xiuFollow++;
      }
    }
    const patTot = taiFollow + xiuFollow;
    const minSamples = n > 500 ? 6 : n > 200 ? 4 : 3;
    const minRatio = n > 500 ? 0.55 : n > 200 ? 0.57 : 0.60;
    if (patTot >= minSamples) {
      const tP = taiFollow / patTot;
      const xP = xiuFollow / patTot;
      if (tP >= minRatio) { patternVote = "tai"; patternWeight = (tP - 0.5) * 2.6; }
      else if (xP >= minRatio) { patternVote = "xiu"; patternWeight = (xP - 0.5) * 2.6; }
    }
  }

  // ── Algorithm 5: Recent Frequency Bias ──────────────────────────
  // Window grows with dataset but caps at 30
  const windowSize = Math.min(30, Math.max(15, Math.floor(n / 20)));
  const recent = directional.slice(0, windowSize);
  let freqVote: "tai" | "xiu" | "none" = "none";
  let freqWeight = 0;
  if (recent.length >= 10) {
    const taiIn = recent.filter((r) => r === "tai").length;
    const tP = taiIn / recent.length;
    // Threshold loosens as we have more data (more reliable baseline)
    const threshold = n > 500 ? 0.60 : 0.63;
    if (tP > threshold)     { freqVote = "xiu"; freqWeight = (tP - 0.5) * 1.9; }
    else if (tP < 1 - threshold) { freqVote = "tai"; freqWeight = (0.5 - tP) * 1.9; }
  }

  // ── Ensemble Voting ──────────────────────────────────────────────
  const algorithms = [
    { name: "streak",    nameVi: "Chuỗi liên tiếp",  vote: streakVote,   weight: Math.round(streakWeight   * 1000) / 1000 },
    { name: "markov1",   nameVi: "Markov bậc 1",      vote: markov1Vote,  weight: Math.round(markov1Weight  * 1000) / 1000 },
    { name: "markov2",   nameVi: "Markov bậc 2",      vote: markov2Vote,  weight: Math.round(markov2Weight  * 1000) / 1000 },
    { name: "pattern3",  nameVi: "Pattern 3-gram",    vote: patternVote,  weight: Math.round(patternWeight  * 1000) / 1000 },
    { name: "frequency", nameVi: "Tần suất gần đây",  vote: freqVote,     weight: Math.round(freqWeight     * 1000) / 1000 },
  ] as const;

  let taiScore = 0, xiuScore = 0;
  for (const { vote, weight } of algorithms) {
    if (vote === "tai") taiScore += weight;
    else if (vote === "xiu") xiuScore += weight;
  }

  const totalScore = taiScore + xiuScore;
  let suggestion: "tai" | "xiu" | "none" = "none";
  let confidence = 0;

  if (totalScore >= 0.20) {
    if (taiScore > xiuScore) {
      const ratio = taiScore / totalScore;
      if (ratio >= 0.54) { suggestion = "tai"; confidence = Math.min(0.50 + ratio * 0.44, 0.94); }
    } else if (xiuScore > taiScore) {
      const ratio = xiuScore / totalScore;
      if (ratio >= 0.54) { suggestion = "xiu"; confidence = Math.min(0.50 + ratio * 0.44, 0.94); }
    }
  }

  return {
    streakType,
    streakCount,
    currentStreak: streakCount,
    recentPattern,
    suggestion,
    confidence: Math.round(confidence * 100) / 100,
    algorithms: algorithms.map((a) => ({ ...a })),
  };
}

// ── Routes ───────────────────────────────────────────────────────────

router.get("/taixiu/history", async (req, res): Promise<void> => {
  const parsed = GetTaixiuHistoryQueryParams.safeParse(req.query);
  const type = (parsed.success ? parsed.data.type : "tx") as "tx" | "md5";
  const limit = parsed.success ? parsed.data.limit : 50;

  const fresh = await fetchFromApi(type);
  saveSessionsToDB(fresh, type).catch(() => {});

  const sliced = fresh.slice(0, limit);
  res.json(GetTaixiuHistoryResponse.parse(sliced.map((s) => rawToSessionResult(s, type))));
});

router.get("/taixiu/stats", async (_req, res): Promise<void> => {
  const [txDB, md5DB] = await Promise.all([
    loadAllFromDB("tx"),
    loadAllFromDB("md5"),
  ]);

  // Also poll fresh data to keep accumulating
  Promise.all([fetchFromApi("tx"), fetchFromApi("md5")]).then(([tx, md5]) => {
    saveSessionsToDB(tx, "tx").catch(() => {});
    saveSessionsToDB(md5, "md5").catch(() => {});
  }).catch(() => {});

  const txSrc = txDB.length > 0 ? txDB : [];
  const md5Src = md5DB.length > 0 ? md5DB : [];

  res.json(GetTaixiuStatsResponse.parse({
    tx: computeGameStats(txSrc),
    md5: computeGameStats(md5Src),
  }));
});

router.get("/taixiu/pattern", async (req, res): Promise<void> => {
  const parsed = GetTaixiuPatternQueryParams.safeParse(req.query);
  const type = (parsed.success ? parsed.data.type : "tx") as "tx" | "md5";

  // Fetch fresh (accumulates to DB), then load full history
  const [fresh, allFromDB] = await Promise.all([
    fetchFromApi(type),
    loadAllFromDB(type),
  ]);
  saveSessionsToDB(fresh, type).catch(() => {});

  // Use DB history if larger, otherwise use fresh data
  const sessions = allFromDB.length >= fresh.length ? allFromDB : fresh.map((s) => ({
    sessionId: s.sessionId,
    dice: s.rs,
    sum: computeSum(s.rs),
    result: classifyResult(s.rs),
    startTime: s.startTime,
    endTime: s.time,
    gameType: type,
  }));

  const pattern = computePattern(sessions);

  // Sum distribution from full history
  const sumFreq: Record<number, number> = {};
  for (const s of sessions) {
    sumFreq[s.sum] = (sumFreq[s.sum] ?? 0) + 1;
  }
  const sumDistribution = Object.entries(sumFreq)
    .map(([sum, count]) => ({ sum: Number(sum), count }))
    .sort((a, b) => a.sum - b.sum);

  res.json(GetTaixiuPatternResponse.parse({ ...pattern, sumDistribution, totalSessions: sessions.length }));
});

router.get("/taixiu/top", async (_req, res): Promise<void> => {
  try {
    const apiRes = await fetch(TOP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (apiRes.ok) {
      const raw = await apiRes.json() as { d?: Array<{ name?: string; score?: number }> };
      const entries = Array.isArray(raw.d)
        ? raw.d.slice(0, 20).map((e, i) => ({
            rank: i + 1,
            name: e.name ?? `Player ${i + 1}`,
            score: typeof e.score === "number" ? e.score : 0,
          }))
        : [];
      res.json(GetTaixiuTopResponse.parse({ entries }));
      return;
    }
  } catch { /* fallthrough */ }
  res.json(GetTaixiuTopResponse.parse({ entries: [] }));
});

// ── Auto-cleanup: keep DB under ~900k rows (≈ ~90MB) ─────────────────
// 1 GB total storage. Each row ≈ 100 bytes. Hard cap = 900_000 rows.
// If exceeded, delete the oldest 10_000 rows of whichever type is largest.
const MAX_TOTAL_ROWS = 900_000;
const CLEANUP_BATCH  = 10_000;

async function autoCleanup(): Promise<void> {
  try {
    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(taixiuSessions);

    if ((total ?? 0) < MAX_TOTAL_ROWS) return;

    // Find the game type with the most rows
    const counts = await db
      .select({
        gameType: taixiuSessions.gameType,
        count: sql<number>`count(*)::int`,
      })
      .from(taixiuSessions)
      .groupBy(taixiuSessions.gameType);

    const biggest = counts.sort((a, b) => b.count - a.count)[0];
    if (!biggest) return;

    // Delete the oldest CLEANUP_BATCH rows for that type
    await db.execute(sql`
      DELETE FROM ${taixiuSessions}
      WHERE session_id IN (
        SELECT session_id FROM ${taixiuSessions}
        WHERE game_type = ${biggest.gameType}
        ORDER BY start_time ASC
        LIMIT ${CLEANUP_BATCH}
      )
    `);
  } catch { /* silent – non-fatal */ }
}

// ── Background accumulator ───────────────────────────────────────────
// Polls both game types every 30 seconds to keep accumulating sessions.
// Runs storage cleanup every 5 minutes.
setInterval(async () => {
  try {
    const [tx, md5] = await Promise.all([fetchFromApi("tx"), fetchFromApi("md5")]);
    await Promise.all([saveSessionsToDB(tx, "tx"), saveSessionsToDB(md5, "md5")]);
  } catch { /* silent */ }
}, 30_000);

setInterval(() => { autoCleanup().catch(() => {}); }, 5 * 60_000);

export default router;
