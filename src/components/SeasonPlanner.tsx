import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
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
import { blockEnd, blockWeeks, defaultSeason, FOCUS_LABELS, rescheduleFuture, seasonBlocksSchema, validateSeason, type SeasonBlock } from "@/lib/seasonPlanning";
import { peakStartDate } from "@/lib/peakingDates";

export function SeasonPlanner({ athleteId, coachId, athleteName }: { athleteId: string; coachId: string; athleteName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editVersion, setEditVersion] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("Säsongsplan");
  const [competitionDate, setCompetitionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [blocks, setBlocks] = useState<SeasonBlock[]>([]);
  const [generating, setGenerating] = useState<{ planId: string; block: SeasonBlock; competitionDate: string } | null>(null);
  const plans = useQuery({
    queryKey: ["season-plans", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("athlete_season_plans").select("*").eq("athlete_id", athleteId).order("updated_at", { ascending: false });
      if (error) throw error;
      const cycles = await supabase.from("mesocycles").select("id, start_date, total_weeks, days_per_week, status").eq("athlete_id", athleteId);
      if (cycles.error) throw cycles.error;
      return (data ?? []).map((p) => {
        const parsed = seasonBlocksSchema.safeParse(p.blocks);
        const normalized = parsed.success ? parsed.data.map((b) => {
          const cycle = cycles.data?.find((c) => c.id === b.mesocycleId);
          return cycle ? { ...b, startDate: cycle.start_date, daysPerWeek: cycle.days_per_week, ...(b.templateId === "peak-3w" ? { peakWeeks: Math.max(2, Math.min(6, cycle.total_weeks)) } : {}), ...(b.templateId === "manual" ? { manualWeeks: Math.max(1, Math.min(24, cycle.total_weeks)) } : {}) } : { ...b, mesocycleId: undefined };
        }) : p.blocks;
        return { ...p, parsedBlocks: seasonBlocksSchema.safeParse(normalized) };
      });
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const errorMessage = validateSeason(blocks, competitionDate);
      if (errorMessage) throw new Error(errorMessage);
      if (!name.trim() || name.trim().length > 100) throw new Error("Ange ett namn på högst 100 tecken.");
      const row = { name: name.trim(), competition_date: competitionDate || null, notes, blocks: blocks as unknown as Json, updated_at: new Date().toISOString() };
      const result = editId
        ? await supabase.from("athlete_season_plans").update(row).eq("id", editId).eq("athlete_id", athleteId).eq("updated_at", editVersion ?? "").select("id").single()
        : await supabase.from("athlete_season_plans").insert({ ...row, athlete_id: athleteId, coach_id: coachId }).select("id").single();
      if (result.error) throw new Error("Kunde inte spara. Planen kan ha ändrats — öppna den igen och försök på nytt.");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["season-plans", athleteId] }); setOpen(false); toast.success("Säsongsplanen är sparad"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("athlete_season_plans").delete().eq("id", id).eq("athlete_id", athleteId); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["season-plans", athleteId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const updateBlock = (id: string, patch: Partial<SeasonBlock>) => setBlocks((prev) => rescheduleFuture(prev, id, patch));
  const competitions = useQuery({ queryKey: ["season-competitions", athleteId], queryFn: async () => {
    const { data, error } = await supabase.from("competitions").select("id, name, comp_date").eq("athlete_id", athleteId).order("comp_date");
    if (error) throw error;
    return data ?? [];
  } });
  const attach = async (mesoId: string) => {
    if (!generating) return;
    // Read back to avoid replacing edits made while the generator was open.
    const { data, error } = await supabase.from("athlete_season_plans").select("blocks, updated_at").eq("id", generating.planId).single();
    if (error) { toast.error("Utkastet skapades, men kunde inte kopplas till säsongsplanen."); return; }
    const parsed = seasonBlocksSchema.safeParse(data.blocks);
    if (!parsed.success) { toast.error("Utkastet skapades. Kontrollera säsongsplanens block."); return; }
    if (!parsed.data.some((b) => b.id === generating.block.id && !b.mesocycleId && b.startDate === generating.block.startDate && b.templateId === generating.block.templateId && b.daysPerWeek === generating.block.daysPerWeek && b.peakWeeks === generating.block.peakWeeks && b.manualWeeks === generating.block.manualWeeks)) {
      toast.error("Utkastet skapades, men blocket ändrades under tiden. Det finns bland atletens träningsblock."); setGenerating(null); return;
    }
    const next = parsed.data.map((b) => b.id === generating.block.id ? { ...b, mesocycleId: mesoId } : b);
    const result = await supabase.from("athlete_season_plans").update({ blocks: next as unknown as Json, updated_at: new Date().toISOString() }).eq("id", generating.planId).eq("updated_at", data.updated_at).select("id").single();
    if (result.error) toast.error("Utkastet skapades, men kunde inte kopplas till säsongsplanen.");
    qc.invalidateQueries({ queryKey: ["season-plans", athleteId] });
    setGenerating(null);
  };
  // Own blocks: create an empty draft block the coach fills in himself, no generated prescriptions.
  const createManual = useMutation({
    mutationFn: async ({ planId, block }: { planId: string; block: SeasonBlock }) => {
      const weeks = blockWeeks(block);
      const { data, error } = await supabase.from("mesocycles").insert({
        coach_id: coachId, athlete_id: athleteId, name: block.name, goal: FOCUS_LABELS[block.focus],
        start_date: block.startDate, total_weeks: weeks, days_per_week: block.daysPerWeek, notes: block.notes || null,
      }).select("id").single();
      if (error) throw new Error("Kunde inte skapa blocket.");
      const weekRows = Array.from({ length: weeks }, (_, i) => ({
        coach_id: coachId, athlete_id: athleteId, mesocycle_id: data.id, week_index: i + 1,
        week_start_date: format(addDays(parseISO(block.startDate), i * 7), "yyyy-MM-dd"), status: "draft" as const,
      }));
      const weekResult = await supabase.from("week_plans").insert(weekRows);
      if (weekResult.error) throw new Error("Blocket skapades, men veckorna kunde inte läggas till.");
      return { planId, blockId: block.id, mesoId: data.id };
    },
    onSuccess: async ({ planId, blockId, mesoId }) => {
      const { data, error } = await supabase.from("athlete_season_plans").select("blocks, updated_at").eq("id", planId).single();
      const parsed = data ? seasonBlocksSchema.safeParse(data.blocks) : null;
      if (error || !parsed?.success) { toast.error("Blocket skapades, men kunde inte kopplas till säsongsplanen."); }
      else {
        const next = parsed.data.map((b) => b.id === blockId ? { ...b, mesocycleId: mesoId } : b);
        const result = await supabase.from("athlete_season_plans").update({ blocks: next as unknown as Json, updated_at: new Date().toISOString() }).eq("id", planId).eq("updated_at", data!.updated_at).select("id").single();
        if (result.error) toast.error("Blocket skapades, men kunde inte kopplas till säsongsplanen.");
        else toast.success("Blocket är skapat. Skriv passen i programmet.");
      }
      qc.invalidateQueries({ queryKey: ["season-plans", athleteId] });
      qc.invalidateQueries({ queryKey: ["mesocycles", athleteId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Säsongsplanering">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Säsongsplanering</h2>
      <Button variant="outline" onClick={() => { setEditId(null); setEditVersion(null); setName("Säsongsplan"); setNotes(""); const start = format(new Date(), "yyyy-MM-dd"); setBlocks(defaultSeason(start)); setCompetitionDate(format(addDays(new Date(), 77), "yyyy-MM-dd")); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Ny säsongsplan</Button>
    </div>
    {plans.isLoading && <p className="text-sm text-muted-foreground">Hämtar säsongsplaner…</p>}
    {plans.isError && <p className="text-sm text-destructive">Kunde inte hämta säsongsplanerna. <Button variant="link" onClick={() => plans.refetch()}>Försök igen</Button></p>}
    {plans.data?.length === 0 && <p className="text-sm text-muted-foreground">Ingen säsongsplan sparad.</p>}
    {plans.data?.map((p) => <div key={p.id} className="space-y-2 border-b border-border pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">{p.name}</h3>{p.competition_date && <p className="text-xs text-muted-foreground">Tävling {p.competition_date}</p>}</div>
        <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Redigera ${p.name}`} title="Redigera" disabled={!p.parsedBlocks.success} onClick={() => { if (!p.parsedBlocks.success) return; setEditId(p.id); setEditVersion(p.updated_at); setName(p.name); setCompetitionDate(p.competition_date ?? ""); setNotes(p.notes ?? ""); setBlocks(p.parsedBlocks.data); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={`Ta bort ${p.name}`} title="Ta bort säsongsplan" disabled={remove.isPending} onClick={() => { if (confirm("Ta bort säsongsplanen? Skapade träningsprogram behålls.")) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button></div>
      </div>
      {p.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}
      {!p.parsedBlocks.success && <p className="text-sm text-destructive">Blocken kunde inte läsas.</p>}
      {p.parsedBlocks.success && p.parsedBlocks.data.map((b) => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary pl-3 py-2">
        <div className="min-w-0"><p className="font-medium break-words">{b.name} <span className="text-xs font-normal text-muted-foreground">· {FOCUS_LABELS[b.focus]}</span></p><p className="text-xs text-muted-foreground">{b.startDate} – {blockEnd(b)} · {b.templateId === "manual" ? `Eget upplägg, ${blockWeeks(b)} veckor` : getTemplate(b.templateId)?.name} · {b.daysPerWeek} dagar/vecka</p>{b.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{b.notes}</p>}</div>
        {b.mesocycleId ? <Button asChild variant="outline" size="sm"><Link to="/coach/athletes/$athleteId/cycles/$cycleId" params={{ athleteId, cycleId: b.mesocycleId }}>Öppna program<ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          : b.templateId === "manual" ? <Button variant="outline" size="sm" disabled={createManual.isPending} onClick={() => createManual.mutate({ planId: p.id, block: b })}>{createManual.isPending ? "Skapar…" : "Skapa tomt block"}</Button>
          : <Button variant="outline" size="sm" onClick={() => setGenerating({ planId: p.id, block: b, competitionDate: p.competition_date ?? "" })}>Förbered block</Button>}
      </div>)}
    </div>)}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{editId ? "Redigera säsongsplan" : "Ny säsongsplan"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="season-name">Namn</Label><Input id="season-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label htmlFor="season-meet">Tävlingsdatum</Label><Input id="season-meet" type="date" value={competitionDate} onChange={(e) => setCompetitionDate(e.target.value)} /></div></div>
      <div><Label htmlFor="season-start">Första blockets startdatum</Label><Input id="season-start" type="date" value={blocks[0]?.startDate ?? ""} disabled={Boolean(blocks[0]?.mesocycleId)} onChange={(e) => { if (e.target.value && blocks[0]) updateBlock(blocks[0].id, { startDate: e.target.value }); }} /></div>
      {competitions.data && competitions.data.length > 0 && <div><Label>Tävling i kalendern</Label><Select value={competitions.data.find((c) => c.comp_date === competitionDate)?.id ?? "manual"} onValueChange={(v) => { const c = competitions.data?.find((c) => c.id === v); if (c) setCompetitionDate(c.comp_date); }}><SelectTrigger aria-label="Tävling i kalendern"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Eget datum</SelectItem>{competitions.data.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.comp_date}</SelectItem>)}</SelectContent></Select></div>}
      <div className="space-y-4">{blocks.map((b, i) => <div key={b.id}><fieldset disabled={Boolean(b.mesocycleId)} className="space-y-2 border-b border-border pb-4"><legend className="text-sm font-medium">Block {i + 1} · {b.startDate} – {blockEnd(b)}{b.mesocycleId ? " · Utkast skapat" : ""}</legend>
        <div className="grid gap-2 sm:grid-cols-2"><div><Label htmlFor={`block-name-${b.id}`}>Blocknamn</Label><Input id={`block-name-${b.id}`} value={b.name} onChange={(e) => updateBlock(b.id, { name: e.target.value })} /></div><div><Label>Fokus</Label><Select disabled={Boolean(b.mesocycleId)} value={b.focus} onValueChange={(v) => updateBlock(b.id, { focus: v as SeasonBlock["focus"] })}><SelectTrigger aria-label={`Fokus block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FOCUS_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Upplägg</Label><Select disabled={Boolean(b.mesocycleId)} value={b.templateId} onValueChange={(v) => { if (v === "manual") { updateBlock(b.id, { templateId: v, manualWeeks: b.manualWeeks ?? 4 }); return; } const t = getTemplate(v); if (t) updateBlock(b.id, { templateId: v, daysPerWeek: t.daysPerWeek }); }}><SelectTrigger aria-label={`Upplägg block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Eget upplägg — jag skriver passen själv</SelectItem>{STRENGTH_TEMPLATES.filter((t) => !t.sessionSetBudget && t.id !== "runner-strength" && t.id !== "athletic-power").map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Träningsdagar/vecka</Label><Select disabled={Boolean(b.mesocycleId)} value={String(b.daysPerWeek)} onValueChange={(v) => updateBlock(b.id, { daysPerWeek: Number(v) })}><SelectTrigger aria-label={`Träningsdagar block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{(b.templateId === "manual" ? [2,3,4,5,6] : Array.from({ length: (getTemplate(b.templateId)?.maxDays ?? 6) - (getTemplate(b.templateId)?.minDays ?? 3) + 1 }, (_, n) => n + (getTemplate(b.templateId)?.minDays ?? 3))).map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="grid gap-2 sm:grid-cols-2"><div><Label htmlFor={`block-date-${b.id}`}>Startdatum</Label><Input id={`block-date-${b.id}`} type="date" value={b.startDate} onChange={(e) => { if (e.target.value) updateBlock(b.id, { startDate: e.target.value }); }} /></div>{b.templateId === "peak-3w" && <div><Label>Toppning, veckor</Label><Select disabled={Boolean(b.mesocycleId)} value={String(b.peakWeeks ?? 3)} onValueChange={(v) => updateBlock(b.id, { peakWeeks: Number(v) })}><SelectTrigger aria-label={`Toppningslängd block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{[2,3,4,5,6].map((n) => <SelectItem key={n} value={String(n)}>{n} veckor</SelectItem>)}</SelectContent></Select></div>}{b.templateId === "manual" && <div><Label>Antal veckor</Label><Select disabled={Boolean(b.mesocycleId)} value={String(b.manualWeeks ?? 4)} onValueChange={(v) => updateBlock(b.id, { manualWeeks: Number(v) })}><SelectTrigger aria-label={`Antal veckor block ${i + 1}`}><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, n) => n + 1).map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "vecka" : "veckor"}</SelectItem>)}</SelectContent></Select></div>}</div>
        {b.templateId === "manual" && !b.mesocycleId && <p className="text-xs text-muted-foreground">Blocket skapas tomt med veckor och dagar. Du lägger själv in övningar, set och vikter i programmet.</p>}
        {b.templateId === "peak-3w" && competitionDate && !b.mesocycleId && <Button variant="outline" size="sm" onClick={() => { const startDate = peakStartDate(competitionDate, blockWeeks(b)); if (startDate) updateBlock(b.id, { startDate }); }}>Lägg toppningen före tävlingen</Button>}
        <Textarea aria-label={`Anteckningar block ${i + 1}`} maxLength={2000} placeholder="Coachanteckningar" value={b.notes} onChange={(e) => updateBlock(b.id, { notes: e.target.value })} />
        <Button variant="ghost" size="sm" disabled={blocks.length <= 1} onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}><Trash2 className="mr-1 h-4 w-4" />Ta bort block</Button>
      </fieldset>{b.mesocycleId && <Button variant="outline" size="sm" onClick={() => {
          if (confirm("Frikoppla blocket för ny planering? Det befintliga programmet och publicerade pass behålls. Arkivera det gamla programmet innan du publicerar en ersättning.")) setBlocks((prev) => prev.map((x) => x.id === b.id ? { ...x, mesocycleId: undefined } : x));
        }}>Frikoppla för omplanering</Button>}</div>)}</div>
      <Button variant="outline" disabled={blocks.length >= 20} onClick={() => setBlocks([...blocks, { id: crypto.randomUUID(), name: "Nytt block", focus: "strength", templateId: "standard-pl", daysPerWeek: 4, startDate: format(addDays(parseISO(blockEnd(blocks[blocks.length - 1])), 1), "yyyy-MM-dd"), notes: "" }])}><Plus className="mr-1 h-4 w-4" />Lägg till block</Button>
      <div><Label htmlFor="season-notes">Säsongsanteckningar</Label><Textarea id="season-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {validateSeason(blocks, competitionDate) && <p className="text-sm text-destructive">{validateSeason(blocks, competitionDate)}</p>}
      <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Avbryt</Button><Button disabled={save.isPending || Boolean(validateSeason(blocks, competitionDate))} onClick={() => save.mutate()}><Save className="mr-1 h-4 w-4" />{save.isPending ? "Sparar…" : "Spara säsongsplan"}</Button></DialogFooter>
    </DialogContent></Dialog>
    {generating && <GenerateStrengthTemplateDialog key={`${generating.planId}-${generating.block.id}`} athleteId={athleteId} coachId={coachId} athleteName={athleteName} defaultCompetitionDate={generating.competitionDate} defaultTemplateId={generating.block.templateId} defaultStartDate={generating.block.startDate} defaultDaysPerWeek={generating.block.daysPerWeek} defaultPeakWeeks={generating.block.peakWeeks} blockName={generating.block.name} blockNotes={generating.block.notes} blockFocus={generating.block.focus} open hideTrigger onOpenChange={(v) => { if (!v) setGenerating(null); }} onCreated={attach} />}
  </section>;
}