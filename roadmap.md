# Roadmap

## Aktuellt
- [ ] Granska alla 22 förslag i Ändringar i SETPOINTs autogenerator mot aktuell kod och forskningsunderlag; inga träningsregler ändras under granskningen.
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
