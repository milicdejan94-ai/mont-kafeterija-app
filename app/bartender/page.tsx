"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Product, ShiftType } from "@/lib/types";
import {
  Button,
  Card,
  Input,
  SecondaryButton,
  Select,
  Textarea
} from "@/components/ui";
import { LogOut } from "lucide-react";

type Item = {
  product_id: string;
  quantity: string;
};

type ShiftStatus = {
  shift: ShiftType;
  status: "active" | "cancelled" | "open";
  can_submit: boolean;
  cancel_reason: string | null;
};

type ReentryTask = {
  report_id: string;
  date: string;
  shift: ShiftType;
  cancel_reason: string | null;
  cancelled_at: string | null;
};

function localTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().trim();
}

function sortProductsAZ(products: Product[]) {
  return [...products].sort((a, b) => a.name.localeCompare(b.name, "bs"));
}

function productMatchesSearch(product: Product, search: string) {
  const q = normalizeText(search);
  if (!q) return true;

  return (
    normalizeText(product.name).includes(q) ||
    normalizeText(product.category).includes(q) ||
    normalizeText(product.package_size).includes(q) ||
    normalizeText(product.unit).includes(q)
  );
}

function shiftLabel(shift: ShiftType) {
  return shift === "first" ? "Prva smjena" : "Druga smjena";
}

function oppositeShiftLabel(shift: ShiftType) {
  return shift === "first" ? "Drugu smjenu" : "Prvu smjenu";
}

