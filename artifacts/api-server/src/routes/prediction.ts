/**
 * 3-method prediction engine for Tài Xỉu next session.
 *
 * Method 1 – Theo Xúc Xắc (Die Position Tracking)  [user-specified]
 *   For each die position (1,2,3):
 *     - Take the current value for that position from the latest session
 *     - Scan the 18 most recent past sessions
 *     - Skip the FIRST occurrence of the same die value (pass by)
 *     - At the SECOND occurrence: use the die value from the session
 *       immediately before (newer than) that second match
 *     - If no second match: keep the original current value
 *   Sum the 3 predicted die values → Tài (≥11) or Xỉu (≤10)
 *
 * Method 2 – Bắt Cầu (Bridge Pattern Detection)
 *   Identify the current bridge pattern in the last 15 directional results:
 *   - Flat streak (cầu phẳng): same ≥3 consecutive → break prediction
 *   - Alternating 1-1 (cầu 1-1): TXTX… ≥4 → continue alternating
 *   - Pair 2-2 (cầu 2-2): TTXX or XXTT ≥4 → predict the next pair
 *   - Triple 3-3 (cầu 3-3): TTTXXX ≥6 → predict the next triple
 *
 * Method 3 – Nhịp Chu Kỳ (Cycle Rhythm)
 *   Compute the historical average run length for each type (Tài/Xỉu).
 *   Compare the current streak length to the historical average:
 *   - Current streak < avg  → predict continue (still within typical cycle)
 *   - Current streak ≥ avg  → predict break (cycle likely ending)
 *   Confidence scales with how far the current streak is from the average
 *   and how many historical samples power the average.
 */

import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { GetTaixiuPredictionQueryParams, GetTaixiuPredictionResponse } from "@workspace/api-zod";
import { db, taixiuSessions } from "@workspace/db";
import { getGeminiPrediction } from "./gemini-prediction";

const router: IRouter = Router();

const TX_URL  = "https://api.s6688v.xyz/tx_session_history_list";
const MD5_URL = "https://api.s6688v.xyz/txmd5_session_history_list";

// ── Types ─────────────────────────────────────────────────────────────

interface Session {
  sessionId: number;
  dice: [number, number, number];
  sum: number;
  result: "tai" | "xiu" | "bao";
}

// ── External API ──────────────────────────────────────────────────────

