import type { Metadata } from "next";
import { IntakeWorkspace } from "@/components/intake/IntakeWorkspace";

export const metadata: Metadata = { title: "Report Intake · POSKOTANGGAP" };

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report } = await searchParams;
  return (
    <>
      <PageHeading
        title="Report Intake"
        description="Ubah laporan teks bebas menjadi data terstruktur. Setiap laporan wajib diperiksa dan diverifikasi operator."
      />
      <IntakeWorkspace initialReportId={typeof report === "string" ? report : null} />
    </>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
    </div>
  );
}