export default function BartenderPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedDate, setSelectedDate] = useState(localTodayDate());
  const [shift, setShift] = useState<ShiftType>("first");
  const [items, setItems] = useState<Item[]>([{ product_id: "", quantity: "" }]);
  const [note, setNote] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [preview, setPreview] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [shiftStatuses, setShiftStatuses] = useState<ShiftStatus[]>([]);
  const [reentryTasks, setReentryTasks] = useState<ReentryTask[]>([]);

  const today = localTodayDate();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!loading) {
      refreshShiftStatus(selectedDate);
    }
  }, [selectedDate, loading]);

  async function loadInitialData() {
    setLoading(true);
    setError("");

    const { data: authData } = await supabase.auth.getUser();

    if (!authData.user) {
      router.replace("/login");
      return;
    }

    setUserId(authData.user.id);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active, full_name")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    if (profile?.role !== "bartender" || !profile?.active) {
      router.replace("/login");
      return;
    }

    setUserName(profile?.full_name || "Šanker");

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name");

    if (productError) {
      setError(productError.message);
    }

    setProducts(sortProductsAZ((productData ?? []) as Product[]));

    await Promise.all([
      refreshShiftStatus(selectedDate),
      refreshReentryTasks()
    ]);

    setLoading(false);
  }

  async function refreshShiftStatus(dateValue: string) {
    const { data, error: rpcError } = await supabase.rpc(
      "get_bartender_shift_status",
      {
        p_date: dateValue
      }
    );

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setShiftStatuses((data ?? []) as ShiftStatus[]);
  }

  async function refreshReentryTasks() {
    const { data, error: rpcError } = await supabase.rpc(
      "get_bartender_reentry_tasks"
    );

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setReentryTasks((data ?? []) as ReentryTask[]);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const productById = useMemo(() => {
    return Object.fromEntries(products.map((p) => [p.id, p]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return sortProductsAZ(
      products.filter((p) => productMatchesSearch(p, productSearch))
    );
  }, [products, productSearch]);

  const cleanItems = useMemo(() => {
    return items.filter((i) => i.product_id && Number(i.quantity) > 0);
  }, [items]);

  const selectedShiftStatus = useMemo(() => {
    return shiftStatuses.find((s) => s.shift === shift);
  }, [shiftStatuses, shift]);

  const isFutureDate = selectedDate > today;
  const isTodayDate = selectedDate === today;
  const isAllowedReentryDate = selectedShiftStatus?.status === "cancelled";
  const canSubmitForSelectedDate = isTodayDate || isAllowedReentryDate;

  const firstShiftStatus = shiftStatuses.find((s) => s.shift === "first");
  const secondShiftStatus = shiftStatuses.find((s) => s.shift === "second");

  const quantityTotal = useMemo(() => {
    return cleanItems.reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);
  }, [cleanItems]);

  function addItem() {
    setItems([...items, { product_id: "", quantity: "" }]);
  }

  function updateItem(index: number, field: keyof Item, value: string) {
    const copy = [...items];
    copy[index] = { ...copy[index], [field]: value };
    setItems(copy);
  }

  function removeItem(index: number) {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [{ product_id: "", quantity: "" }]);
  }

  function resetForm() {
    setItems([{ product_id: "", quantity: "" }]);
    setNote("");
    setProductSearch("");
    setPreview(false);
    setError("");
  }

  async function chooseReentryTask(task: ReentryTask) {
    setSelectedDate(task.date);
    setShift(task.shift);
    resetForm();
    await refreshShiftStatus(task.date);
  }

  function goToPreview() {
    setError("");

    if (isFutureDate) {
      setError("Ne može se zaključiti smjena za datum u budućnosti.");
      return;
    }

    if (!canSubmitForSelectedDate) {
      setError(
        "Ne može se zaključiti smjena za prošli datum. Prošli datum je dozvoljen samo ako je admin poništio tvoju smjenu i traži se ponovni unos."
      );
      return;
    }

    if (selectedShiftStatus?.status === "active" || selectedShiftStatus?.can_submit === false) {
      setError(
        `${shiftLabel(
          shift
        )} je već zaključena za datum ${selectedDate}. Odabrali ste ${shiftLabel(
          shift
        ).toLowerCase()}. Ako ste druga smjena i zaboravili ste promijeniti smjenu, vratite se gore i odaberite ${oppositeShiftLabel(
          shift
        )}.`
      );
      return;
    }

    if (cleanItems.length === 0) {
      setError("Unesi makar jednu stavku potrošnje.");
      return;
    }

    setPreview(true);
  }

  async function submitFinal() {
    setError("");
    setSubmitting(true);

    if (isFutureDate) {
      setSubmitting(false);
      setPreview(false);
      setError("Ne može se zaključiti smjena za datum u budućnosti.");
      return;
    }

    if (!canSubmitForSelectedDate) {
      setSubmitting(false);
      setPreview(false);
      setError(
        "Ne može se zaključiti smjena za prošli datum. Prošli datum je dozvoljen samo ako je admin poništio tvoju smjenu i traži se ponovni unos."
      );
      return;
    }

    await refreshShiftStatus(selectedDate);

    const currentStatus = shiftStatuses.find((s) => s.shift === shift);

    if (currentStatus?.status === "active" || currentStatus?.can_submit === false) {
      setSubmitting(false);
      setPreview(false);
      setError(
        `${shiftLabel(
          shift
        )} je već zaključena za datum ${selectedDate}. Ako ste druga smjena, vratite se i odaberite Drugu smjenu.`
      );
      return;
    }

    const payload = cleanItems.map((i) => ({
      product_id: i.product_id,
      quantity: Number(i.quantity)
    }));

    if (!payload.length) {
      setSubmitting(false);
      setError("Unesi makar jednu stavku.");
      return;
    }

    const { error: rpcError } = await supabase.rpc("submit_consumption", {
      p_location: "bar",
      p_shift: shift,
      p_event_name: null,
      p_note: note || null,
      p_user_id: userId,
      p_items: payload,
      p_date: selectedDate
    });

    if (rpcError) {
      setSubmitting(false);

      if (
        rpcError.message.includes("unique_active_bar_shift_per_day") ||
        rpcError.message.includes("duplicate key")
      ) {
        setPreview(false);
        setError(
          `${shiftLabel(
            shift
          )} je već zaključena za ovaj datum. Ako ste druga smjena, vratite se i odaberite Drugu smjenu.`
        );
        return;
      }

      setError(rpcError.message);
      return;
    }

    await Promise.all([
      refreshShiftStatus(selectedDate),
      refreshReentryTasks()
    ]);

    setSubmitting(false);
    setDone(true);
  }

  function ShiftStatusBox({
    title,
    shiftKey,
    status
  }: {
    title: string;
    shiftKey: ShiftType;
    status?: ShiftStatus;
  }) {
    const currentStatus = status?.status ?? "open";

    const isActive = currentStatus === "active";
    const isCancelled = currentStatus === "cancelled";
    const isOpen = currentStatus === "open";

    return (
      <button
        type="button"
        onClick={() => {
          setShift(shiftKey);
          resetForm();
        }}
        className={`rounded-2xl p-4 text-left transition ${
          isActive
            ? "bg-green-50 hover:bg-green-100"
            : isCancelled
              ? "bg-yellow-50 hover:bg-yellow-100"
              : "bg-red-50 hover:bg-red-100"
        } ${shift === shiftKey ? "ring-2 ring-mont-gold" : ""}`}
      >
        <p className="text-xs font-bold uppercase tracking-wide text-black/50">
          {title}
        </p>

        <p
          className={`mt-1 font-black ${
            isActive
              ? "text-green-800"
              : isCancelled
                ? "text-yellow-800"
                : "text-red-800"
          }`}
        >
          {isActive
            ? "Zaključena"
            : isCancelled
              ? "Poništena - ponovni unos"
              : "Nije zaključena"}
        </p>

        {isOpen && (
          <p className="mt-1 text-xs text-black/60">Smjena je slobodna za unos.</p>
        )}

        {isActive && (
          <p className="mt-1 text-xs text-black/60">
            Smjena je već zaključena. Sadržaj nije prikazan.
          </p>
        )}

        {isCancelled && status?.cancel_reason && (
          <p className="mt-1 text-xs text-black/60">
            Razlog: {status.cancel_reason}
          </p>
        )}
      </button>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mont-cream p-6">
        <Card className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-black">Učitavanje...</h1>
          <p className="text-black/60">Provjeravam korisnika i smjene.</p>
        </Card>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-mont-cream p-6">
        <Card className="max-w-md text-center">
          <h1 className="mb-3 text-3xl font-black">Smjena je zaključena.</h1>
          <p className="mb-5 text-black/60">
            Dokument je poslan adminu i više nije dostupan za pregled ili izmjenu.
          </p>
          <Button onClick={logout}>Izlaz</Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-mont-cream p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-3xl bg-mont-dark p-6 text-white md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-mont-gold">
              Šanker unos
            </p>
            <h1 className="text-2xl font-black">Potrošnja smjene</h1>
            <p className="mt-1 text-sm text-white/70">{userName}</p>
          </div>

          <button
            onClick={logout}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
          >
            <LogOut className="mr-1 inline h-4 w-4" /> Izlaz
          </button>
        </header>

        {reentryTasks.length > 0 && (
          <Card>
            <h2 className="mb-3 text-xl font-black">
              Smjene koje treba ponovo unijeti
            </h2>
            <p className="mb-4 text-sm text-black/60">
              Admin je poništio ove tvoje smjene. Lager je vraćen i treba ponovo
              unijeti ispravan promet za taj datum.
            </p>

            <div className="grid gap-2 md:grid-cols-2">
              {reentryTasks.map((task) => (
                <button
                  type="button"
                  key={task.report_id}
                  onClick={() => chooseReentryTask(task)}
                  className="rounded-2xl bg-yellow-50 p-4 text-left text-yellow-900 transition hover:bg-yellow-100"
                >
                  <b>
                    {task.date} —{" "}
                    {task.shift === "first" ? "Prva smjena" : "Druga smjena"}
                  </b>
                  <p className="mt-1 text-sm">
                    {task.cancel_reason || "Poništeno od strane admina"}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-black/5 p-4">
              <label className="text-xs font-bold uppercase tracking-wide text-black/50">
                Datum unosa
              </label>
              <Input
                className="mt-2"
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => {
                  const nextDate = e.target.value;

                  if (nextDate > today) {
                    setError("Ne može se odabrati datum u budućnosti.");
                    setSelectedDate(today);
                    resetForm();
                    return;
                  }

                  setSelectedDate(nextDate);
                  resetForm();
                }}
              />
              <p className="mt-2 text-xs text-black/50">
                Redovno je dozvoljen samo današnji datum: <b>{today}</b>. Prošli
                datum je dozvoljen samo preko obavještenja za poništenu smjenu.
              </p>
            </div>

            <ShiftStatusBox
              title="Prva smjena"
              shiftKey="first"
              status={firstShiftStatus}
            />

            <ShiftStatusBox
              title="Druga smjena"
              shiftKey="second"
              status={secondShiftStatus}
            />
          </div>
        </Card>

        {!preview ? (
          <Card>
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h2 className="text-xl font-black">Unesi potrošnju</h2>
                <p className="mt-1 text-sm text-black/60">
                  Trenutno odabrano: <b>{selectedDate}</b> —{" "}
                  <b>{shiftLabel(shift)}</b>
                </p>
              </div>

              <div className="min-w-[220px]">
                <label className="mb-1 block text-sm font-semibold">Smjena</label>
                <Select
                  value={shift}
                  onChange={(e) => {
                    setShift(e.target.value as ShiftType);
                    resetForm();
                  }}
                >
                  <option value="first">Prva smjena</option>
                  <option value="second">Druga smjena</option>
                </Select>
              </div>
            </div>

            {!canSubmitForSelectedDate && (
              <div className="mb-4 rounded-2xl bg-red-50 p-5 text-red-800">
                <h3 className="text-lg font-black">
                  Unos za ovaj datum nije dozvoljen.
                </h3>
                <p className="mt-1 text-sm">
                  Šanker može zaključiti samo današnji datum. Prošli datum može
                  zaključiti samo ako je admin poništio njegovu smjenu i postoji
                  obavještenje za ponovni unos.
                </p>
              </div>
            )}

            {selectedShiftStatus?.status === "active" || selectedShiftStatus?.can_submit === false ? (
              <div className="rounded-2xl bg-red-50 p-5 text-red-800">
                <h3 className="text-lg font-black">
                  {shiftLabel(shift)} je već zaključena za datum {selectedDate}.
                </h3>
                <p className="mt-1 text-sm">
                  Odabrali ste {shiftLabel(shift).toLowerCase()}. Ako ste druga
                  smjena i zaboravili ste promijeniti smjenu, vratite se gore i
                  odaberite <b>{oppositeShiftLabel(shift)}</b>.
                </p>
              </div>
            ) : (
              <>
                {selectedShiftStatus?.status === "cancelled" && (
                  <div className="mb-4 rounded-2xl bg-yellow-50 p-4 text-yellow-900">
                    <h3 className="font-black">
                      {shiftLabel(shift)} je bila poništena za datum {selectedDate}.
                    </h3>
                    <p className="mt-1 text-sm">
                      Lager je vraćen nazad. Sada treba unijeti novi ispravan promet
                      za ovu smjenu.
                    </p>
                    {selectedShiftStatus.cancel_reason && (
                      <p className="mt-1 text-sm">
                        Razlog poništavanja:{" "}
                        <b>{selectedShiftStatus.cancel_reason}</b>
                      </p>
                    )}
                  </div>
                )}

                <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
                  <Input
                    placeholder="Pretraži artikal po nazivu, kategoriji ili pakovanju..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />

                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setProductSearch("");
                      addItem();
                    }}
                  >
                    + Dodaj stavku
                  </SecondaryButton>
                </div>

                <div className="space-y-2">
                  {items.map((it, idx) => {
                    const selectedProduct = productById[it.product_id] as
                      | Product
                      | undefined;

                    return (
                      <div
                        key={idx}
                        className="grid gap-2 rounded-2xl border bg-white p-3 md:grid-cols-[1fr_150px_90px]"
                      >
                        <Select
                          value={it.product_id}
                          onChange={(e) => updateItem(idx, "product_id", e.target.value)}
                        >
                          <option value="">Izaberi piće</option>
                          {filteredProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.package_size ?? ""}
                            </option>
                          ))}
                        </Select>

                        <Input
                          type="number"
                          step="0.01"
                          placeholder={`Količina${
                            selectedProduct?.unit ? ` (${selectedProduct.unit})` : ""
                          }`}
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        />

                        <SecondaryButton type="button" onClick={() => removeItem(idx)}>
                          Ukloni
                        </SecondaryButton>
                      </div>
                    );
                  })}
                </div>

                <Textarea
                  className="mt-4"
                  placeholder="Napomena, ako treba"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />

                {error && (
                  <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-black/60">
                    Stavki za slanje: <b>{cleanItems.length}</b> • Ukupna količina:{" "}
                    <b>{quantityTotal.toFixed(2)}</b>
                  </div>

                  <Button onClick={goToPreview} disabled={!canSubmitForSelectedDate}>
                    Pregledaj dokument prije slanja
                  </Button>
                </div>
              </>
            )}
          </Card>
        ) : (
          <Card>
            <h2 className="mb-2 text-xl font-black">Pregled dokumenta prije slanja</h2>
            <p className="mb-4 text-sm text-black/60">
              Provjeri datum, smjenu, artikle i količine. Cijene nisu prikazane
              šankeru.
            </p>

            <div className="rounded-xl border p-4">
              <p>
                <b>Datum:</b> {selectedDate}
              </p>
              <p>
                <b>Smjena:</b> {shiftLabel(shift)}
              </p>
              <p>
                <b>Šanker:</b> {userName}
              </p>
              {note && (
                <p>
                  <b>Napomena:</b> {note}
                </p>
              )}
            </div>

            <div className="mt-4 overflow-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/5">
                  <tr>
                    <th className="p-3">Artikal</th>
                    <th>Količina</th>
                    <th>Jedinica</th>
                  </tr>
                </thead>

                <tbody>
                  {cleanItems.map((it, idx) => {
                    const p = productById[it.product_id] as Product | undefined;

                    return (
                      <tr key={idx} className="border-t">
                        <td className="p-3 font-semibold">{p?.name}</td>
                        <td>{Number(it.quantity).toFixed(2)}</td>
                        <td>{p?.unit || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl bg-black/5 p-4 text-sm">
              Ukupno stavki: <b>{cleanItems.length}</b> • Ukupna količina:{" "}
              <b>{quantityTotal.toFixed(2)}</b>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <SecondaryButton onClick={() => setPreview(false)}>
                Vrati se na izmjenu
              </SecondaryButton>

              <Button onClick={submitFinal} disabled={submitting}>
                {submitting ? "Šaljem..." : "Zaključi smjenu"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
