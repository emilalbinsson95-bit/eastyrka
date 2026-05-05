import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Send, MessageCircle, User as UserIcon } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const messagesSearchSchema = z.object({
  thread: z.string().uuid().optional(),
});

export const Route = createFileRoute("/messages")({
  validateSearch: (s) => messagesSearchSchema.parse(s),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Messages — EA Training System" },
      { name: "description", content: "Chat between coach and athlete." },
    ],
  }),
  component: MessagesPage,
});

interface ThreadRow {
  id: string;
  coach_id: string;
  athlete_id: string;
  planned_session_id: string | null;
  subject: string | null;
  last_message_at: string;
  other_name: string;
  unread: number;
  last_body: string | null;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

function MessagesPage() {
  const { user, role } = useAuth();
  const { thread: selectedId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch threads with the other party's name and unread count
  const threadsQuery = useQuery({
    queryKey: ["message-threads", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ThreadRow[]> => {
      const { data: threads, error } = await supabase
        .from("message_threads")
        .select("id, coach_id, athlete_id, planned_session_id, subject, last_message_at")
        .or(`coach_id.eq.${user!.id},athlete_id.eq.${user!.id}`)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      if (!threads || threads.length === 0) return [];

      const otherIds = Array.from(
        new Set(
          threads.map((t) => (t.coach_id === user!.id ? t.athlete_id : t.coach_id)),
        ),
      );
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", otherIds);
      const nameMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name ?? "User"]),
      );

      // Last message + unread count per thread
      const threadIds = threads.map((t) => t.id);
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("thread_id, body, sender_id, read_at, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false })
        .limit(500);

      const lastByThread = new Map<string, { body: string; sender_id: string }>();
      const unreadByThread = new Map<string, number>();
      for (const m of lastMsgs ?? []) {
        if (!lastByThread.has(m.thread_id)) {
          lastByThread.set(m.thread_id, { body: m.body, sender_id: m.sender_id });
        }
        if (m.sender_id !== user!.id && !m.read_at) {
          unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
        }
      }

      return threads.map((t) => ({
        ...t,
        other_name:
          nameMap.get(t.coach_id === user!.id ? t.athlete_id : t.coach_id) ?? "User",
        unread: unreadByThread.get(t.id) ?? 0,
        last_body: lastByThread.get(t.id)?.body ?? null,
      }));
    },
  });

  // Fetch the linked counterparts so user can start a NEW thread
  const partnersQuery = useQuery({
    queryKey: ["message-partners", user?.id, role],
    enabled: !!user && !!role,
    queryFn: async () => {
      const ids = new Set<string>();
      if (role === "coach") {
        const { data } = await supabase
          .from("coach_athletes")
          .select("athlete_id")
          .eq("coach_id", user!.id);
        (data ?? []).forEach((r) => ids.add(r.athlete_id));
      } else if (role === "athlete") {
        const { data } = await supabase
          .from("coach_athletes")
          .select("coach_id")
          .eq("athlete_id", user!.id);
        (data ?? []).forEach((r) => ids.add(r.coach_id));
      } else if (role === "physio") {
        const { data } = await supabase
          .from("physio_patients")
          .select("patient_id")
          .eq("physio_id", user!.id);
        (data ?? []).forEach((r) => ids.add(r.patient_id));
      } else if (role === "patient") {
        const { data } = await supabase
          .from("physio_patients")
          .select("physio_id")
          .eq("patient_id", user!.id);
        (data ?? []).forEach((r) => ids.add(r.physio_id));
      }
      const idArr = Array.from(ids);
      if (idArr.length === 0) return [] as Array<{ id: string; name: string }>;
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", idArr);
      return (ps ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "User" }));
    },
  });

  // Selected thread messages
  const messagesQuery = useQuery({
    queryKey: ["thread-messages", selectedId],
    enabled: !!selectedId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, thread_id, sender_id, body, read_at, created_at")
        .eq("thread_id", selectedId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mark unread inbound messages as read when opening thread
  useEffect(() => {
    if (!selectedId || !user || !messagesQuery.data) return;
    const unread = messagesQuery.data.filter(
      (m) => m.sender_id !== user.id && !m.read_at,
    );
    if (unread.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((u) => u.id),
      )
      .then(() => {
        qc.invalidateQueries({ queryKey: ["message-threads", user.id] });
      });
  }, [selectedId, user, messagesQuery.data, qc]);

  // Realtime: refresh on new message in any of my threads
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          qc.invalidateQueries({ queryKey: ["message-threads", user.id] });
          if (newMsg.thread_id === selectedId) {
            qc.invalidateQueries({ queryKey: ["thread-messages", selectedId] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedId, qc]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messagesQuery.data]);

  const selectedThread = useMemo(
    () => threadsQuery.data?.find((t) => t.id === selectedId),
    [threadsQuery.data, selectedId],
  );

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || !selectedId || !user) return;
    setDraft("");
    const { error } = await supabase
      .from("messages")
      .insert({ thread_id: selectedId, sender_id: user.id, body });
    if (error) {
      toast.error("Failed to send: " + error.message);
      setDraft(body);
    }
  };

  const startThreadWith = async (otherId: string) => {
    if (!user || !role) return;
    // For physio/patient direct chat we reuse coach_id/athlete_id columns:
    // physio sits in coach_id, patient in athlete_id.
    const initiatorIsLeftSide = role === "coach" || role === "physio";
    const coachId = initiatorIsLeftSide ? user.id : otherId;
    const athleteId = initiatorIsLeftSide ? otherId : user.id;

    // Try to find an existing general thread
    const existing = threadsQuery.data?.find(
      (t) =>
        t.coach_id === coachId &&
        t.athlete_id === athleteId &&
        !t.planned_session_id,
    );
    if (existing) {
      navigate({ search: { thread: existing.id } });
      return;
    }
    const { data, error } = await supabase
      .from("message_threads")
      .insert({ coach_id: coachId, athlete_id: athleteId })
      .select("id")
      .single();
    if (error) {
      toast.error("Couldn't start thread: " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["message-threads", user.id] });
    navigate({ search: { thread: data.id } });
  };

  const partners = partnersQuery.data ?? [];
  const threads = threadsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={role === "coach" ? "/coach" : "/today"}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Messages</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Thread list */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversations
            </h2>
          </div>
          <ScrollArea className="h-[60vh]">
            {threads.length === 0 && partners.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {role === "coach"
                  ? "Connect with athletes to start messaging."
                  : "Your coach hasn't been added yet."}
              </div>
            )}

            {threads.length > 0 && (
              <ul className="divide-y divide-border">
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ search: { thread: t.id } })}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        selectedId === t.id && "bg-accent",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.other_name}</span>
                        {t.unread > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {t.unread}
                          </Badge>
                        )}
                      </div>
                      {t.last_body && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {t.last_body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(t.last_message_at), {
                          addSuffix: true,
                        })}
                        {t.planned_session_id && " · session"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* New thread starter */}
            {partners.length > 0 && (
              <div className="border-t border-border px-3 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Start new
                </p>
                <ul className="space-y-1">
                  {partners
                    .filter(
                      (p) =>
                        !threads.some(
                          (t) =>
                            !t.planned_session_id &&
                            (t.coach_id === p.id || t.athlete_id === p.id),
                        ),
                    )
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => startThreadWith(p.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                        >
                          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{p.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Chat panel */}
        <Card className="flex h-[60vh] flex-col overflow-hidden">
          {!selectedThread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h3 className="font-semibold">{selectedThread.other_name}</h3>
                  {selectedThread.planned_session_id && (
                    <p className="text-xs text-muted-foreground">Session-scoped</p>
                  )}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
                {messagesQuery.isLoading ? (
                  <div className="text-center text-sm text-muted-foreground">Loading…</div>
                ) : (messagesQuery.data ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No messages yet. Say hi.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {messagesQuery.data!.map((m) => {
                      const mine = m.sender_id === user?.id;
                      return (
                        <li
                          key={m.id}
                          className={cn("flex", mine ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={cn(
                              "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                              mine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                            <p
                              className={cn(
                                "mt-0.5 text-[10px]",
                                mine
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground",
                              )}
                            >
                              {format(new Date(m.created_at), "HH:mm")}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-border p-3">
                <div className="flex gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Type a message… (Enter to send)"
                    rows={2}
                    className="resize-none"
                    maxLength={4000}
                  />
                  <Button onClick={sendMessage} disabled={!draft.trim()} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
