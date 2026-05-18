// Run session library — RPE-tension load model.
// Each template is a self-contained workout the coach can deploy to an athlete.
// Designed for running goals 3K → marathon, scaled across athlete level.

import type { StepInput, Discipline } from "./endurance";

export type RaceGoal = "3k" | "5k" | "10k" | "hm" | "marathon";
export type AthleteLevel = "new" | "intermediate" | "advanced" | "elite";
export type SessionCategory =
  | "recovery"
  | "base"
  | "long"
  | "tempo"
  | "threshold"
  | "vo2"
  | "speed";

export const RACE_GOALS: { value: RaceGoal; label: string }[] = [
  { value: "3k", label: "3 K" },
  { value: "5k", label: "5 K" },
  { value: "10k", label: "10 K" },
  { value: "hm", label: "Half marathon" },
  { value: "marathon", label: "Marathon" },
];

export const LEVELS: { value: AthleteLevel; label: string }[] = [
  { value: "new", label: "New" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "elite", label: "Elite" },
];

export const CATEGORIES: { value: SessionCategory; label: string }[] = [
  { value: "recovery", label: "Recovery" },
  { value: "base", label: "Base / easy" },
  { value: "long", label: "Long run" },
  { value: "tempo", label: "Tempo" },
  { value: "threshold", label: "Threshold" },
  { value: "vo2", label: "VO₂ / intervals" },
  { value: "speed", label: "Speed" },
];

type LibStep =
  | { kind: "step"; sec: number; rpe: number; notes?: string }
  | { kind: "group"; repeat: number; notes?: string; children: LibStep[] };

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  category: SessionCategory;
  goals: RaceGoal[];
  levels: AthleteLevel[];
  discipline: Discipline;
  /** "structured" if it has intervals, "quick" for a single steady block. */
  mode: "quick" | "structured";
  steps: LibStep[];
}

// Helpers to keep template definitions compact
const mins = (n: number) => n * 60;
const step = (sec: number, rpe: number, notes?: string): LibStep => ({ kind: "step", sec, rpe, notes });
const group = (repeat: number, children: LibStep[], notes?: string): LibStep => ({ kind: "group", repeat, children, notes });
const wu = (m = 12) => step(mins(m), 3, "Warm-up — easy jog + strides");
const cd = (m = 10) => step(mins(m), 2.5, "Cool-down — very easy jog");

