import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Single-field "mm:ss" (or "h:mm:ss") time input.
 *
 * - Stores its own raw text while the user is typing so partial input
 *   ("4:" or "4:3") doesn't get clobbered.
 * - On blur, parses to whole seconds and calls onChangeSeconds.
 * - Value prop is the canonical second count; the input reflows when it
 *   changes externally (e.g. after a save round-trip).
 *
 * Replaces the legacy two-input "m" + "s" pattern for less tap-friction on mobile.
 */
export function MMSSInput({
  seconds,
  onChangeSeconds,
  placeholder = "mm:ss",
  className,
  allowHours = false,
  ariaLabel,
}: {
  seconds: number | null;
  onChangeSeconds: (s: number | null) => void;
  placeholder?: string;
  className?: string;
  allowHours?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState<string>(secondsToText(seconds, allowHours));

  // Re-sync from external value when the user is NOT focused (we detect via raw text drift).
  useEffect(() => {
    setText(secondsToText(seconds, allowHours));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9:]*"
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cn("font-mono", className)}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseMMSS(text);
        // Echo back a normalized canonical string so "5:7" becomes "5:07".
        setText(parsed != null ? secondsToText(parsed, allowHours) : "");
        onChangeSeconds(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Parse "5:30", "0:45", "1:22:30" → seconds. Returns null for empty/invalid. */
export function parseMMSS(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length === 1) {
    // Bare number → treat as seconds.
    const n = Number(parts[0]);
    return isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 2) {
    const [m, sec] = nums;
    if (sec >= 60) return null;
    return m * 60 + sec;
  }
  if (nums.length === 3) {
    const [h, m, sec] = nums;
    if (m >= 60 || sec >= 60) return null;
    return h * 3600 + m * 60 + sec;
  }
  return null;
}

function secondsToText(sec: number | null | undefined, allowHours: boolean): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (allowHours && h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const totalMin = h * 60 + m;
  return `${totalMin}:${String(s).padStart(2, "0")}`;
}
