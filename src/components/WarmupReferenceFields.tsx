import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { WARMUP_RPES } from '@/lib/warmupReference';
export function WarmupReferenceFields({ checked, rpe, onChecked, onRpe }: { checked: boolean; rpe: number | null; onChecked: (value: boolean) => void; onRpe: (value: number) => void }) {
  return <div className="space-y-3 rounded-md border border-border p-3">
    <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={(v) => onChecked(v === true)} />Uppvärmningsset på referensvikten</label>
    {checked && <><p className="text-sm font-medium">Hur tungt kändes uppvärmningssetet?</p><div className="flex flex-wrap gap-2" role="group" aria-label="Uppvärmnings-RPE">{WARMUP_RPES.map((v) => <Button key={v} size="sm" variant={rpe === v ? 'default' : 'outline'} aria-pressed={rpe === v} onClick={() => onRpe(v)}>{v}</Button>)}</div></>}
  </div>;
}
