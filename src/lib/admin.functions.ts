import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const adminDeleteExercise = createServerFn({ method: "POST" })
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
