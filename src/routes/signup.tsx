import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useAuth, type AppRole } from "@/lib/auth";
import { toast } from "sonner";

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Please enter your name")
    .max(100, "Name must be under 100 characters"),
  email: z.string().trim().email("Invalid email").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be under 72 characters"),
  role: z.enum(["coach", "athlete", "physio", "patient"]),
});

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — EA Training System" },
      {
        name: "description",
        content:
          "Create an account on EA Training System — for coaches, athletes, physiotherapists and patients.",
      },
      { property: "og:title", content: "Sign up — EA Training System" },
      {
        property: "og:description",
        content: "Get started in minutes. Pick your role and start tracking training or rehab.",
      },
      { property: "og:url", content: "https://set-smart-guide.lovable.app/signup" },
    ],
    links: [{ rel: "canonical", href: "https://set-smart-guide.lovable.app/signup" }],
  }),
  component: SignupPage,
});

function roleHome(r: AppRole) {
  if (r === "coach") return "/coach" as const;
  if (r === "physio") return "/physio" as const;
  if (r === "patient") return "/patient" as const;
  return "/today" as const;
}

function SignupPage() {
  const { signUp, user, role: userRole, loading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("athlete");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && userRole) {
      const target = roleHome(userRole);
      if (target === "/coach") navigate({ to: "/coach" });
      else if (target === "/physio") navigate({ to: "/physio" });
      else if (target === "/patient") navigate({ to: "/patient" });
      else navigate({ to: "/today" });
    }
  }, [user, userRole, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = signupSchema.safeParse({ fullName, email, password, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }

    setSubmitting(true);
    const { error } = await signUp(
      parsed.data.email,
      parsed.data.password,
      parsed.data.fullName,
      parsed.data.role,
    );
    setSubmitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success("Account created — signing you in…");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Choose your role — you can only have one per account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={72}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>I am a…</Label>
              <RadioGroup
                value={role}
                onValueChange={(v) => setRole(v as AppRole)}
                className="grid grid-cols-2 gap-2"
              >
                {(
                  [
                    { v: "athlete", label: "Athlete" },
                    { v: "coach", label: "Coach" },
                    { v: "patient", label: "Patient" },
                    { v: "physio", label: "Physiotherapist" },
                  ] as const
                ).map((opt) => (
                  <Label
                    key={opt.v}
                    htmlFor={`role-${opt.v}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-input p-3 text-sm hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <RadioGroupItem value={opt.v} id={`role-${opt.v}`} />
                    {opt.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
