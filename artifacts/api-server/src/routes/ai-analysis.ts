/**
 * AI Analysis route — uses OpenAI to generate a Vietnamese commentary
 * on recent Tài Xỉu patterns and add an independent prediction.
 *
 * Requires OPENAI_API_KEY in environment. If absent, returns a graceful
 * message telling the user to add the key.
 */

import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, taixiuSessions } from "@workspace/db";
import { GetTaixiuAiAnalysisQueryParams, GetTaixiuAiAnalysisResponse } from "@workspace/api-zod";

const router: IRouter = Router();

interface Session {
  result: "tai" | "xiu" | "bao";
  sum: number;
  dice: [number, number, number];
}

async function loadRecent(type: "tx" | "md5", limit = 50): Promise<Session[]> {
  try {
    const rows = await db
      .select()
      .from(taixiuSessions)
      .where(sql`${taixiuSessions.gameType} = ${type}`)
      .orderBy(sql`${taixiuSessions.startTime} DESC`)
      .limit(limit);
    return rows.map((r) => ({
      result: r.result,
      sum: r.sum,
      dice: [r.dice1, r.dice2, r.dice3] as [number, number, number],
    }));
  } catch {
    return [];
  }
}

function buildPrompt(type: string, sessions: Session[]): string {
  if (sessions.length === 0) return "";

  // Current streak
  const results = sessions.map((s) => s.result).filter((r): r is "tai" | "xiu" => r !== "bao");
  let streakLen = 1;
  const cur = results[0];
  for (let i = 1; i < results.length; i++) {
    if (results[i] === cur) streakLen++;
    else break;
  }

  // Recent 20 results
  const recent20 = results.slice(0, 20).map((r) => (r === "tai" ? "T" : "X")).join(" ");

  // Tai/Xiu ratio in last 30
  const last30 = results.slice(0, 30);
  const taiN = last30.filter((r) => r === "tai").length;
  const xiuN = last30.filter((r) => r === "xiu").length;

  // Avg sum
  const avgSum = sessions.slice(0, 20).reduce((s, x) => s + x.sum, 0) / Math.min(sessions.length, 20);

  // Sum distribution last 30
  const sumBuckets: Record<string, number> = {};
  sessions.slice(0, 30).forEach((s) => {
    const key = s.sum <= 6 ? "3-6" : s.sum <= 10 ? "7-10" : s.sum <= 14 ? "11-14" : "15-18";
    sumBuckets[key] = (sumBuckets[key] ?? 0) + 1;
  });

  return `Bạn là chuyên gia phân tích Tài Xỉu (trò chơi xúc xắc 3 hạt, Tài ≥ 11, Xỉu ≤ 10).
Dữ liệu bàn ${type.toUpperCase()} (50 phiên gần nhất, mới → cũ):

- 20 kết quả gần nhất: ${recent20}
- Streak hiện tại: ${streakLen} ${cur === "tai" ? "TÀI" : "XỈU"} liên tiếp
- Tỉ lệ 30 phiên: TÀI ${taiN}/30 (${Math.round(taiN / 30 * 100)}%) · XỈU ${xiuN}/30 (${Math.round(xiuN / 30 * 100)}%)
- Tổng trung bình: ${avgSum.toFixed(1)}
- Phân phối tổng: ${Object.entries(sumBuckets).map(([k, v]) => `${k}: ${v}lần`).join(", ")}

Hãy phân tích ngắn gọn (tối đa 4 câu) bằng tiếng Việt:
1. Nhận xét xu hướng hiện tại
2. Dự đoán phiên tiếp theo là TÀI hay XỈU và lý do
3. Mức độ tin cậy theo thang LOW / MEDIUM / HIGH

Trả lời theo JSON:
{"analysis":"<phân tích ngắn>","prediction":"tai hoặc xiu","confidence":"LOW hoặc MEDIUM hoặc HIGH","reasoning":"<lý do 1 câu>"}`;
}

router.get("/taixiu/ai-analysis", async (req, res): Promise<void> => {
  const parsed = GetTaixiuAiAnalysisQueryParams.safeParse(req.query);
  const type = (parsed.success ? parsed.data.type : "tx") as "tx" | "md5";

  const apiKey = process.env["OPENAI_API_KEY"];

  if (!apiKey) {
    res.json(GetTaixiuAiAnalysisResponse.parse({
      gameType: type,
      available: false,
      message: "Chưa cấu hình OPENAI_API_KEY. Thêm key vào Replit Secrets để bật tính năng phân tích AI.",
      analysis: null,
      prediction: "none",
      confidence: "LOW",
      reasoning: null,
    }));
    return;
  }

  const sessions = await loadRecent(type, 50);
  if (sessions.length < 10) {
    res.json(GetTaixiuAiAnalysisResponse.parse({
      gameType: type,
      available: true,
      message: "Cần ít nhất 10 phiên để phân tích AI.",
      analysis: null,
      prediction: "none",
      confidence: "LOW",
      reasoning: null,
    }));
    return;
  }

  const prompt = buildPrompt(type, sessions);

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      res.json(GetTaixiuAiAnalysisResponse.parse({
        gameType: type,
        available: true,
        message: `Lỗi OpenAI: ${aiRes.status}`,
        analysis: null,
        prediction: "none",
        confidence: "LOW",
        reasoning: null,
      }));
      return;
    }

    const data = await aiRes.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "{}";

    // Parse JSON out of possibly-wrapped response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed2 = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    res.json(GetTaixiuAiAnalysisResponse.parse({
      gameType: type,
      available: true,
      message: null,
      analysis: parsed2.analysis ?? raw,
      prediction: ["tai", "xiu"].includes(parsed2.prediction) ? parsed2.prediction : "none",
      confidence: ["LOW", "MEDIUM", "HIGH"].includes(parsed2.confidence) ? parsed2.confidence : "LOW",
      reasoning: parsed2.reasoning ?? null,
    }));
  } catch (e) {
    res.json(GetTaixiuAiAnalysisResponse.parse({
      gameType: type,
      available: true,
      message: "Lỗi kết nối OpenAI. Vui lòng thử lại.",
      analysis: null,
      prediction: "none",
      confidence: "LOW",
      reasoning: null,
    }));
  }
});

export default router;
