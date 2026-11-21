import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Bell, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isNoticeCurrent, resolveRecipients, stockholmToday } from "@/lib/coachNotices";

/** Athlete side: unread, still-current notices from the athlete's coaches. */
export function CoachNoticeBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["coach-notices-unread", user?.id];
  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const [notices, reads] = await Promise.all([
        supabase.from("coach_notices").select("id, coach_id, coach_name, body, visible_until, created_at").neq("coach_id", user!.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("coach_notice_reads").select("notice_id").eq("user_id", user!.id),
      ]);
      if (notices.error) throw notices.error;
      if (reads.error) throw reads.error;
      const read = new Set((reads.data ?? []).map((r) => r.notice_id));
      return (notices.data ?? []).filter((n) => !read.has(n.id));
    },
  });
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coach_notice_reads").insert({ notice_id: id, user_id: user!.id });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((n) => (
        <section key={n.id} className="flex items-start gap-3 rounded-lg border border-primary/40 bg-card p-4" aria-label={t("coachNotice.title")}>
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {n.coach_name ? t("coachNotice.from", { name: n.coach_name }) : t("coachNotice.title")}
            </p>
            <p className="whitespace-pre-line break-words text-sm">{n.body}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => markRead.mutate(n.id)} disabled={markRead.isPending}>
            {t("coachNotice.close")}
          </Button>
        </section>
      ))}
    </div>
  );
}

interface RosterAthlete { athlete_id: string; full_name: string | null; tag: string | null }

/** Coach side: write a short notice to all or chosen athletes, see who has read it, remove it. */
export function CoachNoticeComposer({ athletes }: { athletes: RosterAthlete[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"all" | "pick">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [until, setUntil] = useState("");
  const others = useMemo(() => athletes.filter((a) => a.athlete_id !== user?.id), [athletes, user?.id]);
  const tags = useMemo(() => Array.from(new Set(others.map((a) => a.tag).filter((t): t is string => !!t))).sort(), [others]);
  const nameOf = useMemo(() => new Map(others.map((a) => [a.athlete_id, a.full_name ?? "Atlet"])), [others]);

  const list = useQuery({
    queryKey: ["coach-notices-own", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("coach_notices").select("id, body, recipient_ids, visible_until, created_at, coach_notice_reads(user_id)").eq("coach_id", user!.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) throw new Error("Skriv något i notisen.");
      const recipients = resolveRecipients(mode, picked);
      if (recipients && !recipients.length) throw new Error("Välj minst en atlet.");
      if (until && until < stockholmToday()) throw new Error("Datumet har redan passerat.");
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
      const first = prof?.full_name?.trim().split(/\s+/)[0] ?? null;
      const { error } = await supabase.from("coach_notices").insert({
        coach_id: user!.id, coach_name: first, body: text, recipient_ids: recipients, visible_until: until || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notisen är skickad");
      setBody(""); setPicked([]); setMode("all"); setUntil("");
      qc.invalidateQueries({ queryKey: ["coach-notices-own"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("coach_notices").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Notisen är borttagen"); qc.invalidateQueries({ queryKey: ["coach-notices-own"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const today = stockholmToday();

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Notis till atleter">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell className="h-5 w-5 text-primary" />Notis till atleter</h2>
      <p className="text-sm text-muted-foreground">Visas överst på atletens sida tills de trycker OK eller datumet passerat.</p>
      <div className="space-y-1">
        <Label htmlFor="notice-body">Meddelande</Label>
        <Textarea id="notice-body" rows={3} maxLength={1000} value={body} placeholder="Jag är på IKSU söndag 11–14." onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="notice-to">Till</Label>
          <select id="notice-to" className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "all" | "pick")}>
            <option value="all">Alla mina atleter ({others.length})</option>
            <option value="pick">Välj atleter</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notice-until">Visa till och med (valfritt)</Label>
          <Input id="notice-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      </div>
      {mode === "pick" && (
        <div className="space-y-2 rounded-md border border-border p-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Välj grupp:</span>
              {tags.map((tag) => (
                <Button key={tag} size="sm" variant="outline" className="h-7" onClick={() => setPicked((p) => Array.from(new Set([...p, ...others.filter((a) => a.tag === tag).map((a) => a.athlete_id)])))}>{tag}</Button>
              ))}
              {picked.length > 0 && <Button size="sm" variant="ghost" className="h-7" onClick={() => setPicked([])}>Rensa</Button>}
            </div>
          )}
          <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {others.map((a) => (
              <label key={a.athlete_id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={picked.includes(a.athlete_id)} onChange={() => toggle(a.athlete_id)} />
                <span className="truncate">{a.full_name ?? "Atlet"}{a.tag ? <span className="text-muted-foreground"> · {a.tag}</span> : null}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{picked.length} valda</p>
        </div>
      )}
      <Button size="sm" disabled={send.isPending || !body.trim()} onClick={() => send.mutate()}><Send className="mr-2 h-4 w-4" />Skicka notis</Button>

      {(list.data ?? []).length > 0 && (
        <div className="divide-y divide-border border-t border-border pt-2">
          {(list.data ?? []).map((n) => {
            const expired = !isNoticeCurrent(n.visible_until, today);
            const total = n.recipient_ids ? n.recipient_ids.length : others.length;
            const readBy = (n.coach_notice_reads ?? []).length;
            const to = n.recipient_ids ? n.recipient_ids.map((id) => nameOf.get(id) ?? "Atlet").join(", ") : "Alla";
            return (
              <div key={n.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="whitespace-pre-line break-words">{n.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {n.created_at.slice(0, 10)} · Till: {to} · Läst av {readBy} av {total}
                    {n.visible_until ? ` · ${expired ? "Gick ut" : "Visas till"} ${n.visible_until}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Ta bort notis" onClick={() => { if (window.confirm("Ta bort notisen? Den försvinner för alla atleter.")) remove.mutate(n.id); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
