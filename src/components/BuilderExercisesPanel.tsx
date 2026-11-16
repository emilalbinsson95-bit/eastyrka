import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BUILDER_DEFAULT_STEP_KG, BUILDER_LIFT_LABEL, BUILDER_LIFTS, BUILDER_MAX_SETS, BUILDER_MIN_SETS, DEFAULT_BUILDER,
  type BuilderChoice, type BuilderChoices, type BuilderLift,
} from "@/lib/builderExercises";

const selectCls = "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Coach choice: one build exercise per main lift, saved with the other generator choices. */
export function BuilderExercisesPanel({ value, onChange }: { coachId: string; value: BuilderChoices; onChange: (v: BuilderChoices) => void }) {
  const catalog = useQuery({
    queryKey: ["builder-exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("name, builder_lift, builder_step_kg").not("builder_lift", "is", null).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ name: string; builder_lift: BuilderLift; builder_step_kg: number | null }>;
    },
  });
  const set = (lift: BuilderLift, patch: Partial<BuilderChoice> | null) => {
    if (patch === null) return onChange({ ...value, [lift]: null });
    const cur = value[lift];
    if (!cur && !patch.exercise) return;
    onChange({ ...value, [lift]: { ...DEFAULT_BUILDER, stepKg: BUILDER_DEFAULT_STEP_KG, exercise: "", ...cur, ...patch } as BuilderChoice });
  };
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">Byggövning</div>
      <div className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          En icke-teknisk övning per lyft som körs hårt med dubbel progression. Läggs efter lyftets huvud- och variantrader, bara i arbetsveckor.
          Räknas inte i lyftets set, mängd eller EAk.
        </p>
        {catalog.isError && <p role="alert" className="text-xs text-destructive">Kunde inte hämta byggövningar.</p>}
        {BUILDER_LIFTS.map((lift) => {
          const c = value[lift];
          const options = (catalog.data ?? []).filter((e) => e.builder_lift === lift);
          return (
            <div key={lift} className="space-y-2 rounded-md border border-border p-2">
              <label className="block text-xs font-medium">
                {BUILDER_LIFT_LABEL[lift]}
                <select
                  className={`${selectCls} mt-1`}
                  value={c?.exercise ?? ""}
                  aria-label={`Byggövning för ${BUILDER_LIFT_LABEL[lift]}`}
                  onChange={(ev) => {
                    const name = ev.target.value;
                    if (!name) return set(lift, null);
                    const row = options.find((o) => o.name === name);
                    set(lift, { exercise: name, stepKg: row?.builder_step_kg ? Number(row.builder_step_kg) : BUILDER_DEFAULT_STEP_KG });
                  }}
                >
                  <option value="">Ingen byggövning</option>
                  {c?.exercise && !options.some((o) => o.name === c.exercise) && <option value={c.exercise}>{c.exercise}</option>}
                  {options.map((o) => <option key={o.name} value={o.name}>{o.name} (viktsteg {String(Number(o.builder_step_kg ?? BUILDER_DEFAULT_STEP_KG)).replace(".", ",")} kg)</option>)}
                </select>
              </label>
              {c && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[11px] text-muted-foreground">Gånger per vecka
                    <select className={selectCls} value={c.perWeek} onChange={(ev) => set(lift, { perWeek: Number(ev.target.value) as 1 | 2 })}>
                      <option value={1}>1</option><option value={2}>2</option>
                    </select>
                  </label>
                  <label className="text-[11px] text-muted-foreground">Set
                    <select className={selectCls} value={c.sets} onChange={(ev) => set(lift, { sets: Number(ev.target.value) })}>
                      {Array.from({ length: BUILDER_MAX_SETS - BUILDER_MIN_SETS + 1 }, (_, i) => BUILDER_MIN_SETS + i).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-muted-foreground">Repintervall
                    <select className={selectCls} value={`${c.repMin}-${c.repMax}`} onChange={(ev) => { const [a, b] = ev.target.value.split("-").map(Number); set(lift, { repMin: a, repMax: b }); }}>
                      {[[5, 8], [6, 10], [8, 12], [10, 15], [12, 20]].map(([a, b]) => <option key={a} value={`${a}-${b}`}>{a}–{b}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-muted-foreground">Läge
                    <select className={selectCls} value={c.mode} onChange={(ev) => set(lift, { mode: ev.target.value as "add" | "replace" })}>
                      <option value="add">Lägg till</option>
                      <option value="replace">Ersätt set</option>
                    </select>
                  </label>
                  {c.mode === "replace" && <p className="col-span-full text-[11px] text-muted-foreground">Tar lika många set från lyftets lättaste huvud- eller variantrad samma vecka. Mätset, push-set, tunga singlar och mallens golv rörs aldrig; går det inte läggs övningen till och du får en varning.</p>}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">Märk fler övningar som byggövning under Övningar.</p>
      </div>
    </div>
  );
}
