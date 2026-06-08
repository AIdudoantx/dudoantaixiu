import { useState } from "react";
import { motion } from "framer-motion";
import { useGetTaixiuHistory } from "@workspace/api-client-react";
import { Dice } from "@/components/Dice";
import { cn } from "@/lib/utils";

function ResultBadge({ result }: { result: "tai" | "xiu" | "bao" }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono",
      result === "tai" && "bg-red-500/20 text-red-400 border border-red-500/30",
      result === "xiu" && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
      result === "bao" && "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    )}>
      {result === "tai" ? "TÀI" : result === "xiu" ? "XỈU" : "BAO"}
    </span>
  );
}

export default function HistoryPage() {
  const [gameType, setGameType] = useState<"tx" | "md5">("tx");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTaixiuHistory({ type: gameType, limit: 100 }, { query: { refetchInterval: 10000 } as any });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">Lịch Sử Phiên</h1>
          <p className="text-sm text-muted-foreground mt-0.5">100 phiên gần nhất</p>
        </div>

        <div className="flex gap-2 bg-muted/40 p-1 rounded-xl border border-border/50">
          {(["tx", "md5"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setGameType(t)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-mono font-medium transition-all",
                gameType === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
          Đang tải dữ liệu...
        </div>
      )}

      <div className="rounded-2xl border border-border/50 overflow-hidden bg-card/40 backdrop-blur-sm">
        <div className="grid grid-cols-[80px_1fr_60px_100px] md:grid-cols-[100px_1fr_80px_120px_120px] gap-px bg-border/30">
          <div className="bg-card/80 px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">Phiên</div>
          <div className="bg-card/80 px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">Xúc xắc</div>
          <div className="bg-card/80 px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">Tổng</div>
          <div className="bg-card/80 px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest">Kết quả</div>
          <div className="bg-card/80 px-4 py-3 text-xs font-mono text-muted-foreground uppercase tracking-widest hidden md:block">Thời gian</div>
        </div>

        <div className="divide-y divide-border/20">
          {data?.map((session, i) => (
            <motion.div
              key={session.sessionId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.01 }}
              className={cn(
                "grid grid-cols-[80px_1fr_60px_100px] md:grid-cols-[100px_1fr_80px_120px_120px] gap-px",
                "hover:bg-primary/5 transition-colors group"
              )}
            >
              <div className="px-4 py-3 text-xs font-mono text-muted-foreground flex items-center">
                #{session.sessionId}
              </div>
              <div className="px-4 py-3 flex items-center gap-1.5">
                {session.dice.map((d, j) => (
                  <Dice key={j} value={d} size="sm" />
                ))}
              </div>
              <div className={cn(
                "px-4 py-3 text-sm font-bold font-mono flex items-center",
                session.result === "tai" && "text-red-400",
                session.result === "xiu" && "text-blue-400",
                session.result === "bao" && "text-amber-400",
              )}>
                {session.sum}
              </div>
              <div className="px-4 py-3 flex items-center">
                <ResultBadge result={session.result} />
              </div>
              <div className="px-4 py-3 text-xs font-mono text-muted-foreground flex items-center hidden md:flex">
                {new Date(session.endTime).toLocaleTimeString("vi-VN")}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
