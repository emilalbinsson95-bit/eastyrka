## Vad som byggs

En knapp **"Generera 20-veckors maratonplan"** på coachens mesocykel-sida som i ett klick skapar:
- 1 mesocycle (20 v) + 20 week_plans + ~100 endurance_sessions med strukturerade steps/reps
- Allt redigerbart efteråt (du kan dra runt pass i kalendern, tweaka intervaller, etc.)

## Vetenskaplig modell

Hybrid av **Pfitzinger "Advanced Marathoning"** + **Daniels Running Formula** + **polariserat 80/20 (Seiler)**, anpassad för 2:45–4:00 maratontider. Volym och tempo skalas från athletens `ten_k_pb_seconds` (VDOT → E/M/T/I/R-paces, finns redan i `endurancePaceHr.ts`).

### 5 faser över 20 veckor

```
v1–4   Bas (Endurance)        — aerob bas, strides, deload v4
v5–10  Lactate Threshold      — LT-tempo + medium-long runs, deload v8
v11–15 Race-specific          — maratontempo i långpass + VO2max, deload v12
v16–18 Sharpening             — sista kvalitetspassen, race-pace finputs
v19–20 Taper + race           — −40% v19, −60% v20, race lördag v20
```

Varje 4:e vecka är deload (−25 % volym, behåller intensitet). Sista långpasset 3 v före race.

### Veckostruktur (5 dgr/v default, 4 eller 6 valbart)

| Dag | Pass |
|-----|------|
| Mån | Vila / X-train |
| Tis | Kvalitet (LT/VO2/MP beroende på fas) |
| Ons | Recovery jog + strides |
| Tor | Medium-long run |
| Fre | Vila |
| Lör | Kvalitet 2 (tempo eller progressiv) |
| Sön | Long run (med MP-block i race-spec-fas) |

80/20 fördelning: Sön+Tor+Ons = easy (zon 1–2), Tis+Lör = hard (zon 4–5). Easy-andel ≥ 80 % av tid över hela blocket.

### Exempel: passmallar (skalade till VDOT)

- **Easy run:** 45–75 min @ RPE 4–5 (E-pace, ~70 % HRmax)
- **Long run (bas):** 90–150 min @ RPE 5
- **Long run (race-spec):** 2×(20 min E + 20 min MP) @ RPE 6–7
- **LT tempo:** 2×20 min @ T-pace, 3 min jogg vila, RPE 7–8
- **VO2max:** 5×3 min @ I-pace, 3 min jogg, RPE 9
- **Strides:** 6×20 s @ R-pace, full vila

Allt genereras som riktiga `endurance_steps` med `repeat_count`, så du ser dem precis som ett manuellt byggt pass i editorn.

## Tekniska detaljer

### Filer
- **`src/lib/marathonPlanGenerator.ts`** (ny) — ren funktion `generate20WeekMarathonPlan({ athleteId, startDate, tenKPbSeconds, daysPerWeek, raceDate })` som returnerar `{ mesocycle, weeks[], sessions[] }`.
- **`src/components/GenerateMarathonPlanDialog.tsx`** (ny) — wizard: start-datum (måndag), dagar/vecka (4/5/6), bekräftelse av PB från profilen (övrigt-fält om saknas), valbar race-distans (default maraton).
- **`src/routes/coach.athletes.$athleteId.cycles.tsx`** — lägg till knapp "Generera 20v maraton" bredvid "New mesocycle".
- **Inga DB-migrations** — använder befintliga tabeller (`mesocycles`, `week_plans`, `planned_sessions`, `endurance_sessions`, `endurance_steps`).

### Persistens
Allt sparas i en transaktion via en serverFn `generateMarathonPlan` (`src/lib/marathonPlan.functions.ts`) med `requireSupabaseAuth` + coach-check (`is_coach_of`). Räknar veckor från valt måndagsdatum, skapar week_plans i `draft`-status så coachen kan publicera vecka för vecka (din befintliga flow).

### Skalningsformel (kort)
VDOT från `tenKPbSeconds` (Daniels-quadratic, redan i `endurancePaceHr.ts`) → E/M/T/I-paces. Veckovolym börjar på `baseKm = 0.6 × goalRacePaceKm × 4` (≈48 km/v för 3:00-mara, 60 km/v för 2:45) och progrederar +10 %/v med deload var 4:e vecka, peak ~v14, sedan taper.

## Vad som INTE byggs

- Halvmara/10k/ultra-planer (samma motor, men kräver egna mallar — kan adderas senare).
- Auto-publicering — du publicerar varje vecka själv som idag.
- Garmin sync.

## Verifiering
Genererar en plan mot en test-athlete, kollar i kalendern att veckorna ser rimliga ut, och att 80/20-panelen i WeeklyOverview visar ≥ 80 % easy.