export const SESSION_LIBRARY: SessionTemplate[] = [
  // ───────── RECOVERY / BASE — shared across all goals ─────────
  {
    id: "recovery-jog-30",
    name: "Recovery jog · 30 min",
    description: "Conversation pace, no structure. Pure aerobic flush.",
    category: "recovery",
    goals: ["3k", "5k", "10k", "hm", "marathon"],
    levels: ["new", "intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(30), 2.5, "Conversational — should feel almost too easy")],
  },
  {
    id: "base-easy-45",
    name: "Easy base · 45 min",
    description: "Aerobic foundation — RPE 3-4 throughout.",
    category: "base",
    goals: ["3k", "5k", "10k", "hm", "marathon"],
    levels: ["new", "intermediate"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(45), 3.5, "Steady, breath under control")],
  },
  {
    id: "base-easy-60",
    name: "Easy base · 60 min",
    description: "Mid-week aerobic. RPE 3-4 throughout.",
    category: "base",
    goals: ["5k", "10k", "hm", "marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(60), 3.5, "Nasal breathing optional")],
  },
  {
    id: "base-easy-strides",
    name: "Easy + 6×20s strides",
    description: "Aerobic run finished with relaxed strides — neuromuscular touch.",
    category: "base",
    goals: ["3k", "5k", "10k", "hm", "marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      step(mins(40), 3.5, "Easy base"),
      group(6, [step(20, 8, "Strides — relaxed fast"), step(60, 2, "Walk/jog full recovery")]),
      cd(5),
    ],
  },

  // ───────── LONG RUNS ─────────
  {
    id: "long-60-easy",
    name: "Long run · 60 min easy",
    description: "First step toward an endurance base.",
    category: "long",
    goals: ["5k", "10k", "hm"],
    levels: ["new"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(60), 3.5)],
  },
  {
    id: "long-90",
    name: "Long run · 90 min",
    description: "Steady aerobic. Hydrate + fuel from 60 min in.",
    category: "long",
    goals: ["10k", "hm", "marathon"],
    levels: ["intermediate", "advanced"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(90), 3.5, "Conversational, smooth form")],
  },
  {
    id: "long-120",
    name: "Long run · 2 hr",
    description: "Aerobic base + fueling practice.",
    category: "long",
    goals: ["hm", "marathon"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "quick",
    steps: [step(mins(120), 3.5)],
  },
  {
    id: "long-progression-90",
    name: "Long progression · 90 min",
    description: "Three 30-min blocks: easy → moderate → marathon effort.",
    category: "long",
    goals: ["hm", "marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      step(mins(30), 3, "Block 1 — easy"),
      step(mins(30), 5, "Block 2 — moderate"),
      step(mins(30), 6.5, "Block 3 — marathon effort"),
    ],
  },
  {
    id: "long-marathon-fast-finish",
    name: "Long run · 2 hr with fast finish 20'",
    description: "Run on tired legs at marathon effort.",
    category: "long",
    goals: ["marathon"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      step(mins(100), 3.5, "Easy aerobic"),
      step(mins(20), 6.5, "Lock into marathon effort"),
      cd(5),
    ],
  },

  // ───────── TEMPO / THRESHOLD ─────────
  {
    id: "tempo-2x10",
    name: "Tempo · 2 × 10 min",
    description: "Comfortably hard, steady breathing. Threshold introduction.",
    category: "tempo",
    goals: ["5k", "10k", "hm"],
    levels: ["new", "intermediate"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(12),
      group(2, [step(mins(10), 6.5, "Tempo — controlled but committed"), step(mins(3), 3, "Easy jog")]),
      cd(8),
    ],
  },
  {
    id: "threshold-4x8",
    name: "Threshold · 4 × 8 min",
    description: "Classic threshold block. RPE 7 — sustainable for ~10K race.",
    category: "threshold",
    goals: ["5k", "10k", "hm"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(4, [step(mins(8), 7, "Threshold — heavy but controlled"), step(mins(2), 3, "Float recovery")]),
      cd(10),
    ],
  },
  {
    id: "threshold-cruise-3x15",
    name: "Cruise threshold · 3 × 15 min",
    description: "Big aerobic stimulus just under threshold.",
    category: "threshold",
    goals: ["10k", "hm", "marathon"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(3, [step(mins(15), 6.5, "Sub-threshold cruise"), step(mins(3), 3, "Easy")]),
      cd(10),
    ],
  },
  {
    id: "threshold-2x20",
    name: "Threshold · 2 × 20 min",
    description: "Big-block threshold for HM/marathon strength.",
    category: "threshold",
    goals: ["hm", "marathon"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(2, [step(mins(20), 6.5, "Threshold — relaxed power"), step(mins(5), 3, "Easy")]),
      cd(10),
    ],
  },
  {
    id: "tempo-continuous-30",
    name: "Continuous tempo · 30 min",
    description: "One unbroken HM-effort block.",
    category: "tempo",
    goals: ["hm", "marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      step(mins(30), 6.5, "Lock in HM effort"),
      cd(10),
    ],
  },

  // ───────── VO₂ / INTERVALS ─────────
  {
    id: "vo2-5x3",
    name: "VO₂ · 5 × 3 min",
    description: "Hard 3-min reps at 3K effort with equal jog recovery.",
    category: "vo2",
    goals: ["3k", "5k", "10k"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(5, [step(mins(3), 8.5, "VO₂ — 3K effort"), step(mins(3), 3, "Easy jog")]),
      cd(10),
    ],
  },
  {
    id: "vo2-6x4",
    name: "VO₂ · 6 × 4 min",
    description: "Big VO₂ block. RPE 8 — controlled, repeatable.",
    category: "vo2",
    goals: ["5k", "10k"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(6, [step(mins(4), 8, "VO₂ — controlled hard"), step(mins(2), 3, "Float jog")]),
      cd(10),
    ],
  },
  {
    id: "vo2-12x400",
    name: "VO₂ · 12 × 90 s hard / 60 s jog",
    description: "Short-rep VO₂. RPE 9 reps, RPE 3 jog.",
    category: "vo2",
    goals: ["3k", "5k"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(12, [step(90, 9, "Hard — 3K effort"), step(60, 3, "Easy jog")]),
      cd(10),
    ],
  },
  {
    id: "vo2-8x800",
    name: "VO₂ · 8 × 3 min @ 5K / 90 s jog",
    description: "Classic 5K sharpener. RPE 8.5.",
    category: "vo2",
    goals: ["3k", "5k", "10k"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(8, [step(mins(3), 8.5, "5K effort"), step(90, 3, "Easy jog")]),
      cd(10),
    ],
  },
  {
    id: "vo2-5x1000-10k",
    name: "10K reps · 5 × ~4 min / 2 min jog",
    description: "10K-pace specific intervals.",
    category: "vo2",
    goals: ["10k"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(5, [step(mins(4), 7.5, "10K effort"), step(mins(2), 3, "Easy jog")]),
      cd(10),
    ],
  },
  {
    id: "vo2-3x10-billats",
    name: "Billat-style · 3 × 10 × 30/30",
    description: "30 s hard / 30 s easy, 10 reps per block, 3 blocks.",
    category: "vo2",
    goals: ["3k", "5k", "10k"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(3, [
        group(10, [step(30, 9, "Hard"), step(30, 3, "Easy")]),
        step(mins(3), 2.5, "Block recovery"),
      ]),
      cd(10),
    ],
  },

  // ───────── SPEED / NEUROMUSCULAR ─────────
  {
    id: "speed-10x200",
    name: "Speed · 10 × 45 s fast / 90 s walk",
    description: "Short, sharp speed work. RPE 9.5 with full recovery.",
    category: "speed",
    goals: ["3k", "5k"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(10, [step(45, 9.5, "Fast, relaxed form"), step(90, 1.5, "Walk recovery")]),
      cd(10),
    ],
  },
  {
    id: "speed-hill-sprints",
    name: "Hill sprints · 8 × 15 s",
    description: "Short hill sprints for power & form. Full recovery.",
    category: "speed",
    goals: ["3k", "5k", "10k", "hm", "marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(8, [step(15, 9.5, "All-out uphill — drive arms"), step(mins(2), 1.5, "Walk down")]),
      cd(10),
    ],
  },

  // ───────── MARATHON-PACE SPECIFIC ─────────
  {
    id: "mp-3x20",
    name: "Marathon pace · 3 × 20 min",
    description: "Specific-endurance block at MP effort.",
    category: "tempo",
    goals: ["marathon"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(3, [step(mins(20), 6, "Marathon effort"), step(mins(5), 3, "Easy float")]),
      cd(10),
    ],
  },
  {
    id: "mp-fartlek-6x1mi",
    name: "MP fartlek · 6 × 5 min MP / 1 min easy",
    description: "Marathon-pace cuts with mini recoveries.",
    category: "tempo",
    goals: ["marathon"],
    levels: ["intermediate", "advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      group(6, [step(mins(5), 6, "MP"), step(mins(1), 3, "Easy jog")]),
      cd(10),
    ],
  },

  // ───────── HALF-MARATHON SPECIFIC ─────────
  {
    id: "hm-race-8mi",
    name: "HM pace · 50 min continuous",
    description: "Steady block at HM effort. Big specific stimulus.",
    category: "tempo",
    goals: ["hm"],
    levels: ["advanced", "elite"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(15),
      step(mins(50), 6.5, "Lock into HM effort"),
      cd(10),
    ],
  },

  // ───────── NEW RUNNER STARTERS ─────────
  {
    id: "new-walk-run-30",
    name: "Walk/run · 6 × 3 min jog / 2 min walk",
    description: "Couch-to-5K style intro. Build aerobic comfort.",
    category: "base",
    goals: ["3k", "5k"],
    levels: ["new"],
    discipline: "run",
    mode: "structured",
    steps: [
      step(mins(5), 2, "Warm-up walk"),
      group(6, [step(mins(3), 4, "Easy jog — RPE 4"), step(mins(2), 1, "Walk recovery")]),
      step(mins(5), 1.5, "Cool-down walk"),
    ],
  },
  {
    id: "new-fartlek-1min",
    name: "Fartlek intro · 8 × 1 min on / 2 min off",
    description: "Light play with pace changes. RPE 7 on, RPE 3 off.",
    category: "vo2",
    goals: ["3k", "5k", "10k"],
    levels: ["new", "intermediate"],
    discipline: "run",
    mode: "structured",
    steps: [
      wu(10),
      group(8, [step(60, 7, "Pick it up"), step(mins(2), 3, "Easy jog")]),
      cd(8),
    ],
  },
];

