import { supabase } from "@/integrations/supabase/client";

export async function fetchPaymentSchedule(athleteId: string) {
  const { data, error } = await supabase.from("payment_reminder_schedules").select("*").eq("athlete_id", athleteId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function savePaymentSchedule(athleteId: string, service: "coaching" | "overview", startDate: string) {
  const { error } = await supabase.from("payment_reminder_schedules").upsert({ athlete_id: athleteId, service, start_date: startDate, active: true }, { onConflict: "athlete_id" });
  if (error) throw error;
}

export async function stopPaymentSchedule(athleteId: string) {
  const { data, error } = await supabase.from("payment_reminder_schedules").update({ active: false }).eq("athlete_id", athleteId).select("id").single();
  if (error) throw error;
  return data;
}