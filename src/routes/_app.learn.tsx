import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoachingInformation } from "@/components/CoachingInformation";

export const Route = createFileRoute("/_app/learn")({
  head: () => ({
    meta: [
      { title: "Lär dig: RPE, RIR, block, deload och toppning — SETPOINT" },
      { name: "description", content: "Enkla förklaringar av begreppen i ditt träningsprogram." },
      { property: "og:title", content: "Lär dig träningsbegreppen — SETPOINT" },
      { property: "og:description", content: "Enkla förklaringar av RPE, RIR, block, deload och toppning." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LearnPage,
});

function Topic({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

const RPE_ROWS: [string, string, string][] = [
  ["10", "0", "Max. Inga fler reps, ingen mer vikt."],
  ["9.5", "0", "Ingen rep till, men lite mer vikt hade kanske gått."],
  ["9", "1", "En rep kvar i tanken."],
  ["8", "2", "Två reps kvar. Typiskt tungt arbetsset."],
  ["7", "3", "Tre reps kvar. Snabbt och kontrollerat."],
  ["6 och lägre", "4+", "Uppvärmning eller teknikträning."],
];

function LearnPage() {
  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-semibold">Lär dig begreppen</h1>
        <p className="text-sm text-muted-foreground">Det här betyder orden i ditt program.</p>
      </div>

      <div className="border-b border-border pb-6"><CoachingInformation /></div>

      <Topic title="Uppvärmning för styrkelyft (10–15 min)">
        <p>Börja med hela kroppen och värm sedan upp med stången. Håll uppvärmningen kort så att du har energi kvar till arbetsseten.</p>
        <p className="font-medium text-foreground">1. Puls (3–5 min)</p>
        <p>Cykel, roddmaskin eller rask promenad tills du blir lite varm.</p>
        <p className="font-medium text-foreground">2. Rörlighet och aktivering (5 min, 1 varv)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cat–camel × 8 — rörlig rygg.</li>
          <li>World's greatest stretch × 5/sida — höft, bröstrygg.</li>
          <li>Djup knäböj med vikt framför bröstet (goblet) × 8 — häng i botten 2–3 s.</li>
          <li>Höftlyft (glute bridge) × 10.</li>
          <li>Band pull-apart × 15 + band dislocates × 10 — axlar inför bänk.</li>
          <li>Dead bug × 6/sida — bål och andning.</li>
        </ul>
        <p className="font-medium text-foreground">3. Specifik uppvärmning med stången</p>
        <p>Öka stegvis mot dagens första arbetsset, med färre reps ju tyngre det blir. Exempel mot 150 kg × 5:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Tom stång × 10 · 60 kg × 5 · 90 kg × 3 · 115 kg × 2 · 135 kg × 1 · sedan arbetsset.</li>
          <li>Ungefär 40 / 60 / 75 / 90 % av arbetsvikten. Vila kort i början, längre mot slutet.</li>
          <li>Nästa lyft i passet behöver bara 2–3 uppvärmningsset — du är redan varm.</li>
        </ul>
        <p>Långa statiska stretchar precis före tunga lyft behövs inte. Spara dem till efter passet om du vill.</p>
      </Topic>

      <Topic title="RPE — hur tungt var setet?">
        <p>RPE (Rating of Perceived Exertion) är en skala 1–10 för hur ansträngande ett set var. I styrketräning
          betyder den i praktiken: <strong>hur många reps hade du kvar?</strong></p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-foreground"><tr><th className="py-1 pr-3">RPE</th><th className="pr-3">Reps kvar</th><th>Känsla</th></tr></thead>
            <tbody>
              {RPE_ROWS.map(([r, rir, d]) => (
                <tr key={r} className="border-t border-border"><td className="py-1 pr-3 font-medium text-foreground">{r}</td><td className="pr-3">{rir}</td><td>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Står det "3×5 @ RPE 8" väljer du en vikt där du har ungefär två reps kvar efter femte repen. Känns
          dagen tung tar du ner vikten, känns den lätt går du upp.</p>
      </Topic>

      <Topic title="RIR — reps in reserve">
        <p>RIR är samma sak från andra hållet: antal reps du hade kvar. RIR 2 = RPE 8. Var ärlig — det är
          bättre att gissa en rep för lågt än att gå till fail varje set. Det blir lättare att bedöma med tiden.</p>
      </Topic>

      <Topic title="Block (mesocykel)">
        <p>Ett block är några veckor (oftast 3–6) med ett tydligt fokus, till exempel volym, styrka eller
          toppning. Inom blocket ökar belastningen gradvis. Efter blocket följer ofta en deload, sedan nästa block.</p>
      </Topic>

      <Topic title="Deload — planerad lätt vecka">
        <p>En deload är en medvetet lättare vecka: färre set och/eller lägre vikter. Syftet är att kroppen
          ska återhämta sig efter de tyngre veckorna.</p>
        <p>I appen märks de som <strong>"Planned light"</strong> och du får inga trötthetsvarningar de veckorna.</p>
      </Topic>

      <Topic title="Toppning inför tävling">
        <p>De sista ~3 veckorna före tävling minskar volymen stegvis medan vikterna hålls kvar: ungefär
          15 % mindre, sedan hälften, och tävlingsveckan bara två korta pass. Forskningen visar att det är
          volymsänkningen som gör dig pigg och stark på tävlingsdagen — tunga singlar behövs inte.</p>
        <p>Passen ska kännas lättare under toppningen. Den minskade volymen ger tid för återhämtning före tävlingen.</p>
      </Topic>

      <Topic title="E1RM och EAk">
        <p><strong>E1RM</strong> är ett uppskattat maxlyft räknat från setets vikt, reps och RPE med samma tabell som programmet använder, t.ex. 125 kg × 3 @ RPE 10 ≈ 136 kg. Det är ett uppskattat värde, inte ett testat max.</p>
        <p><strong>EAk</strong> jämför dagens set med din vanliga nivå. Över 100 % = starkare än vanligt, under = en
          tyngre dag. En enstaka låg dag betyder inget; det är trenden som räknas.</p>
      </Topic>

      <Topic title="Bra, Godtagbart och Trötthetsgräns">
        <p>När du loggar flera set av samma lyft jämför appen varje set med ditt första set den dagen.
          Tappar du mycket i styrka från set till set är det ett tecken på att du samlat på dig tillräckligt
          med trötthet för dagen.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Bra</strong> — setet ligger inom 4 % av första setet. Du håller kvaliteten.</li>
          <li><strong>Godtagbart</strong> — tapp på 4–5 %. Fortfarande okej, men nära gränsen.</li>
          <li><strong>Trötthetsgräns</strong> — tapp på 5 % eller mer. Dags att avsluta lyftet; fler set ger mest trötthet, inte mer träningseffekt.</li>
        </ul>
        <p>Det är därför siffran bygger på RPE: ett lättare set med färre reps kan vara lika tungt som ett
          tyngre med fler. Markeringen är en rekommendation, inte ett förbud — men sluta inte lyftet bara
          för att etiketten ändrar färg om du och coachen kommit överens om något annat.</p>
      </Topic>

      <Topic title="Huvudlyft, variationer och assistans">
        <p><strong>Huvudlyft</strong> är knäböj, bänk och mark. <strong>Variationer</strong> (pausböj, tempobänk,
          deficitmark) är egna övningar som tränar en viss del av lyftet. <strong>Assistans</strong> bygger muskler
          som hjälper lyften. Din coach väljer dem efter dina mål och hur du tränar.</p>
      </Topic>

      <Topic title="Sömn, mat och besvär">
        <p>Berätta för coachen om du sovit sämre än vanligt, känner dig ovanligt trött
          eller har ont. Jämför med hur du brukar må och hur uppvärmningen går.
          Ett lågt EAk-värde kan inte tala om varför ett pass känns tungt.</p>
        <p>För friska vuxna som styrketränar är omkring 1,6 g protein per kilo kroppsvikt
          och dag ett allmänt riktvärde, inte ett exakt krav. Vanlig mat räknas och
          proteinpulver behövs inte. Tillräckligt med mat, kolhydrater och sömn spelar också roll.</p>
        <p>Återkommande skador, oförklarlig trötthet eller prestationstapp kan behöva
          bedömas av vården. För lite energi kan drabba både kvinnor och män, även utan
          undervikt. Utebliven mens, sänkt libido eller uteblivna morgonerektioner kan
          vara skäl att söka hjälp; de kan också ha andra orsaker.</p>
        <p>Coachen kan anpassa träningen, men ställer inte medicinska diagnoser.
          Ring 1177 om du är osäker på var du ska söka vård. Vid akut fara, ring 112.</p>
      </Topic>

      <Topic title="Kosttillskott när du tävlar">
        <p>Tillskott är inget krav för att bli starkare. Även produkter som säljs öppet
          kan innehålla förbjudna ämnen som inte står på etiketten. Kontrollera
          tävlingsreglerna innan du använder något. Oberoende batchtestning minskar
          risken för kontaminering men är ingen garanti mot doping.</p>
      </Topic>

      <Topic title="Ha SETPOINT som app på mobilen">
        <p>Öppna <strong>eastyrka.lovable.app</strong> i mobilens webbläsare och lägg sidan på hemskärmen. Då får du en SETPOINT-ikon som öppnar träningen direkt.</p>
        <p className="font-medium text-foreground">iPhone (Safari)</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Öppna hemsidan i Safari.</li>
          <li>Tryck på Dela-symbolen (fyrkanten med pil uppåt). Skrolla ned i menyn.</li>
          <li>Välj <strong>Lägg till på hemskärmen</strong> och tryck på <strong>Lägg till</strong>.</li>
        </ol>
        <p className="font-medium text-foreground">Android (Chrome)</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Öppna hemsidan i Chrome.</li>
          <li>Tryck på de tre prickarna uppe till höger.</li>
          <li>Välj <strong>Installera app</strong> eller <strong>Lägg till på startskärmen</strong> och bekräfta.</li>
        </ol>
        <p>Du behöver fortfarande internet för att använda träningen. Inget behöver laddas ner från App Store eller Google Play.</p>
      </Topic>
    </div>
  );
}
