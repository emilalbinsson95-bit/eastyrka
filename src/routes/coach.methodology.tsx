import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/coach/methodology")({
  head: () => ({
    meta: [
      { title: "Metodik: löpning, styrka och coachning — SETPOINT" },
      { property: "og:title", content: "Metodik: löpning, styrka och coachning — SETPOINT" },
      { property: "og:description", content: "Metoder och beräkningar för löpning, styrka och coachning i SETPOINT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Metoder och beräkningar för löpning, styrka och coachning i SETPOINT." },
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
          Metoder och beräkningar för löpning, styrka och coachning.
        </p>
      </div>

      <Tabs defaultValue="running" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="running">Löpning</TabsTrigger>
          <TabsTrigger value="strength">Styrka</TabsTrigger>
          <TabsTrigger value="coaching">Coachning</TabsTrigger>
        </TabsList>
        <TabsContent value="running" className="space-y-6">
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
        <p>För att ett enskilt snabbt intervall inte ska påverka uppskattningen för mycket använder vi EWMA
          mot de 4–5 senaste predikterade tiderna med α = 0.4:</p>
        <Formula>{`blended = α · current + (1 − α) · prevEMA`}</Formula>
      </Section>

      <Section title="Polariseringsmål — volymanpassad (HIIT-tungt → 80/20)">
        <p>Klassisk Seiler 80/20 antar elitvolym. Vid låg volym vänder vi förhållandet:
          då är HIIT-tunga pass mer effektiva per minut för VO2max, blodtryck och löpekonomi
          (Gibala, Stöggl & Sperlich, Tjønna 4×4 m.fl.). Easy-andelen interpoleras linjärt
          mellan veckans totala minuter:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>≤ 150 min/v (≈ 20 km, 2 korta pass)</b> → 40 % easy / <b>60 % kvalitet</b> (HIIT-tungt)</li>
          <li><b>150 – 450 min</b> → linjär ramp 40 → 80 % easy</li>
          <li><b>≥ 450 min/v (≈ 75–90 km)</b> → klassisk 80/20</li>
        </ul>
        <p>Rationale: lite total volym → kvalitet driver adaptationen och hälsovinsten.
          Hög volym → aerob bas är redan stor; mer hårt arbete ger främst skaderisk.</p>
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

      <Section title="Räkneexempel — RPE → pace via VDOT">
        <p>Atlet: 10k-PB 42:00. v = 10000/42 = 238 m/min.</p>
        <Formula>
{`VO2     = −4.6 + 0.182258·238 + 0.000104·238²  ≈  44.6
%VO2max ≈ 0.838  (t = 42 min)
VDOT    = 44.6 / 0.838 ≈ 53.2`}
        </Formula>
        <p>Vid RPE 6 (M-pace, ~82 % VO2max) inverteras kvadraten:</p>
        <Formula>
{`mål-VO2 = 0.82 × 53.2 ≈ 43.6
lös     0.000104·v² + 0.182258·v − 48.2 = 0
v       ≈ 232 m/min  →  4:18 / km`}
        </Formula>
      </Section>

      <Section title="Beslutsdiagram — RPE → preskription">
        <Formula>
{`           ┌──────────────┐
           │ Coach-override?│──ja──▶ använd exakt pace/HR/watt
           └──────┬─────────┘
                  │ nej
                  ▼
           ┌──────────────────┐
           │ Modalitet?       │
           └──┬────┬─────┬────┘
              │    │     │
           löp│ cykel│ sim│
              ▼    ▼     ▼
           VDOT  FTP    CSS
              │    │     │
              └────┼─────┘
                   ▼
           RPE → %target
                   ▼
           steg-pace / watt / pace/100m
                   ▼
           HR-överlägg:
             HRrest+max → Karvonen %HRR
             bara max   → %HRmax`}
        </Formula>
      </Section>

      <Section title="Volym → easy-andel (HIIT-tungt → 80/20-rampen)">
        <Formula>
{`easy %
 80 ┤                          ┌──────────────
    │                       ╱
 60 ┤                    ╱
    │                 ╱
 40 ┤──────────────╱
    └─────────────┬─────────┬──────────────▶ min/v
                 150       450`}
        </Formula>
        <p>Mellan 150 och 450 min/v: <code>easy = 0.40 + 0.40 × (min − 150) / 300</code>.
          Vid 150 min/v → 40 % easy / 60 % kvalitet. Vid 300 min/v → 60/40. Vid 450+ min/v → 80/20.</p>
      </Section>

      <Section title="Faser i 20-veckorsplanen">
        <Formula>
{`vecka   1  2  3  4 │ 5  6  7  8  9 10 │11 12 13 14 15 │16 17 18 │19 20
fas     Base       │ LT-utveckling     │Race-specific  │Sharpen  │Taper
volym   ▁▂▃▄       │ ▄▅▆▆▆▇            │▇▆▆▅▅          │▅▄▃      │▂ R`}
        </Formula>
        <p>Race ligger sista söndagen. Taper sänker volym men behåller intensitet
          (öppningsintervall i v19, race-pace-tune i v20).</p>
      </Section>

      <Section title="Forskningsgrund — löpning">
        <p className="font-semibold text-foreground mt-3">VDOT, %VO2max och löppace</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Daniels J. (2014). <em>Daniels' Running Formula</em>, 3rd ed. Human Kinetics.
            Källan till VDOT-tabellen och E/M/T/I/R-zonerna.</li>
          <li>Daniels J, Gilbert J. (1979). <em>Oxygen Power: Performance Tables for
            Distance Runners</em>. Originalstudien med den kvadratiska VO2/pace-ekvationen
            och %VO2max-decay-funktionen vi implementerar bokstavligt.</li>
          <li>Léger L, Mercier D. (1984). <em>Gross energy cost of horizontal treadmill and
            track running</em>. Sports Med 1. Stödbevis för linjär energi-kostnad mellan
            8–22 km/h som motiverar zon-skalningen.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Polariserad träning (80/20)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Seiler S. (2010). <em>What is best practice for training intensity and
            duration distribution in endurance athletes?</em> IJSPP 5.</li>
          <li>Stöggl T, Sperlich B. (2014). <em>Polarized training has greater impact on
            key endurance variables than threshold, high intensity or high volume training</em>.
            Front Physiol 5.</li>
          <li>Esteve-Lanao J et al. (2007). <em>Impact of training intensity distribution
            on performance in endurance athletes</em>. JSCR 21.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">HIIT-vikt vid låg volym (40/60 under 150 min/v)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tjønna AE et al. (2008). <em>Aerobic interval training versus continuous
            moderate exercise as a treatment for the metabolic syndrome</em>. Circulation 118.
            4×4 min @ 90 % HRmax slår kontinuerlig träning per minut.</li>
          <li>Gibala MJ et al. (2012). <em>Physiological adaptations to low-volume,
            high-intensity interval training in health and disease</em>. J Physiol 590.
            Grunden till "kvalitet driver adaptation när tid är knapp".</li>
          <li>Milanović Z et al. (2015). <em>Effectiveness of HIIT and continuous endurance
            training for VO2max improvements: meta-analysis</em>. Sports Med 45. HIIT ger
            större ΔVO2max per minut, särskilt &lt; 3 h/v träning.</li>
          <li>Weston KS, Wisløff U, Coombes JS. (2014). <em>HIIT vs. moderate-intensity
            continuous training in cardiometabolic disease</em>. BJSM 48.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Maratonperiodisering (20-veckorsplanen)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Pfitzinger P, Douglas S. (2009). <em>Advanced Marathoning</em>, 2nd ed.
            Strukturen Base → LT → Race-Specific → Taper, MLR-konceptet och MP-blocken
            i långpass.</li>
          <li>Daniels J. (2014). <em>Running Formula</em>. Tempo-, I- och R-passens längd
            och vila.</li>
          <li>Mujika I, Padilla S. (2003). <em>Scientific bases for precompetition tapering
            strategies</em>. MSSE 35. Stödjer 40–60 % volymsänkning över 2 v med
            bibehållen intensitet.</li>
          <li>Bosquet L et al. (2007). <em>Effects of tapering on performance:
            meta-analysis</em>. MSSE 39. 8–14 d taper med 41–60 % volymsänkning ger
            störst prestationslyft.</li>
        </ul>
      </Section>
        </TabsContent>
        <TabsContent value="strength" className="space-y-6">
      <Section title="EAkoefficient (styrke-autoregulering)">
        <p>EAk svarar på en fråga: hur ligger dagsformen till mot atletens baseline, och vad gör vi åt det idag? Mätning och förskrivning använder samma RTS-tabell, så talet betyder samma sak oavsett reps.</p>
        <Formula>
{`E1RM  = vikt ÷ RTS-%(reps, RPE)      // RPE interpoleras, avrundas aldrig nedåt
Set med RPE < 7 räknas inte
EAk % = (mätsetets E1RM ÷ baseline 1RM) × 100`}
        </Formula>
        <p><b>Mätset:</b> första kvalificerade setet med RPE ≥ 7. En tung singel räknas bara när den ligger före första arbetssetet. Referensuppvärmning och teknikset undantas. Jämförelser mellan pass matchar övning, variant och repintervall 1–3, 4–6 eller 7+; RTS räknar om RPE.</p>
        <p>Statusband och åtgärd idag:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>&lt; 92 %</b> Långt under baslinjen</li>
          <li><b>92–under 97 %</b> Under baslinjen</li>
          <li><b>97–103 %</b> Vid baslinjen</li>
          <li><b>&gt; 103 %</b> Över baslinjen</li>
        </ul>
        <p>Ett värde under baseline betyder inte att atleten har tränat för lite.</p>
        <p><b>Dag och trend skiljs åt:</b> det enskilda passet styr dagens justering. Ett glidande medel över 3 pass styr coachbeslut, eftersom ett RPE-fel på ±0,5–1 motsvarar 2–4 % i E1RM.</p>
        <p><b>Volymkvalitet:</b> set efter mätsetet (bara RPE ≥ 7) jämförs mot mätsetets E1RM. Under 4 % tapp = bra, 4–under 5 % = godtagbart, minst 5 % = trötthetsgräns. Detta är ett annat mått än EAk mot baslinjen.</p>
        <p className="mt-2"><b>Coachstyrd baslinje:</b> både höjningar och sänkningar kräver coachens beslut. Appen kan föreslå en ändring men skriver aldrig om baslinjen automatiskt. Atletkort och coachlista visar samma rullande snitt av tre mätpass per lyft.</p>
        <p><b>Belastning:</b> statistikens CTL/ATL/TSB räknas från sRPE × minuter för styrka och kondition. Det är en belastningsmodell, inte ett besked om styrkeform. EAk och generatorns styrkestatus förblir rena styrkemått.</p>
        <p>Trösklarna (92/97/103 %, 12 av 16, +5 %) är mina egna designval, inte värden från forskningen.</p>
      </Section>

      <Section title="Volym — trötthetsstyrd och blockvis">
        <p><b>Extra set inom passet:</b> när de planerade seten är klara får atleten lägga till set på samma vikt så länge tappet mot mätsetet är ≤ 4 % och RPE ligger högst 1 över målet. Stopp vid tapp ≥ 5 % eller planerat + 2 set. Gäller inte deload, toppning eller singlar. Idén är densamma som RTS "fatigue stops"; stödet i forskningen är svagt, så det är mitt designval.</p>
        <p><b>Mellan block:</b> varje lyft utvärderas på senaste blocket. +1 arbetsset per vecka om tappet var ≤ 4 % i minst 75 % av passen och EAk-trenden var stabil eller steg. −1 set om trenden föll under 97 % eller tappet var ≥ 5 % i mer än en tredjedel av passen. Annars oförändrat. Högst +2 set per lyft och block, och coachen kan sätta ett veckotak per lyft.</p>
        <p><b>Volymtolerans:</b> låg / normal / hög ger −1 / 0 / +1 set per lyft och vecka som startvärde tills det finns data från ett block. Valet sparas på atleten.</p>
        <p><b>Fler set eller fler dagar:</b> ökad volym läggs först som fler set i befintliga pass. Når ett pass cirka 6 arbetsset på samma lyft föreslår generatorn en dag till eller att volymen sprids.</p>
        <p className="text-xs">Dos–respons mellan volym och muskeltillväxt: Schoenfeld BJ et al. (2017) J Sports Sci 35(11). Den individuella variationen är stor, därför styr datan volymen i stället för mallen.</p>
      </Section>

      <Section title="RPE → %1RM (RTS-tabell)">
        <p>Föreskriven vikt och E1RM använder samma tabell (RPE 10 @ 1 rep = 100 %). RPE interpoleras mellan halvsteg, reps klampas till [1, 12] och föreskriven vikt avrundas till närmaste 2,5 kg.</p>
        <p>RIR konverteras till RPE som <code>RPE = 10 − RIR</code> (klampat till ≥ 6).</p>
      </Section>

      <Section title="Räkneexempel — EAkoefficient">
        <p>Atlet med baseline 1RM knäböj 150 kg. Idag: 130 kg × 5 reps @ RPE 8.</p>
        <Formula>
{`RTS-%(5 reps, RPE 8) = 81,1 %
E1RM = 130 ÷ 0,811 = 160,3 kg
EAk  = 160,3 / 150 × 100 = 106,9 %  → Över baslinjen

Kontroll: 150 × 1 @ RPE 10 = 150 kg → 100 % (Vid baslinjen)`}
        </Formula>
        <p>Tolkning: dagsformen är 6,9 % över baseline. Gå tyngre eller testa bara om det håller två pass i rad.</p>
      </Section>

      <Section title="Setupplägg — hur seten läggs upp">
        <p>Setupplägget styr hur seten inom en övning fördelas. Det väljs manuellt av
          coachen i programgeneratorn, separat för knäböj, bänk, mark och assistansövningar.
          Antalet övningar och dagar är oförändrat; antalet arbetsset styrs av volymprofilen. Deload-, taper-,
          toppnings- och återhämtningsveckor behåller sina upplägg. De ändrade seten får
          RPE 6–8,5 och sparas i övningens anteckningar.</p>

        <p className="mt-3"><b>Behåll mallens upplägg</b></p>
        <p>Förvalt alternativ. Mallens set, reps och ansträngning behålls. Välj detta när
          du vill använda mallen utan att ändra setens upplägg.</p>

        <p className="mt-3"><b>Samma vikt och reps (straight sets)</b></p>
        <p>Alla set körs på samma vikt och samma reps. Första setet sätter vikten. Om ett
          set överstiger mål-RPE med 1 eller mer, eller når RPE 9, sänks vikten 5 % i resterande set för att
          undvika att ansträngningen blir för hög. Upplägget är enkelt att följa upp
          och passar ofta tävlingslyften i styrkeblock.</p>

        <p className="mt-3"><b>Samma vikt, färre reps vid trötthet (rep drops)</b></p>
        <p>Vikten är låst till första setets vikt. Därefter anpassar atleten antalet reps
          till en lägre RPE — aldrig till failure. Upplägget används inte på arbete över
          cirka 85 % av 1RM; där behålls det planerade upplägget. Vikten är densamma
          mellan seten och antalet reps anpassas efter ansträngningen.</p>

        <p className="mt-3"><b>Stegrande vikt (ramping)</b></p>
        <p>Samma reps i alla set, men RPE och vikt stiger successivt inom passet — till
          exempel 3 set @ RPE 6, 6,5 och 7. Uppvärmningen är separat och räknas inte in.
          Planerade lätta set (RPE ≤ 6) ändras inte. Stegringen passar i våg- och
          volymveckor när arbetet ska bli tyngre under passet.</p>

        <p className="mt-3"><b>Fallande reps, stegrande vikt (descending)</b></p>
        <p>Färre reps för varje set, med högre vikt men bibehållen RPE — ett pyramidupplägg.
          Reps går aldrig under två. Exempel: 5, 4, 3 reps med stigande vikt på samma
          ansträngning. Det ger tungt arbete på högre procent utan att något set blir
          maximalt, och passar när atleten behöver vänja sig vid tyngre vikter i
          ackumulationsfasen.</p>

        <p className="mt-3"><b>Topp-set + backoff</b></p>
        <p>Ett topp-set i huvudförskrivningen, följt av backoff-set på högst 5 reps, högst
          70 % av övningens uppskattade 1RM och högst 90 % av toppvikten, med RPE-tak.
          Vila: 2 minuter för assistans, 3–5 minuter för huvudlyft. Extra backoff-set får läggas till enligt trötthetsregeln, inom vikt- och RPE-taken. Vikt- och RPE-gränserna begränsar ansträngningen i backoff-seten.</p>

        <p className="mt-3"><b>Dubbel progression</b></p>
        <p>Reps rör sig inom ett intervall, till exempel 3–7 reps, på samma vikt i alla set.
          När alla set når övre gränsen inom mål-RPE höjs vikten med minsta tillgängliga
          viktsteg nästa gång, och atleten börjar om på nedre gränsen. Annars behålls
          vikten. Schemat behåller startvikten tills atleten uppfyller kravet för en
          höjning. Atleten loggar utförda reps så att coachen kan följa när vikten
          behöver ändras.</p>

        <p className="mt-3"><b>Gemensamma regler för alla upplägg</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Uppvärmningsset räknas aldrig in i arbetsseten.</li>
          <li>Avbryt setet om position eller teknik inte kan hållas — det gäller oavsett
            upplägg.</li>
          <li>Vila 3–5 minuter mellan arbetsset på huvudlyften, 2–3 minuter för assistans,
            längre vid behov för att hålla teknik och mål-RPE.</li>
          <li>Viktberäkningar bygger bara på övningens egen förskrivna vikt — aldrig på en
            annan övnings baseline. Ett byte mellan sumo och konventionellt, eller en
            svaghetsvariation, börjar alltså om med rätt last.</li>
        </ul>

        <p className="mt-3"><b>Hur jag väljer</b></p>
        <p>Tävlingslyften i styrkeblock får oftast straight sets eller stegrande vikt, för
          tydlighet och tungt arbete på kontrollerad ansträngning. Volym- och
          specialiseringsblock passar bra med fallande reps eller topp-set med backoff.
          Dubbel progression kör jag helst på assistans och varianter, där progressionen
          ska växa fram över flera veckor. Rep drops är mitt val när atletens dagsform
          svänger mycket mellan pass. Vikten behålls och antalet reps anpassas efter RPE.</p>
        <p className="text-xs">Källor: Zourdos MC et al. (2016) JSCR 30(1), RPE-skalan som
          RPE-skalan bygger på; Helms ER et al. (2016) Strength Cond J 38(4), RIR-baserad
          autoreglering; Greig L et al. (2020) Sports Med 50, autoreglering kräver
          konsekvent styrning för att vara tolkbar; Helms ER et al. (2019) Muscle and
          Strength Pyramid, dubbel progression som standardmodell för assistans.</p>
      </Section>

      <Section title="Forskningsgrund — styrka">
        <p className="font-semibold text-foreground mt-3">E1RM och RPE</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Zourdos MC et al. (2016). <em>Novel Resistance Training-Specific Rating of
            Perceived Exertion Scale Measuring Repetitions in Reserve</em>. JSCR 30(1).
            RPE/RIR-skalan som tabellen bygger på.</li>
          <li>Helms ER et al. (2016). <em>Application of the Repetitions in Reserve-Based
            Rating of Perceived Exertion Scale for Resistance Training</em>. Strength Cond J 38(4).</li>
          <li>Helms ER et al. (2017). <em>RPE and Velocity Relationships for the Back Squat,
            Bench Press, and Deadlift in Powerlifters</em>. JSCR 31(2).</li>
          <li>LeSuer DA et al. (1997). <em>The Accuracy of Prediction Equations for Estimating
            1-RM Performance in the Bench Press, Squat, and Deadlift</em>. JSCR 11(4).
            De testade ekvationerna underskattade marklyft. Studien validerar inte RTS-tabellen.</li>
        </ul>
        <p>Trösklar för topp och baseline-höjning är mina egna designval.</p>
      </Section>
      <Section title="Svagheter i lyften – först cues, sen övningsval">
        <p>Min grundregel är att använda cues tidigt, när det finns större tekniska fel att rätta till,
          framför allt sådant som påverkar säkerheten eller grundpositionen. När tekniken väl sitter
          löser jag svagheter och obalanser med övningsval i stället för att lägga på fler cues. Det
          finns stöd för det i forskningen. Cues med externt fokus hjälper inlärningen (Wulf 2013), men
          när man fastnar i ett lyft beror det oftast på att en muskelgrupp eller en position är svag.
          Det tränar man bäst med variationer som belastar just den delen extra (Kompf &amp;
          Arandjelović 2016; van den Tillaar 2012–2019).</p>
        <p className="font-semibold text-foreground">Ta reda på problemet innan du åtgärdar det</p>
        <p>Filma lyftet från sidan på RPE 8–10 och kolla var stången går långsammast, alltså var du
          fastnar. Jämför sedan med ett lättare set. Ser positionen likadan ut på RPE 7 som på RPE 9,5
          är det troligen styrkan och inte tekniken som brister. Det säger också en del att jämföra
          variationer, till exempel om pausböj eller front squat är relativt sett svagare än vanlig böj.
          Ändra bara en sak per block och följ e1RM både i variationen och i huvudlyftet, annars vet du
          inte vad som gjorde skillnad.</p>
        <p className="font-semibold text-foreground">Marklyft</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Långsam från golvet:</strong> Oftast quads eller startpositionen. Kör deficitmark,
            pausmark strax under knät och front squat. Om du drar konventionellt och fastnar tidigt kan
            det vara värt att testa sumo, och tvärtom.</li>
          <li><strong>Fastnar vid knät eller i lockout:</strong> Oftast höftsträckare och ryggstyrka.
            RDL, good mornings, rack pulls från strax under knät, hip thrust och pausmark vid knät.</li>
          <li><strong>Ryggen rundar sig:</strong> I början räcker det ofta med en cue som "bröstet mot
            väggen" eller "armhålorna över stången". Senare handlar det mer om övningsval: pausmark, RDL
            med tempo, front squat, rodd och mark på lägre vikt med hårdare krav på positionen.</li>
        </ul>
        <p className="font-semibold text-foreground">Knäböj</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Tappar spänningen i botten:</strong> Pausböj (2–3 s), långsam nedfas (3–5 s) och
            pin squat från botten. Det bygger styrka och kontroll precis där lyftet faller ihop.</li>
          <li><strong>Fastnar strax ovanför parallellt (vanligast):</strong> Höftsträckare och quads i
            mittpartiet. Pin squat vid sticking point, pausböj, high bar eller front squat och
            1¼-böj.</li>
          <li><strong>Höften åker upp först (good morning-böj):</strong> Quadsen är för svaga jämfört med
            baksidan. Front squat, high bar, benpress och safety bar squat.</li>
          <li><strong>Knäna faller in:</strong> Lite valgus där man fastnar är normalt, även hos starka
            lyftare. Faller knäna in tydligt jobbar du med adduktorer och höftstyrka, split squats och
            tempo.</li>
        </ul>
        <p className="font-semibold text-foreground">Bänkpress</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Från bröstet:</strong> Bröst och främre axel. Bänk med lång paus, Spoto press,
            brett grepp, hantelpress och deficit eller cambered bar.</li>
          <li><strong>Mitten, 5–15 cm ovanför bröstet (vanligast):</strong> Triceps och bröst i
            övergången mellan dem. Spoto press, pin press vid sticking point, smalt grepp och Larsen
            press.</li>
          <li><strong>Lockout:</strong> Triceps. Smalt grepp, board eller pin press högt upp, JM press,
            dips och triceps över huvudet.</li>
          <li><strong>Stången tappar banan:</strong> I början cues som "böj stången" och "armbågarna
            under stången". Senare bänk med tempo och paus för att nöta in banan.</li>
        </ul>
        <p className="font-semibold text-foreground">I programgeneratorn</p>
        <p>Välj upp till tre svagheter under "Weak points" när du genererar ett program. Lyftets
          variationsplats byts mot den riktade variationen, och en riktad assistansövning läggs till
          varje vecka (inte i deload). Valen sparas på atleten och är förvalda nästa block.</p>
        <p className="font-semibold text-foreground">Hur mycket?</p>
        <p>Byt ut 1–2 variationer per block och kör dem 1–2 pass i veckan på RPE 7–8. Variationen ska
          ligga nära huvudlyftet men belasta den svaga delen hårdare. Utvärdera efter 4–8 veckor. Går
          variationen upp men inte huvudlyftet var det förmodligen inte där problemet satt, och då får
          du testa en ny hypotes.</p>
        <p className="text-xs">Källor: Wulf G (2013) Int Rev Sport Exerc Psychol; Kompf J &amp; Arandjelović O
          (2016) Sports Med 46; van den Tillaar R &amp; Ettema G (2010, 2013), sticking region i bänk;
          van den Tillaar R et al. (2014), sticking region i knäböj; Escamilla RJ et al. (2000), sumo vs
          konventionell; Nuckols G, Stronger by Science, om sticking points; Swinton PA et al. (2011),
          box- och pinövningar.</p>
      </Section>

      <Section title="Varianter som fungerar på alla tre lyften">
        <p><b>1½-reps:</b> Den fulla rörelsen, sedan en halv, sedan den fulla igen. Det ger dubbelt
          så mycket tid i den svåraste delen, och spänningen måste hållas genom hela seten.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Bänk:</b> Ner till bröstet, halvvägs upp, ner till bröstet igen, sedan upp och lås
            ut.</li>
          <li><b>Böj:</b> Ner i botten, upp till strax ovanför parallellt, ner i botten igen, sedan
            upp. Bra för att lära sig att inte tappa spänningen när man vänder i botten.</li>
          <li><b>Mark:</b> Dra upp till knät, sänk kontrollerat tills stången nuddar golvet utan att
            släppa spänningen, sedan drar du hela lyftet. Bra för den som är långsam från golvet och
            tappar positionen när stången lämnar det.</li>
        </ul>
        <p><b>Belastning:</b> Ungefär 60–75 % av 1RM. Räkna varje 1½ som en rep.</p>
        <p><b>Paus på väg upp:</b> De flesta pausar i botten. Prova i stället att stanna 1–2 sekunder
          mitt i lyftet på väg upp, precis där du fastnar. Då måste du bygga upp kraften igen på
          exakt den punkten. Det fungerar mycket bra på bänk (5–10 cm över bröstet) och böj (strax
          över parallellt).</p>
        <p><b>Pauser på flera ställen:</b> En rep med två eller tre stopp. För mark kan det vara ett
          stopp 2–3 cm över golvet och ett vid knät. För böj ett halvvägs ned och ett i botten. Man
          får positionskontroll genom hela rörelsen och kan inte fuska sig förbi de svaga lägena.</p>
        <p><b>Svävande reps:</b> Vänd precis innan du når botten eller golvet, utan att vila där. På
          bänk betyder det att stoppa 1–2 cm ovanför bröstet (som en Spoto). På mark lyfter du
          stången 1 cm från golvet och håller där innan du drar vidare. Man lär sig att spänningen
          ska finnas innan rörelsen börjar.</p>
        <p><b>Isometriskt mot pinnar:</b> Ställ pinnarna vid din sticking point och tryck eller dra
          maximalt mot dem i 3–6 sekunder. Effekten sitter framför allt runt just den vinkeln, så
          det passar när du vet exakt var du fastnar. Kör 3–5 set efter huvudlyftet.</p>
        <p><b>Tempo:</b> Utöver långsam nedfas kan du prova 3-3-0, alltså tre sekunder ned, tre
          sekunders paus och explosivt upp. Det är tufft men avslöjar direkt var du tappar
          positionen.</p>
        <p><b>Från stillastående:</b> Varje rep börjar från stillhet utan studs eller elastisk
          energi. Mark från golvet med full omstart per rep, Anderson squat (böj från pinnar i
          botten) och dead bench (bänk från pinnar vid bröstet).</p>
        <p><b>Band och kedjor:</b> Motståndet ökar ju högre upp i lyftet du kommer. Det passar för
          lockout och för att öva på att accelerera genom hela lyftet. Forskningen är blandad, så
          jag ser det som ett komplement och inte som en grundpelare.</p>
        <p><b>Omvända band:</b> Band från ställningens topp som avlastar i botten. Du får känna
          tyngre vikter i toppen och det bygger självförtroende inför maxförsök. Använd det
          sparsamt.</p>
        <p><b>Kombinationsreps:</b> Till exempel 1 pausrep + 2 vanliga reps i samma set, eller en
          tempo-rep följd av vanliga reps. Du får den tekniska effekten utan att tappa så mycket
          vikt.</p>

        <p className="mt-3"><b>Marklyft – fler fel</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Höften åker upp först från golvet:</b> Benen gör för lite i starten. Pausmark 2–3 cm
            över golvet, deficitmark och front squat. Cue: "tryck bort golvet" i stället för "dra
            stången".</li>
          <li><b>Stången glider bort från kroppen:</b> Latsen är inte aktiva. Straight-arm pulldown
            som aktivering, RDL med fokus på att stången nuddar låren och cue: "skydda armhålorna"
            eller "böj stången runt benen".</li>
          <li><b>Greppet släpper:</b> Håll i toppen 10–20 sekunder efter sista setet, dubbelt
            överhandsgrepp i uppvärmningen, snatch grip-hållningar och fat grips. Glöm inte kalk.</li>
          <li><b>Övre ryggen rundar:</b> Snatch grip-mark (bredare grepp, längre dragväg, mer övre
            rygg), Zercher-mark eller Zercher squat, rodd och face pulls.</li>
          <li><b>Hitchar i lockout, alltså stöttar stången mot låren:</b> Oftast svaga
            höftsträckare och sätesmuskler. Hip thrust med paus i toppen, rack pulls strax ovanför
            knät och block pulls med tempo.</li>
          <li><b>Tappar spänningen mellan reps (touch and go):</b> Kör varje rep från stillastående
            och gör en ny bracing för varje rep.</li>
        </ul>

        <p className="mt-3"><b>Knäböj – fler fel</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Faller framåt eller vikten hamnar på tårna:</b> Balansen ligger inte över mitten av
            foten. Tempo med fokus på att ha tyngden där, pausböj, goblet squat som teknikövning
            och cue: "hela foten i golvet".</li>
          <li><b>Tappar bracingen under lyftet:</b> Andningen eller buken släpper. Pausböj med
            andningen hållen genom pausen, bracing-övningar med bälte ("magen mot bältet") och
            front squat, som straffar direkt om du släpper.</li>
          <li><b>Studsar ur botten utan kontroll:</b> Studsen tar över. Pausböj, pin squat och tempo
            ned. Studsen är okej, men den ska vara kontrollerad.</li>
          <li><b>Svagt i botten men stark i toppen:</b> Pin squat från botten, box squat under
            parallellt och 1½-böj.</li>
          <li><b>Quads är den svaga länken:</b> Hälupphöjd böj eller cyclist squat, hack squat, belt
            squat och front squat.</li>
          <li><b>Ryggen tröttnar innan benen:</b> Belt squat eller benpress för mer benvolym utan
            ryggbelastning, och safety bar squat.</li>
          <li><b>Olika på vänster och höger sida (höften skiftar):</b> Split squats, bulgarian split
            squats och step-ups. Filma framifrån.</li>
        </ul>

        <p className="mt-3"><b>Bänkpress – fler fel</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Rumpan lyfter från bänken:</b> Bendriften är okontrollerad. Larsen press, bänk med
            fötterna lugnt i golvet och cue: "tryck golvet framåt, inte uppåt".</li>
          <li><b>Axlarna rullar fram i lockout:</b> Skulderbladen släpper. Rodd, face pulls och bänk
            med paus i lockout där du aktivt håller kvar skulderbladen.</li>
          <li><b>En arm går före den andra:</b> Hantelpress, enarmad hantelpress och tempo. Filma
            framifrån.</li>
          <li><b>Stannar direkt när stången vänder:</b> Pausbänk, dead bench från pinnar och bänk
            med paus på väg upp.</li>
          <li><b>Studsar på bröstet:</b> Pausbänk, Spoto och tempo ned (3 sekunder).</li>
          <li><b>Svag lockout trots stark triceps:</b> Kolla armbågsbanan. Ofta flaras armbågarna
            för tidigt. Floor press, pin press högt upp och tempo för att nöta in banan.</li>
        </ul>

        <p className="mt-3"><b>Idéer för att lägga upp det</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Toppset + back-off med variation:</b> Ett tungt set i huvudlyftet och sedan 2–3 set
            i den variation som tränar din svaghet, till exempel toppset i bänk och sedan
            1½-bänk.</li>
          <li><b>Byt variation per block men behåll principen:</b> Om 1½-bänk hjälpte i mitten av
            lyftet kan du testa paus på väg upp i nästa block. Samma svaghet, ny stimulans.</li>
          <li><b>Teknikreps i uppvärmningen:</b> Kör uppvärmningen som pausreps eller tempo-reps.
            Det kostar nästan ingen energi, och du får in positionerna utan extra pass.</li>
        </ul>
      </Section>
        </TabsContent>
        <TabsContent value="coaching" className="space-y-6">
      <Section title="Atleten ska förstå sin träning">
        <p>Jag vill att atleten ska förstå varför vi tränar som vi gör och kunna ta
          egna beslut under ett pass. Vad gör man när uppvärmningen känns tung?
          När ska vikten sänkas? Vilka övningar kan prioriteras bort om tiden inte räcker?
          Det är sådant vi behöver gå igenom, inte bara vilket program som ska följas.</p>

        <p className="mt-3"><b>Olika mycket hjälp med olika saker</b></p>
        <p>En erfaren lyftare kan sköta vikterna i böjen själv men behöva hjälp med
          toppningen inför tävling. Jag utgår från vad atleten kan i den aktuella frågan,
          inte bara hur många år den har tränat. Jag förklarar det som behövs och låter
          atleten sköta det som redan fungerar.</p>

        <p className="mt-3"><b>Jag behöver veta hur passet faktiskt gick</b></p>
        <p>Om ett set var RPE 9 ska det stå 9, även om planen sa 7. Om knät gjorde ont
          eller ett pass inte hanns med behöver jag också veta det. Annars riskerar jag
          att lägga nästa veckas träning på fel nivå. Vi går igenom vad som hände och
          om något behöver ändras.</p>

        <p className="mt-3"><b>Låt atleten vara med och bedöma</b></p>
        <p>Jag frågar hur vikten kändes och jämför det med loggen och filmen. Efter hand
          kan atleten föreslå en justering själv: samma vikt igen, lite lättare nästa
          set eller ett set mindre. Vi går igenom varför. Då får atleten öva på de
          beslut som behövs även när jag inte är med.</p>
        <p>En dålig natt eller en tung uppvärmning behöver inte betyda att hela passet
          ska ändras. Vi väger ihop känslan med hur lyften faktiskt går.</p>

        <p className="mt-3"><b>Återkoppla på det som går att se</b></p>
        <p>Jag försöker vara konkret: ”Höften kom upp före stången på de sista två
          repsen.” Sedan frågar jag hur det kändes. Filmen visar inte allt, och jag
          vill inte bestämma orsaken innan jag hört atletens bedömning.</p>
        <p>För en ny lyftare använder jag cues för att rätta till större teknikbrister.
          När grunderna sitter jobbar jag främst med övningsval för det som behöver
          förbättras, i stället för att lägga på fler instruktioner i varje lyft.</p>

        <p className="mt-3"><b>Följ upp det vi tränar för</b></p>
        <p>Inför ett block går vi igenom vad vi vill förbättra och hur vi ska följa upp
          det. Det kan vara att hålla positionen ur botten i böjen, få in veckans pass
          eller lyfta mer vid samma RPE. Efter blocket tittar vi på vad som fungerade
          och vad som behöver ändras. Ett enstaka dåligt pass räcker inte för att döma
          ut upplägget.</p>

        <p className="mt-3"><b>Programmet ska gå att diskutera</b></p>
        <p>Atleten får säga om något inte fungerar: för långa pass, en övning som gör
          ont eller en belastning som är svår att återhämta sig från. Jag ansvarar för
          planeringen, men behöver den informationen för att göra ett bättre jobb.</p>
        <p>Att klara sig själv betyder inte att atleten ska tycka som jag i allt.
          Det betyder att den förstår träningen, kan motivera sina val och vet när
          den behöver hjälp.</p>
      </Section>

      <Section title="Tränaren som projektledare">
        <p>Jag planerar träningen och följer upp hur den fungerar. Sömn, mat, skador och
          tiden atleten har till träning påverkar vad som är rimligt att lägga in. Jag behöver
          ta hänsyn till det, men ska inte försöka lösa allt själv. När något ligger utanför
          min kompetens hjälper jag atleten att hitta rätt hjälp.</p>

        <p className="mt-3"><b>Grundregeln: coacha inom din kompetens</b></p>
        <p>Min tumregel är att jag får anpassa träningen efter nästan allt, men att jag inte
          diagnostiserar eller behandlar någonting. Jag kan sänka volymen när atleten sover dåligt,
          men jag behandlar inte sömnproblem. Jag kan byta böj mot benpress när knät krånglar, men
          jag säger inte vad som är fel på knät. Jag kan ge allmänna kostråd, men jag skriver inte
          behandlingsupplägg.</p>
        <p>I Sverige är det lätt att se var gränsen går, eftersom fysioterapeut, legitimerad
          dietist, psykolog och läkare är skyddade yrkestitlar. "Nutritionist", "kostrådgivare" och
          "mental coach" är det inte, och där varierar kompetensen mycket.</p>

        <p className="mt-3"><b>Skador</b></p>
        <p>Jag behöver få veta var det gör ont och vad som provocerar smärtan. Jag
          anpassar övningar, belastning och rörelseomfång när det går att träna utan att
          besvären förvärras, och följer upp hur det utvecklas. Lätt och övergående träningsvärk eller
          stelhet som inte blir värre av träningen kan man oftast hantera med ändrad belastning.</p>
        <p>Här skickar jag vidare till fysioterapeut eller läkare:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Smärtan blir värre vecka för vecka, eller har inte blivit bättre efter ungefär två
            veckor med anpassad belastning.</li>
          <li>Det gör ont i vila eller på natten, eller det är svullet, varmt eller instabilt.</li>
          <li>Det domnar, sticker eller känns svagt i en arm eller ett ben.</li>
          <li>Något hände plötsligt under ett lyft, till exempel ett smäll- eller knäppljud, eller
            atleten kan inte längre belasta.</li>
          <li>Smärtan tvingar fram en förändrad teknik som inte går att rätta till.</li>
        </ul>
        <p>Akut via 1177 eller 112: Ryggsmärta som kommer tillsammans med domningar i underlivet
          eller problem att kissa eller bajsa, kraftig bröstsmärta eller andningssvårigheter.</p>

        <p className="mt-3"><b>Energi och kost</b></p>
        <p>Det här gör jag själv: Jag ger allmänna råd utifrån Livsmedelsverkets riktlinjer och
          grundläggande idrottsnutrition, som tillräckligt med energi, protein fördelat över dagen,
          kolhydrater kring passen och vätska. Jag följer vikt och prestation över tid. EAk i appen visar uppskattad
          styrka i förhållande till baslinjen; det mäter inte energitillgänglighet och kan inte
          avgöra om atleten får i sig tillräckligt med mat.</p>
        <p>Här skickar jag vidare till legitimerad dietist eller läkare:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tecken på låg energitillgänglighet (REDs): utebliven eller oregelbunden mens,
            upprepade stressfrakturer, oförklarlig trötthet, att man blir sjuk ofta, sjunkande
            prestation trots bra träning eller att vikten går ner fast den inte ska.</li>
          <li>Medicinska tillstånd som påverkar kosten, till exempel diabetes, celiaki, IBS,
            allergier eller graviditet.</li>
          <li>Tecken på ett stört förhållande till mat. Det kan vara stark oro kring mat, strikta
            regler, kompensationsträning, stora viktsvängningar eller att atleten döljer vad den
            äter. Då ger jag inga fler kostråd utan hänvisar till vården.
            Träningen får anpassas efter bedömningen där.</li>
        </ul>

        <p><b>REDs gäller även män.</b> Sänkt libido, uteblivna morgonerektioner och oförklarligt
          prestationstapp kan vara skäl att söka vård, särskilt tillsammans med trötthet eller
          återkommande skador. Symtomen kan ha andra orsaker; de räcker inte för en diagnos.
          REDs CAT2 är ett kliniskt bedömningsverktyg, inte en checklista för coachen.</p>

        <p className="mt-3"><b>När vardagen påverkar träningen</b></p>
        <p>Jag frågar om sömn, återhämtning och hur mycket tid som finns till passen.
          Om jobb eller annat gör en träningsvecka svår att få ihop anpassar vi schemat.
          Jag behöver veta hur det påverkar träningen, inte gå in i atletens privatliv.</p>
        <p>Här skickar jag vidare till psykolog, vårdcentral eller företagshälsovård:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nedstämdhet, oro eller sömnproblem som varar mer än ett par veckor eller påverkar
            vardagen.</li>
          <li>Tydlig personlighetsförändring, att atleten drar sig undan eller att intresset
            försvinner, även för träningen.</li>
          <li>Tävlingsångest eller prestationsångest som inte släpper trots anpassning.</li>
          <li>Alkohol, spel eller andra beroenden som påverkar livet.</li>
        </ul>
        <p>Om atleten pratar om att inte vilja leva eller om att skada sig själv: fråga rakt,
          ta det på allvar och hjälp till att få kontakt med vården. Vid omedelbar fara eller
          konkreta självmordsplaner, ring <b>112</b> eller sök psykiatrisk akutmottagning.
          Lämna inte personen ensam vid akut fara.</p>
        <p><a className="text-primary underline" href="https://mind.se/stod-kunskap/prata-eller-chatta-med-volontar/sjalvmordslinjen/"
          target="_blank" rel="noopener noreferrer">Självmordslinjen (Mind), 90101</a>,
          ger samtalsstöd. Det är ett komplement till vården, inte en ersättning för 112 vid akut fara.
          Ring 1177 om du behöver hjälp att hitta rätt vård.</p>

        <p className="mt-3"><b>Så lämnar du över på ett bra sätt</b></p>
        <p>Jag förklarar vad jag inte kan bedöma och vilken hjälp atleten behöver.
          Sedan följer jag upp vad det innebär för träningen.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ha kontaktnätet klart i förväg. Ha namnen på en fysioterapeut, en dietist och en
            psykolog du litar på innan du behöver dem. Det är mycket lättare att säga "ring Anna"
            än "sök hjälp någonstans".</li>
          <li>Säg varför, rakt och utan dramatik. "Det här ligger utanför vad jag kan bedöma, och
            jag vill att någon som kan det här tittar på det. Vi stämmer av vilken träning som är lämplig under tiden."</li>
          <li>Be om lov innan du delar information. Atleten bestämmer vad som får föras vidare
            mellan dig och vården.</li>
          <li>Följ en plan. Jag anpassar träningen efter vad den som behandlar säger, och inte
            tvärtom. Be om konkreta ramar, till exempel vilka rörelser som är okej, vilken
            belastning som gäller och vilka tecken som betyder stopp.</li>
          <li>Följ upp vilka ramar som gäller för träningen. Anteckna bara det som behövs för
            planeringen, inte hela vårdbesöket.</li>
        </ul>

        <p className="mt-3"><b>I SETPOINT</b></p>
        <p>Jag antecknar de anpassningar som behövs för träningen och följer upp om de
          fungerar. Medicinska bedömningar hör till vården. Dela bara de uppgifter som
          behövs för planeringen och som atleten har godkänt att du delar.</p>
        <p className="mt-3"><b>Hälsoanteckningar och samtycke</b></p>
        <p>Skade- och hälsoanteckningar är känsliga personuppgifter. Innan de sparas behöver
          den som ansvarar för uppgifterna ha en rättslig grund enligt GDPR artikel 6 och
          ett tillämpligt undantag enligt artikel 9. För coaching kan uttryckligt samtycke
          vara det undantaget. Det ska vara frivilligt, tydligt och gå att återkalla.</p>
        <p>Förklara vad som sparas, varför, vilka som får läsa och hur länge uppgifterna behövs.
          Begränsa åtkomsten, bestäm en gallringsplan och dela inte mer än nödvändigt.
          Vid återkallat samtycke ska den behandling som bygger på samtycket upphöra;
          uppgifter utan annan giltig grund ska raderas. Den här texten ersätter inte ett
          samtyckesförfarande eller en kontroll av appens hantering.</p>
        <p className="text-xs">Källa: <a className="text-primary underline" target="_blank" rel="noopener noreferrer"
          href="https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/kansliga-personuppgifter/nar-far-ni-behandla-kansliga-personuppgifter/">IMY — när får ni behandla känsliga personuppgifter?</a></p>
      </Section>

      <Section title="Val och återkoppling under träningen">
        <p>Ge val där båda alternativen fungerar. Atleten kan till exempel välja mellan två
          överenskomna assistansövningar eller deras ordning. Tävlingslyftets plats, belastning
          och säkerhetskrav behöver inte vara förhandlingsbara. Förklara varför ramen finns.
          Mageau och Vallerand beskriver hur val, tydliga ramar och stöd kan stärka motivationen;
          deras artikel är en modell, inte ett bevis för att varje val ger bättre prestation.</p>
        <p>Återkoppla även efter set som fungerar: ”Du höll bröstet uppe genom vändningen.”
          Testa en kort cue som ”tryck bort golvet”, och fråga om den hjälpte. Externt fokus
          och valmöjligheter har stöd i forskning om motorisk inlärning, men resultaten från
          enklare uppgifter bevisar inte att samma cue passar alla erfarna styrkelyftare.</p>
      </Section>

      <Section title="Sömn, dagsform och besvär">
        <p>Gå igenom sömn, stress, ömhet och motivation före passet. Jämför med atletens
          vanliga nivå och med hur uppvärmningen går, inte med ett generellt idealvärde.
          Självskattningar kan fånga förändringar som andra mått missar, men de kan inte
          avgöra orsaken. EAk beskriver uppskattad styrka, inte hälsa.</p>
        <p>Flera korta nätter i rad är anledning att fråga vad som har förändrats och om
          träningen behöver anpassas. Sju timmar är ingen skarp gräns för alla atleter.
          Ihållande sömnproblem hör till vården, inte till ett nytt träningsupplägg.</p>
        <p>Fråga varje vecka om besvär: vad provocerar dem, vad har ändrats och hur fungerade
          anpassningen? Strömbäcks studie visar att besvär är vanliga bland styrkelyftare och
          ofta påverkar träningen. Att många tränar vidare betyder inte att all smärta är ofarlig.
          Följ remissråden ovan när besvären kräver bedömning.</p>
        <p>Psykisk ohälsa bedöms och behandlas av vården. Träning kan ibland fortsätta med
          anpassning och rätt stöd, men det avgörs individuellt. IOC:s verifierade konsensus
          från 2019 är underlaget här; den angivna 2026-referensen har inte kunnat bekräftas.</p>
      </Section>

      <Section title="Mat, tillskott och individuella skillnader">
        <p><b>Protein:</b> omkring 1,6 g/kg kroppsvikt och dag i totalt intag är ett rimligt
          allmänt riktvärde för friska vuxna som styrketränar. Det kommer från ett gruppresultat,
          inte ett exakt behov eller ett tak för varje atlet. Vanlig mat räknas; proteintillskott
          är inget krav. Tillräcklig energi och kolhydrater spelar också roll.</p>
        <p><b>Kosttillskott:</b> kreatin och koffein har stöd i vissa prestationssammanhang.
          Nitrat och buffertsubstanser har mer uppgiftsspecifika användningar; inget av detta
          är en standardlista för styrkelyftare. Kontrollera behov, biverkningar och tävlingsregler.
          Kontaminerade produkter kan innehålla förbjudna ämnen. Oberoende batchtestning minskar
          risken men garanterar inte att en produkt är säker eller dopingfri.</p>
        <p><b>REDs:</b> en atlet kan få för lite energi utan att vara underviktig. Låg
          kolhydrattillgång kan också påverka. Vid misstanke hänvisar jag till läkare och
          legitimerad dietist i stället för att ge en egen diagnos eller behandlingsdiet.</p>
        <p><b>P-piller:</b> gruppresultaten visar små och varierande effekter på prestation.
          Lägg inte samma regel på alla. Följ upp om atleten själv märker en skillnad;
          val eller byte av preventivmedel diskuteras med barnmorska eller läkare.</p>
      </Section>

      <Section title="Ansträngning, toppning och kondition">
        <p><b>Närhet till failure:</b> styrka kan utvecklas utan att alla set körs till stopp.
          För muskeltillväxt verkar närmare failure ofta ge mer stimulus, men exakt var
          nyttan planar ut är osäkert. RPE 8–9 kan passa vissa assistans- och volymset,
          om teknik och återhämtning håller. Det är ett coachval, inte ett nytt automatiskt
          RPE-tak i generatorn.</p>
        <p><b>Toppning:</b> forskningen för maximal styrka är begränsad. Följ upp hur den
          minskade volymen, sista tunga passet och vilodagarna fungerade, tillsammans med
          tävlingsresultatet. Använd det när nästa toppning planeras. Tunga singlar kan
          hjälpa vissa att känna sig förberedda, men behöver inte vara obligatoriska.</p>
        <p><b>Kombinerad löpning och styrka:</b> effekten beror på mängd, intensitet,
          återhämtning och vad som ska prioriteras. Lundbergs analys fann möjlig påverkan
          på muskelfibrernas tillväxt, tydligare med löpning än cykling. Det är inte samma
          sak som att all löpning försämrar styrka. Om benen inte återhämtar sig i ett
          hypertrofiblock kan cykling vara ett alternativ. Planera hårda löppass och tunga
          benpass så att atleten kan genomföra båda med kvalitet.</p>
      </Section>

      <Section title="Källor till coachråden">
        <ul className="list-disc pl-5 space-y-2">
          <li>Mageau GA, Vallerand RJ (2003). <em>The coach–athlete relationship: a motivational model.</em> J Sports Sci 21(11).</li>
          <li>Wulf G et al. (2018). <em>Triple play: Additive contributions of enhanced expectancies, autonomy support, and external attentional focus to motor learning.</em> Q J Exp Psychol 71(4).</li>
          <li>Saw AE, Main LC, Gastin PB (2016). <em>Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures.</em> BJSM 50(5).</li>
          <li>Walsh NP et al. (2021). <em>Sleep and the athlete: narrative review and 2021 expert consensus recommendations.</em> BJSM.</li>
          <li>Morton RW et al. (2018). <em>A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults.</em> BJSM 52(6).</li>
          <li>Maughan RJ et al. (2018). <em>IOC consensus statement: dietary supplements and the high-performance athlete.</em> Int J Sport Nutr Exerc Metab 28(2).</li>
          <li>Mountjoy M et al. (2023). <em>2023 IOC's consensus statement on Relative Energy Deficiency in Sport (REDs).</em> BJSM 57(17).</li>
          <li>Reardon CL et al. (2019). <a className="text-primary underline" target="_blank" rel="noopener noreferrer" href="https://pubmed.ncbi.nlm.nih.gov/31097450/">Mental health in elite athletes: International Olympic Committee consensus statement (2019).</a> BJSM 53(11).</li>
          <li>Strömbäck E et al. (2018). <em>Prevalence and Consequences of Injuries in Powerlifting: A Cross-sectional Study.</em> Orthop J Sports Med 6(5).</li>
          <li>Robinson ZP et al. (2024). <em>Exploring the Dose–Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions.</em> Sports Med 54(9).</li>
          <li>Refalo MC et al. (2023). <em>Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis.</em> Sports Med 53(3).</li>
          <li>Travis SK et al. (2020). <em>Tapering and Peaking Maximal Strength for Powerlifting Performance: A Review.</em> Sports 8(9).</li>
          <li>Lundberg TR et al. (2022). <em>The Effects of Concurrent Aerobic and Strength Training on Muscle Fiber Hypertrophy: A Systematic Review and Meta-Analysis.</em> Sports Med 52(10).</li>
          <li>Elliott-Sale KJ et al. (2020). <em>The Effects of Oral Contraceptives on Exercise Performance in Women: A Systematic Review and Meta-analysis.</em> Sports Med 50(10).</li>
        </ul>
        <p>Översikter och konsensus sammanfattar grupper och flera typer av studier.
          De ersätter inte en individuell bedömning och validerar inte appens egna trösklar.</p>
      </Section>

      <Section title="Träningslast: Foster sRPE">
        <p>Fosters metod: <code>last = minuter × pass-RPE</code>. Atleten skattar hela
          passets ansträngning cirka 30 minuter efter avslut, inte bara det hårdaste setet.</p>
        <p>När faktiska segmentvärden finns använder appen en tidsviktad segmentsumma.
          Det är en egen beräkningsvariant, inte samma mätprotokoll som Foster validerade.</p>
        <p>Vi använder aldrig <code>peak_rpe</code> i fallback-kedjan — den överskattar last.</p>
      </Section>

      <Section title="ACWR — förändring i träningslast">
        <Formula>
{`acute   = summa sRPE senaste 7 dagarna
chronic = (snitt daglig last senaste 28 dagarna) × 7
ratio   = acute / chronic`}
        </Formula>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>&lt; 0,8</b> lägre last än den senaste referensperioden</li>
          <li><b>0,8–1,3</b> nära referensperiodens last</li>
          <li><b>1,3–1,5</b> högre last</li>
          <li><b>&gt; 1,5</b> tydligt högre last</li>
        </ul>
        <p>Gränserna kommer från ett omdiskuterat ramverk med mycket data från lagidrott.
          De är inte validerade säkerhetszoner för löpning eller styrkelyft. ACWR kan inte
          förutsäga om en enskild atlet skadar sig och bör inte ensamt styra träningen.</p>
        <p>Appen visar inget förhållande förrän kronisk last är över 50 AU. Det är vår
          egen spärr mot en liten nämnare, inte en forskningsbaserad gräns från Hulin.
          De befintliga justeringsreglerna ändras inte av den här textgranskningen.</p>
      </Section>

      <Section title="Banister fitness/fatigue (CTL/ATL/TSB)">
        <Formula>
{`CTL = EMA av daglig last,  τ = 42 dagar  → "fitness"
ATL = EMA av daglig last,  τ = 7 dagar   → "fatigue"
TSB = CTL − ATL                          → "form"  (positiv = fresh)`}
        </Formula>
        <p>60 dagars warm-up före synligt fönster så CTL hinner stabilisera sig.</p>
        <p>42 och 7 dagar är konventioner i prestationsdiagram, inte universella biologiska
          konstanter från Banister. Originalmodellen anpassade tidskonstanterna individuellt.
          Diagrammet uppskattar belastningshistorik, inte faktisk fitness eller trötthet.</p>
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

      <Section title="Räkneexempel — ACWR efter en tung vecka">
        <p>Senaste 7 dagar: 4 pass à 60 min RPE 7 + 1 långpass 120 min RPE 6.</p>
        <Formula>
{`acute   = 4 × (60 × 7) + 1 × (120 × 6)
        = 1680 + 720 = 2400 AU
chronic = (snitt 28d ~ 280 AU/dag) × 7 = 1960 AU
ratio   = 2400 / 1960 = 1.22  → nära referensperiodens last`}
        </Formula>
        <p>På en kronisk bas på 1200 AU blir förhållandet 2,0: dubbla referenslasten.
          Det säger inte hur stor skaderisken är. Kontrollera datatäckning, dagsform,
          besvär och vad lastökningen består av innan träningen ändras.</p>
      </Section>

      <Section title="Beslutsdiagram — drift → retune">
        <Formula>
{`           ┌─────────────────────────────┐
           │  5 senaste kvalitetspass    │
           │  delta_i = actual − planned │
           └──────────────┬──────────────┘
                          │
              avgDelta, n_drifted (Δ ≥ 1)
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
  avgΔ ≥ +1.5         avgΔ ≥ +1.0        annars
  ELLER ≥ 4/5         ELLER ≥ 3/5
        │                 │                  │
        ▼                 ▼                  ▼
  reduce_volume       easy_week           hold
   × 0.85              × 0.90            × 1.00
        │                 │                  │
        └─────────┬───────┴──────────────────┘
                  ▼
   kombinera med ACWR-faktor (konservativast vinner)
                  ▼
   klamp [0.75, 1.10]  →  skala 28d planerade pass`}
        </Formula>
      </Section>

      <Section title="Antaganden & begränsningar">
        <ul className="list-disc pl-5 space-y-1">
          <li>VDOT är validerad för 1500 m – maraton. Ultra/track-sprint avviker.</li>
          <li>EAkoefficient antar samma rörelse som baseline-test (samma bar, samma djup).</li>
          <li>Fosters protokoll använder pass-RPE cirka 30 minuter efter passet. Håll
            tidpunkten konsekvent; senare skattningar är inte automatiskt oanvändbara.</li>
          <li>ACWR beskriver relativ last. Det saknar validerade individuella
            skaderiskgränser. Appens 28-dagars referens är ett beräkningsval.</li>
          <li>Re-tune rör aldrig race-passet eller pass markerade som testfönster.</li>
          <li>HIIT-tungt schema vid låg volym förutsätter att atleten är skadefri — vid
            ACWR &gt; 1.3 prioriterar systemet alltid easy oavsett volymbucket.</li>
        </ul>
      </Section>

      <Section title="Forskningsgrund — coachning & ledarskap">
        <p>De idrottsspecifika källorna finns i ”Källor till coachråden” ovan. Listan nedan
          är kompletterande läsning, främst om arbetsliv och organisationer. Den ger inte
          direkt stöd för att samma arbetssätt förbättrar en styrkelyftares resultat.</p>
        <p className="font-semibold text-foreground mt-3">Självledarskap och rolltagning</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Sundlin AL, Sundlin P. (2018). <em>Ta din roll på jobbet</em>. Liber.</li>
          <li>Sundlin AL, Sundlin P. (2020). <em>Jaget och jobbet</em>. Liber.</li>
          <li>Sandahl C, Falkenström E, Knorring M. (2017). <em>Chef med känsla och
            förnuft — om professionalism och etik i ledarskap</em>, 2 uppl. Natur och Kultur.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Ledarskap</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Söderfjäll S. (2012). <em>Behovsanpassat ledarskap</em>.</li>
          <li>Söderfjäll S. (2018). <em>En liten bok om ledarskap</em>.</li>
          <li>Savén B. (2020). <em>Bygga ledarskap</em>.</li>
          <li>Gospic K. (2015). <em>Neuroledarskap</em>. Natur & Kultur.</li>
          <li>Bushe G. (2010). <em>Klart ledarskap</em>. Ekerlids.</li>
          <li>Lowe KB. (1996). <em>Effectiveness correlates of transformational and
            transactional leadership: A meta-analytic review</em>. The Leadership Quarterly 7(3).</li>
          <li>Ng TWH. (2017). <em>Transformational leadership and performance outcomes</em>.
            The Leadership Quarterly 28(3).</li>
          <li>Piccolo RF et al. (2012). <em>The relative impact of complementary leader
            behaviors</em>. The Leadership Quarterly 23(3).</li>
          <li>Bass BM, Avolio BJ. (1994). <em>Improving organizational effectiveness
            through transformational leadership</em>. Sage.</li>
          <li>Bass BM. (1997). <em>Does the transactional-transformational leadership
            paradigm transcend organizational and national boundaries?</em> American
            Psychologist 52(2).</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Kommunikation</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Benjamin BE, Yeager A, Simon A. (2015). <em>Klar kommunikation — SAVI</em>.
            Studentlitteratur.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Psykologisk trygghet</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Edmondson AC. (2018). <em>The Fearless Organization</em>. Wiley.</li>
          <li>Porath CL. (2016). <em>Mastering Civility</em>. Grand Central Publishing.</li>
          <li>Edmondson AC, Nickisch C. (2019). <em>Creating psychological safety in the
            workplace</em>. Harvard Business Review.</li>
          <li>Frazier ML et al. (2016). <em>Psychological safety: A meta-analytic review
            and extension</em>. Personnel Psychology.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Team</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Wheelan SA. (2010). <em>Att bygga effektiva team</em>. Studentlitteratur.</li>
          <li>Wheelan SA. (2005). <em>Group Processes: A Developmental Perspective</em>,
            2nd ed. Allyn & Bacon.</li>
          <li>Söderfjäll S. (2017). <em>To team or not to team</em>. Type and Tell.</li>
          <li>Jacobsson C, Åkerlund M. (2019). <em>Teamutveckling i teori och praktik</em>.
            Natur och Kultur.</li>
          <li>Edmondson AC. (2012). <em>Teaming</em>. Pfeiffer Wiley.</li>
          <li>De Jong BA, Dirks KT, Gillespie N. (2016). <em>Trust and team performance:
            a meta-analysis</em>. Journal of Applied Psychology 101(8).</li>
          <li>Lacerenza CN et al. (2018). <em>Team development interventions</em>.
            American Psychologist 73(4).</li>
          <li>Burke CS et al. (2006). <em>What type of leadership behaviors are functional
            in teams?</em> The Leadership Quarterly 17(3).</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Relationell koordinering och mentalisering</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Hoffer Gittell J. (2016). <em>Transforming Relationships for High Performance</em>.
            Stanford University Press.</li>
          <li>Tomasello M. (2009). <em>Why We Cooperate</em>. MIT Press.</li>
          <li>Sapolsky RM. (2018). <em>Varför vi beter oss som vi gör</em>. Natur och Kultur.</li>
          <li>Swami V. (2013). <em>Evolutionspsykologi — en kritisk introduktion</em>.
            Studentlitteratur.</li>
          <li>Tomasello M, Rakoczy H. (2003). <em>What makes human cognition unique?</em>
            Mind and Language 18.</li>
        </ul>
      </Section>

      <Section title="Forskningsgrund — träningsstyrning">
        <p className="font-semibold text-foreground mt-3">Foster sRPE (träningslast)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Foster C et al. (2001). <em>A New Approach to Monitoring Exercise Training</em>.
            J Strength Cond Res 15(1). Originalet för <code>load = min × RPE</code>.</li>
          <li>Haddad M et al. (2017). <em>Session-RPE Method for Training Load Monitoring:
            Validity, Ecological Usefulness, and Influencing Factors</em>. Front Neurosci 11.
            Bekräftar validitet mot HR-baserad TRIMP r = 0.75–0.90.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">ACWR — akut:kronisk last</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Gabbett TJ. (2016). <em>The training-injury prevention paradox</em>.
            BJSM 50(5). Ramverket bygger främst på lagidrott och validerar inte
            säkra ACWR-gränser för löpning eller styrkelyft.</li>
          <li>Hulin BT et al. (2016). <em>The acute:chronic workload ratio predicts injury</em>.
            BJSM 50. Samband i elit-rugby league; studien stöder inte appens 50 AU-spärr.</li>
          <li>Impellizzeri FM et al. (2020). <em>Acute:Chronic Workload Ratio: Conceptual
            Issues and Fundamental Pitfalls</em>. IJSPP 15(6). Kritik av kvotens
            statistiska och kausala tolkning, inte stöd för en 28-dagars uppvärmning.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Banister fitness/fatigue (CTL/ATL/TSB)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Banister EW. (1991). <em>Modeling Elite Athletic Performance</em>.
            Originalmodellen med individuellt anpassade tidskonstanter.</li>
          <li>TrainingPeaks/Coggan, Performance Management Chart. Praktisk
            CTL/ATL/TSB-konvention med 42/7 dagar, inte en universellt validerad modell.</li>
          <li>Busso T. (2003). <em>Variable dose-response relationship between exercise
            training and performance</em>. MSSE 35.</li>
        </ul>
      </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
