# Roadmap

## Tre vägar till utveckling (Emils dokument 2026-11-16, docs/)
Prioriterat efter nytta: först det som visar varför lyft står still, sedan det som ger push.
- [x] 1. Mått: hårda/lätta set, mängd, tunga set per huvudlyft och vecka (ordinerat/genomfört) + blockjämförelse i Analys → Volym. Bara visning. Tester med dokumentets siffror (57,8 / 19,9 / 2,7).
- [x] 1b (generatordelen). Mängd och tunga set per vecka mot referensen (snitt av tre senaste genomförda arbetsveckor; avlastning/toppning/innevarande vecka utesluts) i generatorns förhandsvisning.
- [x] 1b (atletdelen). Mängdgraf (12 veckor) i atletens Statistik och coachens statistikvy, samma beräkning som Analys.
- [x] 2. Varning "Inga tunga set" (två arbetsveckor i rad; ej avlastning/uppstart/toppning/startvecka/löparstyrka/helkropp 2 dgr) och "Mängd" (>30 % över referens) i generatorn; coach kan skapa ändå och stänga av tunga-set-varningen per atlet. Verifierat som Emil för Shadi och Mattis, av/på provat på Alex. 437 tester.
- [x] 3. Procent som styrning per rad (RPE/RIR/% i blockredigering och passredigering, vikt = baslinje × % avrundad till coachens steg, fast vikt i Idag, "Logga alla set som planerat" vid ≥4 set, förklaring i Information) + volymvakter som bara räknar hårda set (30-setstaket räknar alla). Alex: 10×10 @ 58 % gav 75 kg (baslinje 130) i redigering och Idag; tio set loggade och testdata borttagen.
- [x] 3b. Frivillig RPE på procentrader: krävs bara på första setet vid uppskattad RPE ≥ 7; set utan RPE visas som streck och räknas inte i snitt, max eller EAk. Alex loggade 4 × 10 @ 75 kg utan RPE (enstaka + "logga alla"), återläst som tomt i coachvyn; testdata borttagen.
- [x] 4. Byggövning (steg 6–7): katalogroll + viktsteg, tio standardövningar märkta (Dips skapad), generatorval per lyft (1–2 ggr, 2–5 set, repintervall, Lägg till/Ersätt), "Förra gången/Mål i dag" i Idag, kort i Analys → Volym, förklaring i Information. Alex: Standard powerlifting med benpress gav rad efter böj i v1–3, ingen i avlastning; 140 × 12, 11, 10 gav målet 34 reps och bekräftelse efter 12, 12, 10. Testblock arkiverat, testdata borttagen.
- [x] 5. RPE-tak (6–10, över taket föreslår 5 % lägre vikt) och max reps på sista setet (repsrekord per 2,5 %, >12 reps ger varken e1RM eller EAk, ≤12 @ RPE 9+ ger coachgodkänt maxförslag); push i fast procent (Push-typ i Viktprogression, alla huvudset samma vikt, över taket/missade reps = miss). Alex: fast procent sparad och återläst, sedan återställd. Tester med dokumentets siffror (165 kg × 80 % = 132,5).
- [x] 6. Procenttrappa per huvudlyft i generatorn (50/60/67,5 upptrappning, toppset 70/75/80/85 + 2,5 per varv, övriga dagar 62,5 % 5 × 4, avlastning 70 % halva set), procent per vecka redigerbar, spärrad mot push på samma lyft. Panel provad som Emil på Alex.
- [x] 7. Volymblock bänk: 21 pass (varannan dag 6 v / 3 dgr 7 v), setdos, intrappning, mätsingel, underhåll, mängdbekräftelse, "Backa tre pass" efter ≥5 dagars uppehåll (coach godkänner), maxförslag från pass 21, "Ingen mätning (procentblock)" i EAk. Alex: block skapat (21 pass, 75 kg = 58 % av 130), backning provad med loggade pass 1–4, sedan borttaget.
- [x] 8. Nyheter i appen: admin skriver/sparar utkast/publicerar per mottagare; användare ser nyheten en gång tills "Jag har läst". Två utkast (atleter, coacher) sparade, inte publicerade — Emil publicerar själv.
- [ ] Coachbeslut i dokumentet (setdos, mätsingel, max reps i böj/mark m.m.) — dokumentets förslag gäller tills Emil säger annat.

