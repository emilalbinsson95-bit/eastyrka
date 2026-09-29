import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/BrandMark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [
    { title: "Forgot password — SETPOINT" },
    { name: "description", content: "Request a password reset link for your SETPOINT account." },
    { property: "og:title", content: "Forgot password — SETPOINT" },
    { property: "og:description", content: "Recover access to your SETPOINT account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setErrorMessage("The link could not be sent right now. Please try again shortly.");
      else setSent(true);
    } catch {
      setErrorMessage("The link could not be sent right now. Please try again shortly.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex justify-center"><BrandMark showWordmark /></div>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>{sent ? "Check your email for a link to choose a new password. Check spam if it doesn't arrive." : "Enter the email address for your account."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!sent && <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="recovery-email">Email</Label><Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} /></div>
          {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
          <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send reset link"}</Button>
        </form>}
        <p className="text-center text-sm"><Link to="/login" className="font-medium text-primary hover:underline">Back to sign in</Link></p>
      </CardContent>
    </Card>
  </main>;
}