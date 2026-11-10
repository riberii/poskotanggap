import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Login operator · POSKOTANGGAP" };

export default function LoginPage() {
  const config = getSupabasePublicConfig();
  return (
    <div className="mx-auto mt-8 max-w-sm rounded-lg border border-navy-700 bg-navy-900 p-6">
      <h1 className="text-lg font-semibold">Login operator</h1>
      {config ? (
        <>
          <p className="mt-1 text-sm text-muted">Hanya akun yang terdaftar sebagai operator yang dapat mengakses data.</p>
          <LoginForm url={config.url} anonKey={config.anonKey} />
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Supabase belum dikonfigurasi, sehingga aplikasi berjalan dalam mode prototipe: data simulasi disimpan di localStorage browser ini dan tidak memerlukan login.{" "}
          <Link href="/intake" className="text-teal-strong underline underline-offset-2">
            Buka Report Intake
          </Link>
        </p>
      )}
    </div>
  );
}
