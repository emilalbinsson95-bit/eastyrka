import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/coach/admin")({
  component: AdminPage,
});

const MANAGEABLE_ROLES: AppRole[] = ["coach", "athlete", "physio", "patient"];

interface AdminUser {
  id: string;
  full_name: string | null;
  email: string | null;
  roles: string[];
}

function AdminPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin" as AppRole);
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users", query],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", {
        _query: query.trim() || null,
      });
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      grant,
    }: {
      userId: string;
      role: AppRole;
      grant: boolean;
    }) => {
      const { error } = await supabase.rpc(
        grant ? "admin_grant_role" : "admin_revoke_role",
        { _user_id: userId, _role: role },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`${v.grant ? "Granted" : "Revoked"} ${v.role}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          This page is only available to admins.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            User administration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Search for a user and toggle their roles. Granting{" "}
            <span className="font-medium text-foreground">coach</span> lets an
            athlete coach others while still being coached by you.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-9"
            />
          </div>

          {usersQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(usersQuery.data ?? []).map((u) => (
                <li key={u.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.full_name || "(no name)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MANAGEABLE_ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <Button
                          key={r}
                          size="sm"
                          variant={has ? "default" : "outline"}
                          className="h-7 px-2 text-xs capitalize"
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({
                              userId: u.id,
                              role: r,
                              grant: !has,
                            })
                          }
                        >
                          {r}
                        </Button>
                      );
                    })}
                    {u.roles.includes("admin") && (
                      <Badge variant="secondary" className="text-xs">
                        admin
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
              {(usersQuery.data ?? []).length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  No users found.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
