import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_coach/templates")({
  head: () => ({
    meta: [
      { title: "Plan templates — EAkoefficient Coach" },
      { name: "description", content: "Reusable week templates for your athletes." },
    ],
  }),
  component: TemplatesPage,
});

function TemplatesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Plan templates</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Save common training weeks as reusable templates and apply them to any
            athlete in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          For now, build week plans directly on each athlete's page (week builder
          ships next).
        </CardContent>
      </Card>
    </div>
  );
}
