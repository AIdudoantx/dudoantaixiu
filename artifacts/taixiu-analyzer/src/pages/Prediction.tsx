import { useState } from "react";
import { motion } from "framer-motion";
import { useGetTaixiuPrediction, useGetTaixiuAiAnalysis } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Dice1, Layers, RefreshCw, Target, TrendingUp, ChevronDown, ChevronUp, Brain, Sparkles } from "lucide-react";

const METHOD_ICONS = {
  die_tracking: Dice1,
  bat_cau: Layers,
  cycle_rhythm: TrendingUp,
};

const METHOD_COLOR = {
  tai:  { bg: "bg-red-500/10",  border: "border-red-500/30",  text: "text-red-400",  bar: "bg-red-400" },
  xiu:  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", bar: "bg-blue-400" },
  none: { bg: "bg-muted/20",    border: "border-border/50",   text: "text-muted-foreground", bar: "bg-muted" },
};

const CONF_COLOR: Record<string, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-amber-400",
  HIGH: "text-emerald-400",
};

// ── Method card ──────────────────────────────────────────────────────

function PredictionCard({
  item,
  index,
}: {
  item: {
    id: string;
    name: string;
    nameVi: string;
    description: string;
    prediction: "tai" | "xiu" | "none";
    confidence: number;
    predictedSum?: number | null;
    predictedDice?: number[] | null;
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
      className={cn("rounded-2xl border p-6 space-y-4", c.bg, c.border)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-xl border", c.bg, c.border)}>
          <Icon size={18} className={c.text} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Phương Pháp {index + 1}
            </span>
            <span className={cn("text-xs font-mono px-2 py-0.5 rounded border", c.bg, c.border, c.text)}>
              {item.name}
            </span>
          </div>
          <div className="text-base font-semibold font-mono mt-0.5">{item.nameVi}</div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1 font-mono">Dự đoán</div>
          <div className={cn("text-4xl font-bold font-mono", c.text)}>
            {item.prediction === "tai" ? "TÀI" : item.prediction === "xiu" ? "XỈU" : "---"}
          </div>
        </div>

        {item.predictedDice && item.predictedDice.length === 3 && (
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-2 font-mono">Xúc xắc dự đoán</div>
            <div className="flex gap-2 items-center">
              {item.predictedDice.map((d, i) => (
                <div key={i} className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold font-mono border", c.bg, c.border, c.text)}>
                  {d}
                </div>
              ))}
              {item.predictedSum != null && (
                <div className="ml-2 text-2xl font-bold font-mono text-muted-foreground">
                  = <span className={c.text}>{item.predictedSum}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground font-mono">Độ tin cậy</span>
          <span className={cn("text-sm font-bold font-mono", c.text)}>
            {item.prediction !== "none" ? `${Math.round(item.confidence * 100)}%` : "Không đủ dữ liệu"}
          </span>
        </div>
        <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: item.prediction !== "none" ? `${Math.round(item.confidence * 100)}%` : 0 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.1 + 0.2 }}
            className={cn("h-full rounded-full", c.bar)}
          />
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? "Ẩn" : "Cách tính"}
      </button>
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-xs text-muted-foreground font-mono leading-relaxed border-t border-border/30 pt-3"
        >
          {item.description}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Consensus banner ─────────────────────────────────────────────────

function ConsensusBadge({ predictions }: { predictions: Array<{ prediction: "tai" | "xiu" | "none"; confidence: number }> }) {
  const taiCount = predictions.filter((p) => p.prediction === "tai").length;
  const xiuCount = predictions.filter((p) => p.prediction === "xiu").length;
  const taiScore = predictions.filter((p) => p.prediction === "tai").reduce((s, p) => s + p.confidence, 0);
  const xiuScore = predictions.filter((p) => p.prediction === "xiu").reduce((s, p) => s + p.confidence, 0);
  const winner = taiCount > xiuCount ? "tai" : xiuCount > taiCount ? "xiu" : taiScore > xiuScore ? "tai" : "none";
  const c = METHOD_COLOR[winner];

  return (
    <div className={cn("rounded-2xl border p-6 text-center space-y-2", c.bg, c.border)}>
      <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
        Đồng Thuận 3 Phương Pháp
      </div>
      <div className={cn("text-5xl font-bold font-mono", c.text)}>
        {winner === "tai" ? "TÀI" : winner === "xiu" ? "XỈU" : "---"}
      </div>
      <div className="flex justify-center gap-3 text-xs font-mono text-muted-foreground">
        <span className="text-red-400">{taiCount}/3 phương pháp TÀI</span>
        <span>·</span>
        <span className="text-blue-400">{xiuCount}/3 phương pháp XỈU</span>
      </div>
      <div className="flex justify-center gap-2 pt-1">
        {predictions.map((p, i) => (
          <div key={i} className={cn("w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold font-mono", METHOD_COLOR[p.prediction].bg, METHOD_COLOR[p.prediction].border, METHOD_COLOR[p.prediction].text)}>
            {p.prediction === "tai" ? "T" : p.prediction === "xiu" ? "X" : "·"}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── AI Analysis panel ────────────────────────────────────────────────

function AiPanel({ gameType }: { gameType: "tx" | "md5" }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, refetch, isFetching } = useGetTaixiuAiAnalysis({ type: gameType }, { query: { staleTime: 60000 } as any });

  const predColor = data?.prediction === "tai" ? METHOD_COLOR.tai : data?.prediction === "xiu" ? METHOD_COLOR.xiu : METHOD_COLOR.none;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-primary" />
          <span className="text-sm font-semibold font-mono">Phân Tích AI (GPT)</span>
          <span className="text-xs px-2 py-0.5 rounded border border-primary/30 text-primary font-mono">BETA</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-mono"
        >
          <Sparkles size={12} className={isFetching ? "animate-spin" : ""} />
          {isFetching ? "Đang phân tích..." : "Phân tích lại"}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          Đang kết nối AI...
        </div>
      )}

      {data && !data.available && (
        <div className="text-xs text-muted-foreground font-mono leading-relaxed p-3 rounded-xl bg-muted/20 border border-border/50">
          <span className="text-amber-400 font-semibold">⚠ Chưa bật:</span> {data.message}
          <div className="mt-2 text-[10px] opacity-60">
            Thêm <code className="bg-muted px-1 rounded">OPENAI_API_KEY</code> vào Replit Secrets → tab 🔒 bên trái.
          </div>
        </div>
      )}

      {data?.available && data.analysis && (
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className={cn("text-center px-4 py-3 rounded-xl border min-w-[90px]", predColor.bg, predColor.border)}>
              <div className="text-[10px] text-muted-foreground font-mono mb-1">AI DỰ ĐOÁN</div>
              <div className={cn("text-2xl font-bold font-mono", predColor.text)}>
                {data.prediction === "tai" ? "TÀI" : data.prediction === "xiu" ? "XỈU" : "—"}
              </div>
              <div className={cn("text-xs font-mono mt-1 font-semibold", CONF_COLOR[data.confidence])}>
                {data.confidence}
              </div>
            </div>
            <div className="flex-1 text-xs text-muted-foreground font-mono leading-relaxed">
              {data.analysis}
            </div>
          </div>

          {data.reasoning && (
            <div className="text-[11px] text-primary/70 font-mono border-t border-primary/10 pt-3">
              💡 {data.reasoning}
            </div>
          )}
        </div>
      )}

      {data?.available && !data.analysis && data.message && (
        <div className="text-xs text-muted-foreground font-mono">{data.message}</div>
      )}
    </motion.div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export default function Prediction() {
  const [gameType, setGameType] = useState<"tx" | "md5">("tx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, refetch, isFetching } = useGetTaixiuPrediction({ type: gameType }, { query: { refetchInterval: 15000 } as any });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">Dự Đoán 3 Phương Pháp</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Theo xúc xắc · Bắt cầu · Nhịp chu kỳ</p>
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
          Đang tính toán 3 phương pháp...
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <ConsensusBadge predictions={data.predictions} />

          <div className="grid md:grid-cols-3 gap-4">
            {data.predictions.map((item, i) => (
              <PredictionCard key={item.id} item={item} index={i} />
            ))}
          </div>

          {/* AI Analysis */}
          <AiPanel gameType={gameType} />

          <p className="text-center text-xs text-muted-foreground font-mono">
            Tự động cập nhật mỗi 15 giây · Chỉ để tham khảo
          </p>
        </div>
      )}
    </div>
  );
}
