import { Router, type IRouter } from "express";
import { db, taixiuSessions } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface GeminiPrediction {
  prediction: "tai" | "xiu" | "none";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  available: boolean;
  message?: string;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string; code?: number };
}

async function callGeminiRest(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as GeminiApiResponse;

  if (!res.ok) {
    const errMsg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.trim().replace(/```json|```/g, "").trim();
}

export async function getGeminiPrediction(gameType: "tx" | "md5"): Promise<GeminiPrediction> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    return { prediction: "none", confidence: "LOW", reasoning: "", available: false, message: "GEMINI_API_KEY chưa được cấu hình" };
  }

  try {
    const sessions = await db
      .select()
      .from(taixiuSessions)
      .where(eq(taixiuSessions.gameType, gameType))
      .orderBy(desc(taixiuSessions.sessionId))
      .limit(60);

    if (sessions.length < 10) {
      return { prediction: "none", confidence: "LOW", reasoning: "", available: false, message: "Không đủ dữ liệu" };
    }

    const historyLines = sessions
      .slice(0, 50)
      .map((s, i) => {
        const result = s.result === "tai" ? "TÀI" : s.result === "xiu" ? "XỈU" : "BÁO";
        const dice = `${s.dice1}-${s.dice2}-${s.dice3}`;
        return `${i + 1}. Phiên ${s.sessionId}: ${dice} = ${s.sum} → ${result}`;
      })
      .join("\n");

    const recentResults = sessions
      .slice(0, 20)
      .map((s) => (s.result === "tai" ? "T" : s.result === "xiu" ? "X" : "B"))
      .join("");

    const prompt = `Bạn là chuyên gia phân tích game Tài Xỉu (xúc xắc). Dựa vào lịch sử 50 phiên gần nhất (thứ tự mới nhất → cũ nhất), hãy dự đoán kết quả phiên TIẾP THEO.

Quy tắc:
- Tổng xúc xắc ≥ 11 → TÀI
- Tổng xúc xắc ≤ 10 → XỈU (trừ BÁO = ba con giống nhau)

Chuỗi 20 kết quả gần nhất: ${recentResults}

Lịch sử 50 phiên:
${historyLines}

Phân tích xu hướng, cầu hiện tại, chu kỳ và đưa ra dự đoán. Chỉ trả về JSON (không có markdown):
{"prediction":"tai hoặc xiu","confidence":"LOW hoặc MEDIUM hoặc HIGH","reasoning":"Giải thích ngắn gọn 1-2 câu bằng tiếng Việt"}`;

    const text = await callGeminiRest(apiKey, prompt);
    const parsed = JSON.parse(text) as { prediction: string; confidence: string; reasoning: string };
    const prediction = parsed.prediction === "tai" ? "tai" : parsed.prediction === "xiu" ? "xiu" : "none";
    const confidence = (["LOW", "MEDIUM", "HIGH"].includes(parsed.confidence) ? parsed.confidence : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH";

    return { prediction, confidence, reasoning: parsed.reasoning ?? "", available: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is429 = msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests") || msg.includes("RESOURCE_EXHAUSTED");
    logger.warn({ is429, errMsg: msg }, "Gemini prediction failed");
    return {
      prediction: "none",
      confidence: "LOW",
      reasoning: "",
      available: false,
      message: is429 ? "Đã hết quota Gemini hôm nay — thử lại vào ngày mai" : "Lỗi khi gọi Gemini API",
    };
  }
}

router.get("/taixiu/gemini-prediction", async (req, res): Promise<void> => {
  const gameType = (req.query["type"] === "md5" ? "md5" : "tx") as "tx" | "md5";
  const result = await getGeminiPrediction(gameType);
  res.json({ gameType, ...result });
});

export default router;
