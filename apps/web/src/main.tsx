import React from "react";
import ReactDOM from "react-dom/client";
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { PublicLayout } from "./components/layout";
import { HomePage } from "./pages/home";
import { LoginPage } from "./pages/login";
import { MotorcyclePage } from "./pages/motorcycle";
import { PrivacyPage } from "./pages/privacy";
import { SellerPage } from "./pages/seller";
import { AdminPage } from "./pages/admin";
import { InventoryPage } from "./pages/inventory";
import { captureCampaignParams } from "./lib/campaign";
import { z } from "zod";
import "./styles.css";

captureCampaignParams();

function withPublicLayout(Page: ComponentType) {
  return function PublicPage() {
    return <PublicLayout><Page /></PublicLayout>;
  };
}

const rootRoute = createRootRoute({ component: Outlet });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: withPublicLayout(HomePage) });
const motorcycleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/motos/$slug",
  validateSearch: z.object({ seller: z.string().optional() }),
  component: withPublicLayout(MotorcyclePage),
});
const sellerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/vendedor/$slug", component: withPublicLayout(SellerPage) });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/privacidade", component: withPublicLayout(PrivacyPage) });
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginPage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/estoque", component: InventoryPage });
const routeTree = rootRoute.addChildren([
  homeRoute,
  motorcycleRoute,
  sellerRoute,
  privacyRoute,
  loginRoute,
  adminRoute,
  inventoryRoute,
]);
const router = createRouter({ routeTree, defaultPreload: "intent" });
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
