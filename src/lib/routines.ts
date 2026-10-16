export type RoutineId = "morning_long" | "morning_short" | "warmup";

export interface RoutineStep {
  title: string;
  text: string;
  /** Timer in seconds; null = no timer (do the reps at your own pace). */
  seconds: number | null;
  /** True = timer runs once per side (seconds is per side). */
  sides?: boolean;
}

interface FlowStep {
  title: string;
  text: string;
  long: number;
  /** Seconds in the short version; null = skipped in short. */
  short: number | null;
  shortText?: string;
  /** long/short are seconds per side. */
  sides?: boolean;
}

const MORNING: FlowStep[] = [
  {
    title: "Goddess-stans med höft framåt",
    text: "Stå brett, ungefär dubbla axelbredden, tårna utåt cirka 45 grader. Sjunk ner tills låren är nästan parallella med golvet. För knäna utåt åt samma håll som tårna. Tryck fram höften och spänn sätet. Börja högre och gå djupare under några andetag.",
    long: 60,
    short: 30,
    shortText: "Gå ner gradvis. Avsluta med 2–3 sidolutningar per sida.",
  },
  {
    title: "Sidolutning i goddess-stans",
    text: "Stå kvar i stansen. Luta överkroppen åt höger med armen över huvudet, sedan åt vänster. 3–4 lutningar per sida, 2 andetag i varje. Höften står still.",
    long: 45,
    short: null,
  },
  {
    title: "Knästående bakåtlutning",
    text: "Sitt på hälarna med vristerna platta mot golvet. Sätt händerna bakom dig och luta dig sakta bakåt. Lyft gärna höften något för att öka töjningen i låret.",
    long: 45,
    short: null,
  },
  {
    title: "Katt–ko och thread the needle",
    text: "Alla fyra. Katt–ko: runda ryggen på utandningen, sjunk ner med bröstet fram på inandningen, 6–8 reps. Thread the needle: sträck armen mot taket, för den sedan in under andra armen och lägg ner axeln. 5 per sida.",
    long: 90,
    short: 60,
    shortText: "5 katt–ko och 3 thread the needle per sida.",
  },
  {
    title: "90/90 till pigeon, aktivt",
    text: "Sitt med båda knäna böjda 90 grader. Luta dig lätt fram över främre benet. Gå över till pigeon med bakre benet sträckt bakåt och pressa främre benet mot golvet. Tillbaka till 90/90 och byt sida. 3–4 övergångar per sida.",
    long: 60,
    short: 45,
    shortText: "2 övergångar per sida.",
    sides: true,
  },
  {
    title: "Höftböjare i djupt utfall",
    text: "Långt utfall, bakre knät strax ovanför golvet. Spänn sätet på bakre benet och tryck fram höften. Bålen upprätt, svanka inte. Knäet får passera tårna – låt det glida fram så långt hälen håller sig i golvet. 45 s per sida.",
    long: 45,
    short: 30,
    shortText: "30 s per sida.",
    sides: true,
  },
  {
    title: "Baksida lår och vader",
    text: "Baksida: för höften bakåt och sträck främre benet med foten flexad, 30 s per sida. Vader: sträck bakre benet och tryck ner hälen (20 s), böj sedan bakre knät något (20 s). Båda sidorna.",
    long: 60,
    short: null,
    sides: true,
  },
  {
    title: "World's greatest stretch",
    text: "Djupt utfall med höger fot fram. Vänster hand i golvet. För höger armbåge mot fotleden, vrid bröstet upp och sträck armen mot taket. Avsluta med höften bakåt och främre benet sträckt. 3 per sida.",
    long: 60,
    short: 45,
    shortText: "2 per sida.",
    sides: true,
  },
  {
    title: "Djup huk med rörelse",
    text: "Sätt dig djupt på huk med hälarna i golvet. Tryck fram knäna över tårna. Vagga sakta åt sidorna, framåt och bakåt. Armbågarna mot insidan av knäna. Stå bredare om hälarna lyfter.",
    long: 60,
    short: 60,
  },
  {
    title: "Cossack squats",
    text: "Stå brett. Sjunk ner på ena benet medan det andra sträcks ut med tårna mot taket. Hälen i golvet, bröstet upprätt. Växla långsamt. 5 per sida.",
    long: 60,
    short: null,
  },
  {
    title: "Framåtfällning med armsvep",
    text: "Fötterna höftbrett. Fäll fram och låt armar och huvud hänga tungt. Svep sakta med armarna från sida till sida.",
    long: 45,
    short: null,
  },
  {
    title: "Upprullning och axelcirklar",
    text: "Rulla upp kota för kota, huvudet sist. 5 stora armcirklar framåt och 5 bakåt, en arm i taget. Sträck armarna mot taket och luta lätt åt sidorna.",
    long: 60,
    short: 60,
  },
];

const WARMUP: RoutineStep[] = [
  { title: "Puls", text: "Cykel, roddmaskin eller rask promenad tills du blir lite varm.", seconds: 240 },
  { title: "Cat–camel × 8", text: "Alla fyra. Runda och svanka ryggen lugnt i takt med andningen.", seconds: 45 },
  { title: "World's greatest stretch × 5/sida", text: "Djupt utfall, hand i golvet, armbåge mot fotleden, vrid upp och sträck armen mot taket.", seconds: 45, sides: true },
  { title: "Goblet squat × 8", text: "Djup knäböj med vikt framför bröstet. Häng i botten 2–3 s varje rep.", seconds: 60 },
  { title: "Höftlyft × 10", text: "Ligg på rygg med fötterna i golvet. Tryck upp höften och spänn sätet i toppen.", seconds: 45 },
  { title: "Band pull-apart × 15 + dislocates × 10", text: "Raka armar. Dra isär bandet mot bröstet, för det sedan över huvudet och tillbaka.", seconds: 60 },
  { title: "Dead bug × 6/sida", text: "Ländryggen mot golvet. Sträck ut motsatt arm och ben på utandningen.", seconds: 30, sides: true },
  {
    title: "Uppvärmning med stången",
    text: "Öka stegvis mot dagens första arbetsset, färre reps ju tyngre. Ungefär tom stång × 10, 40 % × 5, 60 % × 3, 75 % × 2, 90 % × 1. Vila kort i början, längre mot slutet.",
    seconds: null,
  },
];

export const ROUTINE_LABEL: Record<RoutineId, string> = {
  morning_long: "Morgonflow – lång (ca 15 min)",
  morning_short: "Morgonflow – kort (ca 8 min)",
  warmup: "Uppvärmning (10–15 min)",
};

export function getRoutine(id: RoutineId): RoutineStep[] {
  if (id === "warmup") return WARMUP;
  if (id === "morning_long") return MORNING.map((s) => ({ title: s.title, text: s.text, seconds: s.long, sides: s.sides }));
  return MORNING.filter((s) => s.short != null).map((s) => ({
    title: s.title,
    text: s.shortText ? `${s.text} Kort: ${s.shortText}` : s.text,
    seconds: s.short,
    sides: s.sides,
  }));
}
