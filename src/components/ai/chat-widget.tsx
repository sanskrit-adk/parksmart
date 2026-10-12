"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BotIcon, CalendarPlusIcon, MessageCircleIcon, SendIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { api } from "@/lib/fetcher";
import { dateTime, duration, money, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ResultCard {
  id: string;
  name: string;
  hourly_price: number;
  walk_minutes: number;
  free_probability: number;
  ai_pick: boolean;
  reason: string;
}

type Action =
  | { type: "book"; location_id: string; location_name: string; start_time: string; end_time: string; vehicle_plate: string | null; total: number; hours: number }
  | { type: "extend"; booking_id: string; location_name: string; minutes: number; new_end_time: string; amount: number }
  | { type: "cancel"; booking_id: string; location_name: string; refund: number; rule: string };

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards?: ResultCard[];
  actions?: (Action & { state?: "pending" | "done" | "dismissed" })[];
}

const SUGGESTIONS = ["Find parking near me for 2 hours", "Cheapest garage near Oracle Park tonight", "Show my bookings", "Extend my current booking by 1 hour"];
const STORE = "parksmart:chat";

export function ChatWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useSession();
  const geo = useGeolocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);
    try {
      const res = await api<{ reply: string; cards: ResultCard[]; actions: Action[] }>("/api/ai/chat", {
        json: { messages: history.map(({ role, content }) => ({ role, content })), position: geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null },
      });
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: res.reply, cards: res.cards, actions: res.actions.map((a) => ({ ...a, state: "pending" })) },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `Sorry — ${(e as Error).message}` }]);
    } finally {
      setSending(false);
    }
  }

  function setActionState(msgId: string, idx: number, state: "done" | "dismissed") {
    setMessages((m) => m.map((msg) => (msg.id === msgId ? { ...msg, actions: msg.actions?.map((a, i) => (i === idx ? { ...a, state } : a)) } : msg)));
  }

  async function confirm(msgId: string, idx: number, action: Action) {
    const key = `${msgId}-${idx}`;
    setBusyAction(key);
    try {
      if (action.type === "book") {
        const res = await api<{ booking: { id: string }; checkout_url: string | null }>("/api/bookings", {
          json: { location_id: action.location_id, start_time: action.start_time, end_time: action.end_time, vehicle_plate: action.vehicle_plate },
        });
        setActionState(msgId, idx, "done");
        if (res.checkout_url) {
          toast.success("Taking you to secure checkout…");
          window.location.href = res.checkout_url;
        } else {
          toast.success("Booked!");
          router.push(`/bookings/${res.booking.id}`);
        }
      } else if (action.type === "extend") {
        const res = await api<{ url: string | null }>(`/api/bookings/${action.booking_id}/extend`, { json: { minutes: action.minutes } });
        setActionState(msgId, idx, "done");
        if (res.url) window.location.href = res.url;
        else {
          toast.success("Booking extended");
          router.refresh();
        }
      } else {
        const res = await api<{ refund: { amount: number } }>(`/api/bookings/${action.booking_id}/cancel`, { method: "POST" });
        setActionState(msgId, idx, "done");
        toast.success("Booking cancelled", { description: res.refund.amount > 0 ? `${money(res.refund.amount)} refund on its way` : "No refund applies" });
        router.refresh();
      }
    } catch (e) {
      toast.error("That didn't work", { description: (e as Error).message });
    } finally {
      setBusyAction(null);
    }
  }

  const onFind = pathname === "/find";

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={cn("fixed right-4 z-40", onFind ? "top-[8.75rem] md:top-auto md:bottom-6" : "bottom-24 md:bottom-6")}
          >
            <Button
              size="icon-lg"
              variant="teal"
              onClick={() => setOpen(true)}
              aria-label="Open AI parking assistant"
              className="size-14 rounded-full shadow-lift"
            >
              <MessageCircleIcon className="size-6" />
              <span className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-navy text-white dark:bg-white dark:text-navy">
                <SparklesIcon className="size-3" />
              </span>
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-label="AI parking assistant"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:right-6 md:bottom-6 md:h-[min(640px,calc(100dvh-6rem))] md:w-[400px] md:rounded-3xl md:border md:shadow-lift"
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-navy text-teal dark:bg-teal dark:text-navy">
                <BotIcon className="size-5" />
              </span>
              <div className="flex-1">
                <p className="font-semibold">Parking assistant</p>
                <p className="text-xs text-muted-foreground">Finds, books, extends & cancels — always asks first</p>
              </div>
              {messages.length > 0 && (
                <Button variant="ghost" size="icon-sm" aria-label="Clear conversation" onClick={() => setMessages([])}>
                  <Trash2Icon />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={() => setOpen(false)}>
                <XIcon />
              </Button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
              {messages.length === 0 && (
                <div className="space-y-4 pt-6 text-center">
                  <SparklesIcon className="mx-auto size-8 text-teal-strong" />
                  <p className="text-sm text-muted-foreground">
                    Ask me anything about parking in the Bay Area.
                    {!profile && " Sign in to book or manage bookings by chat."}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-full border bg-card px-3 py-2 text-left text-sm hover:bg-muted">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                      m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
                    )}
                  >
                    {m.content}
                  </div>
                  {m.cards && m.cards.length > 0 && (
                    <div className="w-full space-y-2">
                      {m.cards.slice(0, 3).map((c) => (
                        <Link
                          key={c.id}
                          href={`/spots/${c.id}`}
                          onClick={() => setOpen(false)}
                          className="block rounded-xl border bg-card p-3 text-sm shadow-soft hover:bg-muted/50"
                        >
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-semibold">
                              {c.ai_pick && <SparklesIcon className="mr-1 inline size-3.5 text-teal-strong" />}
                              {c.name}
                            </span>
                            <span className="font-bold">{c.hourly_price === 0 ? "Free" : `${money(c.hourly_price)}/hr`}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.walk_minutes} min walk · {percent(c.free_probability)} likely free
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.actions?.map((a, i) => (
                    <ActionCard
                      key={i}
                      action={a}
                      busy={busyAction === `${m.id}-${i}`}
                      onConfirm={() => confirm(m.id, i, a)}
                      onDismiss={() => setActionState(m.id, i, "dismissed")}
                    />
                  ))}
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-4 py-3" aria-label="Assistant is typing">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-2 rounded-full bg-muted-foreground/60"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="pb-safe flex items-end gap-2 border-t p-3"
            >
              <label htmlFor="chat-input" className="sr-only">
                Message the parking assistant
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="e.g. Book the closest garage for 3 hours"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border bg-card px-3.5 py-2.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
              <Button type="submit" size="icon" className="size-11" loading={sending} disabled={!input.trim()} aria-label="Send message">
                <SendIcon />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ActionCard({
  action,
  busy,
  onConfirm,
  onDismiss,
}: {
  action: Action & { state?: "pending" | "done" | "dismissed" };
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const title = action.type === "book" ? "Confirm booking" : action.type === "extend" ? "Confirm extension" : "Confirm cancellation";
  return (
    <div className="w-full rounded-2xl border-2 border-teal/50 bg-card p-4 text-sm shadow-soft">
      <p className="flex items-center gap-2 font-semibold">
        <CalendarPlusIcon className="size-4 text-teal-strong" /> {title}
      </p>
      <dl className="mt-2 space-y-1 text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Location</dt>
          <dd className="truncate text-right font-medium text-foreground">{action.location_name}</dd>
        </div>
        {action.type === "book" && (
          <>
            <div className="flex justify-between">
              <dt>Starts</dt>
              <dd className="text-foreground">{dateTime(action.start_time)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Duration</dt>
              <dd className="text-foreground">{duration(action.hours)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Total</dt>
              <dd className="font-semibold text-foreground">{money(action.total)}</dd>
            </div>
          </>
        )}
        {action.type === "extend" && (
          <>
            <div className="flex justify-between">
              <dt>New end</dt>
              <dd className="text-foreground">{dateTime(action.new_end_time)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Extra cost</dt>
              <dd className="font-semibold text-foreground">{money(action.amount)}</dd>
            </div>
          </>
        )}
        {action.type === "cancel" && (
          <>
            <div className="flex justify-between">
              <dt>Refund</dt>
              <dd className="font-semibold text-foreground">{money(action.refund)}</dd>
            </div>
            <p className="text-xs">{action.rule}</p>
          </>
        )}
      </dl>
      {action.state === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onDismiss} disabled={busy}>
            Not now
          </Button>
          <Button variant={action.type === "cancel" ? "destructive" : "teal"} className="flex-1" onClick={onConfirm} loading={busy}>
            {action.type === "book" ? "Confirm & pay" : action.type === "extend" ? "Confirm & pay" : "Cancel booking"}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium text-muted-foreground">{action.state === "done" ? "✓ Done" : "Dismissed"}</p>
      )}
    </div>
  );
}
