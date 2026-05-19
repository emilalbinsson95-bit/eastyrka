# Plan: Etapp 1 + 2

## Etapp 1 — Snabba fixar

### 1.1 Chat uppdateras långsamt (realtime)
`messages.tsx` prenumererar redan på `postgres_changes`, men `messages`-tabellen ligger troligen inte i publikationen `supabase_realtime`, så INSERT-events droppas och UI uppdateras först vid refetch.

- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;` + `ALTER TABLE public.messages REPLICA IDENTITY FULL;`
- Lägg till optimistisk insert i `sendMessage` så avsändaren ser meddelandet direkt.

### 1.2 Veckor börjar på måndagar (konsekvent)
Mest är redan `weekStartsOn: 1`, men:
- `src/components/SharedCalendar.tsx` rad 47: `WEEKDAYS` är hårdkodad men ändras till i18n-nycklar (`common.weekdaysShort.mon`…).
- Verifiera att `_app.today.tsx` och `coach.athletes.$athleteId.cycles.$cycleId.tsx` mappar `day_of_week` 1=mån…7=sön (visa via `dayLabel(idx)` som returnerar översatt veckodag i stället för "Day N").

### 1.3 Coach kan radera pass helt (även röda/avbokade)
I `SharedCalendar.tsx` finns idag ingen delete-knapp för coach. Lägg till:
- I varje sessionskort när `readOnly=false` ELLER `viewerRole==="coach"`: trash-ikon → `AlertDialog` med bekräftelse → mutation som:
  - Tar bort matchande `session_schedule_overrides` (owner_id=atlet, source_id, source_type).
  - För källtyp `planned_session`: delete på `planned_sessions` (RLS tillåter via week_plan ägd av coach).
  - För källtyp `endurance_session`: delete på `endurance_sessions`.
  - För källtyp `rehab_session`: delete på `rehab_sessions`.
- Skicka `viewerRole` som prop från `coach.athletes.$athleteId.calendar.tsx` så delete bara visas i coach-vyn.
- Invalidera kalender-queries.

### 1.4 Endurance "Last 7 days" / "This week"
- I `EnduranceWeeklyOverview` lägg till en liten toggle ovanför grafen: `[Denna vecka] [Senaste 7 dagar] [8v trend]`.
- Default = "Denna vecka" (mån → idag), summa-statarna under filtreras därefter. "8v trend" = nuvarande beteende.

### 1.5 i18n överallt (sv + en)
- Bygg ut `src/locales/{en,sv}.json` med namespaces: `endurance`, `calendar`, `coach`, `analytics`, `messages`, `today`, `cycles`, `auth`, `readiness`, `common.weekdays{Short}`.
- Gå igenom hårdkodade strängar i: `_app.endurance.tsx`, `EnduranceWeeklyOverview`, `EnduranceSessionEditor`, `SharedCalendar`, `coach.tsx`, `coach.index.tsx`, `coach.athletes.*`, `messages.tsx`, `_app.today.tsx`, `_app.history.tsx`, `onboarding.tsx`, `ReadinessGate`, `AddSessionDialog`, `AdhocStrengthEditor`, `SessionPreviewDialog`, `NotificationsBell`. Ersätt med `t("…")`.
- Lägg `<LanguageToggle />` i både coach- och athlete-header (verifiera att den redan finns för båda).

### 1.6 Hydration mismatch (`Laddar… vs Loading…`)
Fix samtidigt med 1.5: byt fallback-strängar `Loading…/Laddar…` mot deterministisk variant. Sätt `i18n.init({ ..., react: { useSuspense: false } })` och bara rendera översatta strängar efter `i18n.isInitialized`, eller använd `<Trans>` med samma defaultValue. Praktiskt: ersätt direkta fallbacks i route-laddtillstånd med en spinner-only komponent utan text. Detta tar bort SSR/CSR-mismatchen på `/coach`.

---

## Etapp 2 — Endurance-djup

### 2.1 Benchmark/HR/tider fastnar inte
`ActualLogger` använder lokala `useState` och skriver först vid Save-knappen. Problem är troligen att `predicted_10k_seconds` och HR/distans inte alltid markeras som "dirty" → patch skippas. Konkret:
- Lägg till explicit `Spara`-CTA som alltid skriver patchen (inte beroende av `hasAnyActual` förutom för status-flipp).
- För steg-tabellen (`actual_avg_hr`, `actual_distance_m`): säkerställ `onBlur` triggar `update.mutate` även när värdet är 0/tomt → null.
- I `Profile`-vyn: säkerställ att `ten_k_pb_seconds`, `max_hr`, `resting_hr`, `ftp_watts`, `css_per_100m_seconds` har korrekt onBlur-spar. Skriv testfall manuellt: skriv → blur → reload → värdet kvar.
- Tydlig toast både vid success och vid validation-fel (DB-triggrar kastar bra meddelanden).

### 2.2 Läsbarare charts + bättre ikoner
- I `coach.athletes.$athleteId.analytics.tsx` Endurance-tab:
  - Öka tick-fontstorlek, lägg `formatter` på tooltips (pace `5:32 /km`, tid `1h 23m`, avstånd `12.4 km`).
  - Lägg till `<ReferenceLine>` för veckogenomsnitt på RPE/distans.
  - Konsolidera färger via design tokens (`--chart-1…5` i `styles.css`) i stället för hex.
  - Lägg `<Legend>` med tydliga labels per discipline.
- Ikon-uppgradering: byt `Activity`→discipline-specifika (`Footprints` run, `Bike` bike, `Waves` swim, `Dumbbell` strength) på tabbar/cards/badges. Behåll `Activity` bara som "alla discipliner"-aggregat.

### 2.3 Ad-hoc strength i load (verifiera)
Implementerat i `EnduranceWeeklyOverview` (existerande). Lägg till:
- Vid radering av ad-hoc strength-pass: delete-mutation som tar bort *alla* rader med samma `(athlete_id, date, exercise)` så load-grafen rensas.
- Visa strength som egen färgband i RPE-bar (lägg `strength`-disciplin i `perDiscipline` legend).

---

## Tekniska detaljer

**Migrations (en migration totalt):**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
```

