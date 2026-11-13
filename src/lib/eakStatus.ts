/**
 * Plain-language EAk status shared by the athlete EAk card and the program
 * generator, so both describe a signal the same way. Advice only: nothing here
 * changes a plan without the coach's choice.
 */
export type EakStatusKey = "insufficient_data" | "red_strong" | "red" | "yellow" | "low_confidence" | "push" | "green";

export const EAK_STATUS: Record<EakStatusKey, { label: string; cls: string; text: string }> = {
  green: { label: "Enligt plan", cls: "bg-status-adapting text-status-adapting-foreground", text: "Följer planen. Ingen ändring behövs." },
  yellow: { label: "Bevaka", cls: "bg-status-peaking text-status-peaking-foreground", text: "Styrkan har gått ner lite. Behåll planen och lägg inte till volym." },
  red: { label: "Bromsa", cls: "bg-status-exhausted text-status-exhausted-foreground", text: "Styrkan har gått ner tydligt. Ta bort lite volym eller sänk vikterna." },
  red_strong: { label: "Bromsa nu", cls: "bg-status-exhausted text-status-exhausted-foreground", text: "Stort tapp. Sänk belastningen nu och kolla sömn, mat och sjukdom." },
  push: { label: "Redo för mer", cls: "bg-status-undertrained text-status-undertrained-foreground", text: "Starkare än baslinjen. Det finns utrymme för mer volym eller en högre baslinje." },
  low_confidence: { label: "Ovanligt brusigt block", cls: "bg-status-peaking text-status-peaking-foreground", text: "Passen skiljer sig mycket åt. Dra inga slutsatser än." },
  insufficient_data: { label: "För lite data", cls: "bg-muted text-muted-foreground", text: "För få mätpass än." },
};

export function eakStatus(status: string | null | undefined) {
  return EAK_STATUS[(status ?? "insufficient_data") as EakStatusKey] ?? EAK_STATUS.insufficient_data;
}

/**
 * Combines the block-to-block volume suggestion with the latest EAk signal.
 * A brake signal always suggests one set less; a watch or noisy signal never
 * suggests adding sets; otherwise the block suggestion stands.
 */
export function eakVolumeAdvice(blockDelta: -1 | 0 | 1, status: string | null | undefined): { delta: -1 | 0 | 1; byEak: boolean } {
  if (status === "red" || status === "red_strong") return { delta: -1, byEak: blockDelta !== -1 };
  if ((status === "yellow" || status === "low_confidence") && blockDelta > 0) return { delta: 0, byEak: true };
  return { delta: blockDelta, byEak: false };
}
