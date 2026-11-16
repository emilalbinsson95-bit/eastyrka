import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LIFTS, liftMetrics, type MetricSet } from "@/lib/liftMetrics";

const weekKey = (date: string) => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");

/** Athlete view of completed Mängd per main lift and week (same calculation as the coach's Analys). */
export function WeeklyVolumeCard({ logs, baselines, weeks = 12 }: { logs: MetricSet[] & Array<{ date: string }>; baselines: Record<string, number>; weeks?: number }) {
  const { t } = useTranslation();
  const { data, missing } = useMemo(() => {
    const start = startOfWeek(addDays(new Date(), -7 * (weeks - 1)), { weekStartsOn: 1 });
    const keys = Array.from({ length: weeks }, (_, i) => format(addDays(start, i * 7), "yyyy-MM-dd"));
    const byWeek = new Map<string, MetricSet[]>(keys.map((k) => [k, []]));
    for (const l of logs) byWeek.get(weekKey(l.date))?.push(l);
    const missingLifts = new Set<string>();
    const rows = keys.map((k) => {
      const m = liftMetrics(byWeek.get(k) ?? [], baselines);
      const row: Record<string, number | string | null> = { week: format(parseISO(k), "d/M") };
      for (const lift of LIFTS) {
        if (m[lift].baselineMissing) missingLifts.add(lift);
        row[lift] = m[lift].volume == null ? null : Math.round(m[lift].volume * 10) / 10;
      }
      return row;
    });
    return { data: rows, missing: [...missingLifts] };
  }, [logs, baselines, weeks]);
  const hasData = data.some((r) => LIFTS.some((l) => Number(r[l] ?? 0) > 0));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("volume.title")}</CardTitle>
        <CardDescription>{t("volume.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasData ? <p className="text-sm text-muted-foreground">{t("volume.empty")}</p> : (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" fontSize={10} />
                <YAxis fontSize={10} width={32} />
                <Tooltip />
                <Legend />
                {LIFTS.map((lift, i) => <Bar key={lift} dataKey={lift} name={t(`volume.${lift}`)} fill={`var(--chart-${i + 1})`} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {missing.length > 0 && <p className="text-xs text-muted-foreground">{t("volume.noBaseline", { lifts: missing.map((l) => t(`volume.${l}`)).join(", ") })}</p>}
      </CardContent>
    </Card>
  );
}
