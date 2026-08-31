"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Search } from "lucide-react";
import {
  addActivity,
  generateId,
  getInventory,
  getProducts,
  InventoryItem,
  Product,
  saveInventory,
} from "../lib/storage";
import { addTransaction } from "../lib/transactions";

type CountDraft = {
  countInputs: Record<number, string>;
  search: string;
  activeCategory: string;
};

const DRAFT_KEY = "inventory-count-draft";

function safeNumber(value: string | number | undefined) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function loadDraft(): CountDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(DRAFT_KEY);
    return value ? JSON.parse(value) as CountDraft : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(DRAFT_KEY);
}

function productLabel(product: Product | undefined) {
  return product?.model || product?.name || product?.brandUses || "Unknown product";
}

export default function InventoryCountPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [countInputs, setCountInputs] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All Inventory");
  const [showReview, setShowReview] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [completion, setCompletion] = useState<{ checked: number; matched: number; adjusted: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const inventory = getInventory();
    const draft = loadDraft();
    setItems(inventory);
    setProducts(getProducts());
    setCountInputs(draft?.countInputs ?? {});
    setSearch(draft?.search ?? "");
    setActiveCategory(draft?.activeCategory === "All" ? "All Inventory" : draft?.activeCategory ?? "All Inventory");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ countInputs, search, activeCategory }));
  }, [activeCategory, countInputs, hydrated, search]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const categories = useMemo(
    () => ["All Inventory", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort()],
    [products]
  );

  const filteredItems = useMemo(() => {
    const queryTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((item) => {
        const product = productsById.get(item.productId);
        const fields = [product?.name, product?.brandUses, product?.model, product?.sizeGauge, product?.category, product?.productCode, product?.sku, item.variant]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return queryTokens.every((token) => fields.includes(token)) && (activeCategory === "All Inventory" || product?.category === activeCategory);
      })
      .sort((left, right) => productLabel(productsById.get(left.productId)).localeCompare(productLabel(productsById.get(right.productId))));
  }, [activeCategory, items, productsById, search]);

  const countedItems = useMemo(
    () => items.filter((item) => countInputs[item.id] !== undefined && countInputs[item.id] !== ""),
    [countInputs, items]
  );
  const differences = useMemo(
    () => countedItems.filter((item) => safeNumber(countInputs[item.id]) !== safeNumber(item.stock)),
    [countInputs, countedItems]
  );
  const summary = {
    selected: filteredItems.length,
    counted: countedItems.length,
    matched: countedItems.length - differences.length,
    differences: differences.length,
    remaining: filteredItems.filter((item) => countInputs[item.id] === undefined || countInputs[item.id] === "").length,
  };

  useEffect(() => {
    if (!hydrated || countedItems.length === 0) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [countedItems.length, hydrated]);

  const updateCount = (id: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setCountInputs((current) => ({ ...current, [id]: value }));
    setCompletion(null);
  };

  const clearSession = () => {
    setCountInputs({});
    setShowReview(false);
    setConfirmApply(false);
    setCompletion(null);
    clearDraft();
  };

  const applyAdjustments = () => {
    const updatedInventory = items.map((item) => {
      const count = countInputs[item.id];
      if (count === undefined || count === "") return item;
      const physicalCount = safeNumber(count);
      const systemQuantity = safeNumber(item.stock);
      if (physicalCount === systemQuantity) return item;
      const product = productsById.get(item.productId);
      const change = physicalCount - systemQuantity;
      addTransaction({
        id: generateId(),
        type: "ADJUST",
        productId: item.productId,
        inventoryItemId: item.id,
        productName: productLabel(product),
        variant: item.variant,
        quantity: change,
        previousStock: systemQuantity,
        newStock: physicalCount,
        date: Date.now(),
      });
      addActivity(`Inventory count adjustment: ${change >= 0 ? "+" : ""}${change} ${productLabel(product)}`);
      return { ...item, stock: physicalCount };
    });

    saveInventory(updatedInventory);
    setItems(updatedInventory);
    setCompletion({ checked: countedItems.length, matched: summary.matched, adjusted: differences.length });
    setCountInputs({});
    setShowReview(false);
    setConfirmApply(false);
    clearDraft();
  };

  if (!hydrated) {
    return <div className="p-6 text-sm text-slate-600">Loading inventory count...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-inventory">
        <div className="mt-3 command-slip-icon"><CheckSquare />Inventory Count</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Inventory Count</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Count physical stock and reconcile it with R.P.O.S.</p>
      </div>

      {completion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>Inventory count complete: {completion.checked} checked, {completion.matched} matched, {completion.adjusted} adjusted.</span>
          <div className="flex gap-3"><button type="button" onClick={clearSession} className="font-medium text-cyan-700">Continue Counting</button><Link href="/inventory" className="font-medium text-cyan-700">View Inventory</Link></div>
        </div>
      ) : null}

      <section className="glass-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory..." className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-3 text-slate-900" /></div>
          <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900">{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          {(search || activeCategory !== "All Inventory") ? <button type="button" onClick={() => { setSearch(""); setActiveCategory("All Inventory"); }} className="text-sm font-medium text-cyan-700">Clear filters</button> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-sm text-slate-600">
          <span>{summary.selected} selected</span><span>{summary.counted} counted</span><span>{summary.matched} matched</span><span>{summary.differences} differences</span><span>{summary.remaining} remaining</span>
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-semibold text-slate-950">Count inventory</h2><button type="button" onClick={() => setShowReview(true)} disabled={differences.length === 0} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">Review Differences</button></div>
        {filteredItems.length === 0 ? <p className="p-6 text-sm text-slate-600">No inventory matches your selection.</p> : (
          <div role="table" aria-label="Inventory count" className="w-full text-sm">
            <div role="row" className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_100px_130px_100px] gap-3 bg-slate-100 px-4 text-xs font-medium text-slate-600"><div className="py-3">Product</div><div className="py-3">Variant / Size</div><div className="py-3">System Qty</div><div className="py-3">Physical Count</div><div className="py-3">Difference</div></div>
            <div role="rowgroup">{filteredItems.map((item) => {
              const physicalCount = countInputs[item.id];
              const difference = physicalCount === undefined || physicalCount === "" ? null : safeNumber(physicalCount) - safeNumber(item.stock);
              return <div key={item.id} role="row" className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_100px_130px_100px] items-center gap-3 border-t border-slate-200 px-4 hover:bg-slate-50">
                <div className="min-w-0 py-3"><p className="truncate font-medium text-slate-950">{productLabel(productsById.get(item.productId))}</p><p className="truncate text-xs text-slate-500">{productsById.get(item.productId)?.brandUses || productsById.get(item.productId)?.productCode || "-"}</p></div>
                <div className="truncate py-3 text-slate-600">{productsById.get(item.productId)?.sizeGauge || item.variant || "-"}</div><div className="py-3 font-semibold text-slate-950">{safeNumber(item.stock)}</div>
                <div className="py-3"><input aria-label={`Physical count for ${productLabel(productsById.get(item.productId))}`} type="number" min="0" value={physicalCount ?? ""} onChange={(event) => updateCount(item.id, event.target.value)} className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" /></div>
                <div className={`py-3 font-semibold ${difference === null || difference === 0 ? "text-slate-500" : difference < 0 ? "text-rose-700" : "text-amber-700"}`}>{difference === null ? "-" : difference > 0 ? `+${difference}` : difference}</div>
              </div>;
            })}</div>
          </div>
        )}
      </section>

      {showReview ? (
        <section className="glass-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-950">Review differences</h2><p className="mt-1 text-sm text-slate-600">{differences.length} {differences.length === 1 ? "item" : "items"} will be adjusted. {summary.remaining > 0 ? `${summary.remaining} uncounted items will remain unchanged.` : ""}</p></div><button type="button" onClick={() => setShowReview(false)} className="text-sm font-medium text-cyan-700">Back to count</button></div>
          <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">{differences.map((item) => { const physical = safeNumber(countInputs[item.id]); const difference = physical - safeNumber(item.stock); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span className="font-medium text-slate-950">{productLabel(productsById.get(item.productId))} {productsById.get(item.productId)?.sizeGauge || item.variant}</span><span className="text-slate-600">System: {item.stock} · Physical: {physical} · Adjustment: {difference > 0 ? `+${difference}` : difference}</span></div>; })}</div>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setConfirmApply(true)} className="rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950">Apply Adjustments</button><button type="button" onClick={clearSession} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">Reset count</button></div>
        </section>
      ) : null}

      {confirmApply ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="confirm-count-title" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6"><h2 id="confirm-count-title" className="text-xl font-semibold text-slate-950">Apply adjustments?</h2><p className="mt-2 text-sm text-slate-600">{differences.length} inventory items will be adjusted to match the physical count. {summary.remaining > 0 ? `${summary.remaining} uncounted items will remain unchanged.` : ""}</p><div className="mt-5 flex gap-3"><button type="button" onClick={applyAdjustments} className="rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950">Apply Adjustments</button><button type="button" onClick={() => setConfirmApply(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">Cancel</button></div></section></div> : null}
    </div>
  );
}