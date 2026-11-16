import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Megaphone, Send, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Audience = "all" | "coach" | "athlete";
const AUDIENCE_LABEL: Record<Audience, string> = { all: "Alla", coach: "Coacher", athlete: "Atleter" };

/** Unread published news for the signed-in user, shown once until marked read. */
export function AnnouncementBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const key = ["announcements-unread", user?.id];
  const q = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const [ann, reads] = await Promise.all([
        supabase.from("app_announcements").select("id, title, body, published_at").not("published_at", "is", null).order("published_at", { ascending: false }).limit(10),
        supabase.from("announcement_reads").select("announcement_id").eq("user_id", user!.id),
      ]);
      if (ann.error) throw ann.error;
      if (reads.error) throw reads.error;
      const read = new Set((reads.data ?? []).map((r) => r.announcement_id));
      return (ann.data ?? []).filter((a) => !read.has(a.id));
    },
  });
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcement_reads").insert({ announcement_id: id, user_id: user!.id });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => { setIndex(0); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const items = q.data ?? [];
  if (!items.length) return null;
  const item = items[Math.min(index, items.length - 1)];
  return (
    <section className="mb-4 space-y-2 rounded-lg border border-primary/40 bg-card p-4" aria-label={t("news.title")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Megaphone className="h-4 w-4 text-primary" />{t("news.title")}: {item.title}</h2>
        {items.length > 1 && <span className="text-xs text-muted-foreground">{t("news.of", { n: Math.min(index, items.length - 1) + 1, total: items.length })}</span>}
      </div>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => markRead.mutate(item.id)} disabled={markRead.isPending}>{t("news.close")}</Button>
        {items.length > 1 && <Button size="sm" variant="outline" onClick={() => setIndex((i) => (i + 1) % items.length)}>{t("news.next")}</Button>}
      </div>
    </section>
  );
}

/** Admin: write, save as draft and publish app news. Nothing reaches users until "Publicera". */
export function AnnouncementComposer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const list = useQuery({
    queryKey: ["announcements-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_announcements").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const reset = () => { setEditing(null); setTitle(""); setBody(""); setAudience("all"); };
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const row = { title: title.trim(), body: body.trim(), audience, ...(publish ? { published_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() };
      if (!row.title || !row.body) throw new Error("Rubrik och text behövs.");
      const { error } = editing
        ? await supabase.from("app_announcements").update(row).eq("id", editing)
        : await supabase.from("app_announcements").insert({ ...row, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: (_, publish) => { qc.invalidateQueries({ queryKey: ["announcements-admin"] }); qc.invalidateQueries({ queryKey: ["announcements-unread"] }); toast.success(publish ? "Meddelandet är publicerat" : "Utkastet är sparat"); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("app_announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements-admin"] }); toast.success("Utkastet är borttaget"); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Nyheter i appen">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Megaphone className="h-5 w-5 text-primary" />Nyheter i appen</h2>
      <p className="text-sm text-muted-foreground">Skriv ett meddelande om förändringar. Det visas en gång för valda användare tills de trycker på "Jag har läst". Utkast syns bara här.</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1"><Label htmlFor="ann-title">Rubrik</Label><Input id="ann-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ann-aud">Mottagare</Label>
          <select id="ann-aud" className="flex h-9 rounded-md border border-input bg-background px-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1"><Label htmlFor="ann-body">Text</Label><Textarea id="ann-body" rows={10} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate(false)}><Save className="mr-2 h-4 w-4" />Spara utkast</Button>
        <Button size="sm" disabled={save.isPending} onClick={() => { if (window.confirm(`Publicera till ${AUDIENCE_LABEL[audience].toLowerCase()} nu?`)) save.mutate(true); }}><Send className="mr-2 h-4 w-4" />Publicera</Button>
        {editing && <Button size="sm" variant="ghost" onClick={reset}>Avbryt</Button>}
      </div>
      <div className="divide-y divide-border">
        {(list.data ?? []).map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">{AUDIENCE_LABEL[a.audience as Audience] ?? a.audience} · {a.published_at ? `Publicerat ${a.published_at.slice(0, 10)}` : "Utkast"}</p>
            </div>
            <div className="flex items-center gap-2">
              {a.published_at ? <Badge variant="secondary">Publicerat</Badge> : <>
                <Button size="sm" variant="outline" onClick={() => { setEditing(a.id); setTitle(a.title); setBody(a.body); setAudience(a.audience as Audience); }}>Redigera</Button>
                <Button size="icon" variant="ghost" aria-label="Ta bort utkast" onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
              </>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
