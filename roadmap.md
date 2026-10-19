# Roadmap

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

## Pågår
- [ ] STEG 2: src/lib/eakSignal.ts + eakSignal.test.ts — ren TS, återanvänder dailyE1RM/pickMeasurementSet/lookupBaseline; session-nivå + mesocykel-evaluering, rebound-test, baseline med coach-godkännande, förslag istället för automatisk blockvolym

## Väntar
- [x] STEG 3: databastabeller eak_meso_evaluations, baseline_history, rebound_tests + RLS
- [x] STEG 4: coachvy — statuschips per lyft, EAk-sektion, godkänn/avvisa/justera, baseline-korrigering
- [ ] STEG 5 (valfritt): volymtak skalar med volymfaktor
- [ ] Provköra egna säsongsblock ("Eget upplägg") som coach i appen
- [ ] Granska maratonplanens tävlingsvecka (monitoring-fynd)
