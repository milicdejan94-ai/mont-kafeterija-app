"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Product, StockRow, LocationType } from "@/lib/types";
import { Button, Card, Input, money, SecondaryButton, Select, Textarea } from "@/components/ui";
import {
  LogOut,
  PackagePlus,
  ClipboardList,
  BarChart3,
  Pencil,
  Warehouse,
  Trash2
} from "lucide-react";

type Tab =
  | "dashboard"
  | "products"
  | "stock"
  | "receipt"
  | "storage"
  | "adjustments"
  | "daily"
  | "locked"
  | "reports"
  | "suppliers";

type ReceiptItem = { product_id: string; quantity: string };
type ConsumptionItem = { product_id: string; quantity: string };

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  created_at?: string;
};

type StockAdjustment = {
  id: string;
  date: string;
  location: LocationType;
  product_id: string;
  old_quantity: number;
  new_quantity: number;
  difference: number;
  reason: string | null;
  user_id: string | null;
  created_at: string;
  products?: Product;
};

const categoryOptions = [
  "Kafa i topli napici",
  "Čajevi",
  "Voda i sokovi",
  "Pivo",
  "Vino",
  "Žestoka pića",
  "Ostalo"
];

const unitOptions = ["kom", "kg", "doza", "l", "boca"];

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

function purchasePriceWithVat(product: any) {
  const purchasePrice = Number(product?.purchase_price ?? 0);
  const vatRate = Number(product?.vat_rate ?? 0);

  return purchasePrice * (1 + vatRate / 100);
}

function stockPurchaseValue(product: Product, quantity: number) {
  return quantity * purchasePriceWithVat(product);
}

function stockSaleValue(product: Product, quantity: number) {
  if (product.coffee_per_kg) {
    return quantity * Number(product.coffee_per_kg) * Number(product.sale_price ?? 0);
  }

  return quantity * Number(product.sale_price ?? 0);
}

function receiptItemPurchaseValue(item: any) {
  return Number(item.quantity ?? 0) * purchasePriceWithVat(item.products);
}

function calculateConsumptionItemValues(item: any) {
  const quantity = Number(item.quantity ?? 0);
  const product = item.products;

  const sale = quantity * Number(product?.sale_price ?? 0);

  let purchase = 0;

  if (product?.coffee_per_kg) {
    purchase =
      (quantity / Number(product.coffee_per_kg)) *
      purchasePriceWithVat(product);
  } else {
    purchase = quantity * purchasePriceWithVat(product);
  }

  return {
    sale,
    purchase,
    profit: sale - purchase
  };
}

function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function isDateInRange(date: string, fromDate: string, toDate: string) {
  if (!date) return false;
  if (fromDate && date < fromDate) return false;
  if (toDate && date > toDate) return false;
  return true;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkUser();
    refreshAll();
  }, []);

  async function checkUser() {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", data.user.id)
      .single();

    if (profile?.role !== "admin" || !profile?.active) {
      router.replace("/login");
    }
  }

  async function refreshAll() {
    const [
      { data: p },
      { data: s },
      { data: cr },
      { data: sr },
      { data: sp },
      { data: adj }
    ] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("stock_levels").select("*, products(*)").order("location"),
      supabase
        .from("consumption_reports")
        .select("*, profiles(full_name), consumption_items(*, products(*))")
        .order("date", { ascending: false })
        .limit(500),
      supabase
        .from("stock_receipts")
        .select("*, profiles(full_name), stock_receipt_items(*, products(*))")
        .order("date", { ascending: false })
        .limit(500),
      supabase.from("suppliers").select("*").order("name"),
      supabase
        .from("stock_adjustments")
        .select("*, products(*)")
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    setProducts(sortProductsAZ((p ?? []) as Product[]));
    setStock((s ?? []) as StockRow[]);
    setReports(cr ?? []);
    setReceipts(sr ?? []);
    setSuppliers((sp ?? []) as Supplier[]);
    setAdjustments((adj ?? []) as StockAdjustment[]);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const productById = useMemo(() => {
    return Object.fromEntries(products.map((p) => [p.id, p]));
  }, [products]);

  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};

    stock.forEach((s) => {
      map[`${s.product_id}_${s.location}`] = Number(s.quantity);
    });

    return map;
  }, [stock]);

  const stockTotals = useMemo(() => {
    const activeProducts = products.filter((p) => p.active);

    let barPurchase = 0;
    let barSale = 0;
    let storagePurchase = 0;
    let storageSale = 0;

    activeProducts.forEach((p) => {
      const barQ = Number(stockMap[`${p.id}_bar`] ?? 0);
      const storageQ = Number(stockMap[`${p.id}_storage`] ?? 0);

      barPurchase += stockPurchaseValue(p, barQ);
      barSale += stockSaleValue(p, barQ);

      storagePurchase += stockPurchaseValue(p, storageQ);
      storageSale += stockSaleValue(p, storageQ);
    });

    return {
      barPurchase,
      barSale,
      storagePurchase,
      storageSale,
      totalPurchase: barPurchase + storagePurchase,
      totalSale: barSale + storageSale
    };
  }, [products, stockMap]);

  const activeReports = useMemo(() => {
    return reports.filter((r: any) => (r.status || "active") !== "cancelled");
  }, [reports]);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayReports = activeReports.filter((r) => r.date === today);

    let sale = 0;
    let purchase = 0;

    todayReports.forEach((r) => {
      r.consumption_items?.forEach((it: any) => {
        const values = calculateConsumptionItemValues(it);
        sale += values.sale;
        purchase += values.purchase;
      });
    });

    return {
      count: todayReports.length,
      sale,
      purchase,
      profit: sale - purchase
    };
  }, [activeReports]);

  const navItems: [Tab, string][] = [
    ["dashboard", "Dashboard"],
    ["products", "Artikli"],
    ["stock", "Šank"],
    ["storage", "Magacin"],
    ["receipt", "Prijem robe"],
    ["adjustments", "Korekcije"],
    ["daily", "Dnevni zaključak"],
    ["locked", "Zaključane smjene"],
    ["suppliers", "Komitenti"],
    ["reports", "Izvještaji"]
  ];

  return (
    <main className="min-h-screen bg-mont-cream p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 rounded-3xl bg-mont-dark p-6 text-white md:flex-row md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-mont-gold">Admin panel</p>
            <h1 className="text-3xl font-black">Mont Kafeterija Lager</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {navItems.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === key
                    ? "bg-mont-gold text-mont-dark hover:bg-mont-gold"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {label}
              </button>
            ))}

            <button
              onClick={logout}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <LogOut className="mr-1 inline h-4 w-4" /> Izlaz
            </button>
          </div>
        </header>

        {message && (
          <div className="rounded-2xl bg-green-50 p-4 text-green-800">
            {message}
          </div>
        )}

        {tab === "dashboard" && (
          <Dashboard
            products={products}
            stockMap={stockMap}
            todayStats={todayStats}
            stockTotals={stockTotals}
          />
        )}

        {tab === "products" && (
          <Products
            products={products}
            selectedProduct={selectedProduct}
            setSelectedProduct={setSelectedProduct}
            refresh={refreshAll}
            setMessage={setMessage}
          />
        )}

        {tab === "stock" && (
          <StockView
            title="Lager šanka"
            location="bar"
            products={products}
            stockMap={stockMap}
          />
        )}

        {tab === "storage" && (
          <StorageView
            products={products}
            stockMap={stockMap}
            refresh={refreshAll}
            setMessage={setMessage}
          />
        )}

        {tab === "receipt" && (
          <ReceiptForm
            products={products}
            suppliers={suppliers}
            refresh={refreshAll}
            setMessage={setMessage}
          />
        )}

        {tab === "adjustments" && (
          <AdjustmentsView
            products={products}
            stockMap={stockMap}
            adjustments={adjustments}
            refresh={refreshAll}
            setMessage={setMessage}
          />
        )}

        {tab === "daily" && <DailySummaryView reports={activeReports} />}

        {tab === "locked" && (
          <LockedShiftsView reports={reports} refresh={refreshAll} setMessage={setMessage} />
        )}

        {tab === "suppliers" && (
          <SuppliersView
            suppliers={suppliers}
            receipts={receipts}
            refresh={refreshAll}
            setMessage={setMessage}
          />
        )}

        {tab === "reports" && (
          <Reports reports={activeReports} receipts={receipts} productById={productById} />
        )}
      </div>
    </main>
  );
}

