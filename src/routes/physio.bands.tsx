import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/physio/bands")({
  head: () => ({
    meta: [
      { title: "Resistance bands — EA Physio" },
      {
        name: "description",
        content: "Manage the resistance-band library used in rehab plans.",
      },
    ],
  }),
  component: BandsPage,
});

function BandsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["resistance-bands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resistance_bands")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [color, setColor] = useState("#3B82F6");
  const [label, setLabel] = useState("");
  const [minKg, setMinKg] = useState("");
  const [maxKg, setMaxKg] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      if (!label.trim()) throw new Error("Label required");
      const mn = Number(minKg);
      const mx = Number(maxKg);
      if (!(mx >= mn)) throw new Error("Max must be ≥ min");
      const sortOrder = (query.data ?? []).length + 1;
      const { error } = await supabase.from("resistance_bands").insert({
        color,
        label: label.trim(),
        min_kg: mn,
        max_kg: mx,
        sort_order: sortOrder,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Band added");
      setLabel("");
      setMinKg("");
      setMaxKg("");
      qc.invalidateQueries({ queryKey: ["resistance-bands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("resistance_bands")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["resistance-bands"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const bands = query.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" /> Resistance bands
        </h1>
        <p className="text-sm text-muted-foreground">
          Color-coded band library used when prescribing rehab exercises.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Library ({bands.length})</CardTitle>
          <CardDescription>
            Seeded with the standard six colors. Add your own — only you can
            edit or delete bands you created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {bands.map((b) => {
              const owned = b.created_by === user!.id;
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 py-2 text-sm"
                >
                  <span
                    className="inline-block h-5 w-5 rounded-full border border-border"
                    style={{ background: b.color }}
                    aria-hidden
                  />
                  <span className="w-24 font-medium">{b.label}</span>
                  <span className="text-muted-foreground">
                    {Number(b.min_kg)}–{Number(b.max_kg)} kg
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {owned ? "yours" : "system / shared"}
                  </span>
                  {owned && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(b.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
            {bands.length === 0 && !query.isLoading && (
              <p className="py-2 text-sm text-muted-foreground">
                No bands yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Add a band
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Color</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 p-1"
              />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Orange XL"
              />
            </div>
            <div>
              <Label className="text-xs">Min (kg)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={minKg}
                onChange={(e) => setMinKg(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Max (kg)</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={maxKg}
                onChange={(e) => setMaxKg(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            <Plus className="mr-1 h-4 w-4" /> Add band
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
