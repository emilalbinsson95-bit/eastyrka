# Roadmap

## Aktuellt
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
