import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Lets an athlete accept or decline coach connection requests. */
export function PendingCoachInvites({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pending-coach-invites", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_athletes")
        .select("id, coach_id")
        .eq("athlete_id", athleteId)
        .eq("status", "pending");
      if (error) throw error;
      const ids = (data ?? []).map((d) => d.coach_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const m = new Map((profs ?? []).map((p) => [p.id, p.full_name]));
      return (data ?? []).map((d) => ({ ...d, name: m.get(d.coach_id) ?? null }));
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "accepted" | "rejected" }) => {
      if (status === "rejected") {
        const { error } = await supabase.from("coach_athletes").delete().eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("coach_athletes").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "accepted" ? "Coach connected" : "Request declined");
      qc.invalidateQueries({ queryKey: ["pending-coach-invites", athleteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!q.data || q.data.length === 0) return null;
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Coach requests
        </CardTitle>
        <CardDescription>Accept to let this coach plan your training and see your logs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.data.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
            <span className="font-medium">{r.name ?? "A coach"}</span>
            <div className="flex gap-1">
              <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, status: "accepted" })}>
                <Check className="mr-1 h-3.5 w-3.5" /> Accept
              </Button>
              <Button size="sm" variant="ghost" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, status: "rejected" })}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
