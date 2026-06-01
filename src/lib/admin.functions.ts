import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminDeleteExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        password: z.string().min(1).max(200),
        exerciseId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) throw new Error("Admin password is not configured");
    if (data.password !== expected) throw new Error("Wrong admin password");

    const { error } = await supabaseAdmin
      .from("exercises")
      .delete()
      .eq("id", data.exerciseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateExercise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        password: z.string().min(1).max(200),
        exerciseId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        category: z.string().trim().max(40).nullable().optional(),
        description: z.string().trim().max(2000).nullable().optional(),
        default_intensity_metric: z.enum(["rpe", "rir"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) throw new Error("Admin password is not configured");
    if (data.password !== expected) throw new Error("Wrong admin password");

    const { error } = await supabaseAdmin
      .from("exercises")
      .update({
        name: data.name,
        category: data.category || null,
        description: data.description || null,
        default_intensity_metric: data.default_intensity_metric,
      })
      .eq("id", data.exerciseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