/**
 * Flatten the nested template structure into the DB step shape, assigning
 * order indices and parent pointers via temp IDs.
 */
export function expandTemplate(
  template: SessionTemplate,
): Omit<StepInput, "id">[] {
  const out: (Omit<StepInput, "id"> & { _tempId: string; _parentTemp: string | null })[] = [];
  let counter = 0;
  const tempId = () => `t${++counter}`;

  function walk(nodes: LibStep[], parentTemp: string | null) {
    nodes.forEach((node, idx) => {
      const id = tempId();
      if (node.kind === "group") {
        out.push({
          _tempId: id,
          _parentTemp: parentTemp,
          parent_id: null, // resolved after insert
          order_index: idx,
          is_group: true,
          repeat_count: node.repeat,
          discipline: template.discipline,
          duration_seconds: null,
          target_rpe: null,
          notes: node.notes ?? null,
        });
        walk(node.children, id);
      } else {
        out.push({
          _tempId: id,
          _parentTemp: parentTemp,
          parent_id: null,
          order_index: idx,
          is_group: false,
          repeat_count: 1,
          discipline: template.discipline,
          duration_seconds: node.sec,
          target_rpe: node.rpe,
          notes: node.notes ?? null,
        });
      }
    });
  }
  walk(template.steps, null);

  // Strip _temp markers for return — the inserter resolves parents itself.
  return out as unknown as Omit<StepInput, "id">[];
}

