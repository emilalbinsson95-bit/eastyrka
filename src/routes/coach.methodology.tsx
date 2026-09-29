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
        <p>För att inte ett enskilt grymt intervall ska spika estimatet använder vi EWMA
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
        <p className="mt-2"><b>Auto-flytande baseline (trögt):</b> när atleten har samlat
          ≥ 12 set-1-pass med EAk ≥ 103 % efter senaste baseline-ändringen höjs baseline
          till <code>median(peak-E1RM) × 0.98</code>, avrundat till 0.5 kg. Endast höjningar
          tillåts; coach hanterar nedjusteringar manuellt. Enstaka topp-pass flyttar
          alltså aldrig baseline — det krävs sustained progression.</p>
      </Section>

      <Section title="RPE → %1RM (RTS / Helms-tabell)">
        <p>Föreskriven vikt vid given RPE och rep-mål använder standard-tabellen
          (RPE 10 @ 1 rep = 100 %). Vi snappar RPE nedåt till närmsta 0.5 i [6, 10],
          klampar reps till [1, 12], och avrundar vikten till närmsta 2.5 kg.</p>
        <p>RIR konverteras till RPE som <code>RPE = 10 − RIR</code> (klampat till ≥ 6).</p>
      </Section>

      <Section title="Räkneexempel — EAkoefficient">
        <p>Atlet med baseline 1RM knäböj 150 kg. Idag: 130 kg × 5 reps @ RPE 8.</p>
        <Formula>
{`E1RM = 130 × (1 + (5 + (10 − 8)) / 30)
     = 130 × (1 + 7/30)
     = 130 × 1.2333
     = 160.3 kg
EAk  = 160.3 / 150 × 100 = 106.9 %  → Peaking`}
        </Formula>
        <p>Tolkning: dagsformen är 6.9 % över baseline → grönt ljus för tungt set
          eller test, men logga och se om det håller två pass i rad innan baseline justeras.</p>
      </Section>

      <Section title="Forskningsgrund — styrka">
        <p className="font-semibold text-foreground mt-3">Epley 1RM-formel (EAkoefficient)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Epley B. (1985). <em>Poundage Chart</em>. Boyd Epley Workout. Original-källan
            till <code>1RM = vikt × (1 + reps/30)</code>.</li>
          <li>LeSuer DA et al. (1997). <em>The Accuracy of Prediction Equations for
            Estimating 1-RM Performance in the Bench Press, Squat, and Deadlift</em>.
            J Strength Cond Res 11(4). Visar att Epley håller r &gt; 0.95 upp till ~10 reps —
            varför vi klampar reps till 8.</li>
          <li>Helms ER et al. (2016). <em>RPE and Velocity Relationships for the Back Squat,
            Bench Press, and Deadlift in Powerlifters</em>. J Strength Cond Res 30(11).
            Validerar RIR-baserad RPE som autoregleringsmått — grunden för
            <code>RPE = 10 − RIR</code>.</li>
          <li>Zourdos MC et al. (2016). <em>Novel Resistance Training-Specific Rating of
            Perceived Exertion Scale Measuring Repetitions in Reserve</em>. JSCR 30(1).
            Definierar RPE@reps-tabellen vi använder för preskription.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Autoregulering & RIR-baserad styrka</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Helms ER et al. (2018). <em>Application of the RIR-Based RPE Scale for
            Resistance Training</em>. Strength Cond J 38. Motiverar &gt; 102 % E1RM
            regelbundet som legitimt peaking-signal — vår auto-flytande baseline-tröskel.</li>
          <li>Greig L et al. (2020). <em>Autoregulation in resistance training: addressing
            the inconsistencies</em>. Sports Med 50. Varför vi kräver ≥ 12 observationer
            innan baseline justeras (signal vs. brus).</li>
        </ul>
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
      <Section title="Målet: en atlet som klarar sig själv">
        <p>Den bästa coachen är den som till slut inte behövs. Jag har sammanfattat
          mitt sätt att coacha i sex principer. De bygger på källorna under varje
          rubrik.</p>

        <p className="mt-3"><b>1. Anpassa ledarskapet efter atleten (Söderfjäll)</b></p>
        <p>En ny atlet behöver tydlig styrning. En erfaren atlet behöver mandat.
          Poängen med behovsanpassat ledarskap är att samma person kan behöva olika
          typer av ledning i olika frågor. Någon som har tränat i tio år kan vara
          helt självgående i sin knäböj men fortfarande behöva hjälp med att
          planera en tävlingstopp. Därför bedömer jag mognaden område för område
          och inte atleten som helhet.</p>
        <p>Mognad handlar om två saker: kompetens (vet atleten vad som ska göras
          och varför?) och engagemang (vill och orkar atleten ta ansvar för det?).
          Den som är ny men väldigt motiverad behöver främst instruktioner. Den som
          kan mycket men har tappat gnistan behöver snarare stöd och delaktighet än
          fler instruktioner. Det viktigaste är att trappa ner styrningen medvetet
          och säga det högt, till exempel "från nästa block planerar du dina
          accessoarer själv". Annars fortsätter coachen styra av gammal vana.</p>

        <p className="mt-3"><b>2. Bygg psykologisk trygghet först (Edmondson; Googles
          Project Aristotle)</b></p>
        <p>Atleten måste kunna berätta om smärta, missade pass och tvivel utan att
          det får negativa följder. Edmondson definierar psykologisk trygghet som
          en delad uppfattning om att det är säkert att ta mellanmänskliga risker,
          alltså att erkänna misstag, fråga och säga emot. I Googles Project
          Aristotle var det den faktor som betydde mest för om ett team fungerade,
          före både struktur och tydlighet.</p>
        <p>För oss är det framför allt en fråga om datakvalitet. Om atleten skriver
          RPE 7 när det egentligen var 9, eller hoppar över att logga knät som gjorde
          ont, får alla modeller (EAk, ACWR, drift) dåliga data och ger fel svar.
          Hur jag reagerar första gången någon rapporterar något jobbigt avgör om
          jag får veta det nästa gång. Tacka för informationen, var nyfiken och
          justera utan dramatik. Ett missat pass är något att lära av, inte ett
          misslyckande.</p>

        <p className="mt-3"><b>3. Lämna över rollen stegvis (Sundlin &amp; Sundlin)</b></p>
        <p>Atleten ska successivt ta över sina egna beslut i tre steg:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Logga ärligt. Atleten lär sig beskriva vad som faktiskt hände, alltså
            vikter, RPE, sömn och känsla, utan att försköna.</li>
          <li>Tolka sin egen dagsform. Atleten börjar se mönster, till exempel att
            tunga ben efter dålig sömn betyder att toppsetet kan sänkas en nivå.</li>
          <li>Föreslå egna justeringar. Atleten lägger fram förslag och jag granskar
            dem. Jag frågar hellre "varför?" än säger "nej".</li>
        </ul>
        <p>Hoppa inte över något steg. En atlet som inte loggar ärligt kan inte
          tolka sin form, och den som inte kan tolka sin form kan inte föreslå
          rimliga ändringar.</p>

        <p className="mt-3"><b>4. Kommunicera tydligt (SAVI, Benjamin &amp; Yeager)</b></p>
        <p>SAVI delar in det vi säger i sådant som ökar chansen att bli förstådd,
          som fakta, raka frågor, svar på frågan, att återge vad den andra sa och
          att berätta om egna upplevelser. Sedan finns det som minskar chansen, som
          anklagelser, sarkasm, retoriska frågor och "ja, men". I coachingen blir
          det en enkel ordning:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Säg vad du ser: "Stången åkte framåt på de två sista repsen."</li>
          <li>Säg vad du tror att det betyder: "Jag tror att bröstryggen tröttnar."</li>
          <li>Fråga hur atleten upplevde det: "Hur kändes det från ditt håll?"</li>
        </ul>
        <p>Först efter det kommer råden. Feedback som utgår från atletens egen
          bild fastnar bättre, och ibland visar det sig att atleten har en bättre
          förklaring än jag.</p>

        <p className="mt-3"><b>5. Balansera det inspirerande och det konkreta (Bass &amp;
          Avolio; Lowe m.fl. 1996; Ng 2017)</b></p>
        <p>Bass och Avolio skiljer mellan transformativt ledarskap, som bygger på
          mening, visioner och personlig utveckling, och transaktionellt
          ledarskap, som handlar om tydliga mål, uppföljning och belöning när man
          levererar. En atlet behöver båda. Meningen gör att man orkar ett helt år.
          Målen och uppföljningen gör att man vet vad som ska göras på tisdag.</p>
        <p>Forskningen stöder att de kompletterar varandra, men man ska inte påstå
          att det transaktionella är det som egentligen driver prestation. Lowe
          m.fl. (1996) fann tvärtom att transformativt ledarskap hade starkare
          samband med effektivitet. Inom det transaktionella är det också främst
          "belöning mot prestation" som fungerar, alltså tydliga överenskommelser
          och uppföljning. Att bara ingripa när något går fel ger betydligt sämre
          resultat. Så jag menar tydliga mål och ärlig uppföljning, inte straff.</p>

        <p className="mt-3"><b>6. Se coach och atlet som ett lag på två (Wheelan; Hoffer
          Gittell; Tomasello)</b></p>
        <p>Wheelan: Grupper går igenom faser, från osäkerhet och beroende via
          konflikt och förhandling till tillit och till slut produktivt arbete. Det
          gäller även en grupp på två. Den första friktionen, som när atleten
          ifrågasätter programmet, är ofta ett tecken på att relationen mognar och
          inte att något är fel.</p>
        <p>Hoffer Gittell: Relationell koordination bygger på delade mål, delad
          kunskap och ömsesidig respekt, och den bärs upp av kommunikation som är
          ofta, i tid, korrekt och inriktad på att lösa problem. Det fungerar
          bättre än instruktioner uppifrån.</p>
        <p>Tomasello: Människan är byggd för att samarbeta mot gemensamma mål. Den
          förmågan ska jag använda i stället för att coacha ovanifrån.</p>

        <p className="mt-3"><b>Så ser det ut i SETPOINT</b></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Fas 1: Jag loggar åt atleten och visar hur det görs.</li>
          <li>Fas 2: Atleten loggar själv och jag kommenterar.</li>
          <li>Fas 3: Atleten föreslår ändringar, till exempel via Review &amp;
            adjust, och jag godkänner dem.</li>
        </ul>
        <p>Målet är nått när atletens egna förslag stämmer med mina gång på gång.</p>
      </Section>

      <Section title="Tränaren som projektledare">
        <p>Som tränare ansvarar man för mer än programmet. Skador, energi och kost, sömn, stress och
          livet runt träningen påverkar resultatet minst lika mycket som valet av övningar. Jag ser
          därför tränarrollen som en projektledarroll. Jag håller ihop helheten, ser till att rätt
          person gör rätt sak och följer upp att det blir gjort. Men en projektledare gör inte allt
          själv. En stor del av jobbet är att veta var min kompetens tar slut och när jag ska lämna
          över till någon annan.</p>

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
        <p>Det här gör jag själv: Jag ser skaderapporter som information och inte som något
          misslyckande. Här blir den psykologiska tryggheten från förra avsnittet konkret. Jag
          anpassar övningar, belastning och rörelseomfång så att atleten kan fortsätta träna runt
          skadan, och jag följer smärtan över tid i loggen. Lätt och övergående träningsvärk eller
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
          kolhydrater kring passen och vätska. Jag följer vikt och prestation i loggen och kopplar
          ihop dem med EAk, alltså hur mycket energi som finns kvar till kroppen när träningen är
          betald.</p>
        <p>Här skickar jag vidare till legitimerad dietist eller läkare:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tecken på låg energitillgänglighet (RED-S): utebliven eller oregelbunden mens,
            upprepade stressfrakturer, oförklarlig trötthet, att man blir sjuk ofta, sjunkande
            prestation trots bra träning eller att vikten går ner fast den inte ska.</li>
          <li>Medicinska tillstånd som påverkar kosten, till exempel diabetes, celiaki, IBS,
            allergier eller graviditet.</li>
          <li>Tecken på ett stört förhållande till mat. Det kan vara stark oro kring mat, strikta
            regler, kompensationsträning, stora viktsvängningar eller att atleten döljer vad den
            äter. Då slutar jag ge kostråd helt. Skicka vidare, och fortsätt vara ett stöd i
            relationen.</li>
        </ul>

        <p className="mt-3"><b>Livsstil, stress och mående</b></p>
        <p>Det här gör jag själv: Jag frågar om sömn, stress, jobb och relationer som en del av
          uppföljningen. Jag anpassar träningen efter hur livet ser ut just nu, pratar om målbild
          och motivation och hjälper till med vanor och struktur. Det mesta av det här är vanligt
          tränarjobb, och SAVI-modellen gör de samtalen bättre.</p>
        <p>Här skickar jag vidare till psykolog, vårdcentral eller företagshälsovård:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nedstämdhet, oro eller sömnproblem som varar mer än ett par veckor eller påverkar
            vardagen.</li>
          <li>Tydlig personlighetsförändring, att atleten drar sig undan eller att intresset
            försvinner, även för träningen.</li>
          <li>Tävlingsångest eller prestationsångest som inte släpper trots anpassning.</li>
          <li>Alkohol, spel eller andra beroenden som påverkar livet.</li>
        </ul>
        <p>Akut via 112 eller psykiatrisk akutmottagning: Om atleten pratar om att inte vilja leva
          eller om att skada sig själv. Fråga rakt, ta det på allvar och se till att atleten får
          hjälp samma dag. Som tränare behöver du inte kunna hantera situationen. Du behöver se
          till att den inte stannar hos dig.</p>

        <p className="mt-3"><b>Så lämnar du över på ett bra sätt</b></p>
        <p>Att skicka vidare är inte att släppa taget, och det är där projektledarrollen syns som
          tydligast.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ha kontaktnätet klart i förväg. Ha namnen på en fysioterapeut, en dietist och en
            psykolog du litar på innan du behöver dem. Det är mycket lättare att säga "ring Anna"
            än "sök hjälp någonstans".</li>
          <li>Säg varför, rakt och utan dramatik. "Det här ligger utanför vad jag kan bedöma, och
            jag vill att någon som kan det här tittar på det. Vi fortsätter träna under tiden."</li>
          <li>Be om lov innan du delar information. Atleten bestämmer vad som får föras vidare
            mellan dig och vården.</li>
          <li>Följ en plan. Jag anpassar träningen efter vad den som behandlar säger, och inte
            tvärtom. Be om konkreta ramar, till exempel vilka rörelser som är okej, vilken
            belastning som gäller och vilka tecken som betyder stopp.</li>
          <li>Följ upp. Fråga hur besöket gick, logga det och stäm av med jämna mellanrum.</li>
        </ul>

        <p className="mt-3"><b>I SETPOINT</b></p>
        <p>Allt som gäller en skada, en remiss eller en anpassning loggas på samma ställe som
          träningen, så att helheten syns. Varningssignalerna ovan kan fungera som trafikljus i
          uppföljningen. Grönt betyder att vi anpassar själva, gult att vi följer upp extra noga
          och sätter en tidsgräns, och rött att vi skickar vidare nu. Det gör besluten mindre
          beroende av magkänsla och gör det tydligt för atleten varför vi gör som vi gör.</p>
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
ratio   = 2400 / 1960 = 1.22  → sweet spot`}
        </Formula>
        <p>Hade samma vecka kommit på en kronisk bas på 1200 AU blev ratio 2.0
          → danger, och drift-/retune-logiken skulle skala kommande veckor × 0.85.</p>
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
          <li>sRPE kräver att RPE loggas inom ~30 min efter passet — senare logg är brus.</li>
          <li>ACWR är ett <em>varningssystem</em>, inte en diagnos. Vi ratio:ar inte under 28 d data.</li>
          <li>Re-tune rör aldrig race-passet eller pass markerade som testfönster.</li>
          <li>HIIT-tungt schema vid låg volym förutsätter att atleten är skadefri — vid
            ACWR &gt; 1.3 prioriterar systemet alltid easy oavsett volymbucket.</li>
        </ul>
      </Section>

      <Section title="Forskningsgrund — coachning & ledarskap">
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
            BJSM 50(5). Källan till sweet-spot 0.8–1.3 och danger &gt; 1.5.</li>
          <li>Hulin BT et al. (2016). <em>The acute:chronic workload ratio predicts injury</em>.
            BJSM 50. Hög kronisk last skyddar — varför vi inte rapporterar ratio under
            chronic ≤ 50 AU.</li>
          <li>Impellizzeri FM et al. (2020). <em>What role do chronic workloads play in the
            ACWR?</em> Sports Med 50. Kritisk replik som motiverar 28-dagars warm-up
            och att vi presenterar ACWR som varning, inte diagnos.</li>
        </ul>

        <p className="font-semibold text-foreground mt-3">Banister fitness/fatigue (CTL/ATL/TSB)</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Banister EW. (1991). <em>Modeling Elite Athletic Performance</em>.
            Originalmodellen med τ = 42 / τ = 7-konstanterna.</li>
          <li>Coggan AR. (2003). <em>TrainingPeaks Performance Management Chart</em>.
            Operationaliseringen till CTL/ATL/TSB som vi följer.</li>
          <li>Busso T. (2003). <em>Variable dose-response relationship between exercise
            training and performance</em>. MSSE 35.</li>
        </ul>
      </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
