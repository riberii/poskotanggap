import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Report Intake</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Ubah laporan teks bebas menjadi data terstruktur. Setiap laporan wajib diperiksa dan diverifikasi operator.
        </p>
      </div>
      <IntakeWorkspace initialReportId={params.get("report")} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Mode "local" saja: data di localStorage, ekstraksi RuleBasedExtractor, tanpa AI/Supabase. */}
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
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<Navigate to="/intake" replace />} />
            <Route path="/intake" element={<IntakePage />} />
            <Route path="/dashboard" element={<LocalDashboard />} />
            <Route path="*" element={<Navigate to="/intake" replace />} />
          </Routes>
        </main>
        <footer className="border-t border-navy-700 py-6 text-center text-xs text-subtle">
          POSKOTANGGAP · prototipe hackathon LOGICODIX 2026 · bukan sistem produksi
        </footer>
      </DataModeProvider>
    </BrowserRouter>
  </StrictMode>,
);
