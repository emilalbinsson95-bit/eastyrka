import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Attaches the user's Supabase bearer token to every serverFn RPC so
// `requireSupabaseAuth` can validate it on the server side.
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