/**
 * Build payload rows ready for two-pass insert: first inserts groups+leaves
 * without parent_id, then we update children to point at their group's UUID.
 * Returns the raw template tree + ordering so the caller can do the two-pass.
 */
export function templateInsertPlan(template: SessionTemplate) {
  const nodes: {
    tempId: string;
    parentTemp: string | null;
    order_index: number;
    is_group: boolean;
    repeat_count: number;
    discipline: Discipline;
    duration_seconds: number | null;
    target_rpe: number | null;
    notes: string | null;
  }[] = [];

  let counter = 0;
  const tempId = () => `t${++counter}`;

  function walk(arr: LibStep[], parentTemp: string | null) {
    arr.forEach((node, idx) => {
      const id = tempId();
      if (node.kind === "group") {
        nodes.push({
          tempId: id,
          parentTemp,
          order_index: idx,
          is_group: true,
          repeat_count: node.repeat,
          discipline: template.discipline,
          duration_seconds: null,
          target_rpe: null,
          notes: node.notes ?? null,
        });
        walk(node.children, id);
      } else {
        nodes.push({
          tempId: id,
          parentTemp,
          order_index: idx,
          is_group: false,
          repeat_count: 1,
          discipline: template.discipline,
          duration_seconds: node.sec,
          target_rpe: node.rpe,
          notes: node.notes ?? null,
        });
      }
    });
  }
  walk(template.steps, null);
  return nodes;
}

/** Sum total planned seconds for a template (expands repeats). */
export function templateTotalSeconds(t: SessionTemplate): number {
  function sum(nodes: LibStep[]): number {
    let total = 0;
    for (const n of nodes) {
      if (n.kind === "group") total += n.repeat * sum(n.children);
      else total += n.sec;
    }
    return total;
  }
  return sum(t.steps);
}

/** Weighted-average target RPE across leaf steps. */
export function templateAvgRpe(t: SessionTemplate): number | null {
  let w = 0,
    s = 0;
  function walk(nodes: LibStep[], mult: number) {
    for (const n of nodes) {
      if (n.kind === "group") walk(n.children, mult * n.repeat);
      else {
        s += n.rpe * n.sec * mult;
        w += n.sec * mult;
      }
    }
  }
  walk(t.steps, 1);
  if (w === 0) return null;
  return Math.round((s / w) * 10) / 10;
}

/** Peak (highest) target RPE across all leaf steps. */
export function templatePeakRpe(t: SessionTemplate): number | null {
  let peak: number | null = null;
  function walk(nodes: LibStep[]) {
    for (const n of nodes) {
      if (n.kind === "group") walk(n.children);
      else if (peak == null || n.rpe > peak) peak = n.rpe;
    }
  }
  walk(t.steps);
  return peak;
}

/**
 * Session strain — TRIMP-style load score using the same RPE-weighting
 * curve as `sessionLoad` in enduranceLoad.ts so library previews are
 * comparable to logged-session load.
 */
export function templateStrain(t: SessionTemplate): number {
  let strain = 0;
  function walk(nodes: LibStep[], mult: number) {
    for (const n of nodes) {
      if (n.kind === "group") walk(n.children, mult * n.repeat);
      else {
        const minutes = (n.sec * mult) / 60;
        const expo = Math.exp(0.18 * (n.rpe - 5));
        strain += minutes * n.rpe * expo * 0.55;
      }
    }
  }
  walk(t.steps, 1);
  return Math.round(strain);
}

/** Qualitative strain bucket for badge styling. */
export function strainBucket(strain: number): { label: string; tone: string } {
  if (strain < 40) return { label: "Light", tone: "bg-status-peaking/30 text-status-peaking-foreground" };
  if (strain < 90) return { label: "Moderate", tone: "bg-status-adapting/30 text-status-adapting-foreground" };
  if (strain < 160) return { label: "Hard", tone: "bg-primary/20 text-primary" };
  return { label: "Very hard", tone: "bg-status-exhausted/30 text-status-exhausted-foreground" };
}

