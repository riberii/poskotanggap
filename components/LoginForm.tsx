"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button, Field, inputClass } from "@/components/ui/form";

export function LoginForm({ url, anonKey }: { url: string; anonKey: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient(url, anonKey);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Email atau kata sandi salah.");
      return;
    }
    router.replace("/intake");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <Field label="Email" htmlFor="email">
        <input id="email" type="email" autoComplete="email" required className={inputClass} value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Kata sandi" htmlFor="password">
        <input id="password" type="password" autoComplete="current-password" required className={inputClass}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? "Masuk…" : "Masuk"}
      </Button>
    </form>
  );
}
