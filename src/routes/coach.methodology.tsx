import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/coach/methodology")({
  head: () => ({
    meta: [
      { title: "Metodik — Logik & beräkningar" },
      { name: "description", content: "Förklarar EAkoefficient, RPE→pace/HR, ACWR, drift, 80/20-viktning, plan-generering och retune-logik." },
    ],
  }),
  component: MethodologyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rounded-md bg-muted px-3 py-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Metodik — logik & beräkningar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Alla formler och beslutsregler bakom appen. Tänkt för coacher som vill förstå
          varför ett pass får en viss intensitet eller varför planen justeras.
        </p>
      </div>

      <Section title="EAkoefficient (styrke-autoregulering)">
        <p>Dagligt estimerat 1RM från ett loggat set, normaliserat mot baseline 1RM:</p>
        <Formula>
{`cappedReps = min(reps, 8)
E1RM       = vikt × (1 + (cappedReps + (10 − RPE)) / 30)
EAk %      = (dagens E1RM ÷ baseline 1RM) × 100`}
        </Formula>
        <p>Statusband ger snabb läsning av dagsformen:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>&lt; 92 %</b> Exhausted — sänk volym/intensitet</li>
          <li><b>92–97 %</b> Undertrained — kör som planerat, lite extra</li>
          <li><b>97–102 %</b> Adapting — sweet spot</li>
          <li><b>&gt; 102 %</b> Peaking — möjligt PB-fönster</li>
        </ul>
        <p>Volymkvalitet inom passet: jämför set 2+ mot set 1:s E1RM samma dag.
          ≤ 4 % drop = optimal, 4–5 % = acceptabel, ≥ 5 % = fatigue limit nått.</p>
      </Section>

      <Section title="RPE → %1RM (RTS / Helms-tabell)">
        <p>Föreskriven vikt vid given RPE och rep-mål använder standard-tabellen
          (RPE 10 @ 1 rep = 100 %). Vi snappar RPE nedåt till närmsta 0.5 i [6, 10],
          klampar reps till [1, 12], och avrundar vikten till närmsta 2.5 kg.</p>
        <p>RIR konverteras till RPE som <code>RPE = 10 − RIR</code> (klampat till ≥ 6).</p>
      </Section>

      <Section title="RPE → pace / HR / watt (uthållighet)">
        <p>Löppace härleds från VDOT (Jack Daniels), som vi räknar ut från senaste 10 km-PB:</p>
        <Formula>
{`v       = distans / tid     (m/min)
VO2     = −4.6 + 0.182258·v + 0.000104·v²
%VO2max = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)
VDOT    = VO2 / %VO2max`}
        </Formula>
        <p>RPE 1–10 mappas till %VO2max (E≈70 %, M≈82 %, T≈88 %, I≈97 %, R≈105 %)
          och inverteras till pace via samma kvadratiska ekvation.</p>
        <p>Puls: %HRmax när enbart maxpuls är känd, Karvonen %HRR
          (<code>HRrest + reserv × pct</code>) när vilopuls finns. Cykel använder %FTP
          (Coggan-zoner), simning %CSS.</p>
        <p><b>Coach-overrides</b> (exakt pace eller exakt HR per steg) går alltid före
          RPE-estimaten — så ett "4:30/km @ 165 bpm"-pass överlever ändringar i atletens PB.</p>
      </Section>

      <Section title="10k-prediktion från träningspass (EWMA)">
        <p>Varje kvalitetsinsats (≥ 3 min, RPE ≥ 5) konverteras till VDOT via samma
          Daniels-formel. Bästa VDOT i passet → predikterad 10k-tid (bisektion).</p>
        <p>För att inte ett enskilt grymt intervall ska spika estimatet använder vi EWMA
          mot de 4–5 senaste predikterade tiderna med α = 0.4:</p>
        <Formula>{`blended = α · current + (1 − α) · prevEMA`}</Formula>
      </Section>

      <Section title="Träningslast: Foster sRPE">
        <p>Per pass: <code>load = minuter × RPE</code> (linjär, validerad). När
          per-steg/per-rep actuals finns används tidsviktad segment-summa istället för
          ett snitt-RPE för hela passet (så 4×4 min @ RPE 9 inte späds ut av jogg-vila).</p>
        <p>Vi använder aldrig <code>peak_rpe</code> i fallback-kedjan — den överskattar last.</p>
      </Section>

      <Section title="ACWR (skaderisk-indikator)">
        <Formula>
{`acute   = summa sRPE senaste 7 dagarna
chronic = (snitt daglig last senaste 28 dagarna) × 7
ratio   = acute / chronic`}
        </Formula>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>&lt; 0.8</b> låg (undertränad)</li>
          <li><b>0.8 – 1.3</b> optimal sweet spot</li>
          <li><b>1.3 – 1.5</b> hög (varning)</li>
          <li><b>&gt; 1.5</b> danger (skaderisk-spik)</li>
        </ul>
        <p>Vi visar inget ratio förrän kronisk last &gt; 50 AU — annars är talet brus.</p>
      </Section>

      <Section title="Banister fitness/fatigue (CTL/ATL/TSB)">
        <Formula>
{`CTL = EMA av daglig last,  τ = 42 dagar  → "fitness"
ATL = EMA av daglig last,  τ = 7 dagar   → "fatigue"
TSB = CTL − ATL                          → "form"  (positiv = fresh)`}
        </Formula>
        <p>60 dagars warm-up före synligt fönster så CTL hinner stabilisera sig.</p>
      </Section>

      <Section title="Polariseringsmål — volymanpassad 80/20">
        <p>Klassisk Seiler 80/20 antar elitvolym. Vi interpolerar easy-andelen
          linjärt mellan veckans totala minuter:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>≤ 150 min/v (≈ 20 km)</b> → 60 % easy, 40 % kvalitet (pyramidalt)</li>
          <li><b>150 – 450 min</b> → linjär ramp 60 → 80 %</li>
          <li><b>≥ 450 min/v (≈ 90 km)</b> → klassisk 80/20</li>
        </ul>
        <p>Rationale: vid låg volym ger mer kvalitet bättre adaptation; vid hög volym
          tjänar man mer på att skydda aerob bas än att lägga på fler hårda pass.</p>
      </Section>

      <Section title="Drift-detektion (feedback-loop)">
        <p>Vi inspekterar de 5 senaste avslutade kvalitetspassen (planerad RPE ≥ 6).
          Räknar drift som <code>actual − planned</code>:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>avgDelta ≥ +1.5 eller 4 av 5 driftade</b> → reduce_volume (×0.85)</li>
          <li><b>3 av 5 driftade eller avgDelta ≥ +1.0</b> → easy_week (×0.90)</li>
          <li>annars → hold (×1.00)</li>
        </ul>
      </Section>

      <Section title="Maratonplan-generering (20 veckor)">
        <p>Hybrid Pfitzinger/Daniels/Seiler. Veckovolymen skalas av en VDOT-faktor från 10k-PB:</p>
        <Formula>{`factor = clamp(1.0 + (2700 − tenKsec) / 3000, 0.7, 1.4)`}</Formula>
        <p>Fem faser: Base (v1–4) → LT (v5–10) → Race-Specific (v11–15) → Sharpening (v16–18)
          → Taper (v19–20). Race ligger sista söndagen.</p>
        <p>Vid generering multipliceras factor med valfri <code>volumeAdjustment</code>
          (0.80–1.05) som kommer från ACWR + nyligen drift — så en överbelastad atlet
          aldrig startar på 100 % av kalibrerad volym.</p>
      </Section>

      <Section title="Re-tune av kommande 4 veckor">
        <p>När coachen öppnar atletens vy beräknas drift + ACWR från senaste 35 dagarna.
          Mest konservativ vinner, klampat till [0.75, 1.10]. Apply-knappen skalar
          <code> planned_total_seconds</code> och alla <code>endurance_steps.duration_seconds</code>
          för planerade pass de närmsta 28 dagarna. Avslutade/pågående pass rörs aldrig.</p>
      </Section>
    </div>
  );
}
