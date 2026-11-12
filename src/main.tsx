import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { DataModeProvider } from "@/components/DataModeProvider";
import { LocalModeNotice } from "@/components/LocalModeNotice";
import { SimulationBanner } from "@/components/SimulationBanner";
import { IntakeWorkspace } from "@/components/intake/IntakeWorkspace";
import { LocalDashboard } from "@/components/dashboard/LocalDashboard";
import "./index.css";

function IntakePage() {
  const [params] = useSearchParams();
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-teal-accent">Ruang kerja posko <span className="mx-2 text-navy-600">/</span> Laporan</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Kelola laporan masuk.</h1>
          <p className="mt-2 text-sm text-muted">Dari pesan lapangan menjadi informasi yang siap ditindaklanjuti.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-teal-accent" /> Prototipe aktif</div>
      </div>
      <IntakeWorkspace key={params.get("report") ?? "new"} initialReportId={params.get("report")} />
    </>
  );
}

function AppLayout() {
  return (
      <DataModeProvider mode="local" aiEnabled={false}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-teal-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-navy-950"
        >
          Lewati ke konten utama
        </a>
        <SimulationBanner />
        <AppHeader mode="local" />
        <LocalModeNotice />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-9 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-white/10 py-6 text-center text-xs text-subtle">
          POSKOTANGGAP · Prototipe LOGICODIX 2026
        </footer>
      </DataModeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <Navigate to="/intake" replace /> },
      { path: "/intake", element: <IntakePage /> },
      { path: "/dashboard", element: <LocalDashboard /> },
      { path: "*", element: <Navigate to="/intake" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
