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
import { UsersPage } from "./pages/users";
import { PipelinePage } from "./pages/pipeline";
import { SettingsPage } from "./pages/settings";
import { LeadCreatePage } from "./pages/lead-create";
import { WhatsAppPage } from "./pages/whatsapp";
import { ContactsPage } from "./pages/contacts";
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
const pipelineRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/funil", component: PipelinePage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/estoque", component: InventoryPage });
const motorcycleFormRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/motocicletas/cadastrar",
  validateSearch: z.object({ edit: z.string().optional() }),
  component: InventoryPage,
});
const sellersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/vendedores", component: InventoryPage });
const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/usuarios", component: UsersPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/configuracoes", component: SettingsPage });
const leadCreateRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/leads/cadastrar", component: LeadCreatePage });
const contactsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin/contatos", component: ContactsPage });
const whatsappRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/whatsapp",
  validateSearch: z.object({ leadId: z.string().optional() }),
  component: WhatsAppPage,
});
const routeTree = rootRoute.addChildren([
  homeRoute,
  motorcycleRoute,
  sellerRoute,
  privacyRoute,
  loginRoute,
  adminRoute,
  pipelineRoute,
  inventoryRoute,
  motorcycleFormRoute,
  sellersRoute,
  usersRoute,
  settingsRoute,
  leadCreateRoute,
  contactsRoute,
  whatsappRoute,
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
