/**
 * External-integration server functions for Garmin Connect and Strava.
 *
 * Status: SCAFFOLD — wired end-to-end (DB, RLS, UI status, disconnect)
 * but OAuth + activity sync are stubbed until the user obtains API access.
 *
 * To go live:
 *  1. Register an app with the provider and get a client id / secret.
 *  2. Add these secrets via the Secrets tool:
 *       - STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
 *       - GARMIN_CONSUMER_KEY, GARMIN_CONSUMER_SECRET
 *  3. Fill in startOAuth() / handleOAuthCallback() / syncRecentActivities()
 *     below using the canonical flow described inline.
 *  4. Add a server route under src/routes/api/public/<provider>/callback.ts
 *     to receive the redirect, then call handleOAuthCallback().
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExternalProvider = "garmin" | "strava";

const ProviderSchema = z.object({
  provider: z.enum(["garmin", "strava"]),
});

/** List the user's current integration rows (without exposing tokens). */
export const listMyIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("external_integrations")
      .select(
        "provider, provider_user_id, scope, connected_at, last_synced_at, last_sync_error, token_expires_at"
      )
      .eq("athlete_id", userId);
    if (error) throw new Error(error.message);
    return { integrations: data ?? [] };
  });

/** Disconnect: deletes the row (and therefore the stored tokens). */
export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("external_integrations")
      .delete()
      .eq("athlete_id", userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * STUB — start OAuth.
 * Real flow:
 *   - Strava: redirect to https://www.strava.com/oauth/authorize
 *       ?client_id=...&response_type=code&redirect_uri=<APP>/api/public/strava/callback
 *       &approval_prompt=auto&scope=read,activity:read_all
 *   - Garmin Connect (OAuth1): request_token → user authorization → access_token.
 * Returns the URL the browser should redirect to.
 */
export const startOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProviderSchema.parse(d))
  .handler(async ({ data }) => {
    // TODO: implement once credentials exist
    throw new Error(
      `[${data.provider}] OAuth not yet configured. Add provider API credentials to enable.`
    );
  });

/**
 * STUB — pull recent activities and upsert them into endurance_sessions.
 * Use endurance_sessions.external_provider + external_activity_id as the
 * idempotency key (unique index already exists).
 *
 * Mapping suggestion:
 *   activity.start_date     → date
 *   activity.moving_time    → actual_total_seconds
 *   activity.distance       → actual_distance_m
 *   discipline:             → 'run' | 'bike' | 'swim' based on activity.type
 *   peak/overall RPE:       → estimated from HR zones if available, else null
 */
export const syncRecentActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProviderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("external_integrations")
      .select("access_token, refresh_token, token_expires_at")
      .eq("athlete_id", userId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.access_token) {
      throw new Error(`Not connected to ${data.provider}`);
    }
    // TODO: refresh token if expired, fetch /api/v3/athlete/activities (Strava)
    // or Garmin equivalent, then upsert into endurance_sessions.
    return { imported: 0, skipped: 0, note: "sync not yet implemented" };
  });
