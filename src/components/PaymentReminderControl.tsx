import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchPaymentSchedule, savePaymentSchedule, stopPaymentSchedule } from "@/lib/paymentReminders";

export function PaymentReminderControl({ athleteId }: { athleteId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<"coaching" | "overview">("coaching");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const schedule = useQuery({ queryKey: ["payment-schedule", athleteId], queryFn: () => fetchPaymentSchedule(athleteId) });
  const mutation = useMutation({
    mutationFn: (stop: boolean) => stop ? stopPaymentSchedule(athleteId) : savePaymentSchedule(athleteId, service, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-schedule", athleteId] });
      qc.invalidateQueries({ queryKey: ["calendar-items", athleteId] });
      setOpen(false);
      toast.success(t("payment.saved"));
    },
    onError: () => toast.error(t("payment.saveError")),
  });
  return <>
    <Button variant="outline" size="sm" disabled={schedule.isLoading || schedule.isError} onClick={() => {
      setService(schedule.data?.service === "overview" ? "overview" : "coaching");
      setDate(schedule.data?.active ? schedule.data.start_date : format(new Date(), "yyyy-MM-dd"));
      setOpen(true);
    }}><Wallet className="mr-1 h-3.5 w-3.5" />{t(schedule.data?.active ? "payment.manage" : "payment.start")}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("payment.title")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="payment-service">{t("payment.service")}</Label>
            <Select value={service} onValueChange={v => { if (v === "coaching" || v === "overview") setService(v); }}>
              <SelectTrigger id="payment-service"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="coaching">{t("payment.coaching")} · 300 {t("payment.perMonth")}</SelectItem><SelectItem value="overview">{t("payment.overview")} · 100 {t("payment.perMonth")}</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="payment-start">{t("payment.firstDate")}</Label><Input id="payment-start" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          {schedule.data?.active && <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>{t("payment.stop")}</Button>}
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
          <Button disabled={!date || mutation.isPending} onClick={() => mutation.mutate(false)}>{t(schedule.data?.active ? "actions.save" : "payment.start")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}