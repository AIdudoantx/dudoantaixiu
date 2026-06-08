import { Router, type IRouter } from "express";
import { db, taixiuSessions } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface OpenAIPrediction {
  prediction: "tai" | "xiu" | "none";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  available: boolean;
  message?: string;
}

interface OpenAIApiResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string; code?: string };
}

async function callOpenAIRest(apiKey: string, prompt: string): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Bạn là chuyên gia phân tích xác suất game Tài Xỉu. Chỉ trả lời bằng JSON thuần túy, không có markdown hay giải thích thêm.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 256,
    temperature: 0.3,
    response_format: { type: "json_object" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as OpenAIApiResponse;

  if (!res.ok) {
    const errMsg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim();
}

export async function getOpenAIPrediction(gameType: "tx" | "md5"): Promise<OpenAIPrediction> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    return {
      prediction: "none",
      confidence: "LOW",
      reasoning: "",
      available: false,
      message: "OPENAI_API_KEY chưa được cấu hình",
    };
  }

  try {
    const sessions = await db
      .select()
      .from(taixiuSessions)
      .where(eq(taixiuSessions.gameType, gameType))
      .orderBy(desc(taixiuSessions.sessionId))
      .limit(60);

    if (sessions.length < 10) {
      return {
        prediction: "none",
        confidence: "LOW",
        reasoning: "",
        available: false,
        message: "Không đủ dữ liệu",
      };
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

    const prompt = `Phân tích lịch sử Tài Xỉu và dự đoán kết quả phiên TIẾP THEO.

Quy tắc: Tổng xúc xắc ≥ 11 → TÀI | Tổng ≤ 10 → XỈU

20 kết quả gần nhất (mới → cũ): ${recentResults}

Lịch sử 50 phiên:
${historyLines}

Trả về JSON:
{"prediction":"tai hoặc xiu","confidence":"LOW hoặc MEDIUM hoặc HIGH","reasoning":"Nhận xét xu hướng 1-2 câu tiếng Việt"}`;

    const text = await callOpenAIRest(apiKey, prompt);
    const parsed = JSON.parse(text) as { prediction: string; confidence: string; reasoning: string };
    const prediction = parsed.prediction === "tai" ? "tai" : parsed.prediction === "xiu" ? "xiu" : "none";
    const confidence = (
      ["LOW", "MEDIUM", "HIGH"].includes(parsed.confidence) ? parsed.confidence : "MEDIUM"
    ) as "LOW" | "MEDIUM" | "HIGH";

    return { prediction, confidence, reasoning: parsed.reasoning ?? "", available: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const is429 =
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("Too Many Requests") ||
      msg.includes("rate_limit") ||
      msg.includes("insufficient_quota");
    logger.warn({ is429, errMsg: msg }, "OpenAI prediction failed");
    return {
      prediction: "none",
      confidence: "LOW",
      reasoning: "",
      available: false,
      message: is429
        ? "Đã hết quota OpenAI — kiểm tra billing tại platform.openai.com"
        : "Lỗi khi gọi OpenAI API",
    };
  }
}

router.get("/taixiu/openai-prediction", async (req, res): Promise<void> => {
  const gameType = (req.query["type"] === "md5" ? "md5" : "tx") as "tx" | "md5";
  const result = await getOpenAIPrediction(gameType);
  res.json({ gameType, ...result });
});

export default router;
