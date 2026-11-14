import { useCallback, useEffect, useRef, useState } from "react";
import { Button, inputClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { CHAT_BODY_MAX, CHAT_SENDER_LABELS, type ChatMessage, type ChatSender } from "@/lib/domain/chat";
import { formatDateTime } from "@/lib/format";
import { fetchMessages, postMessage } from "@/lib/remote";

const POLL_MS = 8_000;

/**
 * Utas pesan pelapor ↔ tim posko, seperti surel: setiap pesan punya pengirim dan waktu.
 * `as` = sisi yang sedang melihat. Pesan hanya informasi tambahan; tidak dibaca oleh perhitungan kebutuhan.
 */
export function ChatThread({ code, as }: { code: string; as: ChatSender }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "offline">("loading");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetchMessages(code, lastId.current);
    if (!res.ok) return setState(res.kind === "not_found" ? "unavailable" : "offline");
    setState("ready");
    if (res.data.messages.length > 0) {
      lastId.current = res.data.messages[res.data.messages.length - 1].id;
      setMessages((m) => [...m, ...res.data.messages.filter((n) => !m.some((x) => x.id === n.id))]);
    }
  }, [code]);

  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
    setState("loading");
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await postMessage(code, as, body);
    setSending(false);
    if (!res.ok) return setError(res.message);
    setDraft("");
    await load();
  }

  const other = as === "reporter" ? "tim posko" : "pelapor";
  return (
    <section aria-label="Pesan dengan tim" className="rounded-lg border border-navy-700 bg-white">
      <h2 className="flex items-center gap-2 border-b border-navy-700 px-4 py-3 text-base font-bold">
        <Icon name="chat" size={18} className="text-teal-accent" />Pesan
      </h2>
      {state === "loading" && <div role="status" aria-label="Memuat pesan" className="skeleton m-4 h-16" />}
      {state === "unavailable" && (
        <p className="px-4 py-4 text-sm text-muted">Laporan ini belum tersinkron ke posko, jadi belum bisa berkirim pesan. Coba lagi saat tersambung internet.</p>
      )}
      {state === "offline" && <p role="alert" className="px-4 py-4 text-sm text-warn">Tidak tersambung ke server. Mencoba lagi otomatis.</p>}
      {(state === "ready" || messages.length > 0) && (
        <ul aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && <li className="text-sm text-muted">Belum ada pesan. Tulis info tambahan atau pertanyaan untuk {other}.</li>}
          {messages.map((m) => {
            const mine = m.sender === as;
            return (
              <li key={m.id} className={`rounded-md border px-3 py-2 ${mine ? "ml-6 border-teal-accent/40 bg-teal-accent/5" : "mr-6 border-navy-700 bg-navy-850"}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
                  <strong className="text-ink">{mine ? "Anda" : CHAT_SENDER_LABELS[m.sender]}</strong>
                  <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-base text-ink">{m.body}</p>
              </li>
            );
          })}
          <div ref={endRef} />
        </ul>
      )}
      {state !== "unavailable" && (
        <form
          className="border-t border-navy-700 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={`chat-${as}`} className="mb-1.5 block text-sm font-semibold">
            {as === "reporter" ? "Tambah info atau balas tim" : "Balas pelapor"}
          </label>
          <textarea
            id={`chat-${as}`}
            rows={3}
            value={draft}
            maxLength={CHAT_BODY_MAX}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            className={`${inputClass} resize-y text-base`}
            placeholder={as === "reporter" ? "Contoh: Air makin tinggi, sekarang sudah 1 meter." : "Contoh: Tim menuju lokasi. Mohon kirim patokan terdekat."}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-subtle">{draft.length}/{CHAT_BODY_MAX}</span>
            <Button type="submit" variant="primary" className="min-h-11" disabled={sending || draft.trim() === ""}>
              {sending ? "Mengirim…" : "Kirim pesan"}
            </Button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          {as === "reporter" && <p className="mt-2 text-xs text-subtle">Pesan tidak mengubah hitungan kebutuhan. Hanya tim yang memutuskan. Jangan kirim data pribadi korban.</p>}
        </form>
      )}
    </section>
  );
}
