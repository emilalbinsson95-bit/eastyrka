import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoachingInformation } from "@/components/CoachingInformation";
import { RoutineLauncher } from "@/components/RoutinePlayer";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/learn")({
  head: () => ({
    meta: [
      { title: "Lär dig: RPE, RIR, block, deload, toppning och morgonflow — SETPOINT" },
      { name: "description", content: "Enkla förklaringar av begreppen i ditt träningsprogram, samt morgonflödet med steg för steg." },
      { property: "og:title", content: "Lär dig träningsbegreppen — SETPOINT" },
      { property: "og:description", content: "Enkla förklaringar av RPE, RIR, block, deload och toppning, plus morgonflödet steg för steg." },
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

      <Topic title="Morgonflow — rörelser innan träningen (lång ca 14 min · kort ca 8 min)">
        <p>Gör detta när du vaknar eller strax innan passet. Stegen märkta <em>ej i kort</em> hoppar du över i kortversionen; där doseringen skiljer sig står den under steget.</p>

        <p className="font-medium text-foreground">1. Goddess-stans med höft framåt (1 min)</p>
        <p>Stå brett, ungefär dubbla axelbredden, med tårna utåtvridna cirka 45 grader. Sjunk ner tills låren är nästan parallella med golvet. För aktivt knäna utåt så att de pekar åt samma håll som tårna. Tryck sedan fram höften och spänn sätet tills det öppnar i höftens framsida och insida lår. Börja högre och gå djupare under några andetag.</p>
        <p>Kort: gå ner gradvis i cirka 30 s. Avsluta med 2–3 sidolutningar per sida enligt steg 2.</p>

        <p className="font-medium text-foreground">2. Sidolutning i goddess-stans (45 s · ej i kort)</p>
        <p>Stå kvar i stansen. Luta överkroppen åt höger med armen över huvudet, och sedan åt vänster. Gör 3–4 lutningar per sida och stanna 2 andetag i varje. Höften står still, rörelsen sker i bålens sida.</p>

        <p className="font-medium text-foreground">3. Knästående bakåtlutning (45 s · ej i kort)</p>
        <p>Sätt dig på knä med vristerna platta mot golvet och sitt på hälarna. Sätt händerna bakom dig och luta dig sakta bakåt. Det töjer framsida lår och framsida skenben. Lyft gärna höften något för att öka töjningen i låret. Håll 30–45 s.</p>

        <p className="font-medium text-foreground">4. Katt–ko och thread the needle (1,5 min)</p>
        <p>Katt–ko: gå upp på alla fyra med händerna under axlarna och knäna under höfterna. Runda ryggen mot taket på utandningen och sjunk ner med bröstet fram på inandningen. Gör 6–8 långsamma repetitioner.</p>
        <p>Thread the needle: stå kvar på alla fyra. Sträck höger arm mot taket och följ handen med blicken. För sedan armen in under vänster arm och lägg ner axeln och tinningen mot golvet. Gör 5 per sida och stanna ett andetag i varje ytterläge.</p>
        <p>Kort: 5 katt–ko och 3 thread the needle per sida.</p>

        <p className="font-medium text-foreground">5. 90/90 till pigeon, aktivt (2 min · kort 1,5 min)</p>
        <p>Sitt på golvet med båda knäna böjda 90 grader: främre benet vinklat framför dig och bakre benet vinklat åt sidan. Sitt upprätt och luta dig lätt fram över det främre benet. Gå sedan aktivt över till pigeon, med det främre benet kvar och det bakre sträckt rakt bakåt. Pressa främre benet mot golvet för att aktivera sätet. Gå tillbaka till 90/90 och byt sida. Gör 3–4 övergångar per sida.</p>
        <p>Kort: 2 övergångar per sida.</p>

        <p className="font-medium text-foreground">6. Höftböjare i djupt utfall (1,5 min · kort 1 min)</p>
        <p>Stå i ett långt utfall med bakre knät strax ovanför golvet och bakre foten på tå. Spänn sätet på bakre benet och tryck fram höften. Håll bålen upprätt och svanka inte. Höftböjarstretchen ska kännas i framsidan av bakre höften. Håll 45 s per sida.</p>
        <p>Knäet får passera tårna i det djupa utfallet. Det är inte fel och inte farligt — låt det glida fram så långt det går utan att hälen lyfter, och känn hur stretchen flyttas upp mot framsidan av höften.</p>
        <p>Kort: 30 s per sida.</p>

        <p className="font-medium text-foreground">7. Baksida lår och vader (2 min · ej i kort)</p>
        <p>Baksida lår: från utfallet, för höften bakåt och sträck det främre benet med foten flexad. Håll ryggen rak och fäll fram från höften. Håll 30 s per sida.</p>
        <p>Vader: kliv tillbaka till ett kortare utfall med båda fötterna i golvet. Sträck bakre benet och tryck ner hälen i golvet (övre vaden, 20 s). Böj sedan bakre knät något med hälen kvar i golvet (nedre vaden, soleus, 20 s). Gör båda sidorna.</p>

        <p className="font-medium text-foreground">8. World's greatest stretch (2 min · kort 1,5 min)</p>
        <p>Gå ner i ett djupt utfall med höger fot fram. Sätt vänster hand i golvet bredvid främre foten. För höger armbåge ner mot insidan av höger fotled. Vrid sedan bröstet uppåt och sträck höger arm mot taket. Avsluta med att föra höften bakåt och sträcka främre benet. Gör 3 repetitioner per sida.</p>
        <p>Kort: 2 repetitioner per sida.</p>

        <p className="font-medium text-foreground">9. Djup huk med rörelse (1 min)</p>
        <p>Sätt dig så djupt du kan på huk med hälarna i golvet. Tryck fram knäna över tårna. Vagga sakta åt sidorna, framåt och bakåt. Håll ihop händerna framför bröstet och tryck armbågarna mot insidan av knäna. Om hälarna lyfter kan du stå lite bredare.</p>

        <p className="font-medium text-foreground">10. Cossack squats (1 min · ej i kort)</p>
        <p>Stå brett. Sjunk ner på ena benet medan det andra sträcks ut åt sidan med tårna mot taket. Håll hälen i golvet på det böjda benet och bröstet upprätt. Växla långsamt sida. Gör 5 per sida.</p>

        <p className="font-medium text-foreground">11. Framåtfällning med armsvep (45 s · ej i kort)</p>
        <p>Stå med fötterna höftbrett och raka ben, eller lätt böjda knän om baksidan är stram. Fäll fram och låt armar och huvud hänga tungt. Svep sakta med armarna från vänster till höger sida några gånger.</p>

        <p className="font-medium text-foreground">12. Upprullning och axelcirklar (1 min)</p>
        <p>Rulla upp sakta, kota för kota, med huvudet sist. Gör sedan 5 stora, långsamma armcirklar framåt och 5 bakåt, en arm i taget. Avsluta med att sträcka båda armarna mot taket och luta dig lätt åt höger och vänster.</p>
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
