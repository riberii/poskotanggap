import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { DataModeProvider } from "@/components/DataModeProvider";
import { LocalModeNotice } from "@/components/LocalModeNotice";
import { SimulationBanner } from "@/components/SimulationBanner";
import { IntakeWorkspace } from "@/components/intake/IntakeWorkspace";
import { StatusPage } from "@/components/report/StatusPage";
import { ReporterPage } from "@/components/report/ReporterPage";
import { DemoPage } from "@/components/demo/DemoPage";
import { LocalDashboard } from "@/components/dashboard/LocalDashboard";
import "./index.css";

function IntakePage() {
  const [params] = useSearchParams();
  return (
    <>
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Periksa laporan</h1>
      <IntakeWorkspace key={params.get("report") ?? "new"} initialReportId={params.get("report")} />
    </>
  );
}

function Shell({ team }: { team: boolean }) {
  return (
    <DataModeProvider mode="local" aiEnabled={false}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-teal-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Lewati ke konten utama
      </a>
      {!team && <SimulationBanner />}
      <AppHeader team={team} />
      {team && <LocalModeNotice />}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-9 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-navy-700 bg-white py-5 text-center text-xs text-subtle">
        POSKOTANGGAP · Prototipe 2026 · AI hanya saran
      </footer>
    </DataModeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell team={false} />,
    children: [{ path: "/", element: <ReporterPage /> }, { path: "/status/:code", element: <StatusPage /> }],
  },
  {
    element: <Shell team />,
    children: [
      { path: "/intake", element: <IntakePage /> },
      { path: "/dashboard", element: <LocalDashboard /> },
    ],
  },
  {
    // Alat presentasi: halaman terpisah tanpa Shell (kedua bingkai di dalamnya memuat Shell masing-masing).
    path: "/demo",
    element: (
      <DataModeProvider mode="local" aiEnabled={false}>
        <DemoPage />
      </DataModeProvider>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