## Aktuellt
- [x] Saknade delar (Emil 2026-11-20): uppföljning mellan block (e1RM start→slut, följsamhet, RPE-avvikelse) på atletsidan och i Analys; förslag när ett lyft står still två avslutade block i rad (toppningar undantagna); varning för överlappande planer (passdatum) på atletsidan och blocklistan; kontroll före publicering (pass, vikter, volym, återhämtning, krockar) med "Publicera ändå". Provat som Emil på Mattis, Vincent, Hanna och Shadi utan att publicera. 526 tester.
- [x] Hannas block efter tävlingen: böj saknade vikt (namnmatchning), intrappningen sänkte hela vågen, dubbel smalgreppsbänk, avlastning med fler armset, tunga extraövningar/partials i uppstartsveckan, byggövning som trängde ut svagpunktsövning. Generatorn rättad, föreslagen vikt på RPE-rader (egen historik, annars andel av tävlingslyftet), blocket omgenererat och vecka 1 publicerad. 504 tester.
- [x] Tävlingsdag efter toppningen: kalenderpost + kort i Idag med uppvärmning till öppningen, coachens tre viktförslag per lyft och ifyllda försök (godkänt/underkänt, total). Alex: testtävling i dag, försök sparade och återlästa i Idag, kalendern och coachens Tävlingskort; testdata borttagen.
- [x] Coachvald startvecka (1 vecka, 2–4 dagar): en filmad maxtrea @RPE 10 per tävlingslyft + powerbuilding 3×8–12 @8; markstans följs, inga övriga modifierare/push. Valbar i generator och säsong (låst till 1 vecka). Alex: genererad och återläst (13 övningar, treor 1×3 @10 utan vikt), sedan arkiverad. 402 tester gröna.
- [x] Informationens RPE förtydligad med mål/faktisk ansträngning, startvikt och singlar; m/s förklaras utan loggfält eller ändrade träningsregler. Verifierat inloggad i atletvyn på dator/mobil utan körfel eller sidöverflöde; bygge OK.
- [x] Patient/fysio arkiverade utan dataradering: direktlänkar går till pausbesked; registrering, rollväxling och adminval dolda. Verifierat inloggad som Emil på dator/mobil, återgång till coach fungerar; aktiva atlet-/coachvägar testade i regeltester. 392 tester gröna och bygge OK.
- [x] Nya pushpass använder första setets startvikt och faktisk RPE, justerbara senare set; sänkning/hög RPE håller vikten utan miss. Avslut namnger lyftet och kräver loggade set eller valt stopp. RPE-only har tom vikt, coachvärdet heter Beräkningsmax. Sparad push-1.0 behåller gamla beslut/instruktioner. Alex 145→147,5 kg @7,5 gav push-2.0 beslut återläst via coachvyn, ångrat och kontrollen rensad. 369 tester gröna, bygge OK; atletens inloggade dagsplan inte slutprovad.
- [x] Mattis senaste block: sex opublicerade huvudordinationer i vecka 2–3 ändrade till böj 4×4/180 kg, bänk 4×4/115 kg och sumomark 4×3/192,5 kg @7,5; coachgodkänd push aktiverad med planettor 220/140/227,5. Böjvolym 7 set och övriga set oförändrade. Publicerat/loggar/baslinjer har identiska kontrollsummor före/efter. Återläst i coachvyn, 21 tester gröna. Push omräknar nu bara kommande draft-arbetsveckor.
- [x] Push-kärna: separat stanssäker planetta, coachval, fasta huvudset utan fler set, bekräftade arbetsset, bromsar, atomisk omräkning och ångra. Alex: inställning/generering/push 180→182,7/fyra kommande ordinationer/ångra återlästa; testset borttagna och testblock arkiverat. 362 tester gröna. Ingen verklig atlet aktiverad.
- [ ] Push-specens fortsättning: variantkvoter, stallförslag, strukturerade tävlingsresultat, fullständig datakvalitet/readiness och versionsfilter återstår; inte aktiverade i första införandet.
- [x] EAk-namnmatchning: gemensamma tävlingsnamn och utförandenoteringar inklusive / och ·; riktiga varianter utesluts även i signalmotorn, markstansbaslinjer/historik hålls separata. 343 tester gröna, bygge OK; Alex och verkliga Conventional Deadlift/Competition stance-rader återlästa med EAk 100,3 % och baslinje 260 utan körfel. Inga loggar, program eller baslinjer ändrade.
- [x] Justera Hannas och Shadis publicerade toppningsmark och ta bort Vincents ologgade extra böjpost efter hans genomförda SSB-pass; loggar bevarade och ändrade setantal återlästa i samtliga tre coachvyer utan körfel.
- [x] Grafer/tabeller 1–22: gemensamma mätset och EAk-gränser; samlade väntande beslut; historiska baslinjeband; setvolym/readiness; samlad belastning/PR/DOTS/vikt; tempointervall/rehab; separat toppningsuppföljning. 314 tester gröna och bygge OK. Alex återläste toppningsdatum, flagga, öppning och försök samt rehabgräns/sida; sparade träningsprogram och riktiga atletloggar orörda.
- [ ] Pausat på Emils begäran: rehabdiagram slutprov; patient/fysio är arkiverade tills han ber om återöppning.
- [ ] Genomför granskade generatorändringar 1–22 med skydd: gemensam beräkning (1–3, 14, 18–19, 21–22), tak/coachval (4–5, 11, 17), en D0-toppning (6–8, 15–16), coachbeslut/uppföljning (9–10, 12–13, 20). Verifiera med Alex Athlete; ändra aldrig loggar eller sparade program utan coachens bekräftelse.
- [x] Granska alla 22 förslag i Ändringar i SETPOINTs autogenerator: rapport klar med kodjämförelse, forskningsbegränsningar, rättad volymmatematik och konflikter kring D0/coachstyrning; 105 befintliga tester gröna. Ingen träningsregel eller sparat program ändrat.
- [x] EAk steg B del 1: databas (strategi per atlet, ömhet/motivation, pass-RPE/tid, uppvärmningsvikter, utökad beslutslogg med utfall), motorn läser allt, readiness frågar ömhet/motivation.
- [x] EAk steg B del 2: uppvärmningsvikter i atlet-/coachinställningar, exakt viktmatchning och RPE 6–10 i halvsteg i båda loggflödena; referensset undantas från arbetsset och EAk. Alex sparade/återläste 60 kg och loggade/återläste RPE 7,5; 48 relevanta tester och bygge gröna.
- [x] Steg B slutkontroll: Alex loggade ett separat publicerat kontrollpass och återläste RPE 7,5 / 45 minuter; coachbeslut återläst med plan_changed=true och föregående bänkutvärdering har sparat utfall −8,06 % / yellow.
- [x] EAk steg C: strategikort per atlet (sparad/återläst som coach), signalbrus/stödsignaler/belastningskurva/NFOR i analysvyn, obligatoriskt ja/nej före beslut och beskrivande beslutsöversikt (12 mån) i coachöversikten — allt provkört som coach för Alex; 272 tester gröna.
- [x] EAk steg A: trendjusterat poolat brus, strategi som parameter, stödsignaler och NFOR-flagga; 34 EAk-tester och totalt 264 tester gröna, coachens analys för Alex verifierad utan fel. Veckor grupperas efter mesocykel och föregående antal pass används i tröskeln. Steg B–C är inte påbörjade.
- [x] Toppning: volymnedtrappning sker nu inne i atletens egna pass (set per pass × kurva) med oförändrad frekvens per lyft — Vincent-fallet (böj/mark 1 ggr/vecka) ger 4/3/2 respektive 3/2/1 set istället för 1 set; verifierat mot hans riktiga loggar, 273 tester gröna.
- [x] Tävlingsankrad toppning rättad; 243 tester gröna, Alex sexveckorsutkast sparat och återläst inför lördagstävling.
- [x] Toppning: 2–6 dagar och 2–6 veckor i generator och säsongsplanering; 239 tester gröna, sexveckorsutkast och sparad säsongsplan verifierade som coach för Alex Athlete

