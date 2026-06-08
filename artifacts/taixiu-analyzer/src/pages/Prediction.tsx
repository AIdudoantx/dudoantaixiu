import { useState } from "react";
import { motion } from "framer-motion";
import { useGetTaixiuPrediction } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Dice1, Layers, RefreshCw, Target, TrendingUp, Brain, Sparkles, AlertCircle, Bot } from "lucide-react";

const METHOD_ICONS = {
  die_tracking: Dice1,
  bat_cau: Layers,
  cycle_rhythm: TrendingUp,
  gemini_ai: Brain,
  openai_ai: Bot,
};

const AI_IDS = ["gemini_ai", "openai_ai"] as const;
type AiId = (typeof AI_IDS)[number];

const AI_META: Record<AiId, { label: string; badgeText: string; Icon: typeof Brain; color: string }> = {
  gemini_ai: { label: "Gemini AI", badgeText: "✦ GEMINI", Icon: Brain, color: "text-violet-400 bg-violet-500/10 border-violet-500/30" },
  openai_ai: { label: "OpenAI GPT-4o", badgeText: "✦ OPENAI", Icon: Bot,   color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
};

const METHOD_COLOR = {
  tai:  { bg: "bg-red-500/10",  border: "border-red-500/30",  text: "text-red-400",  bar: "bg-red-400" },
  xiu:  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", bar: "bg-blue-400" },
  none: { bg: "bg-muted/20",    border: "border-border/50",   text: "text-muted-foreground", bar: "bg-muted" },
};

// ── AI card (shared for Gemini + OpenAI) ──────────────────────────────

function AICard({ item, index }: {
  item: {
    id: string; name: string; nameVi: string; description: string;
    prediction: "tai" | "xiu" | "none"; confidence: number;
    reasoning?: string | null; aiAvailable?: boolean | null;
  };
  index: number;
}) {
  const meta = AI_META[item.id as AiId];
  if (!meta) return null;

  const c = METHOD_COLOR[item.prediction];
  const conf = Math.round(item.confidence * 100);
  const available = item.aiAvailable !== false;
  const { label, badgeText, Icon, color } = meta;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={cn(
        "rounded-2xl border-2 p-6 space-y-4 shadow-lg",
        available ? cn(c.bg, c.border) : "bg-muted/10 border-border/40"
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2.5 rounded-xl border-2", available ? cn(c.bg, c.border) : "bg-muted/20 border-border/40")}>
            <Icon size={20} className={available ? c.text : "text-muted-foreground"} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold font-mono">{label}</span>
              <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full border", available ? color : "bg-muted/30 border-border/40 text-muted-foreground")}>
                {available ? badgeText : "CHƯA BẬT"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.nameVi}</div>
          </div>
        </div>

        {available && item.prediction !== "none" && (
          <div className={cn("text-center px-5 py-2.5 rounded-xl border-2", c.bg, c.border)}>
            <div className="text-[10px] text-muted-foreground font-mono mb-0.5">DỰ ĐOÁN AI</div>
            <div className={cn("text-3xl font-bold font-mono", c.text)}>
              {item.prediction === "tai" ? "TÀI" : "XỈU"}
            </div>
            <div className={cn("text-xs font-mono font-semibold mt-0.5", c.text)}>{conf}% tin cậy</div>
          </div>
        )}
      </div>

      {available && item.reasoning && (
        <div className={cn("rounded-xl border p-4 space-y-1", c.bg, c.border)}>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
            <Sparkles size={10} />
            Phân tích của {label}
          </div>
          <p className={cn("text-sm font-mono leading-relaxed", c.text)}>{item.reasoning}</p>
        </div>
      )}

      {available && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-mono">Độ tin cậy AI</span>
            <span className={cn("text-sm font-bold font-mono", c.text)}>
              {item.prediction !== "none" ? `${conf}%` : "Không đủ dữ liệu"}
            </span>
          </div>
          <div className="h-2.5 bg-muted/40 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: item.prediction !== "none" ? `${conf}%` : 0 }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
              className={cn("h-full rounded-full", c.bar)}
            />
          </div>
        </div>
      )}

      {!available && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs font-mono text-muted-foreground leading-relaxed">
            <span className="text-amber-400 font-semibold">Chưa cấu hình:</span> {item.description}
            <div className="mt-1.5 text-[10px] opacity-70">
              Vào <span className="text-foreground">⚙ Cài Đặt</span> → nhập{" "}
              <code className="bg-muted px-1 rounded">
                {item.id === "gemini_ai" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"}
              </code>{" "}
              để bật AI dự đoán thực sự.
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Regular method card ───────────────────────────────────────────────

function PredictionCard({ item, index }: {
  item: {
    id: string; name: string; nameVi: string; description: string;
    prediction: "tai" | "xiu" | "none"; confidence: number;
    predictedSum?: number | null; predictedDice?: number[] | null;
  };
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const c = METHOD_COLOR[item.prediction];
  const Icon = METHOD_ICONS[item.id as keyof typeof METHOD_ICONS] ?? Target;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={cn("rounded-2xl border p-5 space-y-4", c.bg, c.border)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-xl border", c.bg, c.border)}>
          <Icon size={16} className={c.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">PP {index + 1}</div>
          <div className="text-sm font-semibold font-mono mt-0.5">{item.nameVi}</div>
        </div>
        <div className="text-right">
          <div className={cn("text-2xl font-bold font-mono", c.text)}>
            {item.prediction === "tai" ? "TÀI" : item.prediction === "xiu" ? "XỈU" : "---"}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {item.prediction !== "none" ? `${Math.round(item.confidence * 100)}%` : "—"}
          </div>
        </div>
      </div>

      {item.predictedDice && item.predictedDice.length === 3 && (
        <div className="flex gap-2 items-center">
          {item.predictedDice.map((d, i) => (
            <div key={i} className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold font-mono border", c.bg, c.border, c.text)}>
              {d}
            </div>
          ))}
          {item.predictedSum != null && (
            <div className="ml-1 text-lg font-bold font-mono text-muted-foreground">
              = <span className={c.text}>{item.predictedSum}</span>
            </div>
          )}
        </div>
      )}

      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: item.prediction !== "none" ? `${Math.round(item.confidence * 100)}%` : 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.1 + 0.2 }}
          className={cn("h-full rounded-full", c.bar)}
        />
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        {expanded ? "▲ Ẩn chi tiết" : "▼ Xem cách tính"}
      </button>
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-[10px] text-muted-foreground font-mono leading-relaxed border-t border-border/30 pt-3"
        >
          {item.description}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Consensus banner ──────────────────────────────────────────────────

function ConsensusBadge({ predictions }: { predictions: Array<{ prediction: "tai" | "xiu" | "none"; confidence: number; id: string }> }) {
  const total = predictions.length;
  const all = predictions.filter((p) => p.prediction !== "none");
  const taiCount = all.filter((p) => p.prediction === "tai").length;
  const xiuCount = all.filter((p) => p.prediction === "xiu").length;
  const taiScore = all.filter((p) => p.prediction === "tai").reduce((s, p) => s + p.confidence, 0);
  const xiuScore = all.filter((p) => p.prediction === "xiu").reduce((s, p) => s + p.confidence, 0);
  const winner = taiCount > xiuCount ? "tai" : xiuCount > taiCount ? "xiu" : taiScore > xiuScore ? "tai" : "none";
  const c = METHOD_COLOR[winner];

  return (
    <div className={cn("rounded-2xl border-2 p-6 text-center space-y-3", c.bg, c.border)}>
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
        Đồng Thuận {all.length}/{total} Phương Pháp (Gemini + OpenAI + 3 PP)
      </div>
      <div className={cn("text-6xl font-bold font-mono", c.text)}>
        {winner === "tai" ? "TÀI" : winner === "xiu" ? "XỈU" : "---"}
      </div>
      <div className="flex justify-center gap-4 text-sm font-mono">
        <span className="text-red-400 font-semibold">{taiCount} TÀI</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-blue-400 font-semibold">{xiuCount} XỈU</span>
      </div>
      <div className="flex justify-center gap-2 pt-1 flex-wrap">
        {predictions.map((p) => {
          const isAI = (AI_IDS as readonly string[]).includes(p.id);
          return (
            <div key={p.id} className={cn(
              "px-3 py-1 rounded-lg border text-xs font-bold font-mono",
              METHOD_COLOR[p.prediction].bg, METHOD_COLOR[p.prediction].border, METHOD_COLOR[p.prediction].text
            )}>
              {isAI ? "🤖 " : ""}{p.prediction === "tai" ? "TÀI" : p.prediction === "xiu" ? "XỈU" : "·"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function Prediction() {
  const [gameType, setGameType] = useState<"tx" | "md5">("tx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, refetch, isFetching } = useGetTaixiuPrediction({ type: gameType }, { query: { refetchInterval: 15000 } as any });

  const aiMethods = data?.predictions.filter((p) => (AI_IDS as readonly string[]).includes(p.id)) ?? [];
  const regularMethods = data?.predictions.filter((p) => !(AI_IDS as readonly string[]).includes(p.id)) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">Dự Đoán AI + 3 Phương Pháp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gemini AI · OpenAI GPT-4o · Xúc xắc · Bắt cầu · Chu kỳ</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
          <div className="flex gap-2 bg-muted/40 p-1 rounded-xl border border-border/50">
            {(["tx", "md5"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setGameType(t)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-mono font-medium transition-all",
                  gameType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          Đang phân tích Gemini AI + OpenAI + 3 phương pháp...
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <ConsensusBadge predictions={data.predictions} />

          {/* AI cards — full width each */}
          <div className="grid md:grid-cols-2 gap-4">
            {aiMethods.map((item, i) => (
              <AICard key={item.id} item={item} index={i} />
            ))}
          </div>

          {/* 3 algorithmic methods */}
          <div className="grid md:grid-cols-3 gap-4">
            {regularMethods.map((item, i) => (
              <PredictionCard key={item.id} item={item} index={i} />
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground font-mono">
            Tự động cập nhật mỗi 15 giây · Chỉ để tham khảo
          </p>
        </div>
      )}
    </div>
  );
}
