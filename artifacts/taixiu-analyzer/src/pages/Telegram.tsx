import { useState } from "react";
import { motion } from "framer-motion";
import { Send, Users, Zap, CheckCircle, XCircle, RefreshCw, Trash2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface TelegramChat {
  chatId: number;
  chatTitle: string | null;
  gameType: "tx" | "md5";
  active: boolean;
  createdAt: string;
}

interface WebhookInfo {
  ok: boolean;
  result?: { url?: string; pending_update_count?: number };
}

interface BroadcastResult {
  ok: boolean;
  sent: number;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok && res.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Stat Card ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className={cn("rounded-2xl border p-5 flex items-center gap-4", color)}>
      <div className="p-2.5 rounded-xl bg-background/40 border border-border/30">
        <Icon size={18} className="text-foreground/80" />
      </div>
      <div>
        <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</div>
        <div className="text-2xl font-bold font-mono">{value}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function Telegram() {
  const [chats, setChats] = useState<TelegramChat[] | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ tx: number | null; md5: number | null }>({ tx: null, md5: null });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [c, w] = await Promise.all([
        apiFetch<TelegramChat[]>("/telegram/chats"),
        apiFetch<WebhookInfo>("/telegram/webhook-info"),
      ]);
      setChats(c);
      setWebhookInfo(w);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }

  async function broadcast(gameType: "tx" | "md5") {
    setBroadcasting(true);
    try {
      const res = await apiFetch<BroadcastResult>("/telegram/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType }),
      });
      setBroadcastResult((prev) => ({ ...prev, [gameType]: res.sent }));
    } finally {
      setBroadcasting(false);
    }
  }

  async function removeChat(chatId: number) {
    await apiFetch(`/telegram/chats/${chatId}`, { method: "DELETE" });
    setChats((prev) => prev?.map((c) => c.chatId === chatId ? { ...c, active: false } : c) ?? null);
  }

  const activeChats = chats?.filter((c) => c.active) ?? [];
  const webhookUrl = (webhookInfo?.result as { url?: string } | undefined)?.url;
  const webhookOk = !!webhookUrl;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <Bot size={22} className="text-primary" />
            Bot Telegram
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">
            Gửi dự đoán tự động mỗi 5 phút đến các chat đã đăng ký
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/50 text-sm font-mono hover:bg-muted/40 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Làm mới
        </button>
      </div>

      {/* Hướng dẫn */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-primary/20 bg-primary/5 p-6 space-y-3"
      >
        <div className="flex items-center gap-2 text-sm font-semibold font-mono text-primary">
          <Bot size={16} />
          Cách dùng bot
        </div>
        <ol className="space-y-2 text-sm font-mono text-muted-foreground list-decimal list-inside">
          <li>Tìm bot trên Telegram và gõ <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/start</code> hoặc <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/start md5</code></li>
          <li>Bot sẽ xác nhận đăng ký và tự động gửi dự đoán mỗi <b className="text-foreground">5 phút</b></li>
          <li>Gõ <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/predict</code> để lấy dự đoán ngay lập tức</li>
          <li>Gõ <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/stop</code> để huỷ đăng ký</li>
        </ol>
        <div className="text-xs font-mono text-muted-foreground pt-1 border-t border-border/30">
          Lệnh: <code>/start</code> · <code>/start md5</code> · <code>/predict</code> · <code>/stop</code> · <code>/status</code>
        </div>
      </motion.div>

      {chats === null ? (
        <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground font-mono">
          <Bot size={40} className="opacity-30" />
          <p className="text-sm">Nhấn "Làm mới" để tải dữ liệu</p>
          <button
            onClick={refresh}
            className="px-6 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-mono"
          >
            Tải dữ liệu
          </button>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              label="Chat đang theo dõi"
              value={activeChats.length}
              icon={Users}
              color="bg-emerald-500/10 border-emerald-500/20"
            />
            <StatCard
              label="Webhook"
              value={webhookOk ? "Hoạt động" : "Chưa kết nối"}
              icon={webhookOk ? CheckCircle : XCircle}
              color={webhookOk ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}
            />
            <StatCard
              label="Tổng đã đăng ký"
              value={chats.length}
              icon={Bot}
              color="bg-blue-500/10 border-blue-500/20"
            />
          </div>

          {/* Webhook URL */}
          {webhookUrl && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <div className="text-xs font-mono text-muted-foreground mb-1">Webhook URL</div>
              <div className="text-xs font-mono text-emerald-400 break-all">{webhookUrl}</div>
            </div>
          )}

          {/* Broadcast buttons */}
          <div className="grid md:grid-cols-2 gap-4">
            {(["tx", "md5"] as const).map((gt) => (
              <motion.div
                key={gt}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border/50 bg-card/60 p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      Bàn {gt.toUpperCase()}
                    </div>
                    <div className="text-sm font-semibold font-mono mt-0.5">
                      {activeChats.filter((c) => c.gameType === gt).length} chat đang theo dõi
                    </div>
                  </div>
                  <button
                    onClick={() => broadcast(gt)}
                    disabled={broadcasting || activeChats.filter((c) => c.gameType === gt).length === 0}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-mono font-semibold transition-all",
                      activeChats.filter((c) => c.gameType === gt).length === 0
                        ? "opacity-30 cursor-not-allowed bg-muted border border-border/50"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                    )}
                  >
                    <Send size={14} className={broadcasting ? "animate-pulse" : ""} />
                    Gửi ngay
                  </button>
                </div>
                {broadcastResult[gt] !== null && (
                  <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle size={12} />
                    Đã gửi đến {broadcastResult[gt]} chat
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Chat list */}
          <div className="space-y-3">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Danh sách chat ({chats.length})
            </div>
            {chats.length === 0 ? (
              <div className="text-center py-10 text-sm font-mono text-muted-foreground">
                Chưa có chat nào. Hãy nhắn /start cho bot trên Telegram.
              </div>
            ) : (
              <div className="space-y-2">
                {chats.map((chat, i) => (
                  <motion.div
                    key={chat.chatId}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                      chat.active
                        ? "border-border/50 bg-card/40"
                        : "border-border/20 bg-muted/10 opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        chat.active ? "bg-emerald-400" : "bg-muted-foreground"
                      )} />
                      <div className="min-w-0">
                        <div className="text-sm font-mono font-medium truncate">
                          {chat.chatTitle ?? `Chat ${chat.chatId}`}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          ID: {chat.chatId} · Bàn: {chat.gameType.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn(
                        "text-xs font-mono px-2 py-0.5 rounded border",
                        chat.gameType === "tx"
                          ? "bg-red-500/10 border-red-500/20 text-red-400"
                          : "bg-blue-500/10 border-blue-500/20 text-blue-400"
                      )}>
                        {chat.gameType.toUpperCase()}
                      </span>
                      {chat.active && (
                        <button
                          onClick={() => removeChat(chat.chatId)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Huỷ theo dõi"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {lastRefresh && (
            <p className="text-center text-xs font-mono text-muted-foreground">
              Cập nhật lúc {lastRefresh.toLocaleTimeString("vi-VN")} · Bot tự động gửi mỗi 5 phút
            </p>
          )}
        </>
      )}
    </div>
  );
}