async function fetchFresh(type: "tx" | "md5"): Promise<Session[]> {
  try {
    const res = await fetch(type === "tx" ? TX_URL : MD5_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const json = await res.json() as { d?: Array<{ rs: number[]; sessionId: number; time: number; startTime: number }> };
    if (!Array.isArray(json.d)) return [];
    return json.d.map((s) => {
      const [d1 = 1, d2 = 1, d3 = 1] = s.rs;
      const sum = d1 + d2 + d3;
      const result: Session["result"] =
        d1 === d2 && d2 === d3 ? "bao" : sum >= 11 ? "tai" : "xiu";
      return { sessionId: s.sessionId, dice: [d1, d2, d3], sum, result };
    });
  } catch {
    return [];
  }
}

// ── DB historical sessions (all accumulated, newest first) ────────────

async function loadHistorical(type: "tx" | "md5"): Promise<Session[]> {
  try {
    const rows = await db
      .select()
      .from(taixiuSessions)
      .where(sql`${taixiuSessions.gameType} = ${type}`)
      .orderBy(sql`${taixiuSessions.startTime} DESC`);
    return rows.map((r) => ({
      sessionId: r.sessionId,
      dice: [r.dice1, r.dice2, r.dice3] as [number, number, number],
      sum: r.sum,
      result: r.result,
    }));
  } catch {
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════
// METHOD 1 – Theo Xúc Xắc (Die Position Tracking)
// ════════════════════════════════════════════════════════════════════════

function predictDieTracking(sessions: Session[]): {
  prediction: "tai" | "xiu" | "none";
  confidence: number;
  predictedSum: number;
  predictedDice: number[];
  description: string;
} {
  if (sessions.length < 4) {
    return {
      prediction: "none", confidence: 0, predictedSum: 0, predictedDice: [],
      description: "Cần ít nhất 4 phiên để tính toán.",
    };
  }

  const current = sessions[0];
  const past = sessions.slice(1, 19); // 18 most recent past sessions

  const predicted: number[] = [0, 0, 0];
  let matchCount = 0;

  for (let pos = 0; pos < 3; pos++) {
    const currentVal = current.dice[pos];
    let occurrences = 0;
    let foundSecond = false;

    for (let j = 0; j < past.length; j++) {
      if (past[j].dice[pos] === currentVal) {
        occurrences++;
        if (occurrences === 1) {
          // First match — skip (pass by)
          continue;
        }
        if (occurrences === 2) {
          // Second match — take the session just before it (newer = index j-1)
          if (j > 0) {
            predicted[pos] = past[j - 1].dice[pos];
          } else {
            predicted[pos] = currentVal;
          }
          foundSecond = true;
          matchCount++;
          break;
        }
      }
    }

    if (!foundSecond) {
      predicted[pos] = currentVal;
    }
  }

  const predictedSum = predicted[0] + predicted[1] + predicted[2];
  const result: "tai" | "xiu" =
    predicted[0] === predicted[1] && predicted[1] === predicted[2]
      ? (predictedSum >= 11 ? "tai" : "xiu") // bao case → use sum side
      : predictedSum >= 11
      ? "tai"
      : "xiu";

  // Confidence scales with how many dice positions had a second match
  const confidence =
    matchCount === 3 ? 0.78
    : matchCount === 2 ? 0.65
    : matchCount === 1 ? 0.55
    : 0.48;

  return {
    prediction: result,
    confidence,
    predictedSum,
    predictedDice: predicted,
    description:
      `Xúc xắc hiện tại: [${current.dice.join(", ")}]. ` +
      `Tìm trong ${past.length} phiên gần nhất: ${matchCount}/3 vị trí tìm được phiên khớp lần 2. ` +
      `Dự đoán xúc xắc: [${predicted.join(", ")}] → Tổng ${predictedSum}.`,
  };
}

// ════════════════════════════════════════════════════════════════════════
// METHOD 2 – Bắt Cầu (Bridge Pattern Detection) — Full 10+ pattern engine
// ════════════════════════════════════════════════════════════════════════

/** Encode directional sequence into consecutive runs, newest-first */
function encodeRuns(directional: Array<"tai" | "xiu">): Array<{ side: "tai" | "xiu"; len: number }> {
  if (directional.length === 0) return [];
  const runs: Array<{ side: "tai" | "xiu"; len: number }> = [];
  let cur = directional[0];
  let len = 1;
  for (let i = 1; i < directional.length; i++) {
    if (directional[i] === cur) {
      len++;
    } else {
      runs.push({ side: cur, len });
      cur = directional[i];
      len = 1;
    }
  }
  runs.push({ side: cur, len });
  return runs;
}

const opp = (s: "tai" | "xiu"): "tai" | "xiu" => (s === "tai" ? "xiu" : "tai");
const label = (s: "tai" | "xiu") => s.toUpperCase();

interface BridgeResult {
  prediction: "tai" | "xiu";
  confidence: number;
  bridgeName: string;
  description: string;
}

function analyzeBridge(runs: Array<{ side: "tai" | "xiu"; len: number }>): BridgeResult {
  const cur = runs[0];
  const prev = runs[1];
  const prev2 = runs[2];
  const prev3 = runs[3];

  const avgLen = runs.reduce((s, r) => s + r.len, 0) / runs.length;

  // ── 1. Cầu 1-1-1-1 (xen kẽ liên tục) ──────────────────────────────
  // At least 5 consecutive runs all of length 1
  if (runs.length >= 5 && runs.slice(0, 5).every((r) => r.len === 1)) {
    const runCount = runs.filter((r) => r.len === 1).length;
    const conf = Math.min(0.62 + runCount * 0.015, 0.82);
    return {
      prediction: opp(cur.side), confidence: conf,
      bridgeName: `cầu 1-1 (${runCount} nhịp)`,
      description: `Cầu xen kẽ 1-1 kéo dài ${runCount} nhịp liên tiếp. Dự đoán tiếp: ${label(opp(cur.side))}.`,
    };
  }

  // ── 2. Cầu 2-2-2 (đôi đều) ─────────────────────────────────────────
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 2)) {
    return {
      prediction: opp(cur.side), confidence: 0.72,
      bridgeName: "cầu 2-2",
      description: `Cầu đôi 2-2: mỗi đợt đúng 2 phiên rồi đổi (${runs.length} đợt). Dự đoán đổi: ${label(opp(cur.side))}.`,
    };
  }

  // ── 3. Cầu 3-3 (bộ ba đều) ─────────────────────────────────────────
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 3)) {
    return {
      prediction: opp(cur.side), confidence: 0.74,
      bridgeName: "cầu 3-3",
      description: `Cầu bộ ba 3-3: mỗi đợt đúng 3 phiên rồi đổi. Dự đoán đổi: ${label(opp(cur.side))}.`,
    };
  }

  // ── 4. Cầu 4-4 (bộ bốn đều) ────────────────────────────────────────
  if (runs.length >= 4 && runs.slice(0, 4).every((r) => r.len === 4)) {
    return {
      prediction: opp(cur.side), confidence: 0.73,
      bridgeName: "cầu 4-4",
      description: `Cầu bộ bốn 4-4: mỗi đợt đúng 4 phiên rồi đổi. Dự đoán đổi: ${label(opp(cur.side))}.`,
    };
  }

  // ── 5. Cầu 1-2 hoặc 2-1 (xen kẽ không đều) ─────────────────────────
  if (runs.length >= 4 && prev && prev2 && prev3) {
    const lens = [cur.len, prev.len, prev2.len, prev3.len];
    // Pattern 1-2-1-2: current=1, prev=2, prev2=1, prev3=2
    if (lens[0] === 1 && lens[1] === 2 && lens[2] === 1 && lens[3] === 2) {
      return {
        prediction: opp(cur.side), confidence: 0.66,
        bridgeName: "cầu 1-2",
        description: `Cầu 1-2: xen kẽ 1 phiên và 2 phiên. Dự đoán 2 phiên ${label(opp(cur.side))}.`,
      };
    }
    // Pattern 2-1-2-1: current=2, prev=1, prev2=2, prev3=1
    if (lens[0] === 2 && lens[1] === 1 && lens[2] === 2 && lens[3] === 1) {
      return {
        prediction: opp(cur.side), confidence: 0.66,
        bridgeName: "cầu 2-1",
        description: `Cầu 2-1: xen kẽ 2 phiên và 1 phiên. Dự đoán 1 phiên ${label(opp(cur.side))}.`,
      };
    }
    // Pattern 1-3-1-3
    if (lens[0] === 1 && lens[1] === 3 && lens[2] === 1 && lens[3] === 3) {
      return {
        prediction: opp(cur.side), confidence: 0.65,
        bridgeName: "cầu 1-3",
        description: `Cầu 1-3: xen kẽ 1 và 3 phiên. Dự đoán 3 phiên ${label(opp(cur.side))}.`,
      };
    }
    // Pattern 3-1-3-1
    if (lens[0] === 3 && lens[1] === 1 && lens[2] === 3 && lens[3] === 1) {
      return {
        prediction: opp(cur.side), confidence: 0.65,
        bridgeName: "cầu 3-1",
        description: `Cầu 3-1: xen kẽ 3 và 1 phiên. Dự đoán 1 phiên ${label(opp(cur.side))}.`,
      };
    }
    // Pattern 2-3-2-3
    if (lens[0] === 2 && lens[1] === 3 && lens[2] === 2 && lens[3] === 3) {
      return {
        prediction: opp(cur.side), confidence: 0.64,
        bridgeName: "cầu 2-3",
        description: `Cầu 2-3: xen kẽ 2 và 3 phiên. Dự đoán 3 phiên ${label(opp(cur.side))}.`,
      };
    }
  }

  // ── 6. Cầu phẳng dài (>= 4): dự đoán bẻ cầu ───────────────────────
  if (cur.len >= 4) {
    const conf = Math.min(0.62 + (cur.len - 4) * 0.05, 0.86);
    return {
      prediction: opp(cur.side), confidence: conf,
      bridgeName: `cầu phẳng ${cur.len}`,
      description: `Cầu phẳng ${cur.len} phiên ${label(cur.side)} liên tiếp — dài bất thường. Dự đoán bẻ sang ${label(opp(cur.side))}.`,
    };
  }

  // ── 7. Cầu phẳng vừa (3): break nếu avg ngắn, tiếp nếu avg dài ─────
  if (cur.len === 3) {
    if (avgLen <= 2.5) {
      return {
        prediction: opp(cur.side), confidence: 0.60,
        bridgeName: "cầu phẳng 3 (bẻ)",
        description: `Cầu phẳng 3 phiên ${label(cur.side)}, trung bình đợt thấp (${avgLen.toFixed(1)}) → dự đoán bẻ sang ${label(opp(cur.side))}.`,
      };
    } else {
      return {
        prediction: cur.side, confidence: 0.57,
        bridgeName: "cầu phẳng 3 (tiếp)",
        description: `Cầu phẳng 3 phiên ${label(cur.side)}, trung bình đợt cao (${avgLen.toFixed(1)}) → dự đoán tiếp tục.`,
      };
    }
  }

  // ── 8. Cầu phẳng ngắn (2): phân tích theo ngữ cảnh ─────────────────
  if (cur.len === 2) {
    // If prev run was also 2 → partial 2-2 forming
    if (prev && prev.len === 2) {
      return {
        prediction: opp(cur.side), confidence: 0.62,
        bridgeName: "cầu 2-2 (đang hình thành)",
        description: `Hai đợt liên tiếp đều 2 phiên → cầu 2-2 đang hình thành. Dự đoán đổi: ${label(opp(cur.side))}.`,
      };
    }
    // If prev run was 1 → partial 1-2 or 2-1
    if (prev && prev.len === 1) {
      return {
        prediction: opp(cur.side), confidence: 0.57,
        bridgeName: "cầu 2-1 (đang hình thành)",
        description: `Đợt hiện tại 2 phiên, đợt trước 1 phiên → cầu 2-1 hình thành. Dự đoán 1 phiên ${label(opp(cur.side))}.`,
      };
    }
    // Avg-based prediction
    const pred = avgLen > 2 ? cur.side : opp(cur.side);
    return {
      prediction: pred, confidence: 0.55,
      bridgeName: "cầu 2 (theo trung bình)",
      description: `Chuỗi 2 phiên ${label(cur.side)}, TB đợt ${avgLen.toFixed(1)} → dự đoán ${avgLen > 2 ? "tiếp" : "bẻ"}: ${label(pred)}.`,
    };
  }

  // ── 9. Cầu vừa đổi (len=1): phân tích đợt trước ───────────────────
  if (cur.len === 1 && prev) {
    // After a very long streak → reversal tends to continue
    if (prev.len >= 5) {
      return {
        prediction: cur.side, confidence: 0.60,
        bridgeName: `đảo cầu dài (sau ${prev.len})`,
        description: `Vừa đảo cầu sau đợt ${label(prev.side)} dài ${prev.len} phiên. Xu hướng đảo tiếp tục: ${label(cur.side)}.`,
      };
    }
    // After streak of 3-4 → reversal is brief, likely go back
    if (prev.len >= 3) {
      return {
        prediction: opp(cur.side), confidence: 0.55,
        bridgeName: "đảo cầu ngắn",
        description: `Vừa đổi sang ${label(cur.side)} sau ${prev.len} phiên ${label(prev.side)}. Dự đoán quay lại: ${label(opp(cur.side))}.`,
      };
    }
    // Prev was 1 too → 1-1 alt pattern starting
    if (prev.len === 1) {
      return {
        prediction: opp(cur.side), confidence: 0.58,
        bridgeName: "cầu 1-1 (khởi đầu)",
        description: `Hai đợt liên tiếp đều 1 phiên → cầu xen kẽ đang hình thành. Dự đoán: ${label(opp(cur.side))}.`,
      };
    }
    // Prev was 2 → 1-2 or 2-1 forming
    if (prev.len === 2) {
      return {
        prediction: cur.side, confidence: 0.54,
        bridgeName: "cầu 1-2 (đang hình thành)",
        description: `Đợt hiện 1, đợt trước 2 → cầu 1-2 hình thành. Dự đoán tiếp 1: ${label(cur.side)}.`,
      };
    }
  }

  // ── 10. Cầu lệch (zigzag không đều): phân tích xu hướng ────────────
  // Check if runs are all short (< 3) → mixed/zigzag → predict based on frequency
  const shortRuns = runs.slice(0, 8).filter((r) => r.len <= 2).length;
  if (shortRuns >= 6) {
    // Mostly short runs → alternating tendency
    return {
      prediction: opp(cur.side), confidence: 0.55,
      bridgeName: "cầu zigzag",
      description: `Chuỗi ngắn xen kẽ (cầu zigzag): ${shortRuns}/8 đợt ≤2. Dự đoán đổi: ${label(opp(cur.side))}.`,
    };
  }

  // ── 11. Phân tích cầu tăng dần / giảm dần ───────────────────────────
  if (runs.length >= 4) {
    const lens4 = runs.slice(0, 4).map((r) => r.len);
    // Increasing: e.g. 1,2,3 or 2,3,4 (oldest to newest = reversed array)
    const asc = lens4[0] > lens4[1] && lens4[1] > lens4[2];
    if (asc) {
      return {
        prediction: cur.side, confidence: 0.57,
        bridgeName: "cầu tăng dần",
        description: `Cầu tăng dần: đợt hiện ${lens4[0]}, trước ${lens4[1]}, trước nữa ${lens4[2]}. Dự đoán tiếp ${label(cur.side)} (${lens4[0]}+ phiên).`,
      };
    }
    const desc2 = lens4[0] < lens4[1] && lens4[1] < lens4[2];
    if (desc2) {
      return {
        prediction: opp(cur.side), confidence: 0.56,
        bridgeName: "cầu giảm dần",
        description: `Cầu giảm dần: đợt rút ngắn dần, sắp đổi. Dự đoán: ${label(opp(cur.side))}.`,
      };
    }
  }

  // ── 12. Fallback: thống kê 20 phiên gần nhất ────────────────────────
  const recent20 = runs.slice(0, 10).flatMap((r) => Array(r.len).fill(r.side) as Array<"tai" | "xiu">).slice(0, 20);
  const taiCount = recent20.filter((r) => r === "tai").length;
  const xiuCount = recent20.filter((r) => r === "xiu").length;
  const majority: "tai" | "xiu" = taiCount >= xiuCount ? "tai" : "xiu";
  // Predict opposite of majority if majority > 60% (mean reversion)
  const majorPct = Math.max(taiCount, xiuCount) / Math.max(recent20.length, 1);
  const fallbackPred: "tai" | "xiu" = majorPct > 0.6 ? opp(majority) : majority;
  return {
    prediction: fallbackPred, confidence: 0.52,
    bridgeName: "xu hướng tổng quát",
    description: `Không có cầu đặc trưng. 20 phiên: TÀI ${taiCount} · XỈU ${xiuCount}. Dự đoán: ${label(fallbackPred)}.`,
  };
}

