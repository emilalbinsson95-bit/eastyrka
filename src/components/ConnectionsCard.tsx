import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Link2, Link2Off } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  disconnectIntegration,
  listMyIntegrations,
  startOAuth,
  syncRecentActivities,
  type ExternalProvider,
} from "@/lib/externalIntegrations.functions";

const PROVIDERS: Array<{ id: ExternalProvider; label: string; blurb: string }> = [
  {
    id: "garmin",
    label: "Garmin Connect",
    blurb: "Importera löpning, cykel & sim från Garmin-klockan automatiskt.",
  },
  {
    id: "strava",
    label: "Strava",
    blurb: "Importera aktiviteter och peka mot dina endurance-pass.",
  },
];

export function ConnectionsCard() {
  const qc = useQueryClient();
  const list = useServerFn(listMyIntegrations);
  const connect = useServerFn(startOAuth);
  const disconnect = useServerFn(disconnectIntegration);
  const sync = useServerFn(syncRecentActivities);

  const query = useQuery({
    queryKey: ["external-integrations"],
    queryFn: () => list(),
  });

  const connectMut = useMutation({
    mutationFn: (provider: ExternalProvider) =>
      connect({ data: { provider } }) as Promise<{ url?: string }>,
    onSuccess: (res) => {
      if (res?.url) window.location.href = res.url;
    },
    onError: (e: Error) => toast.info(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: (provider: ExternalProvider) =>
      disconnect({ data: { provider } }),
    onSuccess: () => {
      toast.success("Frånkopplad");
      qc.invalidateQueries({ queryKey: ["external-integrations"] });
    },
  });

  const syncMut = useMutation({
    mutationFn: (provider: ExternalProvider) => sync({ data: { provider } }),
    onSuccess: (res: any) => {
      toast.success(
        res?.note ?? `Importerade ${res?.imported ?? 0} aktiviteter`
      );
      qc.invalidateQueries({ queryKey: ["external-integrations"] });
    },
    onError: (e: Error) => toast.info(e.message),
  });

  const integrations = query.data?.integrations ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Anslutna tjänster
        </CardTitle>
        <CardDescription>
          Koppla Garmin eller Strava för att automatiskt få in dina löpningar
          (kräver API-åtkomst — knapparna är redo att aktiveras).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PROVIDERS.map((p) => {
          const row = integrations.find((i: any) => i.provider === p.id);
          const connected = !!row;
          return (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.label}</span>
                  {connected ? (
                    <span className="rounded-full bg-status-peaking/15 px-2 py-0.5 text-xs font-medium text-status-peaking">
                      Ansluten
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Ej ansluten
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.blurb}</p>
                {connected && row.last_synced_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Senaste synk:{" "}
                    {format(parseISO(row.last_synced_at), "MMM d, HH:mm")}
                  </p>
                )}
                {connected && row.last_sync_error && (
                  <p className="text-[11px] text-status-exhausted">
                    {row.last_sync_error}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {connected ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncMut.mutate(p.id)}
                      disabled={syncMut.isPending}
                    >
                      Synka nu
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectMut.mutate(p.id)}
                      disabled={disconnectMut.isPending}
                    >
                      <Link2Off className="mr-1 h-3.5 w-3.5" />
                      Koppla från
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => connectMut.mutate(p.id)}
                    disabled={connectMut.isPending}
                  >
                    <Link2 className="mr-1 h-3.5 w-3.5" />
                    Anslut
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
