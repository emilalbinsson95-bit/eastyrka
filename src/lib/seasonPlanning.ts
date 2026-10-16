import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { z } from "zod";
import { getTemplate } from "@/lib/strengthTemplates";
import { DEFAULT_TUNING } from "@/lib/individualisation";
import { DEFAULT_SET_PROTOCOLS } from "@/lib/setProtocols";

export const generatorSettingsSchema = z.object({
  tuning: z.object({ volume: z.number().min(.7).max(1.3), intensity: z.number().min(-1.5).max(1.5), accessory: z.number().min(.5).max(1.5), mainLifts: z.number().min(.7).max(1.3) }).default(DEFAULT_TUNING),
  overload: z.object({ overWarmSingles: z.boolean(), waveLoading: z.boolean(), benchConsolidation: z.boolean(), deadliftStance: z.enum(["keep", "conventional", "sumo"]) }).optional(),
  setProtocols: z.object({ squat: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), bench: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), deadlift: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), accessories: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]) }).default(DEFAULT_SET_PROTOCOLS),
  volumeDeltas: z.object({ squat: z.number().int().min(-6).max(6), bench: z.number().int().min(-6).max(6), deadlift: z.number().int().min(-6).max(6) }).default({ squat: 0, bench: 0, deadlift: 0 }),
});
export type GeneratorSettings = z.infer<typeof generatorSettingsSchema>;
export const seasonBlockSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(100),
  focus: z.enum(["volume", "strength", "competition"]),
  templateId: z.string().refine((id) => Boolean(getTemplate(id)), "Välj en befintlig mall"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysPerWeek: z.number().int().min(2).max(6),
  notes: z.string().max(2000).default(""),
  mesocycleId: z.string().uuid().optional(),
});
export type SeasonBlock = z.infer<typeof seasonBlockSchema>;
export const seasonBlocksSchema = z.array(seasonBlockSchema).min(1).max(20);
export const FOCUS_LABELS = { volume: "Volymfokus", strength: "Styrkefokus", competition: "Tävlingsförberedelse" };
export function blockEnd(block: SeasonBlock): string {
  return format(addDays(parseISO(block.startDate), (getTemplate(block.templateId)?.weeks ?? 4) * 7 - 1), "yyyy-MM-dd");
}
export function scheduleBlocks(blocks: SeasonBlock[], startDate: string): SeasonBlock[] {
  let next = parseISO(startDate);
  return blocks.map((block) => {
    const out = { ...block, startDate: format(next, "yyyy-MM-dd") };
    next = addDays(next, (getTemplate(block.templateId)?.weeks ?? 4) * 7);
    return out;
  });
}
export function validateSeason(blocks: SeasonBlock[], competitionDate: string): string | null {
  const parsed = seasonBlocksSchema.safeParse(blocks);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Kontrollera blocken";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const template = getTemplate(b.templateId);
    if (!template || b.daysPerWeek < template.minDays || b.daysPerWeek > template.maxDays) return `${b.name}: kontrollera antal träningsdagar.`;
    if (i > 0 && differenceInCalendarDays(parseISO(b.startDate), parseISO(blockEnd(blocks[i - 1]))) !== 1) return "Blocken ska följa varandra utan överlapp eller luckor.";
    if (competitionDate && blockEnd(b) >= competitionDate) return "Sista träningsdagen måste ligga före tävlingsdatumet.";
  }
  return null;
}
export function defaultSeason(startDate: string): SeasonBlock[] {
  return scheduleBlocks([
    { id: "volume", name: "Volymblock", focus: "volume", templateId: "standard-pl", startDate, daysPerWeek: 4, notes: "" },
    { id: "strength", name: "Styrkeblock", focus: "strength", templateId: "standard-pl", startDate, daysPerWeek: 4, notes: "" },
    { id: "competition", name: "Toppning", focus: "competition", templateId: "peak-3w", startDate, daysPerWeek: 3, notes: "" },
  ], startDate);
}