import { motion } from "framer-motion";
import {
  useGetTaixiuHistory,
  useGetTaixiuPattern,
  useGetTaixiuPrediction,
} from "@workspace/api-client-react";
import { Dice } from "@/components/Dice";
import { cn } from "@/lib/utils";
import { Activity, RefreshCw, Zap, Brain, Bot, Sparkles } from "lucide-react";

const AI_IDS = ["gemini_ai", "openai_ai"] as const;

function ResultBadge({ result }: { result: "tai" | "xiu" | "bao" }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold font-mono tracking-wider",
      result === "tai" && "bg-red-500/20 text-red-400 border border-red-500/30",
      result === "xiu" && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      result === "bao" && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    )}>
      {result === "tai" ? "T" : result === "xiu" ? "X" : "B"}
    </span>
  );
}

type Side = "tai" | "xiu" | "none";

function sideColor(s: Side) {
  return s === "tai" ? "text-red-400" : s === "xiu" ? "text-blue-400" : "text-muted-foreground";
}
function sideBg(s: Side) {
  return s === "tai"
    ? "bg-red-500/10 border-red-500/20"
    : s === "xiu"
    ? "bg-blue-500/10 border-blue-500/20"
    : "bg-muted/20 border-border/40";
}

function PredictionPanel({
  label,
  accent,
  predictions,
}: {
  label: string;
  accent: string;
  predictions?: Array<{ id: string; name: string; nameVi: string; prediction: Side; confidence: number; reasoning?: string | null; aiAvailable?: boolean | null }>;
}) {
  if (!predictions) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card/60 border border-border/50 rounded-2xl p-5 backdrop-blur-sm"
      >
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">{label}</div>
        <div className="text-sm text-muted-foreground font-mono">Đang tải...</div>
      </motion.div>
    );
  }

  const aiPreds = predictions.filter((p) => (AI_IDS as readonly string[]).includes(p.id));
  const algoPreds = predictions.filter((p) => !(AI_IDS as readonly string[]).includes(p.id));

  // Consensus across all methods
  const allActive = predictions.filter((p) => p.prediction !== "none");
  const taiVotes = allActive.filter((p) => p.prediction === "tai");
  const xiuVotes = allActive.filter((p) => p.prediction === "xiu");
  const taiScore = taiVotes.reduce((s, p) => s + p.confidence, 0);
  const xiuScore = xiuVotes.reduce((s, p) => s + p.confidence, 0);
  const winner: Side =
    taiVotes.length > xiuVotes.length ? "tai" :
    xiuVotes.length > taiVotes.length ? "xiu" :
    taiScore > xiuScore ? "tai" : "none";

  const avgConf =
    allActive.filter((p) => p.prediction === winner).reduce((s, p) => s + p.confidence, 0) /
    Math.max(allActive.filter((p) => p.prediction === winner).length, 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/60 border border-border/50 rounded-2xl p-5 backdrop-blur-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</div>
        <span className={cn("text-xs font-mono font-semibold px-2 py-0.5 rounded-full border", accent)}>
          DỰ ĐOÁN
        </span>
      </div>

      {/* Consensus big result */}
      <div className={cn("rounded-xl p-4 border flex items-center justify-between", sideBg(winner))}>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Đồng thuận {allActive.length} PP</div>
          <div className={cn("text-3xl font-bold font-mono", sideColor(winner))}>
            {winner === "tai" ? "TÀI" : winner === "xiu" ? "XỈU" : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {winner !== "none" ? `${Math.round(avgConf * 100)}% tin cậy` : "Không đủ dữ liệu"}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-right">
          <div className="text-xs text-muted-foreground">Phiếu bầu</div>
          <div className="text-sm font-mono text-red-400 font-semibold">{taiVotes.length} TÀI</div>
          <div className="text-sm font-mono text-blue-400 font-semibold">{xiuVotes.length} XỈU</div>
        </div>
      </div>

      {/* AI rows */}
      {aiPreds.map((aiPred) => {
        const isGemini = aiPred.id === "gemini_ai";
        const IconComp = isGemini ? Brain : Bot;
        const badgeColor = isGemini ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
        const aiLabel = isGemini ? "Gemini AI" : "OpenAI GPT-4o";
        const keyName = isGemini ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
        if (aiPred.aiAvailable !== false && aiPred.prediction !== "none") {
          return (
            <div key={aiPred.id} className={cn(
              "rounded-xl border px-3 py-2.5 flex items-center gap-3",
              aiPred.prediction === "tai" ? "bg-red-500/10 border-red-500/30" : "bg-blue-500/10 border-blue-500/30"
            )}>
              <IconComp size={14} className={aiPred.prediction === "tai" ? "text-red-400" : "text-blue-400"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{aiLabel}</span>
                  <span className={cn("text-[9px] font-mono px-1.5 py-0.5 rounded-full border", badgeColor)}>✦ AI</span>
                </div>
                {aiPred.reasoning && (
                  <p className={cn("text-[10px] font-mono leading-relaxed truncate mt-0.5", aiPred.prediction === "tai" ? "text-red-300/80" : "text-blue-300/80")}>
                    {aiPred.reasoning}
                  </p>
                )}
              </div>
              <div className={cn("text-lg font-bold font-mono", aiPred.prediction === "tai" ? "text-red-400" : "text-blue-400")}>
                {aiPred.prediction === "tai" ? "TÀI" : "XỈU"}
              </div>
            </div>
          );
        }
        return (
          <div key={aiPred.id} className="rounded-xl border px-3 py-2 flex items-center gap-2 bg-muted/10 border-border/30">
            <IconComp size={13} className="text-muted-foreground/40" />
            <span className="text-[10px] font-mono text-muted-foreground/50">{aiLabel} chưa bật — vào ⚙ Cài Đặt → thêm {keyName}</span>
          </div>
        );
      })}

      {/* Algo methods row */}
      <div className="flex gap-2">
        {algoPreds.map((p) => (
          <div
            key={p.id}
            className={cn("flex-1 rounded-lg p-2.5 border text-center", sideBg(p.prediction))}
          >
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider truncate mb-1">
              {p.name}
            </div>
            <div className={cn("text-sm font-bold font-mono", sideColor(p.prediction))}>
              {p.prediction === "tai" ? "TÀI" : p.prediction === "xiu" ? "XỈU" : "—"}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">
              {p.prediction !== "none" ? `${Math.round(p.confidence * 100)}%` : "—"}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const POLL = { refetchInterval: 10000 } as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PRED_POLL = { refetchInterval: 15000 } as any;

  const { data: txHistory, isLoading: txLoading } = useGetTaixiuHistory({ type: "tx", limit: 30 }, { query: POLL });
  const { data: md5History, isLoading: md5Loading } = useGetTaixiuHistory({ type: "md5", limit: 30 }, { query: POLL });
  const { data: txPattern } = useGetTaixiuPattern({ type: "tx" }, { query: POLL });
  const { data: md5Pattern } = useGetTaixiuPattern({ type: "md5" }, { query: POLL });
  const { data: txPred } = useGetTaixiuPrediction({ type: "tx" }, { query: PRED_POLL });
  const { data: md5Pred } = useGetTaixiuPrediction({ type: "md5" }, { query: PRED_POLL });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Realtime Tài Xỉu Analytics</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <RefreshCw size={12} className="animate-spin" />
          auto-refresh 10s
        </div>
      </div>

      {/* Prediction panels */}
      <div>
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
          <Brain size={12} className="text-primary" />
          <Sparkles size={12} className="text-violet-400" />
          Dự Đoán AI + 3 Phương Pháp
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <PredictionPanel
            label="Bàn TX"
            accent="text-primary border-primary/30"
            predictions={txPred?.predictions}
          />
          <PredictionPanel
            label="Bàn MD5"
            accent="text-amber-400 border-amber-400/30"
            predictions={md5Pred?.predictions}
          />
        </div>
      </div>

      {/* Xu hướng hiện tại */}
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { label: "TX — Xu hướng hiện tại", pattern: txPattern, type: "tx" },
          { label: "MD5 — Xu hướng hiện tại", pattern: md5Pattern, type: "md5" },
        ].map(({ label, pattern }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card/60 border border-border/50 rounded-2xl p-5 backdrop-blur-sm"
          >
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">{label}</div>
            <div className="flex items-center gap-4">
              <div className={cn(
                "flex-1 p-4 rounded-xl text-center",
                pattern?.suggestion === "tai" && "bg-red-500/10 border border-red-500/20",
                pattern?.suggestion === "xiu" && "bg-blue-500/10 border border-blue-500/20",
                (!pattern?.suggestion || pattern.suggestion === "none") && "bg-muted/30 border border-border",
              )}>
                <div className="text-xs text-muted-foreground mb-1">Gợi ý</div>
                <div className={cn(
                  "text-2xl font-bold font-mono",
                  pattern?.suggestion === "tai" && "text-red-400",
                  pattern?.suggestion === "xiu" && "text-blue-400",
                  (!pattern?.suggestion || pattern.suggestion === "none") && "text-muted-foreground",
                )}>
                  {pattern?.suggestion === "tai" ? "TÀI" : pattern?.suggestion === "xiu" ? "XỈU" : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {pattern?.confidence ? `${Math.round(pattern.confidence * 100)}% confidence` : "Chưa đủ data"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Streak hiện tại</div>
                <div className="text-xl font-mono font-bold">
                  <span className={cn(
                    pattern?.streakType === "tai" && "text-red-400",
                    pattern?.streakType === "xiu" && "text-blue-400",
                    pattern?.streakType === "bao" && "text-amber-400",
                  )}>
                    {pattern?.streakCount ?? 0}
                  </span>
                  <span className="text-muted-foreground text-sm ml-1">
                    {pattern?.streakType === "tai" ? "Tài" : pattern?.streakType === "xiu" ? "Xỉu" : pattern?.streakType === "bao" ? "Bao" : ""}
                  </span>
                </div>
              </div>
            </div>
            {pattern?.recentPattern && (
              <div className="mt-4 flex flex-wrap gap-1">
                {pattern.recentPattern.slice(0, 15).map((p, i) => (
                  <span key={i} className={cn(
                    "w-6 h-6 flex items-center justify-center rounded text-xs font-bold font-mono",
                    p === "T" && "bg-red-500/20 text-red-400",
                    p === "X" && "bg-blue-500/20 text-blue-400",
                    p === "B" && "bg-amber-500/20 text-amber-400",
                  )}>{p}</span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Live Feed */}
      <div className="grid md:grid-cols-2 gap-6">
        {[
          { label: "TX — Kết quả gần nhất", data: txHistory, loading: txLoading },
          { label: "MD5 — Kết quả gần nhất", data: md5History, loading: md5Loading },
        ].map(({ label, data, loading }) => (
          <div key={label}>
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity size={12} className="text-primary" /> {label}
            </div>
            <div className="space-y-2">
              {loading && (
                <div className="text-sm text-muted-foreground font-mono">Đang tải...</div>
              )}
              {data?.slice(0, 8).map((session, i) => (
                <motion.div
                  key={session.sessionId}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 bg-card/40 border border-border/40 rounded-xl px-4 py-2.5 hover:bg-card/60 transition-colors"
                >
                  <span className="text-xs text-muted-foreground font-mono w-14">#{session.sessionId}</span>
                  <div className="flex gap-1">
                    {session.dice.map((d, j) => (
                      <Dice key={j} value={d} size="sm" />
                    ))}
                  </div>
                  <span className={cn(
                    "font-mono text-xs w-8 text-center",
                    session.result === "tai" && "text-red-400",
                    session.result === "xiu" && "text-blue-400",
                    session.result === "bao" && "text-amber-400",
                  )}>
                    {session.sum}
                  </span>
                  <ResultBadge result={session.result} />
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
