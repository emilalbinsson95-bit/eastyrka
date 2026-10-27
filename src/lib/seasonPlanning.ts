import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { z } from "zod";
import { getTemplate } from "@/lib/strengthTemplates";
import { DEFAULT_TUNING } from "@/lib/individualisation";
import { DEFAULT_SET_PROTOCOLS } from "@/lib/setProtocols";
import { peakPeriodDays } from "@/lib/peakingDates";

export const generatorSettingsSchema = z.object({
  extraSets: z.object({ squat:z.boolean(), bench:z.boolean(), deadlift:z.boolean() }).default({squat:false,bench:false,deadlift:false}),
  roundingKg: z.union([z.literal(2.5),z.literal(1.25),z.literal(1)]).default(2.5),
  tuning: z.object({ volume: z.number().min(.7).max(1.3), intensity: z.number().min(-1.5).max(1.5), accessory: z.number().min(.5).max(1.5), mainLifts: z.number().min(.7).max(1.3) }).default(DEFAULT_TUNING),
  overload: z.object({ overWarmSingles: z.boolean(), waveLoading: z.boolean(), benchConsolidation: z.boolean(), deadliftStance: z.enum(["keep", "conventional", "sumo"]) }).optional(),
  setProtocols: z.object({ squat: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), bench: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), deadlift: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]), accessories: z.enum(["keep", "straight", "rep-drops", "ramping", "descending", "metabolic", "double"]) }).default(DEFAULT_SET_PROTOCOLS),
  volumeDeltas: z.object({ squat: z.number().int().min(-6).max(6), bench: z.number().int().min(-6).max(6), deadlift: z.number().int().min(-6).max(6) }).default({ squat: 0, bench: 0, deadlift: 0 }),
  heavySingles: z.object({ enabled: z.boolean(), rpe: z.number().min(8).max(9.5).multipleOf(.5), weeks: z.array(z.number().int().min(1).max(4)) }).default({ enabled: false, rpe: 8, weeks: [2, 3] }),
  peak: z.object({ singles: z.enum(["unset", "yes", "no"]), rpe: z.number().min(7).max(9).multipleOf(.5), weeks: z.array(z.number().int().min(1).max(5)), openers: z.object({ squat: z.number().positive().optional(), bench: z.number().positive().optional(), deadlift: z.number().positive().optional() }) }).default({ singles: "unset", rpe: 8, weeks: [1, 2, 3], openers: {} }),
});
export type GeneratorSettings = z.infer<typeof generatorSettingsSchema>;
export const seasonBlockSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(100),
  focus: z.enum(["volume", "strength", "competition"]),
  templateId: z.string().refine((id) => id === "manual" || Boolean(getTemplate(id)), "Välj eget upplägg eller en befintlig mall"),
  manualWeeks: z.number().int().min(1).max(24).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysPerWeek: z.number().int().min(2).max(6),
  notes: z.string().max(2000).default(""),
  mesocycleId: z.string().uuid().optional(),
  endDate: z.string().optional(),
  peakWeeks: z.number().int().min(2).max(6).optional(),
});
export type SeasonBlock = z.infer<typeof seasonBlockSchema>;
export const seasonBlocksSchema = z.array(seasonBlockSchema).min(1).max(20);
export const FOCUS_LABELS = { volume: "Volymfokus", strength: "Styrkefokus", competition: "Tävlingsförberedelse" };
export function blockWeeks(block: SeasonBlock): number {
  if (block.templateId === "manual") return block.manualWeeks ?? 4;
  if (block.templateId === "peak-3w" && block.endDate) return Math.ceil(peakPeriodDays(block.startDate, block.endDate) / 7);
  return block.templateId === "peak-3w" ? block.peakWeeks ?? 3 : getTemplate(block.templateId)?.weeks ?? 4;
}
export function validSeasonDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime()) && format(parseISO(value), "yyyy-MM-dd") === value;
}
export function blockEnd(block: SeasonBlock): string {
  if (!validSeasonDate(block.startDate)) return "";
  if (block.templateId === "peak-3w" && block.endDate) return block.endDate;
  return format(addDays(parseISO(block.startDate), blockWeeks(block) * 7 - 1), "yyyy-MM-dd");
}
export function scheduleBlocks(blocks: SeasonBlock[], startDate: string): SeasonBlock[] {
  let next = parseISO(startDate);
  return blocks.map((block) => {
    const out = { ...block, startDate: format(next, "yyyy-MM-dd") };
    next = addDays(next, blockWeeks(block) * 7);
    return out;
  });
}
export function validateSeason(blocks: SeasonBlock[], competitionDate: string): string | null {
  const parsed = seasonBlocksSchema.safeParse(blocks);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Kontrollera blocken";
  if (competitionDate && !validSeasonDate(competitionDate)) return "Kontrollera tävlingsdatumet.";
  if (new Set(blocks.map((b) => b.id)).size !== blocks.length) return "Blocken måste ha unika ID:n.";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!validSeasonDate(b.startDate)) return `${b.name}: kontrollera startdatumet.`;
    if (b.templateId === "peak-3w" && b.endDate && !peakPeriodDays(b.startDate, b.endDate)) return `${b.name}: välj 14–42 dagar.`;
    const template = getTemplate(b.templateId);
    if (b.templateId !== "manual" && (!template || b.daysPerWeek < template.minDays || b.daysPerWeek > template.maxDays)) return `${b.name}: kontrollera antal träningsdagar.`;
    if (i > 0 && differenceInCalendarDays(parseISO(b.startDate), parseISO(blockEnd(blocks[i - 1]))) < 1) return "Blocken får inte överlappa. Pauser mellan block är tillåtna.";
    if (competitionDate && blockEnd(b) >= competitionDate) return "Sista träningsdagen måste ligga före tävlingsdatumet.";
    if (competitionDate && b.templateId === "peak-3w" && !b.mesocycleId && blockEnd(b) !== format(addDays(parseISO(competitionDate), -1), "yyyy-MM-dd")) return `${b.name}: lägg toppningen direkt före tävlingen så att de lätta passen hamnar rätt.`;
  }
  return null;
}
/** Reflow only unprepared blocks, preserving intentional gaps and every created program. */
export function rescheduleFuture(blocks: SeasonBlock[], changedId: string, patch: Partial<SeasonBlock>): SeasonBlock[] {
  const index = blocks.findIndex((b) => b.id === changedId);
  if (index < 0 || blocks[index].mesocycleId) return blocks;
  const next = blocks.map((b, i) => i === index ? { ...b, ...patch } : { ...b });
  if (patch.peakWeeks && next[index].endDate && !patch.endDate) next[index].endDate = format(addDays(parseISO(next[index].startDate), patch.peakWeeks * 7 - 1), "yyyy-MM-dd");
  for (let i = index + 1; i < next.length; i++) {
    if (next[i].mesocycleId) break;
    const gap = Math.max(1, differenceInCalendarDays(parseISO(blocks[i].startDate), parseISO(blockEnd(blocks[i - 1]))));
    next[i].startDate = format(addDays(parseISO(blockEnd(next[i - 1])), gap), "yyyy-MM-dd");
  }
  return next;
}
export function defaultSeason(startDate: string): SeasonBlock[] {
  return scheduleBlocks([
    { id: "volume", name: "Volymblock", focus: "volume", templateId: "standard-pl", startDate, daysPerWeek: 4, notes: "" },
    { id: "strength", name: "Styrkeblock", focus: "strength", templateId: "standard-pl", startDate, daysPerWeek: 4, notes: "" },
    { id: "competition", name: "Toppning", focus: "competition", templateId: "peak-3w", startDate, daysPerWeek: 3, notes: "" },
  ], startDate);
}