import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { useGetTaixiuPattern } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, Brain, Activity } from "lucide-react";

type AlgoVote = {
  name: string;
  nameVi: string;
  vote: "tai" | "xiu" | "none";
  weight: number;
};

function AlgorithmRow({ algo, maxWeight }: { algo: AlgoVote; maxWeight: number }) {
  const barPct = maxWeight > 0 ? (algo.weight / maxWeight) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="w-36 shrink-0">
        <div className="text-xs font-mono text-foreground font-medium">{algo.nameVi}</div>
        <div className="text-[10px] text-muted-foreground">{algo.name}</div>
      </div>
      <div className="flex-1">
        {algo.vote === "none" || algo.weight === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Minus size={12} />
            Không đủ dữ liệu
          </div>
        ) : (
          <div className="space-y-1">
            <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${barPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className={cn(
                  "h-full rounded-full",
                  algo.vote === "tai" ? "bg-red-400" : "bg-blue-400"
                )}
              />
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              weight: {algo.weight.toFixed(3)}
            </div>
          </div>
        )}
      </div>
      <div className={cn(
        "w-12 text-center text-xs font-bold font-mono shrink-0",
        algo.vote === "tai" && "text-red-400",
        algo.vote === "xiu" && "text-blue-400",
        algo.vote === "none" && "text-muted-foreground",
      )}>
        {algo.vote === "tai" ? "TÀI" : algo.vote === "xiu" ? "XỈU" : "---"}
      </div>
    </div>
  );
}

export default function Pattern() {
  const [gameType, setGameType] = useState<"tx" | "md5">("tx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTaixiuPattern({ type: gameType }, { query: { refetchInterval: 10000 } as any });

  const chartData = data?.sumDistribution ?? [];
  const algorithms = data?.algorithms ?? [];
  const maxWeight = Math.max(...algorithms.map((a) => a.weight), 0.01);
  const totalSessions = data?.totalSessions ?? 0;

  const taiVotes = algorithms.filter((a) => a.vote === "tai").length;
  const xiuVotes = algorithms.filter((a) => a.vote === "xiu").length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">Phân Tích Pattern</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ensemble 5 thuật toán
            {totalSessions > 0 && (
              <span className="ml-2 font-mono text-xs bg-primary/15 text-primary border border-primary/25 rounded px-2 py-0.5">
                học từ {totalSessions.toLocaleString()} phiên
              </span>
            )}
          </p>
        </div>
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

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          Đang phân tích...
        </div>
      )}

      {data && (
        <>
          {/* Suggestion Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "rounded-2xl p-8 border text-center",
              data.suggestion === "tai" && "bg-red-500/10 border-red-500/30",
              data.suggestion === "xiu" && "bg-blue-500/10 border-blue-500/30",
              data.suggestion === "none" && "bg-muted/20 border-border/50",
            )}
          >
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">
              Gợi Ý Phiên Tiếp Theo
            </div>
            <div className={cn(
              "text-6xl font-bold font-mono mb-3",
              data.suggestion === "tai" && "text-red-400",
              data.suggestion === "xiu" && "text-blue-400",
              data.suggestion === "none" && "text-muted-foreground",
            )}>
              {data.suggestion === "tai" ? "TÀI" : data.suggestion === "xiu" ? "XỈU" : "---"}
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {data.suggestion !== "none" ? (
                <>
                  {data.suggestion === "tai"
                    ? <TrendingUp size={16} className="text-red-400" />
                    : <TrendingDown size={16} className="text-blue-400" />
                  }
                  <span className="font-mono">
                    Độ tin cậy: <strong className="text-foreground">{Math.round(data.confidence * 100)}%</strong>
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="font-mono">
                    {taiVotes} TÀI / {xiuVotes} XỈU vote
                  </span>
                </>
              ) : (
                <>
                  <Minus size={16} />
                  <span>Chưa đủ dữ liệu để dự đoán</span>
                </>
              )}
            </div>
          </motion.div>

          {/* Algorithm Breakdown */}
          {algorithms.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card/60 border border-border/50 rounded-2xl p-6"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-5">
                <Brain size={12} className="text-primary" />
                Chi Tiết 5 Thuật Toán Ensemble
              </div>

              {/* Vote summary bar */}
              <div className="flex gap-2 mb-5">
                {algorithms.map((algo) => (
                  <div
                    key={algo.name}
                    title={`${algo.nameVi}: ${algo.vote}`}
                    className={cn(
                      "flex-1 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono border",
                      algo.vote === "tai" && "bg-red-500/20 text-red-400 border-red-500/30",
                      algo.vote === "xiu" && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                      algo.vote === "none" && "bg-muted/20 text-muted-foreground border-border/30",
                    )}
                  >
                    {algo.vote === "tai" ? "T" : algo.vote === "xiu" ? "X" : "·"}
                  </div>
                ))}
              </div>

              <div>
                {algorithms.map((algo) => (
                  <AlgorithmRow key={algo.name} algo={algo} maxWeight={maxWeight} />
                ))}
              </div>
            </motion.div>
          )}

          {/* Streak Info + Recent Pattern */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card/60 border border-border/50 rounded-2xl p-6">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Streak Hiện Tại</div>
              <div className="flex items-end gap-3">
                <div className={cn(
                  "text-5xl font-bold font-mono",
                  data.streakType === "tai" && "text-red-400",
                  data.streakType === "xiu" && "text-blue-400",
                  data.streakType === "bao" && "text-amber-400",
                  data.streakType === "none" && "text-muted-foreground",
                )}>
                  {data.streakCount}
                </div>
                <div className="text-muted-foreground font-mono pb-2">
                  {data.streakType === "tai" ? "Tài liên tiếp"
                    : data.streakType === "xiu" ? "Xỉu liên tiếp"
                    : data.streakType === "bao" ? "Bao liên tiếp"
                    : "không có streak"}
                </div>
              </div>
            </div>

            {/* Recent 20 pattern */}
            <div className="bg-card/60 border border-border/50 rounded-2xl p-6">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">20 Phiên Gần Nhất</div>
              <div className="flex flex-wrap gap-1.5">
                {data.recentPattern.slice(0, 20).map((p, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold font-mono",
                      p === "T" && "bg-red-500/25 text-red-400 border border-red-500/40",
                      p === "X" && "bg-blue-500/25 text-blue-400 border border-blue-500/40",
                      p === "B" && "bg-amber-500/25 text-amber-400 border border-amber-500/40",
                    )}
                  >
                    {p}
                  </motion.span>
                ))}
              </div>
            </div>
          </div>

          {/* Sum Distribution Chart */}
          <div className="bg-card/60 border border-border/50 rounded-2xl p-6">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground uppercase tracking-widest mb-6">
              <Activity size={12} className="text-primary" />
              Phân Phối Tổng Xúc Xắc (3 — 18)
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="sum"
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontFamily: "monospace",
                      fontSize: "12px",
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(val: number) => [val, "Lần"]}
                    labelFormatter={(label) => `Tổng: ${label}`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.sum}
                        fill={
                          entry.sum >= 11
                            ? "hsl(0 80% 60% / 0.7)"
                            : "hsl(210 80% 60% / 0.7)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="w-3 h-3 rounded-sm bg-blue-500/70" />
                Xỉu (3–10)
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="w-3 h-3 rounded-sm bg-red-500/70" />
                Tài (11–18)
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
