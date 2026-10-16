import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { Plus, Save, Trash2, Pencil, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GenerateStrengthTemplateDialog } from "@/components/GenerateStrengthTemplateDialog";
import { STRENGTH_TEMPLATES, getTemplate } from "@/lib/strengthTemplates";
import { blockEnd, defaultSeason, FOCUS_LABELS, scheduleBlocks, seasonBlocksSchema, validateSeason, type SeasonBlock } from "@/lib/seasonPlanning";

export function SeasonPlanner({ athleteId, coachId, athleteName }: { athleteId: string; coachId: string; athleteName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("Säsongsplan");
  const [competitionDate, setCompetitionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState<SeasonBlock[]>([]);
  const [generating, setGenerating] = useState<{ planId: string; block: SeasonBlock } | null>(null);
  const plans = useQuery({
    queryKey: ["season-plans", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_season_plans").select("*").eq("athlete_id", athleteId).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, parsedBlocks: seasonBlocksSchema.safeParse(p.blocks) }));
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const errorMessage = validateSeason(blocks, competitionDate);
      if (errorMessage) throw new Error(errorMessage);
      if (!name.trim() || name.trim().length > 100) throw new Error("Ange ett namn på högst 100 tecken.");
      const row = { name: name.trim(), competition_date: competitionDate || null, notes, blocks: blocks as unknown as Json, updated_at: new Date().toISOString() };
      const result = editId
        ? await supabase.from("athlete_season_plans").update(row).eq("id", editId).eq("athlete_id", athleteId).select("id").single()
        : await supabase.from("athlete_season_plans").insert({ ...row, athlete_id: athleteId, coach_id: coachId }).select("id").single();
      if (result.error) throw result.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["season-plans", athleteId] }); setOpen(false); toast.success("Säsongsplanen är sparad"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("athlete_season_plans").delete().eq("id", id).eq("athlete_id", athleteId); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["season-plans", athleteId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const updateBlock = (id: string, patch: Partial<SeasonBlock>) => setBlocks((prev) => {
    const next = prev.map((b) => b.id === id ? { ...b, ...patch } : b);
    return scheduleBlocks(next, next[0]?.startDate ?? format(new Date(), "yyyy-MM-dd"));
  });
  const attach = async (mesoId: string) => {
    if (!generating) return;
    // Read back to avoid replacing edits made while the generator was open.
    const { data, error } = await supabase.from("athlete_season_plans").select("blocks").eq("id", generating.planId).single();
    if (error) { toast.error("Utkastet skapades, men kunde inte kopplas till säsongsplanen."); return; }
    const parsed = seasonBlocksSchema.safeParse(data.blocks);
    if (!parsed.success) { toast.error("Utkastet skapades. Kontrollera säsongsplanens block."); return; }
    const next = parsed.data.map((b) => b.id === generating.block.id ? { ...b, mesocycleId: mesoId } : b);
    const result = await supabase.from("athlete_season_plans").update({ blocks: next as unknown as Json, updated_at: new Date().toISOString() }).eq("id", generating.planId).select("id").single();
    if (result.error) toast.error("Utkastet skapades, men kunde inte kopplas till säsongsplanen.");
    qc.invalidateQueries({ queryKey: ["season-plans", athleteId] });
    setGenerating(null);
  };
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Säsongsplanering">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Säsongsplanering</h2>
      <Button variant="outline" onClick={() => { setEditId(null); setName("Säsongsplan"); setNotes(""); const start = format(new Date(), "yyyy-MM-dd"); setBlocks(defaultSeason(start)); setCompetitionDate(format(addDays(new Date(), 77), "yyyy-MM-dd")); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Ny säsongsplan</Button>
    </div>
    {plans.isLoading && <p className="text-sm text-muted-foreground">Hämtar säsongsplaner…</p>}
    {plans.isError && <p className="text-sm text-destructive">Kunde inte hämta säsongsplanerna. <Button variant="link" onClick={() => plans.refetch()}>Försök igen</Button></p>}
    {plans.data?.length === 0 && <p className="text-sm text-muted-foreground">Ingen säsongsplan sparad.</p>}
    {plans.data?.map((p) => <div key={p.id} className="space-y-2 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">{p.name}</h3>{p.competition_date && <p className="text-xs text-muted-foreground">Tävling {p.competition_date}</p>}</div>
        <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Redigera ${p.name}`} title="Redigera" disabled={!p.parsedBlocks.success} onClick={() => { if (!p.parsedBlocks.success) return; setEditId(p.id); setName(p.name); setCompetitionDate(p.competition_date ?? ""); setNotes(p.notes ?? ""); setBlocks(p.parsedBlocks.data); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Ta bort ${p.name}`} title="Ta bort säsongsplan" disabled={remove.isPending} onClick={() => { if (confirm("Ta bort säsongsplanen? Skapade träningsprogram behålls.")) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button></div>
      </div>
      {p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}
      {!p.parsedBlocks.success && <p className="text-sm text-destructive">Blocken kunde inte läsas.</p>}
      {p.parsedBlocks.success && p.parsedBlocks.data.map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary pl-3 py-2">
        <div className="min-w-0"><p className="font-medium break-words">{b.name} <span className="text-xs font-normal text-muted-foreground">· {FOCUS_LABELS[b.focus]}</span></p><p className="text-xs text-muted-foreground">{b.startDate} – {blockEnd(b)} · {getTemplate(b.templateId)?.name} · {b.daysPerWeek} dagar/vecka</p>{b.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{b.notes}</p>}</div>
        {b.mesocycleId ? <Button asChild variant="outline" size="sm"><Link to="/coach/athletes/$athleteId/cycles/$cycleId" params={{ athleteId, cycleId: b.mesocycleId }}>Öppna utkast<ArrowRight className="ml-1 h-4 w-4" /></Link></Button> : <Button variant="outline" size="sm" onClick={() => setGenerating({ planId: p.id, block: b })}>Förbered block</Button>}
      </div>)}
    </div>)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editId ? "Redigera säsongsplan" : "Ny säsongsplan"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="season-name">Namn</Label><Input id="season-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label htmlFor="season-meet">Tävlingsdatum</Label><Input id="season-meet" type="date" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} /></div></div>
      <div><Label htmlFor="season-start">Första blockets startdatum</Label><Input id="season-start" type="date" value={blocks[0]?.startDate ?? ""} disabled={blocks.some((b) => b.mesocycleId)} onChange={(e) => { if (e.target.value) setBlocks(scheduleBlocks(blocks, e.target.value)); }} /></div>
      <div className="space-y-4">{blocks.map((b, i) => <fieldset key={b.id} disabled={Boolean(b.mesocycleId)} className="space-y-2 border-b border-border pb-4"><legend className="text-sm font-medium">Block {i + 1} · {b.startDate} – {blockEnd(b)}{b.mesocycleId ? " · Utkast skapat" : ""}</legend>
        <div className="grid gap-2 sm:grid-cols-2"><div><Label htmlFor={`block-name-${b.id}`}>Blocknamn</Label><Input id={`block-name-${b.id}`} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} /></div><div><Label>Fokus</Label><Select value={b.focus} onValueChange={(v) => updateBlock(b.id, { focus: v as SeasonBlock["focus"] })}><SelectTrigger aria-label={`Fokus block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FOCUS_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Mall</Label><Select disabled={blocks.some((x) => x.mesocycleId)} value={b.templateId} onValueChange={(v) => { const t = getTemplate(v); if (t) updateBlock(b.id, { templateId: v, daysPerWeek: t.daysPerWeek }); }}><SelectTrigger aria-label={`Mall block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{STRENGTH_TEMPLATES.filter((t) => !t.sessionSetBudget && t.id !== "runner-strength" && t.id !== "athletic-power").map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Träningsdagar/vecka</Label><Select value={String(b.daysPerWeek)} onValueChange={(v) => updateBlock(b.id, { daysPerWeek: Number(v) })}><SelectTrigger aria-label={`Träningsdagar block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: (getTemplate(b.templateId)?.maxDays ?? 6) - (getTemplate(b.templateId)?.minDays ?? 3) + 1 }, (_, n) => n + (getTemplate(b.templateId)?.minDays ?? 3)).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div></div>
        <Textarea aria-label={`Anteckningar block ${i + 1}`} maxLength={2000} placeholder="Coachanteckningar" value={b.notes} onChange={(e) => updateBlock(b.id, { notes: e.target.value })} />
        <Button variant="ghost" size="sm" disabled={blocks.length <= 1 || blocks.some((x) => x.mesocycleId)} onClick={() => setBlocks(scheduleBlocks(blocks.filter((x) => x.id !== b.id), blocks[0].startDate))}><Trash2 className="mr-1 h-4 w-4" />Ta bort block</Button>
      </fieldset>)}</div>
      <Button variant="outline" disabled={blocks.length >= 20 || blocks.some((b) => b.mesocycleId)} onClick={() => setBlocks(scheduleBlocks([...blocks, { id: crypto.randomUUID(), name: "Nytt block", focus: "strength", templateId: "standard-pl", daysPerWeek: 4, startDate: blocks[0]?.startDate ?? "", notes: "" }], blocks[0].startDate))}><Plus className="mr-1 h-4 w-4" />Lägg till block</Button>
      <div><Label htmlFor="season-notes">Säsongsanteckningar</Label><Textarea id="season-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {validateSeason(blocks, competitionDate) && <p className="text-sm text-destructive">{validateSeason(blocks, competitionDate)}</p>}
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button disabled={save.isPending || Boolean(validateSeason(blocks, competitionDate))} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />{save.isPending ? "Sparar…" : "Spara säsongsplan"}</Button></DialogFooter>
    </DialogContent></Dialog>
    {generating && <GenerateStrengthTemplateDialog key={`${generating.planId}-${generating.block.id}`} athleteId={athleteId} coachId={coachId} athleteName={athleteName} defaultTemplateId={generating.block.templateId} defaultStartDate={generating.block.startDate} defaultDaysPerWeek={generating.block.daysPerWeek} blockName={generating.block.name} blockNotes={generating.block.notes} blockFocus={generating.block.focus} open hideTrigger onOpenChange={(v) => { if (!v) setGenerating(null); }} onCreated={attach} />}
  </section>;
}