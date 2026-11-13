import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STRATEGY, STRATEGY_FIELDS, STRATEGY_PRESETS, matchPreset, presetFormValues, strategyFromRow, strategyValuesToRow, type StrategyPresetId } from "@/lib/eakStrategy";
import type { EakStrategy } from "@/lib/eakSignal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = Partial<Record<keyof EakStrategy, string>>;

export function EakStrategyCard({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<FormValues>({});
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
    mutationFn: async ({ next }: { next: FormValues; label: string }) => {
      const columns = strategyValuesToRow(next);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Logga in för att spara.");
      const { error } = await supabase.from("athlete_eak_strategy").upsert({ athlete_id: athleteId, ...columns, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
      if (error) throw error;
    },
    onSuccess: (_d, { label }) => { qc.invalidateQueries({ queryKey: ["eak-strategy", athleteId] }); toast.success(`${label} sparad. Tidigare utvärderingar ligger kvar.`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const disabled = query.isLoading || query.isError || save.isPending;
  const saved = query.data ? matchPreset(query.data) : null;
  const choosePreset = (id: StrategyPresetId) => {
    const next = presetFormValues(id);
    setValues(next);
    save.mutate({ next, label: `EAk-nivå ${STRATEGY_PRESETS.find((p) => p.id === id)?.label.toLowerCase()}` });
  };
  return <Card>
    <CardHeader><CardTitle>EAk-strategi</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Välj hur snabbt EAk ska bromsa och föreslå mer för den här atleten. Förslagen ändrar ingenting förrän du godkänner dem.</p>
      {query.isError && <p role="alert" className="text-sm text-destructive">Kunde inte läsa strategin. Försök igen.</p>}
      <div role="group" aria-label="EAk-nivå" className="grid gap-2 sm:grid-cols-3">
        {STRATEGY_PRESETS.map((p) => {
          const active = !query.isLoading && saved === p.id;
          return <button key={p.id} type="button" aria-pressed={active} disabled={disabled} onClick={() => choosePreset(p.id)}
            className={`rounded-md border p-3 text-left transition-colors disabled:opacity-60 ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
            <span className="block text-sm font-medium">{p.label}{active ? " · vald" : ""}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{p.text}</span>
          </button>;
        })}
      </div>
      {!query.isLoading && !query.isError && saved === null && <p className="text-xs text-muted-foreground">Egna gränser är sparade. Välj en nivå ovan för att ersätta dem.</p>}
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Avancerat: ställ in varje gräns</summary>
        <div className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">Tomma fält följer standard. Motorn räknar likadant för alla; här flyttar du bara gränserna.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STRATEGY_FIELDS.map((f) => <div key={f.key} className="space-y-1">
              <Label htmlFor={`eak-${f.key}`}>{f.label}</Label>
              <Input id={`eak-${f.key}`} type="number" min="0" step={"integer" in f ? 1 : 0.01} max={"share" in f ? 1 : undefined} placeholder={String(DEFAULT_STRATEGY[f.key])} value={values[f.key] ?? ""} disabled={disabled} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            </div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={disabled} onClick={() => save.mutate({ next: values, label: "EAk-strategin" })}><Save className="mr-1 h-4 w-4" />Spara egna gränser</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => choosePreset("standard")}><RotateCcw className="mr-1 h-4 w-4" />Återställ standard</Button>
          </div>
        </div>
      </details>
    </CardContent>
  </Card>;
}
