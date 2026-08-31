"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import {
  addActivity,
  getAppSettings,
  getInventory,
  getProducts,
  getSuppliers,
  InventoryItem,
  Product,
  resolveSupplierName,
  saveInventory,
  Supplier,
} from "../lib/storage";
import { addTransaction } from "../lib/transactions";

type StatusFilter = "ALL" | "IN" | "LOW" | "OUT";

type LastChange = {
  itemId: number;
  delta: number;
  productName: string;
};

const ITEMS_PER_PAGE = 100;

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function isLowStock(stock: number, minimum: number, mode: "lt" | "lte") {
  if (minimum <= 0 || stock <= 0) return false;
  return mode === "lte" ? stock <= minimum : stock < minimum;
}

function productLabel(product: Product | undefined) {
  if (!product) return "Unknown product";
  return product.model || product.name || product.brandUses || "Unnamed product";
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [adjustingItemId, setAdjustingItemId] = useState<number | null>(null);
  const [customChange, setCustomChange] = useState("");
  const [exactQuantity, setExactQuantity] = useState("");
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateInProgressRef = useRef(false);

  useEffect(() => {
    setItems(getInventory());
    setProducts(getProducts());
    setSuppliers(getSuppliers());
  }, []);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort()],
    [products]
  );

  const filteredItems = useMemo(() => {
    const queryTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const settings = getAppSettings();

    return items
      .filter((item) => {
        const product = productsById.get(item.productId);
        const stock = safeNumber(item.stock);
        const minimum = safeNumber(product?.minimum);
        const fields = [
          product?.name,
          product?.brandUses,
          product?.model,
          product?.category,
          product?.sizeGauge,
          item.variant,
          product?.sku,
          product?.productCode,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesSearch = queryTokens.every((token) => fields.includes(token));
        const matchesCategory = activeCategory === "All" || product?.category === activeCategory;
        const matchesStatus =
          activeStatus === "ALL" ||
          (activeStatus === "OUT" && stock === 0) ||
          (activeStatus === "LOW" && isLowStock(stock, minimum, settings.lowStockMode)) ||
          (activeStatus === "IN" && stock > 0 && !isLowStock(stock, minimum, settings.lowStockMode));

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((left, right) => {
        const leftProduct = productsById.get(left.productId);
        const rightProduct = productsById.get(right.productId);
        return productLabel(leftProduct).localeCompare(productLabel(rightProduct));
      });
  }, [activeCategory, activeStatus, items, productsById, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeCategory, activeStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const pageItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const adjustingItem = items.find((item) => item.id === adjustingItemId) ?? null;
  const adjustingProduct = adjustingItem ? productsById.get(adjustingItem.productId) : undefined;
  const filtersActive = Boolean(search || activeCategory !== "All" || activeStatus !== "ALL");
  const hasUnsavedAdjustment = Boolean(
    customChange || (adjustingItem && exactQuantity !== String(safeNumber(adjustingItem.stock)))
  );

  useEffect(() => {
    if (!adjustingItemId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAdjustingItemId(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [adjustingItemId]);

  const getStatus = (item: InventoryItem) => {
    const product = productsById.get(item.productId);
    const stock = safeNumber(item.stock);
    const minimum = safeNumber(product?.minimum);
    const settings = getAppSettings();
    if (stock === 0) return { label: "Out of stock", className: "text-rose-700", dotClass: "bg-rose-500" };
    if (isLowStock(stock, minimum, settings.lowStockMode)) return { label: "Low stock", className: "text-amber-700", dotClass: "bg-amber-500" };
    return { label: "In stock", className: "text-slate-600", dotClass: "bg-slate-400" };
  };

  const applyChange = (itemId: number, delta: number, recordUndo = true) => {
    if (updateInProgressRef.current || !Number.isFinite(delta) || delta === 0) return;
    const item = items.find((current) => current.id === itemId);
    if (!item) return;

    const previousStock = safeNumber(item.stock);
    const newStock = previousStock + delta;
    if (newStock < 0) return;

    updateInProgressRef.current = true;
    setIsUpdating(true);
    const updatedItems = items.map((current) => current.id === itemId ? { ...current, stock: newStock } : current);
    const product = productsById.get(item.productId);
    const name = productLabel(product);

    saveInventory(updatedItems);
    setItems(updatedItems);
    addTransaction({
      id: Date.now(),
      inventoryItemId: item.id,
      productId: item.productId,
      productName: name,
      variant: item.variant,
      type: delta > 0 ? "RESTOCK" : "REMOVE",
      quantity: Math.abs(delta),
      previousStock,
      newStock,
      date: Date.now(),
    });
    addActivity(`${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "unit" : "units"} ${delta > 0 ? "to" : "from"} ${name}`);

    if (recordUndo) setLastChange({ itemId, delta, productName: name });
    else setLastChange(null);
    setAdjustingItemId(null);
    setIsUpdating(false);
    updateInProgressRef.current = false;
  };

  const openAdjustment = (item: InventoryItem) => {
    setAdjustingItemId(item.id);
    setCustomChange("");
    setExactQuantity(String(safeNumber(item.stock)));
  };

  const submitCustomChange = () => {
    if (!adjustingItem) return;
    applyChange(adjustingItem.id, safeNumber(customChange));
    setCustomChange("");
  };

  const submitExactQuantity = () => {
    if (!adjustingItem) return;
    const nextQuantity = safeNumber(exactQuantity);
    if (nextQuantity < 0) return;
    applyChange(adjustingItem.id, nextQuantity - safeNumber(adjustingItem.stock));
  };

  const clearFilters = () => {
    setSearch("");
    setActiveCategory("All");
    setActiveStatus("ALL");
  };

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-inventory">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mt-3 command-slip-icon"><Boxes />Inventory</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Inventory</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">View and manage current warehouse stock.</p>
          </div>
          <Link href="/products" className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">Add Inventory</Link>
        </div>
      </div>

      {lastChange ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>{Math.abs(lastChange.delta)} {lastChange.delta > 0 ? "added to" : "removed from"} {lastChange.productName}</span>
          <button type="button" onClick={() => applyChange(lastChange.itemId, -lastChange.delta, false)} className="font-semibold text-cyan-700">Undo</button>
        </div>
      ) : null}

      <section className="glass-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search inventory..."
            className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-sky-300"
          />
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <select value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900">
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={activeStatus} onChange={(event) => setActiveStatus(event.target.value as StatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900">
              <option value="ALL">All stock</option>
              <option value="IN">In Stock</option>
              <option value="LOW">Low Stock</option>
              <option value="OUT">Out of Stock</option>
            </select>
          </div>
          {filtersActive ? <button type="button" onClick={clearFilters} className="text-sm font-medium text-cyan-700">Clear filters</button> : null}
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <p className="text-sm text-slate-600">{filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}</p>
          <p className="text-xs text-slate-500">Use - and + for quick changes</p>
        </div>
        {pageItems.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            {filtersActive ? "No inventory matches these filters." : "No inventory matches your search."}
            {filtersActive ? <button type="button" onClick={clearFilters} className="ml-3 font-medium text-cyan-700">Clear filters</button> : null}
          </div>
        ) : (
          <div role="table" aria-label="Inventory" className="w-full text-sm">
            <div role="row" className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_80px_120px_180px] gap-3 bg-slate-100 px-4 text-xs font-medium text-slate-600">
              <div role="columnheader" className="py-3">Product</div>
              <div role="columnheader" className="py-3">Variant / Size</div>
              <div role="columnheader" className="py-3">Category</div>
              <div role="columnheader" className="py-3">Qty</div>
              <div role="columnheader" className="py-3">Status</div>
              <div role="columnheader" className="py-3 text-right">Actions</div>
            </div>
            <div role="rowgroup">
              {pageItems.map((item) => {
                const product = productsById.get(item.productId);
                const status = getStatus(item);
                return (
                  <div key={item.id} role="row" className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_80px_120px_180px] items-center gap-3 border-t border-slate-200 px-4 transition hover:bg-slate-50">
                    <div role="cell" className="min-w-0 py-3">
                      <p className="truncate font-medium text-slate-950">{productLabel(product)}</p>
                      <p className="truncate text-xs text-slate-500">{[product?.brandUses, product?.productCode || product?.sku].filter(Boolean).join(" · ") || "-"}</p>
                    </div>
                    <div role="cell" className="truncate py-3 text-slate-600">{product?.sizeGauge || item.variant || "-"}</div>
                    <div role="cell" className="truncate py-3 text-slate-600">{product?.category || "-"}</div>
                    <div role="cell" className="py-3 text-lg font-semibold text-slate-950">{safeNumber(item.stock)}</div>
                    <div role="cell" className={`flex items-center gap-2 py-3 text-xs font-medium ${status.className}`}><span className={`h-2 w-2 rounded-full ${status.dotClass}`} />{status.label}</div>
                    <div role="cell" className="flex justify-end gap-1 py-3">
                      <button type="button" aria-label={`Remove one from ${productLabel(product)}`} disabled={isUpdating || item.stock <= 0} onClick={() => applyChange(item.id, -1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                      <button type="button" aria-label={`Add one to ${productLabel(product)}`} disabled={isUpdating} onClick={() => applyChange(item.id, 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700"><Plus className="h-4 w-4" /></button>
                      <button type="button" aria-label={`Adjust ${productLabel(product)} stock`} onClick={() => openAdjustment(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700"><SlidersHorizontal className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-5 py-4">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" onClick={() => setCurrentPage(page)} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${page === currentPage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{page}</button>
            ))}
          </div>
        ) : null}
      </section>

      {adjustingItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onMouseDown={() => {
            if (!hasUnsavedAdjustment) setAdjustingItemId(null);
          }}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-stock-title"
          className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-lg"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="adjust-stock-title" className="text-sm font-medium text-slate-950">Adjust stock</p>
              <p className="mt-1 text-sm text-slate-600">{productLabel(adjustingProduct)} · Current: {safeNumber(adjustingItem.stock)}</p>
            </div>
            <button type="button" onClick={() => setAdjustingItemId(null)} aria-label="Close adjustment" className="text-slate-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[-10, -5, -1, 1, 5, 10].map((amount) => (
              <button key={amount} type="button" disabled={isUpdating || safeNumber(adjustingItem.stock) + amount < 0} onClick={() => applyChange(adjustingItem.id, amount)} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">{amount > 0 ? `+${amount}` : amount}</button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">Change by<input value={customChange} onChange={(event) => setCustomChange(event.target.value)} type="number" placeholder="e.g. -12 or +25" className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" /></label>
            <label className="text-sm text-slate-600">Set quantity<input value={exactQuantity} onChange={(event) => setExactQuantity(event.target.value)} type="number" min="0" className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" /></label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={isUpdating || !customChange || safeNumber(adjustingItem.stock) + safeNumber(customChange) < 0} onClick={submitCustomChange} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40">Apply change</button>
            <button type="button" disabled={isUpdating || exactQuantity === "" || safeNumber(exactQuantity) < 0} onClick={submitExactQuantity} className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Set quantity</button>
          </div>
        </section>
        </div>
      ) : null}
    </div>
  );
}