function predictBatCau(sessions: Session[]): {
  prediction: "tai" | "xiu" | "none";
  confidence: number;
  description: string;
} {
  const directional = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");

  if (directional.length < 4) {
    return { prediction: "none", confidence: 0, description: "Cần ít nhất 4 phiên để nhận dạng cầu." };
  }

  const runs = encodeRuns(directional);
  const result = analyzeBridge(runs);

  return {
    prediction: result.prediction,
    confidence: result.confidence,
    description: `[${result.bridgeName}] ${result.description}`,
  };
}

// ════════════════════════════════════════════════════════════════════════
// METHOD 3 – Nhịp Chu Kỳ (Cycle Rhythm)
// ════════════════════════════════════════════════════════════════════════

function predictCycleRhythm(sessions: Session[]): {
  prediction: "tai" | "xiu" | "none";
  confidence: number;
  description: string;
} {
  const directional = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");

  if (directional.length < 20) {
    return {
      prediction: "none", confidence: 0,
      description: "Cần ít nhất 20 phiên để tính nhịp chu kỳ.",
    };
  }

  // Compute all run lengths for each side
  const taiRuns: number[] = [];
  const xiuRuns: number[] = [];
  let runType = directional[directional.length - 1]; // oldest
  let runLen = 1;

  for (let i = directional.length - 2; i >= 0; i--) {
    if (directional[i] === runType) {
      runLen++;
    } else {
      (runType === "tai" ? taiRuns : xiuRuns).push(runLen);
      runType = directional[i];
      runLen = 1;
    }
  }
  // Push last (current) run
  (runType === "tai" ? taiRuns : xiuRuns).push(runLen);

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const avgTai = taiRuns.length >= 3 ? avg(taiRuns) : 2;
  const avgXiu = xiuRuns.length >= 3 ? avg(xiuRuns) : 2;

  // Current streak (from newest)
  const currentSide = directional[0];
  let currentLen = 0;
  for (const v of directional) {
    if (v === currentSide) currentLen++;
    else break;
  }

  const avgForCurrent = currentSide === "tai" ? avgTai : avgXiu;
  const totalRuns = taiRuns.length + xiuRuns.length;

  if (totalRuns < 6) {
    return {
      prediction: "none", confidence: 0,
      description: "Chưa đủ chu kỳ để tính trung bình (cần ≥6 lượt đổi).",
    };
  }

  let prediction: "tai" | "xiu";
  let confidence: number;
  let reasoning: string;

  if (currentLen < avgForCurrent) {
    // Still within typical run length → predict continue
    prediction = currentSide;
    const ratio = currentLen / avgForCurrent;
    confidence = 0.50 + (1 - ratio) * 0.25;
    reasoning = `Đang ở phiên ${currentLen} của đợt ${currentSide.toUpperCase()} (TB: ${avgForCurrent.toFixed(1)}). Còn trong chu kỳ điển hình → tiếp tục.`;
  } else {
    // At or past the average → likely to break
    prediction = currentSide === "tai" ? "xiu" : "tai";
    const excess = currentLen - avgForCurrent;
    confidence = 0.55 + Math.min(excess * 0.07, 0.25);
    reasoning = `Đang ở phiên ${currentLen} của đợt ${currentSide.toUpperCase()} (TB: ${avgForCurrent.toFixed(1)}). Vượt chu kỳ → dự đoán đổi sang ${prediction.toUpperCase()}.`;
  }

  const dataQuality = Math.min(totalRuns / 30, 1);
  const finalConf = Math.min(confidence * (0.75 + 0.25 * dataQuality), 0.86);

  return {
    prediction,
    confidence: Math.round(finalConf * 100) / 100,
    description:
      `TB đợt TÀI: ${avgTai.toFixed(1)} phiên (${taiRuns.length} đợt). ` +
      `TB đợt XỈU: ${avgXiu.toFixed(1)} phiên (${xiuRuns.length} đợt). ` +
      reasoning,
  };
}

