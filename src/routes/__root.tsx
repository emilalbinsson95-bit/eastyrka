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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EA Training System — Coaching & Rehab Monitoring Platform" },
      {
        name: "description",
        content:
          "Monitor athletes, patients and rehab progress. For coaches, athletes, physiotherapists and their patients.",
      },
      { name: "author", content: "EA Training System" },
      { property: "og:title", content: "EA Training System — Coaching & Rehab Monitoring Platform" },
      {
        property: "og:description",
        content:
          "Real-time readiness tracking for coaches and athletes, plus rehab session monitoring for physiotherapists and their patients.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "EA Training System — Coaching & Rehab Monitoring Platform" },
      { name: "twitter:description", content: "Coaching and rehab progress monitoring in one professional platform." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bdd18a74-4ba8-43c0-beec-a3f7677f17a9/id-preview-37c2bf53--369f24af-f4f2-4fad-9b2f-2b98e3b979d6.lovable.app-1777283904089.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/bdd18a74-4ba8-43c0-beec-a3f7677f17a9/id-preview-37c2bf53--369f24af-f4f2-4fad-9b2f-2b98e3b979d6.lovable.app-1777283904089.png" },
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
          name: "EA Training System",
          url: "https://eastyrka.lovable.app",
          description:
            "Coaching and rehab monitoring platform for coaches, athletes, physiotherapists and patients.",
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
          name: "EA Training System",
          url: "https://eastyrka.lovable.app",
          logo: "https://eastyrka.lovable.app/icon-512.png",
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
