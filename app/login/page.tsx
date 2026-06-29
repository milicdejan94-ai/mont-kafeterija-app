"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button, Card, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setError("Neispravan email ili šifra.");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", data.user.id).single();
    if (!profile?.active) {
      setError("Korisnik nije aktivan.");
      setLoading(false);
      return;
    }
    router.replace(profile.role === "admin" ? "/admin" : "/bartender");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-mont-cream p-6">
      <Card className="w-full max-w-md">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-mont-gold">Mont Kafeterija</p>
        <h1 className="mb-6 text-3xl font-black">Prijava</h1>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Šifra</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button disabled={loading} className="w-full">{loading ? "Prijava..." : "Uđi"}</Button>
        </form>
      </Card>
    </main>
  );
}