## Klart
- [x] Passredigering direkt från kalendern (PlannedSessionEditor) — bygge/tester OK
- [x] STEG 1: kritiska buggfixar i generatorn (fix 1–10)
  - liftIdentity.ts: compLiftKey/isCompLift/WeekKind; kind-fält i TemplateWeek + alla mallar + peaking
  - matchBaseline: exakt match + explicit alias, aldrig substring
  - pickMeasurementSet: tung singel räknas bara före första arbetssetet
  - evaluateBlock: lookupBaseline (skiftlägesokänslig); COMP-match via compLiftKey
  - applyBlockVolume/volumeGuards: Over-warm/Opener single aldrig volymkandidater
  - withWaveLoading: bara sanna tävlingslyft, RPE som offset (coachjustering bevaras)
  - reconcileLoad: ställnings-/greppetiketter = samma övning (kg bevaras)
  - sessionSetBudget: matcha per övningsnamn, kasta lägst prioriterad övning
  - kind-baserad deload/taper/peak-detektering i blockVolume/volumeGuards/weakPoints/setProtocols/overload/individualisation
  - weakPoints hoppar över peak/taper; applyAdjustments justerar peak-veckor (skipFloors separerat)
  - 216 tester + build OK
- [x] STEG 2: eakSignal.ts + tester (session, mesocykel, rebound, coach-godkännande)
- [x] STEG 3: tabeller + RLS + serverfunktioner (runEakEvaluation, decideEakEvaluation, applyBaselineChange); auto-flytning av baseline borttagen — bara förslag
- [x] STEG 4: statuschips + sortering i coachöversikt, EAk-mesocykelsektion i analysvyn

