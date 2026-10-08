import { useQuery } from "@tanstack/react-query";
import { coachingAvailabilityOptions } from "@/lib/coachingAvailability";

function Places({ count }: { count: number }) {
  return <p className="mt-1 text-sm text-muted-foreground">{count === 0 ? "Inga lediga platser just nu." : `${count} ${count === 1 ? "ledig plats" : "lediga platser"} just nu.`}</p>;
}

export function CoachingInformation() {
  const availability = useQuery(coachingAvailabilityOptions);
  return (
    <section aria-labelledby="coaching-information-title" className="space-y-4">
      <div>
        <h2 id="coaching-information-title" className="text-lg font-semibold">Appen är gratis</h2>
        <p className="mt-1 text-sm text-muted-foreground">Du behöver inte köpa coachning för att använda SETPOINT.</p>
      </div>
      <div className="divide-y divide-border border-y border-border">
        <div className="py-3">
          <h3 className="font-medium">Coachning med Emil · 300 kr/månad</h3>
          {availability.data && <Places count={availability.data.coaching_places} />}
        </div>
        <div className="py-3">
          <h3 className="font-medium">Träningsöverblick · 100 kr/månad</h3>
          <p className="mt-1 text-sm text-muted-foreground">Överblick och rådgivning kring din egen träningsprogrammering och träning.</p>
          {availability.data && <Places count={availability.data.overview_places} />}
        </div>
      </div>
      {availability.isLoading && <p className="text-sm text-muted-foreground">Hämtar lediga platser…</p>}
      {availability.isError && <p role="alert" className="text-sm text-destructive">Lediga platser kan inte visas just nu.</p>}
      <p className="text-sm">Swish till <strong className="whitespace-nowrap">072-2318321</strong> för coachning eller träningsöverblick.</p>
    </section>
  );
}