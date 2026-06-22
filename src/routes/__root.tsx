import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import "@/lib/i18n";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0A0E1A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "SETPOINT" },
      { title: "SETPOINT — Train at your readiness" },
      {
        name: "description",
        content:
          "SETPOINT is the readiness baseline for strength. Per-set fatigue-limit detection and EAkoefficient readiness for serious lifters and their coaches.",
      },
      { name: "author", content: "SETPOINT" },
      { property: "og:site_name", content: "SETPOINT" },
      { property: "og:title", content: "SETPOINT — Train at your readiness" },
      {
        property: "og:description",
        content:
          "The readiness baseline for strength. Every set tells you if you should push or pull back.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SETPOINT — Train at your readiness" },
      { name: "twitter:description", content: "The readiness baseline for strength. Per-set fatigue-limit detection for lifters and coaches." },
      { property: "og:image", content: "https://eastyrka.lovable.app/__l5e/assets-v1/b689a073-500c-4544-9005-bfee4934a2f3/setpoint-og.jpg" },
      { name: "twitter:image", content: "https://eastyrka.lovable.app/__l5e/assets-v1/b689a073-500c-4544-9005-bfee4934a2f3/setpoint-og.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "SETPOINT",
          url: "https://eastyrka.lovable.app",
          description:
            "The readiness baseline for strength. Per-set fatigue-limit detection and EAkoefficient readiness for serious lifters and their coaches.",
          inLanguage: ["en", "sv"],
          potentialAction: {
            "@type": "SearchAction",
            target: "https://eastyrka.lovable.app/?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SETPOINT",
          url: "https://eastyrka.lovable.app",
          logo: "https://eastyrka.lovable.app/__l5e/assets-v1/4bf5e6a5-90ae-4231-a3ba-35d301d670a7/setpoint-logo.png",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors closeButton />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
