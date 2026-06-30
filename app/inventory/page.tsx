"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getInventory,
  saveInventory,
  getProductById,
  getProducts,
  saveProducts,
  getOrders,
  saveOrders,
  addActivity,
  InventoryItem,
  Product,
} from "../lib/storage";

import { addTransaction } from "../lib/transactions";

function safeNumber(value: any) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function normalizeText(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

/* Stable ID generator (prevents collisions) */
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type StatusFilter = "ALL" | "LOW" | "OUT" | "ORDERED";
const ITEMS_PER_PAGE = 100;

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState(1);
  const categoryTabs = ["All", "Drum Skins", "Guitar Strings", "Drum Sticks", "Misc"];

  /* LOAD DATA */
  useEffect(() => {
    setItems(getInventory());
  }, []);

  const matchesStatusFilter = (item: InventoryItem, product: Product | undefined) => {
    const stock = safeNumber(item.stock);
    const threshold = Number(product?.minimum ?? 0);

    if (activeStatusFilter === "LOW") {
      return stock > 0 && threshold > 0 && stock <= threshold;
    }

    if (activeStatusFilter === "OUT") {
      return stock <= 0;
    }

    if (activeStatusFilter === "ORDERED") {
      return Boolean(product?.ordered);
    }

    return true;
  };

  /* FILTER */
  const filtered = useMemo(() => {
    const matches = items.filter((item) => {
      const product = getProductById(item.productId);
      const normalizedSearch = search.toLowerCase().trim();
      const searchFields = [
        product?.brandUses,
        product?.model,
        product?.sizeGauge,
        item.variant,
        product?.name,
        product?.productCode,
        product?.sku,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !normalizedSearch || searchFields.includes(normalizedSearch);
      const matchesCategory =
        activeCategory === "All" || (product?.category || "") === activeCategory;
      const matchesStatus = matchesStatusFilter(item, product);

      return Boolean(matchesSearch) && matchesCategory && matchesStatus;
    });

    return matches.sort((left, right) => {
      const leftProduct = getProductById(left.productId);
      const rightProduct = getProductById(right.productId);

      const byBrand = normalizeText(leftProduct?.brandUses).localeCompare(normalizeText(rightProduct?.brandUses));
      if (byBrand !== 0) return byBrand;

      const byModel = normalizeText(leftProduct?.model || leftProduct?.name).localeCompare(
        normalizeText(rightProduct?.model || rightProduct?.name)
      );
      if (byModel !== 0) return byModel;

      const bySize = normalizeText(leftProduct?.sizeGauge || left.variant).localeCompare(
        normalizeText(rightProduct?.sizeGauge || right.variant)
      );
      if (bySize !== 0) return bySize;

      return left.id - right.id;
    });
  }, [items, search, activeCategory, activeStatusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeCategory, activeStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedFiltered = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const inventoryStats = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + safeNumber(item.stock), 0);
    const openOrders = getOrders().filter((order) => order.status === "OPEN");

    return {
      trackedLines: items.length,
      totalUnits,
      lowStock: items.filter((item) => {
        const product = getProductById(item.productId);
        const threshold = Number(product?.minimum ?? 0);
        return safeNumber(item.stock) > 0 && threshold > 0 && safeNumber(item.stock) <= threshold;
      }).length,
      outOfStock: items.filter((item) => safeNumber(item.stock) <= 0).length,
      openOrders: openOrders.length,
    };
  }, [items]);

  const getStockStatus = (item: InventoryItem, product: Product | undefined) => {
    const stock = safeNumber(item.stock);
    const threshold = Number(product?.minimum ?? 0);

    if (stock <= 0) {
      return {
        label: "Out of stock",
        fillClass: "bg-rose-500",
        badgeClass: "bg-rose-500 text-white",
        fill: 0,
      };
    }

    if (threshold > 0 && stock <= threshold) {
      return {
        label: "Low stock",
        fillClass: "bg-amber-500",
        badgeClass: "bg-amber-500 text-slate-950",
        fill: 35,
      };
    }

    return {
      label: "Healthy",
      fillClass: "bg-emerald-500",
      badgeClass: "bg-emerald-500 text-white",
      fill: 100,
    };
  };

  const setOrderedFlag = (productId: number, ordered: boolean) => {
    const products = getProducts();
    const updatedProducts = products.map((product) =>
      product.id === productId
        ? {
            ...product,
            ordered,
            orderedDate: ordered
              ? product.orderedDate || new Date().toISOString().slice(0, 10)
              : "",
          }
        : product
    );
    saveProducts(updatedProducts);
    return updatedProducts.find((product) => product.id === productId);
  };

  const syncOrderForProduct = (product: Product | undefined) => {
    if (!product) return;

    const currentOrders = getOrders();
    const existingOrder = currentOrders.find((order) => order.productId === product.id);

    if (product.ordered) {
      const order = {
        id: existingOrder?.id ?? Date.now(),
        productId: product.id,
        productName: product.model || product.brandUses || product.sku || product.name || "Product",
        variant: product.sizeGauge || "",
        quantity: product.orderQty ?? 0,
        orderedDate: product.orderedDate || new Date().toISOString().slice(0, 10),
        supplier: product.supplier || "",
        lastBuyPrice: product.lastBuyPrice,
        status: "OPEN" as const,
      };

      const updatedOrders = existingOrder
        ? currentOrders.map((item) => (item.productId === product.id ? order : item))
        : [order, ...currentOrders];

      saveOrders(updatedOrders);
    } else {
      saveOrders(currentOrders.filter((item) => item.productId !== product.id));
    }
  };

  /* UPDATE STOCK */
  const updateStock = (id: number, delta: number) => {
    let transactionToAdd: any = null;

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      const newStock = Math.max(0, safeNumber(item.stock) + delta);

      const product = getProductById(item.productId);
      transactionToAdd = {
        id: createId(),
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: delta > 0 ? "RESTOCK" : "REMOVE",
        quantity: Math.abs(delta),
        date: new Date().toISOString(),
      };

      return {
        ...item,
        stock: newStock,
      };
    });

    saveInventory(updated);
    setItems(getInventory());
    setSelected((prev) =>
      prev && prev.id === id
        ? updated.find((item) => item.id === id) ?? prev
        : prev
    );

    if (transactionToAdd) {
      addTransaction(transactionToAdd);
      addActivity(
        `${transactionToAdd.type === "RESTOCK" ? "Restocked" : "Removed stock from"} ${transactionToAdd.productName || "inventory item"}`
      );
    }
  };

  /* RESTOCK */
  const restock = (id: number, amount: number) => {
    if (!amount || amount <= 0) return;

    let transactionToAdd: any = null;

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      const newStock = safeNumber(item.stock) + amount;

      const product = getProductById(item.productId);
      transactionToAdd = {
        id: createId(),
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: "RESTOCK",
        quantity: amount,
        date: new Date().toISOString(),
      };

      return {
        ...item,
        stock: newStock,
      };
    });

    saveInventory(updated);
    setItems(getInventory());
    setSelected((prev) =>
      prev && prev.id === id
        ? updated.find((item) => item.id === id) ?? prev
        : prev
    );

    if (transactionToAdd) {
      addTransaction(transactionToAdd);
      addActivity(`Restocked ${transactionToAdd.productName || "inventory item"}`);
    }

    setSelected(null);
    setRestockAmount(1);
  };

  const selectedProduct = selected ? getProductById(selected.productId) : null;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">

      {/* HEADER */}
      <div className="rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(12,74,110,0.95),rgba(8,145,178,0.88))] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,15,24,0.24)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-cyan-200/80">
              STOCK CONTROL GRID
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Inventory Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/78 sm:text-base">
              Live warehouse stock view with fast filtering, line-by-line status, and direct restock controls.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatChip
              label="Lines"
              value={inventoryStats.trackedLines}
              tone="cyan"
              isActive={activeStatusFilter === "ALL"}
              onClick={() => setActiveStatusFilter("ALL")}
            />
            <StatChip label="Units" value={inventoryStats.totalUnits} tone="slate" />
            <StatChip
              label="Low"
              value={inventoryStats.lowStock}
              tone="amber"
              isActive={activeStatusFilter === "LOW"}
              onClick={() => setActiveStatusFilter("LOW")}
            />
            <StatChip
              label="Zero"
              value={inventoryStats.outOfStock}
              tone="rose"
              isActive={activeStatusFilter === "OUT"}
              onClick={() => setActiveStatusFilter("OUT")}
            />
            <StatChip
              label="POs"
              value={inventoryStats.openOrders}
              tone="sky"
              isActive={activeStatusFilter === "ORDERED"}
              onClick={() => setActiveStatusFilter("ORDERED")}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
                  Inventory search
                </p>
                <h2 className="text-xl font-semibold text-slate-950 mt-2">
                  Find product stock fast
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Filter live stock lines by category or search by product name.
                </p>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full sm:w-80 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex flex-wrap gap-3">
              {categoryTabs.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeCategory === category
                      ? "bg-slate-950 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card overflow-x-auto">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
                  Live stock table
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Showing page {currentPage} of {totalPages} ({filtered.length} total {activeCategory === "All" ? "items" : `${activeCategory} items`})
                  {activeStatusFilter === "LOW"
                    ? " in low stock"
                    : activeStatusFilter === "OUT"
                      ? " out of stock"
                      : activeStatusFilter === "ORDERED"
                        ? " marked ordered"
                        : ""}.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                <span className="h-2 w-2 rounded-full bg-cyan-500" />
                Click any row for stock controls
              </div>
            </div>
            <table className="sticky-table-header min-w-full text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Brand / Uses</th>
                  <th className="p-3 text-left">Model</th>
                  <th className="p-3 text-left">Size / Gauge</th>
                  <th className="p-3 text-left">Current Stock</th>
                  <th className="p-3 text-left">Order Qty</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Ordered ✅</th>
                  <th className="p-3 text-left">Ordered Date</th>
                  <th className="p-3 text-left">Product Code</th>
                  <th className="p-3 text-left">Supplier</th>
                  <th className="p-3 text-left">Last Buy Price</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFiltered.map((item) => {
                  const product = getProductById(item.productId);
                  const status = getStockStatus(item, product);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className={`cursor-pointer border-t border-slate-200 transition hover:bg-slate-50 ${selected?.id === item.id ? "bg-cyan-50/70" : ""}`}
                    >
                      <td className="p-3 font-medium text-slate-950">{product?.category || "-"}</td>
                      <td className="p-3 font-medium text-slate-950">
                        {product?.brandUses || product?.category || product?.name || "Unknown"}
                      </td>
                      <td className="p-3 text-slate-600">{product?.model || product?.name || "-"}</td>
                      <td className="p-3 text-slate-600">{product?.sizeGauge || item.variant || "-"}</td>
                      <td className="p-3 text-slate-600">{safeNumber(item.stock)}</td>
                      <td className="p-3 text-slate-600">{product?.orderQty ?? 0}</td>
                      <td className="p-3 text-slate-600">
                        <div className="inline-flex items-center gap-2">
                          <span className="inline-flex h-5 w-10 items-center rounded-full border border-slate-300 bg-slate-100 p-0.5">
                            <span
                              className={`${status.fillClass} h-full rounded-full transition-all duration-200`}
                              style={{ width: `${status.fill}%` }}
                            />
                          </span>
                          <span
                            className={`inline-flex min-w-[90px] justify-center rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${status.badgeClass}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded border ${product?.ordered ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}
                        >
                          {product?.ordered ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{product?.orderedDate || "-"}</td>
                      <td className="p-3 text-slate-600">{product?.productCode || product?.sku || "-"}</td>
                      <td className="p-3 text-slate-600">{product?.supplier || "-"}</td>
                      <td className="p-3 text-slate-600">
                        {product?.lastBuyPrice != null ? `$${product.lastBuyPrice.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-4">
              {Array.from({ length: totalPages }, (_, index) => {
                const page = index + 1;
                const isActive = page === currentPage;

                return (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {selected ? (
            <div className="rounded-[2rem] border border-slate-900 bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(8,15,24,0.24)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm uppercase tracking-[0.24em] text-cyan-300/75">
                    Inventory detail
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    {getProductById(selected.productId)?.model || getProductById(selected.productId)?.name}
                  </h2>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-cyan-400/15 bg-white/5 p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Current Stock</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{safeNumber(selected.stock)}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Ordered</p>
                  <label className="mt-2 inline-flex items-center gap-2 text-slate-100">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedProduct?.ordered)}
                      onChange={(e) => {
                        const product = setOrderedFlag(selected.productId, e.target.checked);
                        syncOrderForProduct(product);
                        setItems(getInventory());
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    {selectedProduct?.ordered ? "Yes" : "No"}
                  </label>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">Adjust stock</p>
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateStock(selected.id, -1)}
                      className="rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => updateStock(selected.id, 1)}
                      className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                    >
                      +1
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={restockAmount}
                      onChange={(e) => setRestockAmount(Number(e.target.value))}
                      className="w-full rounded-2xl border border-white/10 bg-white px-4 py-2 text-slate-900"
                    />
                    <button
                      onClick={() => restock(selected.id, restockAmount)}
                      className="rounded-2xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300"
                    >
                      Restock
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/60 p-6 text-slate-600 shadow-sm backdrop-blur-sm">
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Inventory detail</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Select a stock line</h2>
              <p className="mt-3 text-sm leading-6">
                Click any inventory row to inspect stock state, toggle ordered status, or run a quick restock.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
  isActive = false,
  onClick,
}: {
  label: string;
  value: number;
  tone: "cyan" | "slate" | "amber" | "rose" | "sky";
  isActive?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
    slate: "border-white/15 bg-white/8 text-white",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-50",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-50",
    sky: "border-sky-300/25 bg-sky-300/10 text-sky-50",
  }[tone];

  const activeClass = isActive ? "ring-2 ring-white/70 ring-offset-2 ring-offset-slate-900" : "";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/15 ${toneClass} ${activeClass}`}
      >
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </button>
    );
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