// ── Route ─────────────────────────────────────────────────────────────

router.get("/taixiu/prediction", async (req, res): Promise<void> => {
  const parsed = GetTaixiuPredictionQueryParams.safeParse(req.query);
  const type = (parsed.success ? parsed.data.type : "tx") as "tx" | "md5";

  const [fresh, historical] = await Promise.all([
    fetchFresh(type),
    loadHistorical(type),
  ]);

  // Use the larger dataset; fresh is guaranteed newest-first
  const sessions: Session[] =
    historical.length >= fresh.length ? historical : fresh;

  // Method 1 needs accurate dice data (fresh API); methods 2 & 3 use full history.
  // Method 4 (Gemini AI) runs in parallel — uses DB internally via getGeminiPrediction.
  const freshSessions: Session[] = fresh.length > 0 ? fresh : sessions;

  const [m4] = await Promise.all([getGeminiPrediction(type)]);

  const m1 = predictDieTracking(freshSessions);
  const m2 = predictBatCau(sessions);
  const m3 = predictCycleRhythm(sessions);

  const response = {
    gameType: type,
    predictions: [
      {
        id: "die_tracking",
        name: "Xúc Xắc",
        nameVi: "Theo Dõi Từng Xúc Xắc",
        description: m1.description,
        prediction: m1.prediction,
        confidence: m1.confidence,
        predictedSum: m1.predictedSum,
        predictedDice: m1.predictedDice,
        reasoning: null,
        aiAvailable: null,
      },
      {
        id: "bat_cau",
        name: "Bắt Cầu",
        nameVi: "Nhận Dạng Cầu Pattern",
        description: m2.description,
        prediction: m2.prediction,
        confidence: m2.confidence,
        predictedSum: undefined,
        predictedDice: undefined,
        reasoning: null,
        aiAvailable: null,
      },
      {
        id: "cycle_rhythm",
        name: "Chu Kỳ",
        nameVi: "Phân Tích Nhịp Chu Kỳ",
        description: m3.description,
        prediction: m3.prediction,
        confidence: m3.confidence,
        predictedSum: undefined,
        predictedDice: undefined,
        reasoning: null,
        aiAvailable: null,
      },
      {
        id: "gemini_ai",
        name: "Gemini AI",
        nameVi: "Phân Tích Thông Minh Gemini",
        description: m4.available
          ? `AI phân tích 60 phiên gần nhất và dự đoán: ${m4.prediction === "tai" ? "TÀI" : "XỈU"}.`
          : (m4.message ?? "Chưa cấu hình GEMINI_API_KEY trong Settings."),
        prediction: m4.prediction,
        confidence: m4.confidence === "HIGH" ? 0.82 : m4.confidence === "MEDIUM" ? 0.68 : 0.45,
        predictedSum: undefined,
        predictedDice: undefined,
        reasoning: m4.reasoning || null,
        aiAvailable: m4.available,
      },
    ],
  };

  res.json(GetTaixiuPredictionResponse.parse(response));
});

export default router;
