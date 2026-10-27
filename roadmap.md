# Roadmap

## Aktuellt
- [x] EAk steg B del 1: databas (strategi per atlet, ömhet/motivation, pass-RPE/tid, uppvärmningsvikter, utökad beslutslogg med utfall), motorn läser allt, readiness frågar ömhet/motivation.
- [x] EAk steg B del 2: uppvärmningsvikter i atlet-/coachinställningar, exakt viktmatchning och RPE 6–10 i halvsteg i båda loggflödena; referensset undantas från arbetsset och EAk. Alex sparade/återläste 60 kg och loggade/återläste RPE 7,5; 48 relevanta tester och bygge gröna.
- [ ] Steg B slutkontroll: pass-RPE/tid efter planerat pass, coachens 'ändrade planen' och utfall till föregående utvärdering verifieras med Alex.
- [ ] EAk steg C efter B: atletens strategi, signalbrus/stödsignaler/belastning/NFOR, obligatoriskt ja/nej vid beslut och beskrivande beslutsöversikt för senaste 12 månaderna.
- [x] EAk steg A: trendjusterat poolat brus, strategi som parameter, stödsignaler och NFOR-flagga; 34 EAk-tester och totalt 264 tester gröna, coachens analys för Alex verifierad utan fel. Veckor grupperas efter mesocykel och föregående antal pass används i tröskeln. Steg B–C är inte påbörjade.
- [ ] Toppning: gradvis volymnedtrappning från tre föregående arbetsveckor, valbara start/slutdatum och kontrollerat forskningsunderlag; verifiera med Alex Athlete.
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