## Väntar
- [ ] STEG 5 (valfritt): volymtak skalar med volymfaktor
- [ ] Provköra egna säsongsblock ("Eget upplägg") som coach i appen
- [ ] Granska maratonplanens tävlingsvecka (monitoring-fynd)

## Toppningsmodul (från Emils konceptdokument 2026-10-27)
- [x] Fas 1, del 1: src/lib/taperModel.ts — D0-förankrad grundplan (volymtopp D-42→D-22, intensifiering D-21→D-10, stegtaper D-9→D-3, vila D-2→D-1), lyftspecifika regeldagar (mark D-9/D-7, böj D-8/D-4, bänk D-5/D-3), laster från e1RM avrundade till 2,5 kg, elva coachreglage med intervall, tre hårda varningar, snapping till närmaste träningsdag FÖRE, krockar slås ihop. uppdaterad 08:16-versionen: taperlängd 7–14 d, volymsänkning 30–60 %, intensitetsläge 'sänkt 25–30 %' (Bell 2025), minst 85 % på tunga set; 284 tester gröna
- [ ] Fas 1, del 2: tabell taper_plans (reglage + fryst EAk-baslinje vid D-21) med RLS
- [ ] Fas 1, del 3: koppla in i genereringsdialogen (reglagepanel + varningar) och lyftarvy (nedräkning till D0)
- [ ] Fas 2: flaggor/beslut, kontextstress, öppningsförslag + tävlingskort
- [ ] Fas 3: tävlings-EAk, toppningshistorik, personliga standardvärden
