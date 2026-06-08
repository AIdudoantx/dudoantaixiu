import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Key, Bot, QrCode, Save, Check, Eye, EyeOff, Smartphone, ExternalLink, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingEntry {
  configured: boolean;
  source: "db" | "env" | "none";
  masked: string;
}

type SettingsData = Record<string, SettingEntry>;

async function fetchSettings(): Promise<SettingsData> {
  const res = await fetch("/api/settings");
  return res.json() as Promise<SettingsData>;
}

async function saveSettings(values: Record<string, string>): Promise<{ ok: boolean; saved: string[] }> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  return res.json() as Promise<{ ok: boolean; saved: string[] }>;
}

// ── Expo Go QR Code ───────────────────────────────────────────────────

function QRCodeCard() {
  const [expoUrl, setExpoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/expo-url")
      .then((r) => r.json() as Promise<{ expoUrl: string | null; domain: string | null }>)
      .then((data) => { setExpoUrl(data.expoUrl); })
      .catch(() => { setExpoUrl(null); })
      .finally(() => setLoading(false));
  }, []);

  const qrData = expoUrl ?? window.location.origin;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(qrData)}`;
  const isExpoGo = !!expoUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border/50 bg-card/60 p-6 space-y-4"
    >
      <div className="flex items-center gap-2">
        <Smartphone size={16} className="text-primary" />
        <span className="text-sm font-semibold font-mono">
          {isExpoGo ? "Mở trên Expo Go" : "Mở trên điện thoại"}
        </span>
        {isExpoGo && (
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            Expo Go
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-center">
        {/* QR Code */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
          {loading ? (
            <div className="w-[200px] h-[200px] bg-muted/40 rounded-2xl flex items-center justify-center">
              <QrCode size={40} className="text-muted-foreground/40 animate-pulse" />
            </div>
          ) : (
            <div className="p-3 bg-white rounded-2xl shadow-lg">
              <img
                src={qrImageUrl}
                alt="QR Code"
                width={200}
                height={200}
                className="rounded-xl"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <QrCode size={12} />
            {isExpoGo ? "Quét bằng app Expo Go" : "Quét để mở trình duyệt"}
          </div>
        </div>

        {/* URL + instructions */}
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <div className="text-xs font-mono text-muted-foreground mb-1 uppercase tracking-widest">
              {isExpoGo ? "Địa chỉ Expo Go" : "Địa chỉ app"}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-muted/50 px-3 py-2 rounded-xl border border-border/50 font-mono break-all">
                {loading ? "Đang tải..." : qrData}
              </code>
              {expoUrl && (
                <a
                  href={expoUrl}
                  className="flex items-center gap-1 text-xs text-primary hover:opacity-80 font-mono"
                >
                  <ExternalLink size={12} />
                  Mở
                </a>
              )}
            </div>
          </div>

          {isExpoGo ? (
            <div className="text-xs font-mono text-muted-foreground space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/30">
              <p>📱 <b className="text-foreground">Cách mở ứng dụng di động:</b></p>
              <p>1. Cài app <b className="text-primary">Expo Go</b> trên điện thoại</p>
              <p>2. Mở Expo Go → nhấn Scan</p>
              <p>3. Quét mã QR ở bên trái</p>
            </div>
          ) : (
            <div className="text-xs font-mono text-muted-foreground space-y-1.5 p-3 rounded-xl bg-muted/20 border border-border/30">
              <p>📱 <b className="text-foreground">Cách mở trên điện thoại:</b></p>
              <p>1. Dùng camera quét mã QR ở bên trái</p>
              <p>2. Hoặc nhập trực tiếp địa chỉ URL vào trình duyệt</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Token input field ─────────────────────────────────────────────────

function TokenField({
  label,
  fieldKey,
  placeholder,
  hint,
  icon: Icon,
  current,
  value,
  onChange,
  saved,
}: {
  label: string;
  fieldKey: string;
  placeholder: string;
  hint: string;
  icon: React.ElementType;
  current?: SettingEntry;
  value: string;
  onChange: (v: string) => void;
  saved: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-mono font-medium">
          <Icon size={14} className="text-muted-foreground" />
          {label}
        </label>
        {current?.configured && (
          <span className={cn(
            "text-xs font-mono px-2 py-0.5 rounded-full border",
            current.source === "db"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-blue-500/10 border-blue-500/20 text-blue-400"
          )}>
            {current.source === "db" ? "✓ Đã lưu" : "Từ env"}
          </span>
        )}
      </div>

      {current?.configured && !value && (
        <div className="text-xs font-mono text-muted-foreground px-3 py-2 rounded-xl bg-muted/20 border border-border/30">
          Hiện tại: <span className="text-primary">{current.masked}</span>
        </div>
      )}

      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={current?.configured ? "Nhập mới để thay đổi..." : placeholder}
          className={cn(
            "w-full px-4 py-2.5 pr-10 rounded-xl border bg-background/60 font-mono text-sm",
            "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30",
            "placeholder:text-muted-foreground/40 transition-colors",
            saved ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/50"
          )}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <p className="text-[10px] font-mono text-muted-foreground">{hint}</p>
    </div>
  );
}

// ── Main Settings page ────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [form, setForm] = useState({ TELEGRAM_BOT_TOKEN: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "" });
  const [saving, setSaving] = useState(false);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => setError("Không tải được cài đặt"));
  }, []);

  const hasChanges = form.TELEGRAM_BOT_TOKEN || form.OPENAI_API_KEY || form.GEMINI_API_KEY;

  async function handleSave() {
    setSaving(true);
    setError("");
    setSavedKeys([]);
    try {
      const payload: Record<string, string> = {};
      if (form.TELEGRAM_BOT_TOKEN) payload.TELEGRAM_BOT_TOKEN = form.TELEGRAM_BOT_TOKEN;
      if (form.OPENAI_API_KEY) payload.OPENAI_API_KEY = form.OPENAI_API_KEY;
      if (form.GEMINI_API_KEY) payload.GEMINI_API_KEY = form.GEMINI_API_KEY;

      if (Object.keys(payload).length === 0) {
        setError("Nhập ít nhất một giá trị để lưu");
        return;
      }

      const result = await saveSettings(payload);
      if (result.ok) {
        setSavedKeys(result.saved);
        setForm({ TELEGRAM_BOT_TOKEN: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "" });
        const refreshed = await fetchSettings();
        setSettings(refreshed);
      }
    } catch {
      setError("Lỗi khi lưu cài đặt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
          <Settings size={22} className="text-primary" />
          Cài Đặt
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">
          Quét QR để mở Expo Go · Cấu hình API keys
        </p>
      </div>

      {/* QR Code section */}
      <QRCodeCard />

      {/* API Keys section */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border/50 bg-card/60 p-6 space-y-6"
      >
        <div className="flex items-center gap-2">
          <Key size={16} className="text-primary" />
          <span className="text-sm font-semibold font-mono">API Keys</span>
          <span className="text-xs font-mono text-muted-foreground ml-2">
            Lưu vào database · Tự động áp dụng
          </span>
        </div>

        <div className="space-y-5">
          <TokenField
            label="Telegram Bot Token"
            fieldKey="TELEGRAM_BOT_TOKEN"
            placeholder="8617531708:AAF2oBo..."
            hint="Lấy từ @BotFather trên Telegram · Dạng: 1234567890:ABC...XYZ"
            icon={Bot}
            current={settings?.["TELEGRAM_BOT_TOKEN"]}
            value={form.TELEGRAM_BOT_TOKEN}
            onChange={(v) => setForm((f) => ({ ...f, TELEGRAM_BOT_TOKEN: v }))}
            saved={savedKeys.includes("TELEGRAM_BOT_TOKEN")}
          />

          <TokenField
            label="OpenAI API Key"
            fieldKey="OPENAI_API_KEY"
            placeholder="sk-proj-..."
            hint="Lấy từ platform.openai.com · Dạng: sk-proj-..."
            icon={Key}
            current={settings?.["OPENAI_API_KEY"]}
            value={form.OPENAI_API_KEY}
            onChange={(v) => setForm((f) => ({ ...f, OPENAI_API_KEY: v }))}
            saved={savedKeys.includes("OPENAI_API_KEY")}
          />

          <TokenField
            label="Gemini API Key"
            fieldKey="GEMINI_API_KEY"
            placeholder="AIzaSy..."
            hint="Lấy từ aistudio.google.com · Dùng cho phương pháp dự đoán AI thứ 4"
            icon={Cpu}
            current={settings?.["GEMINI_API_KEY"]}
            value={form.GEMINI_API_KEY}
            onChange={(v) => setForm((f) => ({ ...f, GEMINI_API_KEY: v }))}
            saved={savedKeys.includes("GEMINI_API_KEY")}
          />
        </div>

        {error && (
          <div className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            ⚠️ {error}
          </div>
        )}

        {savedKeys.length > 0 && (
          <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <Check size={12} />
            Đã lưu: {savedKeys.join(", ")} — đang áp dụng ngay
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm font-semibold transition-all",
            saving || !hasChanges
              ? "opacity-40 cursor-not-allowed bg-muted border border-border/50"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          <Save size={14} className={saving ? "animate-pulse" : ""} />
          {saving ? "Đang lưu..." : "Lưu cài đặt"}
        </button>
      </motion.div>

      {/* Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xs font-mono text-muted-foreground space-y-1 p-4 rounded-xl bg-muted/10 border border-border/20"
      >
        <p>💡 Keys được lưu trong database, tự động áp dụng khi server khởi động</p>
        <p>🔒 Giá trị không được hiển thị đầy đủ sau khi lưu (bảo mật)</p>
        <p>🤖 Bot Telegram tự gửi <b className="text-foreground">3 dự đoán</b> mỗi phiên mới</p>
        <p>🧠 Gemini AI phân tích 60 phiên gần nhất → phương pháp dự đoán thứ 4</p>
      </motion.div>
    </div>
  );
}
