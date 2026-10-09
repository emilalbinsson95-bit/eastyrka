import { useQuery } from "@tanstack/react-query";
import { coachingAvailabilityOptions } from "@/lib/coachingAvailability";
import { useTranslation } from "react-i18next";

function Places({ count }: { count: number }) {
  const { t } = useTranslation();
  return <p className="mt-1 text-sm text-muted-foreground">{t("coaching.places", { count })}</p>;
}

export function CoachingInformation() {
  const { t } = useTranslation();
  const availability = useQuery(coachingAvailabilityOptions);
  return (
    <section aria-labelledby="coaching-information-title" className="space-y-4">
      <div>
        <h2 id="coaching-information-title" className="text-lg font-semibold">{t("coaching.freeTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("coaching.freeBody")}</p>
      </div>
      <div className="divide-y divide-border border-y border-border">
        <div className="py-3">
          <h3 className="font-medium">{t("coaching.coachingTitle")}</h3>
          {availability.data && <Places count={availability.data.coaching_places} />}
        </div>
        <div className="py-3">
          <h3 className="font-medium">{t("coaching.overviewTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("coaching.overviewBody")}</p>
          {availability.data && <Places count={availability.data.overview_places} />}
        </div>
      </div>
      {availability.isLoading && <p className="text-sm text-muted-foreground">{t("coaching.loading")}</p>}
      {availability.isError && <p role="alert" className="text-sm text-destructive">{t("coaching.error")}</p>}
      <p className="text-sm">{t("coaching.swishBefore")} <strong className="whitespace-nowrap">072-2318321</strong> {t("coaching.swishAfter")}</p>
    </section>
  );
}