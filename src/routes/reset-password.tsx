import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Choose a new password — SETPOINT" },
    { name: "description", content: "Set a new password using your SETPOINT recovery link." },
    { property: "og:title", content: "Choose a new password — SETPOINT" },
    { property: "og:description", content: "Finish recovering access to your SETPOINT account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    let invalidTimer: ReturnType<typeof setTimeout> | undefined;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const isRecovery = hash.get("type") === "recovery" || query.get("type") === "recovery";
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (active && isRecovery && event === "PASSWORD_RECOVERY") {
        if (invalidTimer) clearTimeout(invalidTimer);
        // This event comes from the verified email link, not an existing signed-in session.
        setState("ready");
      }
    });

    if (!isRecovery) setState("invalid");
    else invalidTimer = setTimeout(() => { if (active) setState((current) => current === "ready" ? current : "invalid"); }, 3000);
    return () => { active = false; if (invalidTimer) clearTimeout(invalidTimer); subscription.unsubscribe(); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password.length > 72) { setErrorMessage("Password must be 8–72 characters."); return; }
    if (password !== confirm) { setErrorMessage("Passwords do not match."); return; }
    setSubmitting(true);
    setErrorMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) setErrorMessage(error.message);
    else {
      setPassword(""); setConfirm(""); setState("done");
      window.history.replaceState(null, "", "/reset-password");
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex justify-center"><BrandMark showWordmark /></div>
        <CardTitle>{state === "done" ? "Password updated" : "Choose a new password"}</CardTitle>
        <CardDescription>{state === "done" ? "Your password has been changed." : state === "invalid" ? "This reset link is invalid or has expired. Request a new one." : "Set a new password for your account."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {state === "checking" && <p className="text-center text-sm text-muted-foreground">Checking your link…</p>}
        {state === "ready" && <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
          <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save new password"}</Button>
        </form>}
        {state === "invalid" && <Button asChild className="w-full"><Link to="/forgot-password">Request new link</Link></Button>}
        {(state === "done" || state === "invalid") && <p className="text-center text-sm"><Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link></p>}
      </CardContent>
    </Card>
  </main>;
}