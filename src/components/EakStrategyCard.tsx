import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STRATEGY, STRATEGY_FIELDS, strategyFromRow, strategyValuesToRow } from "@/lib/eakStrategy";
import type { EakStrategy } from "@/lib/eakSignal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EakStrategyCard({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Partial<Record<keyof EakStrategy, string>>>({});
  const query = useQuery({
    queryKey: ["eak-strategy", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_eak_strategy").select("*").eq("athlete_id", athleteId).maybeSingle();
      if (error) throw error;
      return strategyFromRow(data);
    },
  });
  useEffect(() => {
    if (query.data) setValues(Object.fromEntries(Object.entries(query.data).map(([key, value]) => [key, value == null ? "" : String(value)])));
  }, [query.data, athleteId]);
  const save = useMutation({
    mutationFn: async (reset: boolean) => {
      const columns = strategyValuesToRow(reset ? {} : values);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Logga in för att spara.");
      const { error } = await supabase.from("athlete_eak_strategy").upsert({ athlete_id: athleteId, ...columns, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["eak-strategy", athleteId] }); toast.success("EAk-strategin sparad. Tidigare utvärderingar ligger kvar."); },
    onError: (e: Error) => toast.error(e.message),
  });
  const disabled = query.isLoading || query.isError || save.isPending;
  return <Card>
    <CardHeader><CardTitle>EAk-strategi</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Maskineriet räknar likadant för alla. Här sätter du var gränserna går för just den här atleten.</p>
      {query.isError && <p role="alert" className="text-sm text-destructive">Kunde inte läsa strategin. Försök igen.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STRATEGY_FIELDS.map((f) => <div key={f.key} className="space-y-1">
          <Label htmlFor={`eak-${f.key}`}>{f.label}</Label>
          <Input id={`eak-${f.key}`} type="number" min="0" step={"integer" in f ? 1 : 0.01} max={"share" in f ? 1 : undefined} placeholder={String(DEFAULT_STRATEGY[f.key])} value={values[f.key] ?? ""} disabled={disabled} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled} onClick={() => save.mutate(false)}><Save className="mr-1 h-4 w-4" />Spara EAk-strategi</Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => save.mutate(true)}><RotateCcw className="mr-1 h-4 w-4" />Återställ standard</Button>
      </div>
    </CardContent>
  </Card>;
}