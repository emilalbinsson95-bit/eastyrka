import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Preference = "email_messages_enabled" | "email_coach_invites_enabled";

export function EmailPreferences({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["email-preferences", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles")
        .select("email_messages_enabled, email_coach_invites_enabled")
        .eq("id", userId).single();
      if (error) throw error;
      return data;
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ key, value }: { key: Preference; value: boolean }) => {
      const patch = key === "email_messages_enabled"
        ? { email_messages_enabled: value }
        : { email_coach_invites_enabled: value };
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-preferences", userId] }); toast.success("Preference saved"); },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Email notifications</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Email delivery is not available yet. Your choices will be saved for when it is enabled; in-app notifications stay on.</p>
        {([
          ["email_messages_enabled", "New messages"],
          ["email_coach_invites_enabled", "Coach invitations"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4 border-t border-border pt-4 text-sm">
            <span>{label}</span>
            <Switch aria-label={label} checked={query.data?.[key] ?? false}
              disabled={!query.data || mutation.isPending}
              onCheckedChange={(value) => mutation.mutate({ key, value })} />
          </label>
        ))}
        {query.isError && <p role="alert" className="text-sm text-destructive">Could not load email choices.</p>}
      </CardContent>
    </Card>
  );
}