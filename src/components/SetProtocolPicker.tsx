import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTOCOL_GROUPS, SET_PROTOCOLS, PROTOCOL_DESCRIPTION, type SetProtocolOptions } from "@/lib/setProtocols";

export function SetProtocolPicker({ value, onChange }: { value: SetProtocolOptions; onChange: (value: SetProtocolOptions) => void }) {
  return <section className="space-y-3 border-y py-4" aria-labelledby="set-protocol-title">
    <h3 id="set-protocol-title" className="text-sm font-semibold">Setupplägg</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      {PROTOCOL_GROUPS.map((group) => <div key={group.id} className="min-w-0 space-y-1.5">
        <Label htmlFor={`protocol-${group.id}`}>{group.label}</Label>
        <Select value={value[group.id]} onValueChange={(id) => {
          const protocol = SET_PROTOCOLS.find((p) => p.id === id);
          if (protocol) onChange({ ...value, [group.id]: protocol.id });
        }}>
          <SelectTrigger id={`protocol-${group.id}`} className="h-auto min-h-9 w-full [&_span]:whitespace-normal [&_span]:text-left"><SelectValue /></SelectTrigger>
          <SelectContent>{SET_PROTOCOLS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{PROTOCOL_DESCRIPTION[value[group.id]]}</p>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">Individens antal arbetsset behålls. Deload, toppning, singlar, tyngdlyftning och 1,5-reps behåller sina särskilda upplägg. Vid repsminskning behålls arbete över cirka 85 % oförändrat.</p>
  </section>;
}