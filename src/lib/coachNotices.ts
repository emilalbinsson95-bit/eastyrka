/** Swedish calendar date today; notices stay visible through their last day in Sweden. */
export function stockholmToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Who gets a notice: null = every accepted athlete, else the chosen ids (deduplicated). */
export function resolveRecipients(mode: "all" | "pick", picked: string[]): string[] | null {
  if (mode === "all") return null;
  return Array.from(new Set(picked));
}

/** A notice is shown while its last day (Swedish date) has not passed. */
export function isNoticeCurrent(visibleUntil: string | null, today: string): boolean {
  return !visibleUntil || visibleUntil >= today;
}
