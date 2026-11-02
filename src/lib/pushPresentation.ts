export function firstSetInstruction(weight: number | null, targetRpe: number | null) {
  return weight == null
    ? `Välj första vikten efter ${targetRpe == null ? "dagens ordination" : `mål-RPE ${targetRpe}`}. Logga använd vikt, reps och faktisk RPE. Ingen automatisk höjning utifrån enbart RPE.`
    : `Första arbetssetet: börja på ${weight} kg. Logga faktisk RPE efter setet. Justera följande set för att hålla mål-RPE; sänk vid behov. Du ska inte pressa igenom en för tung vikt.`;
}
export const pushDecisionLabels: Record<string, string> = {
  push: "Underlag för högre startvikt", hold: "Behåll startvikten", miss: "Missade reps registrerade",
  reset: "Startvikten räknas om nedåt", skip: "Ingen automatisk ändring", paused: "Viktökning pausad", none: "Ingen ändring",
};