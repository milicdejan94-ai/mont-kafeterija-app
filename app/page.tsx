"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, Button } from "@/components/ui";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      supabase.from("profiles").select("role").eq("id", data.session.user.id).single().then(({ data: profile }) => {
        router.replace(profile?.role === "admin" ? "/admin" : "/bartender");
      });
    });
  }, [router]);

  return (
    <main className="min-h-screen bg-mont-cream p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 py-16">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-mont-gold">Mont Kafeterija</p>
          <h1 className="text-4xl font-black text-mont-dark md:text-6xl">Lager, potrošnja i izvještaji.</h1>
          <p className="mt-5 max-w-2xl text-lg text-black/70">Interna aplikacija za stanje pića na šanku i u magacinu, unos potrošnje po smjenama, prijem robe i finansijske preglede.</p>
        </div>
        <Card className="max-w-xl">
          <h2 className="mb-2 text-xl font-bold">Prijava u aplikaciju</h2>
          <p className="mb-5 text-sm text-black/60">Admin vidi sve. Šanker vidi samo unos potrošnje, pregled prije zaključavanja i submit.</p>
          <Button onClick={() => router.push("/login")}>Otvori login</Button>
        </Card>
      </div>
    </main>
  );
}