**Filer som ändras (uppskattat):**
- `src/locales/en.json`, `src/locales/sv.json` (stor utbyggnad)
- `src/components/SharedCalendar.tsx` (delete + viewerRole + i18n + weekdays)
- `src/routes/coach.athletes.$athleteId.calendar.tsx` (skicka `viewerRole="coach"`)
- `src/components/EnduranceWeeklyOverview.tsx` (window-toggle, i18n)
- `src/components/EnduranceSessionEditor.tsx` (spar-CTA + onBlur-fix + i18n)
- `src/routes/messages.tsx` (optimistic send + i18n)
- `src/routes/coach.athletes.$athleteId.analytics.tsx` (chart polish + ikoner)
- `src/lib/i18n.ts` (useSuspense: false)
- `src/routes/_app.endurance.tsx`, `_app.today.tsx`, `coach.tsx`, `coach.index.tsx`, `_app.history.tsx`, `onboarding.tsx`, m.fl. (i18n)
- `src/components/AddSessionDialog.tsx`, `AdhocStrengthEditor.tsx`, `SessionPreviewDialog.tsx`, `ReadinessGate.tsx`, `NotificationsBell.tsx` (i18n + ikoner)

**Ej i denna plan (Etapp 3, sparas till senare):** sök i övningar, "skapa övning"-shortcut, byta "dag"→"pass" semantiskt, analytics-omstrukturering i navet, övriga UX-omstruktureringar.

Säg till om jag ska köra hela Etapp 1+2 i en sittning, eller börja med Etapp 1 och pausa för avstämning innan Etapp 2.