function Dashboard({ products, stockMap, todayStats, stockTotals }: any) {
  const activeProducts = products.filter((p: Product) => p.active);
  const [showUrgentBarItems, setShowUrgentBarItems] = useState(false);

  const lowBar = activeProducts.filter((p: Product) => {
    if (p.min_bar_stock === null || p.min_bar_stock === undefined) return false;
    return Number(stockMap[`${p.id}_bar`] ?? 0) <= Number(p.min_bar_stock);
  }).length;

  const lowStorage = activeProducts.filter((p: Product) => {
    if (p.min_storage_stock === null || p.min_storage_stock === undefined) return false;
    return Number(stockMap[`${p.id}_storage`] ?? 0) <= Number(p.min_storage_stock);
  }).length;

  const urgentBarItems = activeProducts
    .map((p: Product) => {
      const barQty = Number(stockMap[`${p.id}_bar`] ?? 0);
      const coffeePerKg = Number(p.coffee_per_kg ?? 0);
      const isCoffee = coffeePerKg > 0;
      const displayQty = isCoffee ? barQty * coffeePerKg : barQty;
      const alertLimit = isCoffee ? coffeePerKg : 10;

      return {
        product: p,
        isCoffee,
        barQty,
        displayQty,
        alertLimit,
        label: isCoffee
          ? `${barQty.toFixed(2)} kg / ${displayQty.toFixed(0)} kafa`
          : `${displayQty.toFixed(2)} ${p.unit || "kom"}`
      };
    })
    .filter((item: any) => item.displayQty <= item.alertLimit)
    .sort((a: any, b: any) => a.displayQty - b.displayQty);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          icon={<ClipboardList />}
          label="Aktivnih artikala"
          value={activeProducts.length}
        />
        <Stat icon={<PackagePlus />} label="Ispod minimuma šank" value={lowBar} />
        <Stat icon={<Warehouse />} label="Ispod minimuma magacin" value={lowStorage} />
        <Stat
          icon={<BarChart3 />}
          label="Danas procjena zarade"
          value={money(todayStats.profit)}
        />
      </div>

      {urgentBarItems.length > 0 && (
        <Card>
          <button
            type="button"
            onClick={() => setShowUrgentBarItems(!showUrgentBarItems)}
            className="flex w-full flex-col justify-between gap-2 text-left md:flex-row md:items-center"
          >
            <div>
              <h2 className="text-xl font-black text-red-800">
                Napomena: šank lager pri kraju
              </h2>
              <p className="text-sm text-black/60">
                Klikni za prikaz/sakrivanje. Pića ispod 10 komada, kafa na 1 kg
                ili manje.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-red-100 px-4 py-2 text-sm font-black text-red-800">
                {urgentBarItems.length} artikala
              </span>
              <span className="rounded-full bg-black/5 px-3 py-2 text-sm font-black">
                {showUrgentBarItems ? "Sakrij" : "Prikaži"}
              </span>
            </div>
          </button>

          {showUrgentBarItems && (
            <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {urgentBarItems.map((item: any) => (
                <div
                  key={item.product.id}
                  className="rounded-2xl border border-red-100 bg-red-50 p-3"
                >
                  <p className="font-black text-red-900">{item.product.name}</p>
                  <p className="text-sm text-red-800">
                    Ostalo: <b>{item.label}</b>
                    {item.isCoffee && (
                      <span className="ml-1 text-xs text-red-700">
                        / limit 1 kg
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-black/50">
                    {item.product.category || "Bez kategorije"}{" "}
                    {item.product.package_size ? `• ${item.product.package_size}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ValueCard
          title="Vrijednost lagera šank"
          purchase={stockTotals.barPurchase}
          sale={stockTotals.barSale}
        />
        <ValueCard
          title="Vrijednost lagera magacin"
          purchase={stockTotals.storagePurchase}
          sale={stockTotals.storageSale}
        />
        <ValueCard
          title="Ukupna vrijednost lagera"
          purchase={stockTotals.totalPurchase}
          sale={stockTotals.totalSale}
        />
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: any) {
  return (
    <Card>
      <div className="mb-3 text-mont-gold">{icon}</div>
      <p className="text-sm text-black/60">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </Card>
  );
}

function ValueCard({ title, purchase, sale }: { title: string; purchase: number; sale: number }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-black/60">{title}</p>
      <div className="mt-3 grid gap-2">
        <div className="flex justify-between rounded-xl bg-black/5 p-3">
          <span>Nabavna vrijednost sa PDV</span>
          <b>{money(purchase)}</b>
        </div>
        <div className="flex justify-between rounded-xl bg-black/5 p-3">
          <span>Prodajna vrijednost</span>
          <b>{money(sale)}</b>
        </div>
        <div className="flex justify-between rounded-xl bg-mont-gold/20 p-3">
          <span>Razlika</span>
          <b>{money(sale - purchase)}</b>
        </div>
      </div>
    </Card>
  );
}

function Products({
  products,
  selectedProduct,
  setSelectedProduct,
  refresh,
  setMessage
}: any) {
  const empty = {
    name: "",
    category: "",
    unit: "kom",
    package_size: "",
    serving_size: "",
    purchase_price: "",
    sale_price: "",
    vat_rate: "17",
    min_bar_stock: "",
    min_storage_stock: "",
    coffee_per_kg: ""
  };

  const [form, setForm] = useState<any>(empty);
  const [showDeleted, setShowDeleted] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedProduct) {
      setForm({
        ...selectedProduct,
        category: selectedProduct.category ?? "",
        unit: selectedProduct.unit ?? "kom",
        package_size: selectedProduct.package_size ?? "",
        serving_size: selectedProduct.serving_size ?? "",
        purchase_price: selectedProduct.purchase_price ?? "",
        sale_price: selectedProduct.sale_price ?? "",
        vat_rate: selectedProduct.vat_rate ?? 17,
        min_bar_stock: selectedProduct.min_bar_stock ?? "",
        min_storage_stock: selectedProduct.min_storage_stock ?? "",
        coffee_per_kg: selectedProduct.coffee_per_kg ?? ""
      });
    }
  }, [selectedProduct]);

  async function saveProduct(e: FormEvent) {
    e.preventDefault();

    const payload = {
      name: form.name,
      category: form.category || null,
      unit: form.unit || "kom",
      package_size: form.package_size || null,
      serving_size: form.serving_size === "" ? null : Number(form.serving_size),
      purchase_price: form.purchase_price === "" ? null : Number(form.purchase_price),
      sale_price: form.sale_price === "" ? null : Number(form.sale_price),
      vat_rate: form.vat_rate === "" ? 17 : Number(form.vat_rate),
      min_bar_stock: form.min_bar_stock === "" ? null : Number(form.min_bar_stock),
      min_storage_stock:
        form.min_storage_stock === "" ? null : Number(form.min_storage_stock),
      coffee_per_kg: form.coffee_per_kg === "" ? null : Number(form.coffee_per_kg),
      active: true
    };

    const res = selectedProduct
      ? await supabase.from("products").update(payload).eq("id", selectedProduct.id)
      : await supabase.from("products").insert(payload);

    if (res.error) {
      setMessage(res.error.message);
      return;
    }

    setMessage("Artikal je sačuvan.");
    setForm(empty);
    setSelectedProduct(null);
    refresh();
  }

  async function deleteProduct(product: Product) {
    const ok = window.confirm(
      `Obrisati artikal: ${product.name}?\n\nAko artikal već ima istoriju potrošnje ili prijema robe, aplikacija će ga samo sakriti da se ne pokvare stari izvještaji.`
    );

    if (!ok) return;

    const hardDelete = await supabase.from("products").delete().eq("id", product.id);

    if (!hardDelete.error) {
      setMessage("Artikal je trajno obrisan.");
      if (selectedProduct?.id === product.id) {
        setSelectedProduct(null);
        setForm(empty);
      }
      refresh();
      return;
    }

    const softDelete = await supabase
      .from("products")
      .update({ active: false })
      .eq("id", product.id);

    if (softDelete.error) {
      setMessage(softDelete.error.message);
      return;
    }

    setMessage(
      "Artikal ima istoriju, zato nije trajno obrisan nego je sakriven iz aktivne upotrebe."
    );

    if (selectedProduct?.id === product.id) {
      setSelectedProduct(null);
      setForm(empty);
    }

    refresh();
  }

  async function restoreProduct(id: string) {
    const { error } = await supabase.from("products").update({ active: true }).eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Artikal je vraćen u aktivne artikle.");
    refresh();
  }

  const visibleProducts = sortProductsAZ(
    (showDeleted ? products : products.filter((p: Product) => p.active)).filter((p: Product) =>
      productMatchesSearch(p, search)
    )
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[460px_1fr]">
      <Card>
        <h2 className="mb-2 text-xl font-black">
          {selectedProduct ? "Izmijeni artikal" : "Dodaj novi artikal"}
        </h2>

        <p className="mb-4 text-sm text-black/60">
          Polja sa cijenama, dozom i minimumom nisu obavezna. Možeš ih dopuniti
          kasnije.
        </p>

        <form onSubmit={saveProduct} className="space-y-4">
          <Field label="Naziv pića / artikla">
            <Input
              placeholder="npr. COCA COLA"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategorija">
              <Select
                value={form.category ?? ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Izaberi kategoriju</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Jedinica mjere">
              <Select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pakovanje / boca / limenka">
              <Input
                placeholder="npr. 0.33, 0.5, 1L"
                value={form.package_size ?? ""}
                onChange={(e) =>
                  setForm({ ...form, package_size: e.target.value })
                }
              />
            </Field>

            <Field label="Prodajna doza">
              <Input
                type="number"
                step="0.001"
                placeholder="npr. 0.03"
                value={form.serving_size ?? ""}
                onChange={(e) =>
                  setForm({ ...form, serving_size: e.target.value })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nabavna cijena bez PDV-a">
              <Input
                type="number"
                step="0.01"
                placeholder="KM bez PDV-a"
                value={form.purchase_price ?? ""}
                onChange={(e) =>
                  setForm({ ...form, purchase_price: e.target.value })
                }
              />
              <p className="mt-1 text-xs text-black/50">
                Unesi cijenu bez PDV-a. Aplikacija sama računa cijenu sa PDV-om.
              </p>
            </Field>

            <Field label="Prodajna cijena">
              <Input
                type="number"
                step="0.01"
                placeholder="KM"
                value={form.sale_price ?? ""}
                onChange={(e) =>
                  setForm({ ...form, sale_price: e.target.value })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="PDV %">
              <Input
                type="number"
                step="0.01"
                placeholder="17"
                value={form.vat_rate ?? ""}
                onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
              />
            </Field>

            <Field label="Minimum šank">
              <Input
                type="number"
                step="0.01"
                placeholder="npr. 10"
                value={form.min_bar_stock ?? ""}
                onChange={(e) =>
                  setForm({ ...form, min_bar_stock: e.target.value })
                }
              />
            </Field>

            <Field label="Minimum magacin">
              <Input
                type="number"
                step="0.01"
                placeholder="npr. 24"
                value={form.min_storage_stock ?? ""}
                onChange={(e) =>
                  setForm({ ...form, min_storage_stock: e.target.value })
                }
              />
            </Field>
          </div>

          <Field label="Kafa: broj kafa iz 1 kg">
            <Input
              type="number"
              step="1"
              placeholder="Samo za kafu, npr. 125"
              value={form.coffee_per_kg ?? ""}
              onChange={(e) =>
                setForm({ ...form, coffee_per_kg: e.target.value })
              }
            />
          </Field>

          <div className="rounded-2xl bg-black/5 p-4 text-sm">
            <p className="font-black">Pregled nabavne cijene</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs text-black/50">Bez PDV-a</p>
                <b>{money(Number(form.purchase_price || 0))}</b>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs text-black/50">PDV {Number(form.vat_rate || 0).toFixed(2)}%</p>
                <b>
                  {money(
                    Number(form.purchase_price || 0) *
                      (Number(form.vat_rate || 0) / 100)
                  )}
                </b>
              </div>
              <div className="rounded-xl bg-mont-gold/20 p-3">
                <p className="text-xs text-black/50">Sa PDV-om</p>
                <b>
                  {money(
                    Number(form.purchase_price || 0) *
                      (1 + Number(form.vat_rate || 0) / 100)
                  )}
                </b>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button>Sačuvaj</Button>

            {selectedProduct && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  setSelectedProduct(null);
                  setForm(empty);
                }}
              >
                Odustani
              </SecondaryButton>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <h2 className="text-xl font-black">Lista artikala</h2>

          <label className="flex items-center gap-2 text-sm font-semibold text-black/70">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => setShowDeleted(e.target.checked)}
            />
            Prikaži obrisane/sakrivene
          </label>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Pretraži artikal, kategoriju ili pakovanje..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-[650px] overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-3">Naziv</th>
                <th>Kategorija</th>
                <th>Pak.</th>
                <th>Nab. bez PDV</th>
                <th>PDV</th>
                <th>Nab. sa PDV</th>
                <th>Prod.</th>
                <th className="p-3">Akcije</th>
              </tr>
            </thead>

            <tbody>
              {visibleProducts.map((p: Product) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-semibold">
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">
                        sakriven
                      </span>
                    )}
                  </td>
                  <td>{p.category}</td>
                  <td>{p.package_size}</td>
                  <td>{money(p.purchase_price)}</td>
                  <td>{Number(p.vat_rate ?? 0).toFixed(2)}%</td>
                  <td className="font-black">{money(purchasePriceWithVat(p))}</td>
                  <td>{money(p.sale_price)}</td>
                  <td className="space-x-2 p-2">
                    <button
                      title="Izmijeni"
                      onClick={() => setSelectedProduct(p)}
                      className="rounded-lg p-2 text-mont-brown hover:bg-black/5"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {p.active ? (
                      <button
                        title="Obriši"
                        onClick={() => deleteProduct(p)}
                        className="rounded-lg p-2 text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => restoreProduct(p.id)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                      >
                        Vrati
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-black/55">
        {label}
      </span>
      {children}
    </label>
  );
}

function StockView({
  title,
  location,
  products,
  stockMap
}: {
  title: string;
  location: LocationType;
  products: Product[];
  stockMap: Record<string, number>;
}) {
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"az" | "most" | "least">("az");

  const visibleProducts = useMemo(() => {
    const filtered = products
      .filter((p) => p.active)
      .filter((p) => productMatchesSearch(p, search));

    if (sortMode === "most") {
      return [...filtered].sort((a, b) => {
        const qa = Number(stockMap[`${a.id}_${location}`] ?? 0);
        const qb = Number(stockMap[`${b.id}_${location}`] ?? 0);
        return qb - qa || a.name.localeCompare(b.name, "bs");
      });
    }

    if (sortMode === "least") {
      return [...filtered].sort((a, b) => {
        const qa = Number(stockMap[`${a.id}_${location}`] ?? 0);
        const qb = Number(stockMap[`${b.id}_${location}`] ?? 0);
        return qa - qb || a.name.localeCompare(b.name, "bs");
      });
    }

    return sortProductsAZ(filtered);
  }, [products, stockMap, location, search, sortMode]);

  const totals = visibleProducts.reduce(
    (acc, p) => {
      const q = Number(stockMap[`${p.id}_${location}`] ?? 0);
      acc.purchase += stockPurchaseValue(p, q);
      acc.sale += stockSaleValue(p, q);
      return acc;
    },
    { purchase: 0, sale: 0 }
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <h2 className="text-xl font-black">{title}</h2>
        <div className="text-sm text-black/70">
          <b>Nabavna:</b> {money(totals.purchase)}{" "}
          <span className="mx-2">|</span>
          <b>Prodajna:</b> {money(totals.sale)}
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px]">
        <Input
          placeholder="Pretraži lager po nazivu, kategoriji ili pakovanju..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as "az" | "most" | "least")}
        >
          <option value="az">Abecedno A-Z</option>
          <option value="most">Čega najviše ima</option>
          <option value="least">Čega najmanje ima</option>
        </Select>
      </div>

      <div className="overflow-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/5">
            <tr>
              <th className="p-3">Artikal</th>
              <th>Kategorija</th>
              <th>Pakovanje</th>
              <th>Stanje</th>
              {location === "bar" && <th>Doza kafe ostalo</th>}
              <th>Vrijednost nabavna sa PDV</th>
              <th>Vrijednost prodajna</th>
            </tr>
          </thead>

          <tbody>
            {visibleProducts.map((p) => {
              const q = Number(stockMap[`${p.id}_${location}`] ?? 0);

              return (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.package_size}</td>
                  <td className="font-black">
                    {q.toFixed(2)} {p.unit}
                  </td>
                  {location === "bar" && (
                    <td>
                      {Number(p.coffee_per_kg ?? 0) > 0 ? (
                        <span className="font-black text-mont-dark">
                          {(q * Number(p.coffee_per_kg ?? 0)).toFixed(0)} kafa
                        </span>
                      ) : (
                        <span className="text-black/30">-</span>
                      )}
                    </td>
                  )}
                  <td>{money(stockPurchaseValue(p, q))}</td>
                  <td>{money(stockSaleValue(p, q))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ReceiptForm({ products, suppliers, refresh, setMessage }: any) {
  const [location, setLocation] = useState<LocationType>("bar");
  const [supplier, setSupplier] = useState("");
  const [doc, setDoc] = useState("");
  const [note, setNote] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([
    { product_id: "", quantity: "" }
  ]);

  const filteredProducts = sortProductsAZ(
    products
      .filter((p: Product) => p.active)
      .filter((p: Product) => productMatchesSearch(p, productSearch))
  );

  async function submit(e: FormEvent) {
    e.preventDefault();

    const clean = items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity)
      }));

    if (clean.length === 0) {
      setMessage("Dodaj bar jednu stavku prijema robe.");
      return;
    }

    const { data: user } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("receive_stock", {
      p_location: location,
      p_supplier: supplier || null,
      p_document_number: doc || null,
      p_note: note || null,
      p_user_id: user.user?.id,
      p_items: clean
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Prijem robe je sačuvan i lager je povećan.");
    setItems([{ product_id: "", quantity: "" }]);
    setSupplier("");
    setDoc("");
    setNote("");
    setProductSearch("");
    refresh();
  }

  return (
    <Card>
      <h2 className="mb-4 text-xl font-black">Prijem robe</h2>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Lager">
            <Select
              value={location}
              onChange={(e) => setLocation(e.target.value as LocationType)}
            >
              <option value="bar">Šank</option>
              <option value="storage">Magacin</option>
            </Select>
          </Field>

          <Field label="Komitent / dobavljač">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Izaberi komitenta</option>
              {suppliers
                .filter((s: Supplier) => s.active)
                .map((s: Supplier) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Broj računa / dokumenta">
            <Input
              placeholder="npr. 15/2026"
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
            />
          </Field>

          <Field label="Datum">
            <Input type="date" value={new Date().toISOString().slice(0, 10)} readOnly />
          </Field>
        </div>

        <Input
          placeholder="Pretraži artikal za prijem robe..."
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
        />

        {items.map((it, idx) => (
          <div key={idx} className="grid gap-2 md:grid-cols-[1fr_160px_90px]">
            <Select
              value={it.product_id}
              onChange={(e) => {
                const c = [...items];
                c[idx].product_id = e.target.value;
                setItems(c);
              }}
            >
              <option value="">Izaberi artikal</option>
              {filteredProducts.map((p: Product) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.package_size ?? ""}
                </option>
              ))}
            </Select>

            <Input
              type="number"
              step="0.01"
              placeholder="Količina"
              value={it.quantity}
              onChange={(e) => {
                const c = [...items];
                c[idx].quantity = e.target.value;
                setItems(c);
              }}
            />

            <SecondaryButton
              type="button"
              onClick={() => setItems(items.filter((_, i) => i !== idx))}
            >
              Ukloni
            </SecondaryButton>
          </div>
        ))}

        <SecondaryButton
          type="button"
          onClick={() => setItems([...items, { product_id: "", quantity: "" }])}
        >
          + Dodaj stavku
        </SecondaryButton>

        <Textarea
          placeholder="Napomena"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <Button>Sačuvaj prijem</Button>
      </form>
    </Card>
  );
}

function StorageView({ products, stockMap, refresh, setMessage }: any) {
  const [eventName, setEventName] = useState("");
  const [note, setNote] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<ConsumptionItem[]>([
    { product_id: "", quantity: "" }
  ]);

  const filteredProducts = sortProductsAZ(
    products
      .filter((p: Product) => p.active)
      .filter((p: Product) => productMatchesSearch(p, productSearch))
  );

  async function submit(e: FormEvent) {
    e.preventDefault();

    const clean = items
      .filter((i) => i.product_id && Number(i.quantity) > 0)
      .map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity)
      }));

    if (clean.length === 0) {
      setMessage("Dodaj bar jednu stavku potrošnje iz magacina.");
      return;
    }

    const { data: user } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("submit_consumption", {
      p_location: "storage",
      p_shift: null,
      p_event_name: eventName || "Privatna proslava",
      p_note: note || null,
      p_user_id: user.user?.id,
      p_items: clean
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Potrošnja iz magacina je sačuvana i lager je umanjen.");
    setItems([{ product_id: "", quantity: "" }]);
    setEventName("");
    setNote("");
    setProductSearch("");
    refresh();
  }

  return (
    <div className="space-y-6">
      <StockView
        title="Lager magacina"
        location="storage"
        products={products}
        stockMap={stockMap}
      />

      <Card>
        <h2 className="mb-4 text-xl font-black">
          Potrošnja iz magacina za privatne proslave
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <Input
            placeholder="Naziv proslave / opis"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />

          <Input
            placeholder="Pretraži artikal za potrošnju iz magacina..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />

          {items.map((it, idx) => (
            <div key={idx} className="grid gap-2 md:grid-cols-[1fr_160px_90px]">
              <Select
                value={it.product_id}
                onChange={(e) => {
                  const c = [...items];
                  c[idx].product_id = e.target.value;
                  setItems(c);
                }}
              >
                <option value="">Izaberi artikal</option>
                {filteredProducts.map((p: Product) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.package_size ?? ""}
                  </option>
                ))}
              </Select>

              <Input
                type="number"
                step="0.01"
                placeholder="Količina"
                value={it.quantity}
                onChange={(e) => {
                  const c = [...items];
                  c[idx].quantity = e.target.value;
                  setItems(c);
                }}
              />

              <SecondaryButton
                type="button"
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
              >
                Ukloni
              </SecondaryButton>
            </div>
          ))}

          <SecondaryButton
            type="button"
            onClick={() => setItems([...items, { product_id: "", quantity: "" }])}
          >
            + Dodaj stavku
          </SecondaryButton>

          <Textarea
            placeholder="Napomena"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <Button>Zaključi potrošnju magacina</Button>
        </form>
      </Card>
    </div>
  );
}

function AdjustmentsView({
  products,
  stockMap,
  adjustments,
  refresh,
  setMessage
}: {
  products: Product[];
  stockMap: Record<string, number>;
  adjustments: StockAdjustment[];
  refresh: () => void;
  setMessage: (message: string) => void;
}) {
  const [location, setLocation] = useState<LocationType>("bar");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  const filteredProducts = sortProductsAZ(
    products
      .filter((p) => p.active)
      .filter((p) => productMatchesSearch(p, productSearch))
  );

  const selectedProduct = products.find((p) => p.id === productId);
  const currentQuantity = productId
    ? Number(stockMap[`${productId}_${location}`] ?? 0)
    : 0;

  const difference =
    newQuantity === "" ? 0 : Number(newQuantity) - Number(currentQuantity);

  const filteredAdjustments = adjustments.filter((a) => {
    const q = normalizeText(historySearch);
    if (!q) return true;

    return (
      normalizeText(a.date).includes(q) ||
      normalizeText(a.location).includes(q) ||
      normalizeText(a.reason).includes(q) ||
      normalizeText(a.products?.name).includes(q)
    );
  });

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (!productId) {
      setMessage("Izaberi artikal za korekciju.");
      return;
    }

    if (newQuantity === "" || Number(newQuantity) < 0) {
      setMessage("Unesi novo stvarno stanje lagera.");
      return;
    }

    const ok = window.confirm(
      `Potvrditi korekciju?\n\nArtikal: ${selectedProduct?.name}\nLokacija: ${
        location === "bar" ? "Šank" : "Magacin"
      }\nStaro stanje: ${currentQuantity.toFixed(2)}\nNovo stanje: ${Number(
        newQuantity
      ).toFixed(2)}\nRazlika: ${difference.toFixed(2)}`
    );

    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("adjust_stock", {
      p_location: location,
      p_product_id: productId,
      p_new_quantity: Number(newQuantity),
      p_reason: reason || null,
      p_user_id: user.user?.id
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Korekcija lagera je sačuvana.");
    setProductId("");
    setNewQuantity("");
    setReason("");
    setProductSearch("");
    refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[460px_1fr]">
      <Card>
        <h2 className="mb-2 text-xl font-black">Korekcija lagera</h2>

        <p className="mb-4 text-sm text-black/60">
          Koristi ovo kada fizički prebrojiš robu i stvarno stanje nije isto kao
          stanje u aplikaciji.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Lokacija">
            <Select
              value={location}
              onChange={(e) => {
                setLocation(e.target.value as LocationType);
                setProductId("");
                setNewQuantity("");
              }}
            >
              <option value="bar">Šank</option>
              <option value="storage">Magacin</option>
            </Select>
          </Field>

          <Field label="Pretraga artikla">
            <Input
              placeholder="Pretraži artikal..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </Field>

          <Field label="Artikal">
            <Select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setNewQuantity("");
              }}
            >
              <option value="">Izaberi artikal</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.package_size ?? ""}
                </option>
              ))}
            </Select>
          </Field>

          {selectedProduct && (
            <div className="rounded-2xl bg-black/5 p-4 text-sm">
              <div className="flex justify-between">
                <span>Trenutno stanje u aplikaciji</span>
                <b>
                  {currentQuantity.toFixed(2)} {selectedProduct.unit}
                </b>
              </div>
            </div>
          )}

          <Field label="Stvarno stanje nakon popisa">
            <Input
              type="number"
              step="0.01"
              placeholder="Unesi stvarno stanje"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
            />
          </Field>

          {selectedProduct && newQuantity !== "" && (
            <div
              className={`rounded-2xl p-4 text-sm ${
                difference < 0
                  ? "bg-red-50 text-red-800"
                  : difference > 0
                    ? "bg-green-50 text-green-800"
                    : "bg-black/5 text-black"
              }`}
            >
              <div className="flex justify-between">
                <span>Razlika korekcije</span>
                <b>
                  {difference > 0 ? "+" : ""}
                  {difference.toFixed(2)} {selectedProduct.unit}
                </b>
              </div>
            </div>
          )}

          <Field label="Razlog / napomena">
            <Textarea
              placeholder="npr. popis, lom, čašćenje, greška u unosu..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          <Button>Sačuvaj korekciju</Button>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <h2 className="text-xl font-black">Istorija korekcija</h2>

          <Input
            placeholder="Pretraži korekcije..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        </div>

        <div className="max-h-[720px] overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-3">Datum</th>
                <th>Lokacija</th>
                <th>Artikal</th>
                <th>Staro</th>
                <th>Novo</th>
                <th>Razlika</th>
                <th>Razlog</th>
              </tr>
            </thead>

            <tbody>
              {filteredAdjustments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3">{a.date}</td>
                  <td>{a.location === "bar" ? "Šank" : "Magacin"}</td>
                  <td className="font-semibold">{a.products?.name}</td>
                  <td>{Number(a.old_quantity).toFixed(2)}</td>
                  <td>{Number(a.new_quantity).toFixed(2)}</td>
                  <td
                    className={
                      Number(a.difference) < 0
                        ? "font-black text-red-700"
                        : Number(a.difference) > 0
                          ? "font-black text-green-700"
                          : "font-black"
                    }
                  >
                    {Number(a.difference) > 0 ? "+" : ""}
                    {Number(a.difference).toFixed(2)}
                  </td>
                  <td>{a.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  right
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          {right && <div className="mt-1 text-sm text-black/60">{right}</div>}
        </div>

        <span className="rounded-full bg-black/5 px-3 py-1 text-sm font-black">
          {open ? "Sakrij" : "Prikaži"} {open ? "▼" : "▶"}
        </span>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}


function addOneDay(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) return dateString;

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

function getDatesBetween(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return [];
  if (fromDate > toDate) return [];

  const dates: string[] = [];
  let current = fromDate;

  while (current <= toDate) {
    dates.push(current);
    current = addOneDay(current);
  }

  return dates;
}

function reportDocumentTotals(report: any) {
  let sale = 0;
  let purchase = 0;
  let quantity = 0;

  report?.consumption_items?.forEach((it: any) => {
    const values = calculateConsumptionItemValues(it);
    sale += values.sale;
    purchase += values.purchase;
    quantity += Number(it.quantity ?? 0);
  });

  return {
    sale,
    purchase,
    profit: sale - purchase,
    quantity,
    itemRows: report?.consumption_items?.length ?? 0
  };
}

function reportUserName(report: any) {
  const profile = report?.profiles;

  if (!profile) return "-";

  if (Array.isArray(profile)) {
    return profile[0]?.full_name || "-";
  }

  return profile.full_name || "-";
}

function LockedShiftsView({
  reports,
  refresh,
  setMessage
}: {
  reports: any[];
  refresh: () => void;
  setMessage: (message: string) => void;
}) {
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(getTodayDate());
  const [search, setSearch] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const activeBarShiftReports = useMemo(() => {
    return reports.filter((r: any) => {
      const isBar = !r.location || r.location === "bar";
      const isShift = r.shift === "first" || r.shift === "second";
      const isActive = (r.status || "active") !== "cancelled";
      return isBar && isShift && isActive && isDateInRange(r.date, fromDate, toDate);
    });
  }, [reports, fromDate, toDate]);

  const cancelledBarShiftReports = useMemo(() => {
    return reports.filter((r: any) => {
      const isBar = !r.location || r.location === "bar";
      const isShift = r.shift === "first" || r.shift === "second";
      const isCancelled = r.status === "cancelled";
      return isBar && isShift && isCancelled && isDateInRange(r.date, fromDate, toDate);
    });
  }, [reports, fromDate, toDate]);

  async function cancelReport(report: any) {
    if (!report?.id) return;

    const shiftName = report.shift === "first" ? "Prva smjena" : "Druga smjena";
    const bartender = reportUserName(report);

    const reason = window.prompt(
      `Unesi razlog poništavanja:\n\n${report.date} - ${shiftName}\nŠanker: ${bartender}`
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Razlog poništavanja je obavezan.");
      return;
    }

    const ok = window.confirm(
      `Potvrdi poništavanje smjene?\n\n${report.date} - ${shiftName}\nŠanker: ${bartender}\n\nLager će se automatski vratiti za sve stavke iz ove smjene.`
    );

    if (!ok) return;

    setCancellingId(report.id);

    const { data: user } = await supabase.auth.getUser();

    const { error } = await supabase.rpc("cancel_consumption_report", {
      p_report_id: report.id,
      p_cancelled_by: user.user?.id,
      p_cancel_reason: reason.trim()
    });

    setCancellingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Smjena je poništena i lager je vraćen.");
    refresh();
  }

  const dayRows = useMemo(() => {
    const dates = getDatesBetween(fromDate, toDate);

    return dates
      .map((date) => {
        const first = activeBarShiftReports.find(
          (r: any) => r.date === date && r.shift === "first"
        );
        const second = activeBarShiftReports.find(
          (r: any) => r.date === date && r.shift === "second"
        );

        return {
          date,
          first,
          second,
          firstTotals: reportDocumentTotals(first),
          secondTotals: reportDocumentTotals(second)
        };
      })
      .reverse();
  }, [activeBarShiftReports, fromDate, toDate]);

  const filteredRows = dayRows.filter((row) => {
    const q = normalizeText(search);
    if (!q) return true;

    return (
      normalizeText(row.date).includes(q) ||
      normalizeText(reportUserName(row.first)).includes(q) ||
      normalizeText(reportUserName(row.second)).includes(q)
    );
  });

  const lockedCount = activeBarShiftReports.length;
  const plannedCount = getDatesBetween(fromDate, toDate).length * 2;
  const missingCount = Math.max(plannedCount - lockedCount, 0);

  const totals = activeBarShiftReports.reduce(
    (acc, r: any) => {
      const values = reportDocumentTotals(r);
      acc.sale += values.sale;
      acc.purchase += values.purchase;
      acc.profit += values.profit;
      acc.quantity += values.quantity;
      return acc;
    },
    { sale: 0, purchase: 0, profit: 0, quantity: 0 }
  );

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
          <Field label="Od datuma">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </Field>

          <Field label="Do datuma">
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Field>

          <Field label="Pretraga">
            <Input
              placeholder="Pretraži po datumu ili šankeru..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          <SecondaryButton
            type="button"
            onClick={() => {
              setFromDate(getMonthStart());
              setToDate(getTodayDate());
              setSearch("");
            }}
          >
            Reset
          </SecondaryButton>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat
          icon={<ClipboardList />}
          label="Aktivne zaključane smjene"
          value={lockedCount}
        />
        <Stat
          icon={<Warehouse />}
          label="Nezaključanih smjena"
          value={missingCount}
        />
        <Stat icon={<BarChart3 />} label="Promet" value={money(totals.sale)} />
        <Stat icon={<PackagePlus />} label="Zarada" value={money(totals.profit)} />
      </div>

      <Card>
        <h2 className="mb-2 text-xl font-black">Zaključane smjene</h2>
        <p className="mb-4 text-sm text-black/60">
          Dugme <b>Poništi smjenu</b> vraća artikle nazad na lager i označava dokument
          kao poništen. Dokument ostaje u bazi kao trag i ne ulazi više u izvještaje.
        </p>

        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-3">Datum</th>
                <th>Prva smjena</th>
                <th>Promet / zarada</th>
                <th>Druga smjena</th>
                <th>Promet / zarada</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.date} className="border-t align-top">
                  <td className="p-3 font-black">{row.date}</td>

                  <td className="py-3 pr-3">
                    {row.first ? (
                      <div>
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-800">
                          Zaključena
                        </span>
                        <p className="mt-2 font-semibold">{reportUserName(row.first)}</p>
                        <p className="text-xs text-black/50">
                          Stavki: {row.firstTotals.itemRows} • Količina: {row.firstTotals.quantity.toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => cancelReport(row.first)}
                          disabled={cancellingId === row.first.id}
                          className="mt-2 rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {cancellingId === row.first.id ? "Poništavam..." : "Poništi smjenu"}
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-800">
                        Nije zaključena
                      </span>
                    )}
                  </td>

                  <td className="py-3 pr-3">
                    {row.first ? (
                      <div className="space-y-1">
                        <p>Promet: <b>{money(row.firstTotals.sale)}</b></p>
                        <p>Zarada: <b>{money(row.firstTotals.profit)}</b></p>
                      </div>
                    ) : (
                      <span className="text-black/40">-</span>
                    )}
                  </td>

                  <td className="py-3 pr-3">
                    {row.second ? (
                      <div>
                        <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-black text-green-800">
                          Zaključena
                        </span>
                        <p className="mt-2 font-semibold">{reportUserName(row.second)}</p>
                        <p className="text-xs text-black/50">
                          Stavki: {row.secondTotals.itemRows} • Količina: {row.secondTotals.quantity.toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => cancelReport(row.second)}
                          disabled={cancellingId === row.second.id}
                          className="mt-2 rounded-lg bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {cancellingId === row.second.id ? "Poništavam..." : "Poništi smjenu"}
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-black text-red-800">
                        Nije zaključena
                      </span>
                    )}
                  </td>

                  <td className="py-3 pr-3">
                    {row.second ? (
                      <div className="space-y-1">
                        <p>Promet: <b>{money(row.secondTotals.sale)}</b></p>
                        <p>Zarada: <b>{money(row.secondTotals.profit)}</b></p>
                      </div>
                    ) : (
                      <span className="text-black/40">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {cancelledBarShiftReports.length > 0 && (
        <Card>
          <h2 className="mb-4 text-xl font-black">Poništene smjene</h2>

          <div className="space-y-3">
            {cancelledBarShiftReports.map((r: any) => {
              const totals = reportDocumentTotals(r);

              return (
                <div key={r.id} className="rounded-xl border bg-red-50 p-3 text-sm text-red-900">
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                    <div>
                      <b>
                        {r.date} — {r.shift === "first" ? "Prva smjena" : "Druga smjena"}
                      </b>
                      <p>Šanker: {reportUserName(r)}</p>
                      <p>Razlog: {r.cancel_reason || "-"}</p>
                    </div>

                    <div className="text-right">
                      <p>Vraćena količina: <b>{totals.quantity.toFixed(2)}</b></p>
                      <p>Vrijeme poništenja: <b>{r.cancelled_at ? String(r.cancelled_at).slice(0, 16).replace("T", " ") : "-"}</b></p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function DailySummaryView({ reports }: { reports: any[] }) {
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [showMoney, setShowMoney] = useState(true);

  const dayReports = useMemo(() => {
    return reports.filter((r: any) => r.date === selectedDate);
  }, [reports, selectedDate]);

  function reportTotals(report: any) {
    let sale = 0;
    let purchase = 0;
    let itemsCount = 0;

    report?.consumption_items?.forEach((it: any) => {
      const values = calculateConsumptionItemValues(it);
      sale += values.sale;
      purchase += values.purchase;
      itemsCount += Number(it.quantity ?? 0);
    });

    return {
      sale,
      purchase,
      profit: sale - purchase,
      itemsCount
    };
  }

  const firstShift = dayReports.find((r: any) => r.shift === "first");
  const secondShift = dayReports.find((r: any) => r.shift === "second");
  const storageReports = dayReports.filter((r: any) => !r.shift);

  const firstTotals = reportTotals(firstShift);
  const secondTotals = reportTotals(secondShift);

  const storageTotals = storageReports.reduce(
    (acc, r: any) => {
      const values = reportTotals(r);
      acc.sale += values.sale;
      acc.purchase += values.purchase;
      acc.profit += values.profit;
      acc.itemsCount += values.itemsCount;
      return acc;
    },
    { sale: 0, purchase: 0, profit: 0, itemsCount: 0 }
  );

  const dayTotals = {
    sale: firstTotals.sale + secondTotals.sale + storageTotals.sale,
    purchase: firstTotals.purchase + secondTotals.purchase + storageTotals.purchase,
    profit: firstTotals.profit + secondTotals.profit + storageTotals.profit,
    itemsCount:
      firstTotals.itemsCount + secondTotals.itemsCount + storageTotals.itemsCount
  };

  const topProducts = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        quantity: number;
        sale: number;
        purchase: number;
        profit: number;
      }
    > = {};

    dayReports.forEach((r: any) => {
      r.consumption_items?.forEach((it: any) => {
        const name = it.products?.name || "Nepoznat artikal";
        const quantity = Number(it.quantity ?? 0);
        const values = calculateConsumptionItemValues(it);

        if (!map[name]) {
          map[name] = {
            name,
            quantity: 0,
            sale: 0,
            purchase: 0,
            profit: 0
          };
        }

        map[name].quantity += quantity;
        map[name].sale += values.sale;
        map[name].purchase += values.purchase;
        map[name].profit += values.profit;
      });
    });

    return Object.values(map)
      .sort((a, b) => (showMoney ? b.sale - a.sale : b.quantity - a.quantity))
      .slice(0, 10);
  }, [dayReports, showMoney]);

  function buildBartenderReportText() {
    function linesForReport(title: string, report: any) {
      if (!report) {
        return [`${title}: NIJE ZAKLJUČENA`];
      }

      const lines = [
        `${title}: ZAKLJUČENA`,
        `Šanker: ${report.profiles?.full_name || "Nepoznat šanker"}`
      ];

      if (report.note) {
        lines.push(`Napomena: ${report.note}`);
      }

      lines.push("Artikli:");

      report.consumption_items?.forEach((it: any) => {
        lines.push(
          `- ${it.products?.name || "Nepoznat artikal"}: ${Number(
            it.quantity ?? 0
          ).toFixed(2)} ${it.products?.unit || ""}`
        );
      });

      return lines;
    }

    const lines = [
      `DNEVNI ZAKLJUČAK BEZ CIJENA`,
      `Datum: ${selectedDate}`,
      "",
      ...linesForReport("Prva smjena", firstShift),
      "",
      ...linesForReport("Druga smjena", secondShift)
    ];

    if (storageReports.length > 0) {
      lines.push("", "Magacin / privatne proslave:");

      storageReports.forEach((r: any) => {
        lines.push(`- ${r.event_name || "Magacin"} (${r.profiles?.full_name || "Nepoznat korisnik"})`);

        r.consumption_items?.forEach((it: any) => {
          lines.push(
            `  • ${it.products?.name || "Nepoznat artikal"}: ${Number(
              it.quantity ?? 0
            ).toFixed(2)} ${it.products?.unit || ""}`
          );
        });
      });
    }

    lines.push("", "Top artikli dana:");

    topProducts.forEach((p) => {
      lines.push(`- ${p.name}: ${p.quantity.toFixed(2)}`);
    });

    return lines.join("\n");
  }

  async function copyBartenderReport() {
    setShowMoney(false);

    try {
      await navigator.clipboard.writeText(buildBartenderReportText());
      alert("Izvještaj bez cijena je kopiran.");
    } catch {
      alert("Nije moguće kopirati automatski. Probaj print opciju.");
    }
  }

  function printBartenderReport() {
    setShowMoney(false);
    setTimeout(() => window.print(), 150);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <Field label="Datum dnevnog zaključka">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </Field>

          <div className="rounded-2xl bg-black/5 p-4 text-sm">
            <b>Dnevni zaključak</b> prikazuje da li su prva i druga smjena
            zaključene za izabrani dan. Kada radniku pokazuješ izvještaj,
            prebaci na prikaz bez cijena.
          </div>

          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              type="button"
              onClick={() => setShowMoney(!showMoney)}
            >
              {showMoney ? "Prikaz za šankera" : "Admin prikaz"}
            </SecondaryButton>

            <SecondaryButton type="button" onClick={copyBartenderReport}>
              Kopiraj bez cijena
            </SecondaryButton>

            <Button type="button" onClick={printBartenderReport}>
              Print bez cijena
            </Button>
          </div>
        </div>
      </Card>

      <CollapsibleSection
        title="Sažetak dana"
        defaultOpen={true}
        right={showMoney ? "Admin prikaz sa finansijama" : "Prikaz za šankera bez cijena"}
      >
        <div className={`grid gap-4 ${showMoney ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          {showMoney && (
            <>
              <Stat icon={<BarChart3 />} label="Ukupan promet" value={money(dayTotals.sale)} />
              <Stat
                icon={<PackagePlus />}
                label="Nabavna vrijednost"
                value={money(dayTotals.purchase)}
              />
              <Stat icon={<ClipboardList />} label="Zarada" value={money(dayTotals.profit)} />
            </>
          )}
          <Stat
            icon={<Warehouse />}
            label="Ukupna količina"
            value={dayTotals.itemsCount.toFixed(2)}
          />
          {!showMoney && (
            <Stat
              icon={<ClipboardList />}
              label="Zaključeni dokumenti"
              value={dayReports.length}
            />
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Prva i druga smjena" defaultOpen={true}>
        <div className="grid gap-4 md:grid-cols-2">
          <ShiftSummaryCard
            title="Prva smjena"
            report={firstShift}
            totals={firstTotals}
            showMoney={showMoney}
          />

          <ShiftSummaryCard
            title="Druga smjena"
            report={secondShift}
            totals={secondTotals}
            showMoney={showMoney}
          />
        </div>
      </CollapsibleSection>

      {storageReports.length > 0 && (
        <CollapsibleSection title="Magacin / privatne proslave" defaultOpen={false}>
          <div className={`mb-4 grid gap-3 ${showMoney ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
            <div className="rounded-xl bg-black/5 p-3">
              <p className="text-xs text-black/50">Broj dokumenata</p>
              <b>{storageReports.length}</b>
            </div>
            {showMoney && (
              <>
                <div className="rounded-xl bg-black/5 p-3">
                  <p className="text-xs text-black/50">Promet</p>
                  <b>{money(storageTotals.sale)}</b>
                </div>
                <div className="rounded-xl bg-black/5 p-3">
                  <p className="text-xs text-black/50">Nabavna vrijednost</p>
                  <b>{money(storageTotals.purchase)}</b>
                </div>
                <div className="rounded-xl bg-mont-gold/20 p-3">
                  <p className="text-xs text-black/50">Zarada</p>
                  <b>{money(storageTotals.profit)}</b>
                </div>
              </>
            )}
            {!showMoney && (
              <div className="rounded-xl bg-black/5 p-3">
                <p className="text-xs text-black/50">Ukupna količina</p>
                <b>{storageTotals.itemsCount.toFixed(2)}</b>
              </div>
            )}
          </div>

          <div className="space-y-2 text-sm">
            {storageReports.map((r: any) => (
              <div key={r.id} className="rounded-xl border p-3">
                <b>{r.event_name || "Magacin"}</b>
                <p className="text-black/60">{r.profiles?.full_name}</p>
                <ul className="mt-2 space-y-1">
                  {r.consumption_items?.map((it: any) => (
                    <li key={it.id}>
                      {it.products?.name}: <b>{Number(it.quantity).toFixed(2)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Top artikli dana" defaultOpen={true}>
        {topProducts.length === 0 ? (
          <p className="text-sm text-black/60">
            Nema unesene potrošnje za ovaj datum.
          </p>
        ) : (
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/5">
                <tr>
                  <th className="p-3">Artikal</th>
                  <th>Količina</th>
                  {showMoney && (
                    <>
                      <th>Promet</th>
                      <th>Nabavna vrijednost</th>
                      <th>Zarada</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="p-3 font-semibold">{p.name}</td>
                    <td>{p.quantity.toFixed(2)}</td>
                    {showMoney && (
                      <>
                        <td>{money(p.sale)}</td>
                        <td>{money(p.purchase)}</td>
                        <td className="font-black">{money(p.profit)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function ShiftSummaryCard({
  title,
  report,
  totals,
  showMoney
}: {
  title: string;
  report: any;
  totals: {
    sale: number;
    purchase: number;
    profit: number;
    itemsCount: number;
  };
  showMoney: boolean;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="text-sm text-black/60">
            {report ? report.profiles?.full_name || "Nepoznat šanker" : "Nije zaključena"}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            report
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {report ? "Zaključena" : "Nije zaključena"}
        </span>
      </div>

      <div className="grid gap-2 text-sm">
        {showMoney && (
          <>
            <div className="flex justify-between rounded-xl bg-black/5 p-3">
              <span>Promet</span>
              <b>{money(totals.sale)}</b>
            </div>

            <div className="flex justify-between rounded-xl bg-black/5 p-3">
              <span>Nabavna vrijednost</span>
              <b>{money(totals.purchase)}</b>
            </div>

            <div className="flex justify-between rounded-xl bg-mont-gold/20 p-3">
              <span>Zarada</span>
              <b>{money(totals.profit)}</b>
            </div>
          </>
        )}

        <div className="flex justify-between rounded-xl bg-black/5 p-3">
          <span>Ukupna količina</span>
          <b>{totals.itemsCount.toFixed(2)}</b>
        </div>
      </div>

      {report?.consumption_items?.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {report.consumption_items.map((it: any) => {
            const values = calculateConsumptionItemValues(it);

            return (
              <li key={it.id}>
                {it.products?.name}: <b>{Number(it.quantity).toFixed(2)}</b>
                {showMoney && <> — promet {money(values.sale)}</>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SuppliersView({ suppliers, receipts, refresh, setMessage }: any) {
  const empty = {
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    note: ""
  };

  const [form, setForm] = useState<any>(empty);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedSupplier) {
      setForm({
        name: selectedSupplier.name ?? "",
        contact_person: selectedSupplier.contact_person ?? "",
        phone: selectedSupplier.phone ?? "",
        email: selectedSupplier.email ?? "",
        note: selectedSupplier.note ?? ""
      });
    }
  }, [selectedSupplier]);

  const supplierStats = useMemo(() => {
    const map: Record<string, { count: number; total: number; lastDate: string }> = {};

    receipts.forEach((r: any) => {
      const name = r.supplier || "Nepoznat komitent";

      if (!map[name]) {
        map[name] = { count: 0, total: 0, lastDate: "" };
      }

      map[name].count += 1;

      r.stock_receipt_items?.forEach((it: any) => {
        map[name].total += receiptItemPurchaseValue(it);
      });

      if (!map[name].lastDate || String(r.date) > map[name].lastDate) {
        map[name].lastDate = String(r.date);
      }
    });

    return map;
  }, [receipts]);

  const visibleSuppliers = [...suppliers]
    .filter((s: Supplier) => {
      const q = normalizeText(search);
      if (!q) return true;

      return (
        normalizeText(s.name).includes(q) ||
        normalizeText(s.contact_person).includes(q) ||
        normalizeText(s.phone).includes(q) ||
        normalizeText(s.email).includes(q)
      );
    })
    .sort((a: Supplier, b: Supplier) => a.name.localeCompare(b.name, "bs"));

  async function saveSupplier(e: FormEvent) {
    e.preventDefault();

    const payload = {
      name: form.name,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      note: form.note || null,
      active: true
    };

    const res = selectedSupplier
      ? await supabase.from("suppliers").update(payload).eq("id", selectedSupplier.id)
      : await supabase.from("suppliers").insert(payload);

    if (res.error) {
      setMessage(res.error.message);
      return;
    }

    setMessage("Komitent je sačuvan.");
    setForm(empty);
    setSelectedSupplier(null);
    refresh();
  }

  async function deactivateSupplier(id: string) {
    const { error } = await supabase.from("suppliers").update({ active: false }).eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Komitent je deaktiviran.");
    refresh();
  }

  async function restoreSupplier(id: string) {
    const { error } = await supabase.from("suppliers").update({ active: true }).eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Komitent je vraćen.");
    refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <Card>
        <h2 className="mb-2 text-xl font-black">
          {selectedSupplier ? "Izmijeni komitenta" : "Dodaj komitenta"}
        </h2>

        <form onSubmit={saveSupplier} className="mt-4 space-y-4">
          <Field label="Naziv komitenta">
            <Input
              placeholder="npr. Gotovinska nabavka"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>

          <Field label="Kontakt osoba">
            <Input
              placeholder="Ime osobe"
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </Field>

          <Field label="Telefon">
            <Input
              placeholder="+387..."
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>

          <Field label="Email">
            <Input
              placeholder="email@..."
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Napomena">
            <Textarea
              placeholder="Napomena o komitentu"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button>Sačuvaj</Button>

            {selectedSupplier && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  setSelectedSupplier(null);
                  setForm(empty);
                }}
              >
                Odustani
              </SecondaryButton>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <h2 className="text-xl font-black">Komitenti / dobavljači</h2>

          <Input
            placeholder="Pretraži komitenta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid gap-3">
          {visibleSuppliers.map((s: Supplier) => {
            const stat = supplierStats[s.name] ?? { count: 0, total: 0, lastDate: "" };

            return (
              <div key={s.id} className="rounded-2xl border bg-white p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <h3 className="text-lg font-black">
                      {s.name}
                      {!s.active && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-1 text-xs text-red-700">
                          neaktivan
                        </span>
                      )}
                    </h3>

                    <p className="text-sm text-black/60">
                      {s.contact_person || "Nema kontakt osobe"}{" "}
                      {s.phone ? `• ${s.phone}` : ""} {s.email ? `• ${s.email}` : ""}
                    </p>

                    {s.note && <p className="mt-2 text-sm text-black/60">{s.note}</p>}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedSupplier(s)}
                      className="rounded-lg p-2 text-mont-brown hover:bg-black/5"
                      title="Izmijeni"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    {s.active ? (
                      <button
                        onClick={() => deactivateSupplier(s.id)}
                        className="rounded-lg p-2 text-red-700 hover:bg-red-50"
                        title="Deaktiviraj"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => restoreSupplier(s.id)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                      >
                        Vrati
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl bg-black/5 p-3">
                    <p className="text-xs text-black/50">Broj prijema</p>
                    <b>{stat.count}</b>
                  </div>
                  <div className="rounded-xl bg-black/5 p-3">
                    <p className="text-xs text-black/50">Nabavna vrijednost</p>
                    <b>{money(stat.total)}</b>
                  </div>
                  <div className="rounded-xl bg-black/5 p-3">
                    <p className="text-xs text-black/50">Zadnji prijem</p>
                    <b>{stat.lastDate || "-"}</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Reports({ reports, receipts }: any) {
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(getMonthStart());
  const [toDate, setToDate] = useState(getTodayDate());

  const dateFilteredReports = useMemo(() => {
    return reports.filter((r: any) => isDateInRange(r.date, fromDate, toDate));
  }, [reports, fromDate, toDate]);

  const dateFilteredReceipts = useMemo(() => {
    return receipts.filter((r: any) => isDateInRange(r.date, fromDate, toDate));
  }, [receipts, fromDate, toDate]);

  const periodTotals = useMemo(() => {
    let sale = 0;
    let purchase = 0;
    let receivedPurchase = 0;

    dateFilteredReports.forEach((r: any) => {
      r.consumption_items?.forEach((it: any) => {
        const values = calculateConsumptionItemValues(it);
        sale += values.sale;
        purchase += values.purchase;
      });
    });

    dateFilteredReceipts.forEach((r: any) => {
      r.stock_receipt_items?.forEach((it: any) => {
        receivedPurchase += receiptItemPurchaseValue(it);
      });
    });

    return {
      sale,
      purchase,
      profit: sale - purchase,
      receivedPurchase
    };
  }, [dateFilteredReports, dateFilteredReceipts]);

  const bartenderStats = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        reports: number;
        sale: number;
        purchase: number;
        profit: number;
        firstShift: number;
        secondShift: number;
        storage: number;
      }
    > = {};

    dateFilteredReports.forEach((r: any) => {
      const name = r.profiles?.full_name || "Nepoznat korisnik";

      if (!map[name]) {
        map[name] = {
          name,
          reports: 0,
          sale: 0,
          purchase: 0,
          profit: 0,
          firstShift: 0,
          secondShift: 0,
          storage: 0
        };
      }

      map[name].reports += 1;

      if (r.shift === "first") map[name].firstShift += 1;
      if (r.shift === "second") map[name].secondShift += 1;
      if (!r.shift) map[name].storage += 1;

      r.consumption_items?.forEach((it: any) => {
        const values = calculateConsumptionItemValues(it);

        map[name].sale += values.sale;
        map[name].purchase += values.purchase;
        map[name].profit += values.profit;
      });
    });

    return Object.values(map).sort((a, b) => b.sale - a.sale);
  }, [dateFilteredReports]);

  const shiftStats = useMemo(() => {
    const map: Record<
      string,
      {
        label: string;
        reports: number;
        sale: number;
        purchase: number;
        profit: number;
      }
    > = {
      first: {
        label: "Prva smjena",
        reports: 0,
        sale: 0,
        purchase: 0,
        profit: 0
      },
      second: {
        label: "Druga smjena",
        reports: 0,
        sale: 0,
        purchase: 0,
        profit: 0
      },
      storage: {
        label: "Magacin / proslave",
        reports: 0,
        sale: 0,
        purchase: 0,
        profit: 0
      }
    };

    dateFilteredReports.forEach((r: any) => {
      const key =
        r.shift === "first"
          ? "first"
          : r.shift === "second"
            ? "second"
            : "storage";

      map[key].reports += 1;

      r.consumption_items?.forEach((it: any) => {
        const values = calculateConsumptionItemValues(it);

        map[key].sale += values.sale;
        map[key].purchase += values.purchase;
        map[key].profit += values.profit;
      });
    });

    return Object.values(map);
  }, [dateFilteredReports]);

  const topProducts = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        quantity: number;
        sale: number;
        purchase: number;
        profit: number;
      }
    > = {};

    dateFilteredReports.forEach((r: any) => {
      r.consumption_items?.forEach((it: any) => {
        const name = it.products?.name || "Nepoznat artikal";
        const quantity = Number(it.quantity ?? 0);
        const values = calculateConsumptionItemValues(it);

        if (!map[name]) {
          map[name] = {
            name,
            quantity: 0,
            sale: 0,
            purchase: 0,
            profit: 0
          };
        }

        map[name].quantity += quantity;
        map[name].sale += values.sale;
        map[name].purchase += values.purchase;
        map[name].profit += values.profit;
      });
    });

    return Object.values(map)
      .sort((a, b) => b.sale - a.sale)
      .slice(0, 15);
  }, [dateFilteredReports]);

  const filteredReports = dateFilteredReports.filter((r: any) => {
    const q = normalizeText(search);
    if (!q) return true;

    return (
      normalizeText(r.date).includes(q) ||
      normalizeText(r.event_name).includes(q) ||
      normalizeText(r.profiles?.full_name).includes(q) ||
      r.consumption_items?.some((it: any) =>
        normalizeText(it.products?.name).includes(q)
      )
    );
  });

  const filteredReceipts = dateFilteredReceipts.filter((r: any) => {
    const q = normalizeText(search);
    if (!q) return true;

    return (
      normalizeText(r.date).includes(q) ||
      normalizeText(r.supplier).includes(q) ||
      normalizeText(r.document_number).includes(q) ||
      r.stock_receipt_items?.some((it: any) =>
        normalizeText(it.products?.name).includes(q)
      )
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
          <Field label="Od datuma">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </Field>

          <Field label="Do datuma">
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Field>

          <Field label="Pretraga">
            <Input
              placeholder="Pretraži po datumu, artiklu, komitentu, dokumentu ili šankeru..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          <SecondaryButton
            type="button"
            onClick={() => {
              setFromDate(getMonthStart());
              setToDate(getTodayDate());
              setSearch("");
            }}
          >
            Reset
          </SecondaryButton>
        </div>
      </Card>

      <CollapsibleSection title="Sažetak perioda" defaultOpen={true}>
        <div className="grid gap-4 md:grid-cols-4">
          <Stat
            icon={<BarChart3 />}
            label="Promet za period"
            value={money(periodTotals.sale)}
          />
          <Stat
            icon={<PackagePlus />}
            label="Nabavna vrijednost potrošnje"
            value={money(periodTotals.purchase)}
          />
          <Stat
            icon={<ClipboardList />}
            label="Zarada za period"
            value={money(periodTotals.profit)}
          />
          <Stat
            icon={<Warehouse />}
            label="Nabavljeno robe"
            value={money(periodTotals.receivedPurchase)}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Šankeri" defaultOpen={true}>
        <div className="grid gap-4 md:grid-cols-3">
          {bartenderStats.map((b) => (
            <Card key={b.name}>
              <p className="text-sm font-semibold text-black/60">Šanker</p>
              <h3 className="mt-1 text-xl font-black">{b.name}</h3>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between rounded-xl bg-black/5 p-3">
                  <span>Broj zaključenih smjena</span>
                  <b>{b.reports}</b>
                </div>

                <div className="flex justify-between rounded-xl bg-black/5 p-3">
                  <span>Promet</span>
                  <b>{money(b.sale)}</b>
                </div>

                <div className="flex justify-between rounded-xl bg-black/5 p-3">
                  <span>Nabavna vrijednost</span>
                  <b>{money(b.purchase)}</b>
                </div>

                <div className="flex justify-between rounded-xl bg-mont-gold/20 p-3">
                  <span>Zarada</span>
                  <b>{money(b.profit)}</b>
                </div>

                <div className="flex justify-between rounded-xl bg-black/5 p-3">
                  <span>Prosjek po smjeni</span>
                  <b>{money(b.reports ? b.sale / b.reports : 0)}</b>
                </div>

                <div className="text-xs text-black/50">
                  Prva smjena: {b.firstShift} • Druga smjena: {b.secondShift} •
                  Magacin: {b.storage}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Statistika po smjenama" defaultOpen={false}>
        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-3">Smjena</th>
                <th>Broj dokumenata</th>
                <th>Promet</th>
                <th>Nabavna vrijednost</th>
                <th>Zarada</th>
                <th>Prosjek po smjeni</th>
              </tr>
            </thead>

            <tbody>
              {shiftStats.map((s) => (
                <tr key={s.label} className="border-t">
                  <td className="p-3 font-semibold">{s.label}</td>
                  <td>{s.reports}</td>
                  <td>{money(s.sale)}</td>
                  <td>{money(s.purchase)}</td>
                  <td className="font-black">{money(s.profit)}</td>
                  <td>{money(s.reports ? s.sale / s.reports : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Najprodavaniji artikli po prometu" defaultOpen={false}>
        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="p-3">Artikal</th>
                <th>Količina</th>
                <th>Promet</th>
                <th>Nabavna vrijednost</th>
                <th>Zarada</th>
              </tr>
            </thead>

            <tbody>
              {topProducts.map((p) => (
                <tr key={p.name} className="border-t">
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td>{p.quantity.toFixed(2)}</td>
                  <td>{money(p.sale)}</td>
                  <td>{money(p.purchase)}</td>
                  <td className="font-black">{money(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Potrošnja - zaključeni dokumenti" defaultOpen={false}>
        <div className="space-y-3">
          {filteredReports.map((r: any) => {
            const totalSale = r.consumption_items?.reduce(
              (sum: number, it: any) => {
                return sum + calculateConsumptionItemValues(it).sale;
              },
              0
            );

            const totalPurchase = r.consumption_items?.reduce(
              (sum: number, it: any) => {
                return sum + calculateConsumptionItemValues(it).purchase;
              },
              0
            );

            const totalProfit =
              Number(totalSale ?? 0) - Number(totalPurchase ?? 0);

            return (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex justify-between gap-2">
                  <b>
                    {r.date} {" "}
                    {r.shift === "first"
                      ? "Prva smjena"
                      : r.shift === "second"
                        ? "Druga smjena"
                        : "Magacin"}
                  </b>
                  <span>{r.profiles?.full_name}</span>
                </div>

                <p className="text-sm text-black/60">{r.event_name}</p>

                <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-black/5 p-2">
                    Promet: <b>{money(totalSale)}</b>
                  </div>
                  <div className="rounded-lg bg-black/5 p-2">
                    Nabavna: <b>{money(totalPurchase)}</b>
                  </div>
                  <div className="rounded-lg bg-mont-gold/20 p-2">
                    Zarada: <b>{money(totalProfit)}</b>
                  </div>
                </div>

                <ul className="mt-2 text-sm">
                  {r.consumption_items?.map((it: any) => {
                    const values = calculateConsumptionItemValues(it);

                    return (
                      <li key={it.id}>
                        {it.products?.name}: {" "}
                        <b>{Number(it.quantity).toFixed(2)}</b> — promet {" "}
                        {money(values.sale)} — zarada {money(values.profit)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Prijem robe" defaultOpen={false}>
        <div className="space-y-3">
          {filteredReceipts.map((r: any) => {
            const total = r.stock_receipt_items?.reduce(
              (sum: number, it: any) => {
                return sum + receiptItemPurchaseValue(it);
              },
              0
            );

            return (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex justify-between gap-2">
                  <b>
                    {r.date} — {r.location === "bar" ? "Šank" : "Magacin"}
                  </b>
                  <span>{r.supplier}</span>
                </div>

                <p className="text-sm text-black/60">
                  Dokument: {r.document_number || "-"} • Nabavna vrijednost: {" "}
                  <b>{money(total)}</b>
                </p>

                <ul className="mt-2 text-sm">
                  {r.stock_receipt_items?.map((it: any) => (
                    <li key={it.id}>
                      {it.products?.name}: {" "}
                      <b>{Number(it.quantity).toFixed(2)}</b> — {" "}
                      {money(receiptItemPurchaseValue(it))}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}
