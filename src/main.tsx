import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { DataModeProvider } from "@/components/DataModeProvider";
import { LocalModeNotice } from "@/components/LocalModeNotice";
import { SimulationBanner } from "@/components/SimulationBanner";
import { IntakeWorkspace } from "@/components/intake/IntakeWorkspace";
import { ReporterPage } from "@/components/report/ReporterPage";
import { LocalDashboard } from "@/components/dashboard/LocalDashboard";
import "./index.css";

function IntakePage() {
  const [params] = useSearchParams();
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Laporan &amp; verifikasi</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Ubah pesan lapangan menjadi data kebutuhan yang diperiksa operator sebelum dihitung.</p>
      </div>
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
      <SimulationBanner />
      <AppHeader team={team} />
      {team && <LocalModeNotice />}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-9 lg:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-navy-700 bg-white py-5 text-center text-xs text-subtle">
        POSKOTANGGAP · Prototipe LOGICODIX 2026 · Hitungan kebutuhan deterministik; AI hanya memberi saran
      </footer>
    </DataModeProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Shell team={false} />,
    children: [{ path: "/", element: <ReporterPage /> }],
  },
  {
    element: <Shell team />,
    children: [
      { path: "/intake", element: <IntakePage /> },
      { path: "/dashboard", element: <LocalDashboard /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
