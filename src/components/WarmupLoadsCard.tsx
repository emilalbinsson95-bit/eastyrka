import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { CompLift } from '@/lib/liftIdentity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const LIFTS = [{ key: 'squat', label: 'Knäböj' }, { key: 'bench', label: 'Bänk' }, { key: 'deadlift', label: 'Mark' }] as const;
export function useWarmupLoads(athleteId: string) {
  return useQuery({
    queryKey: ['warmup-loads', athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from('athlete_warmup_loads').select('lift, load_kg').eq('athlete_id', athleteId);
      if (error) throw error;
      const loads: Partial<Record<CompLift, number>> = {};
      for (const row of data ?? []) {
        if (row.lift === 'squat' || row.lift === 'bench' || row.lift === 'deadlift') loads[row.lift] = Number(row.load_kg);
      }
      return loads;
    },
  });
}
export function WarmupLoadsCard({ athleteId }: { athleteId: string }) {
  const query = useWarmupLoads(athleteId);
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<CompLift, string>>({ squat: '', bench: '', deadlift: '' });
  useEffect(() => {
    if (query.data) setValues({ squat: String(query.data.squat ?? ''), bench: String(query.data.bench ?? ''), deadlift: String(query.data.deadlift ?? '') });
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () => {
      const parsed = LIFTS.map(({ key }) => ({ key, value: values[key].trim() === '' ? null : Number(values[key].replace(',', '.')) }));
      if (parsed.some(({ value }) => value !== null && (!Number.isFinite(value) || value <= 0 || value > 1000))) throw new Error('Ange en vikt över 0 och högst 1000 kg.');
      for (const { key, value } of parsed) {
        const { error } = value === null
          ? await supabase.from('athlete_warmup_loads').delete().eq('athlete_id', athleteId).eq('lift', key)
          : await supabase.from('athlete_warmup_loads').upsert({ athlete_id: athleteId, lift: key, load_kg: value, updated_at: new Date().toISOString() }, { onConflict: 'athlete_id,lift' });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warmup-loads', athleteId] }); toast.success('Uppvärmningsvikterna sparade.'); },
    onError: () => toast.error('Kunde inte spara. Kontrollera vikterna och försök igen.'),
  });
  return <Card>
    <CardHeader><CardTitle>Uppvärmningsvikter</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {query.isError && <p className="text-sm text-destructive">Kunde inte läsa uppvärmningsvikterna.</p>}
      <div className="grid gap-3 sm:grid-cols-3">{LIFTS.map(({ key, label }) => <div key={key} className="space-y-1">
        <Label htmlFor={`warmup-${key}`}>{label} (kg)</Label>
        <Input id={`warmup-${key}`} inputMode="decimal" value={values[key]} disabled={query.isLoading || query.isError || save.isPending} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
      </div>)}</div>
      <Button size="sm" disabled={query.isLoading || query.isError || save.isPending} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />Spara uppvärmningsvikter</Button>
    </CardContent>
  </Card>;
}
