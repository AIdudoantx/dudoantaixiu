import { motion } from "framer-motion";
import { useGetTaixiuTop } from "@workspace/api-client-react";
import { Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy size={18} className="text-amber-400" />;
  if (rank === 2) return <Medal size={18} className="text-gray-300" />;
  if (rank === 3) return <Award size={18} className="text-amber-600" />;
  return <span className="text-muted-foreground font-mono text-sm w-[18px] text-center">{rank}</span>;
}

export default function Top() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTaixiuTop({ query: { refetchInterval: 30000 } as any });

  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono">Bang Xep Hang</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Top nguoi choi xuat sac nhat</p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 text-muted-foreground font-mono text-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          Dang tai du lieu...
        </div>
      )}

      {entries.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Trophy size={40} className="text-muted-foreground/30 mb-4" />
          <div className="text-muted-foreground font-mono text-sm">Chua co du lieu bang xep hang</div>
          <div className="text-muted-foreground/50 font-mono text-xs mt-1">API sand999_top_one chua tra ve ket qua</div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.slice(0, 3).length > 0 && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[entries[1], entries[0], entries[2]].filter(Boolean).map((entry, visualIdx) => {
                const isPodiumFirst = visualIdx === 1;
                return (
                  <motion.div
                    key={entry.rank}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: visualIdx * 0.1 }}
                    className={cn(
                      "flex flex-col items-center justify-end rounded-2xl border p-4 text-center",
                      isPodiumFirst
                        ? "bg-amber-500/10 border-amber-500/30 pt-8"
                        : "bg-card/60 border-border/50",
                    )}
                  >
                    <RankIcon rank={entry.rank} />
                    <div className="mt-3 text-sm font-mono font-medium truncate max-w-full px-2">{entry.name}</div>
                    <div className={cn(
                      "text-lg font-bold font-mono mt-1",
                      isPodiumFirst ? "text-amber-400" : "text-muted-foreground"
                    )}>
                      {entry.score.toLocaleString()}
                    </div>
                    <div className={cn(
                      "text-xs mt-2 font-mono",
                      isPodiumFirst ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground",
                      "px-2 py-0.5 rounded-full",
                    )}>
                      #{entry.rank}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[48px_1fr_120px] border-b border-border/30 bg-muted/20 px-4 py-2.5">
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">#</div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Ten</div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest text-right">Diem</div>
            </div>
            <div className="divide-y divide-border/20">
              {entries.map((entry, i) => (
                <motion.div
                  key={entry.rank}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="grid grid-cols-[48px_1fr_120px] px-4 py-3 hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center">
                    <RankIcon rank={entry.rank} />
                  </div>
                  <div className="font-mono text-sm flex items-center">{entry.name}</div>
                  <div className="font-mono text-sm font-bold text-primary text-right flex items-center justify-end">
                    {entry.score.toLocaleString()}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
