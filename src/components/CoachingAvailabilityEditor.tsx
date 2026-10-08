import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coachingAvailabilityOptions, saveCoachingAvailability } from "@/lib/coachingAvailability";

function AvailabilityForm({ coaching, overview }: { coaching: number; overview: number }) {
  const [coachingPlaces, setCoachingPlaces] = useState(String(coaching));
  const [overviewPlaces, setOverviewPlaces] = useState(String(overview));
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveCoachingAvailability(Number(coachingPlaces), Number(overviewPlaces)),
    onSuccess: (data) => {
      qc.setQueryData(coachingAvailabilityOptions.queryKey, data);
      qc.invalidateQueries({ queryKey: coachingAvailabilityOptions.queryKey });
      toast.success("Lediga platser sparade");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <div className="space-y-2"><Label htmlFor="coaching-places">Lediga coachplatser</Label><Input id="coaching-places" type="number" min={0} max={10000} step={1} required value={coachingPlaces} onChange={(event) => setCoachingPlaces(event.target.value)} /></div>
    <div className="space-y-2"><Label htmlFor="overview-places">Lediga platser för träningsöverblick</Label><Input id="overview-places" type="number" min={0} max={10000} step={1} required value={overviewPlaces} onChange={(event) => setOverviewPlaces(event.target.value)} /></div>
    <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}><Save className="h-4 w-4" />{save.isPending ? "Sparar…" : "Spara lediga platser"}</Button></div>
  </form>;
}

export function CoachingAvailabilityEditor() {
  const availability = useQuery(coachingAvailabilityOptions);
  return <section aria-labelledby="coaching-availability-heading" className="space-y-3 border-b border-border pb-6">
    <h2 id="coaching-availability-heading" className="text-xl font-semibold">Coachning och träningsöverblick</h2>
    {availability.isLoading && <p className="text-sm text-muted-foreground">Hämtar lediga platser…</p>}
    {availability.isError && <p role="alert" className="text-sm text-destructive">Kunde inte hämta lediga platser.</p>}
    {availability.data && <AvailabilityForm key={`${availability.data.coaching_places}-${availability.data.overview_places}`} coaching={availability.data.coaching_places} overview={availability.data.overview_places} />}
  </section>;
}