import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { DataModeProvider } from "@/components/DataModeProvider";
import { LocalModeNotice } from "@/components/LocalModeNotice";
import { SimulationBanner } from "@/components/SimulationBanner";
import { getDataMode, isAiExtractionEnabled } from "@/lib/data";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "POSKOTANGGAP — Prototipe konsol operator posko",
  description:
    "Prototipe hackathon untuk merapikan laporan bencana teks bebas. Data simulasi, tidak terhubung ke layanan tanggap darurat resmi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getDataMode();
  return (
    <html lang="id" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-teal-accent focus:px-3 focus:py-2 focus:text-navy-950"
        >
          Lewati ke konten
        </a>
        <DataModeProvider mode={mode} aiEnabled={isAiExtractionEnabled()}>
          <SimulationBanner />
          <AppHeader mode={mode} />
          {mode === "local" && <LocalModeNotice />}
          <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </DataModeProvider>
        <footer className="border-t border-navy-700 py-6 text-center text-xs text-subtle">
          POSKOTANGGAP · prototipe hackathon LOGICODIX 2026 · bukan sistem produksi
        </footer>
      </body>
    </html>
  );
}
