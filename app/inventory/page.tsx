"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes } from "lucide-react";
import {
  getAppSettings,
  getInventory,
  saveInventory,
  getProducts,
  saveProducts,
  getOrders,
  saveOrders,
  addActivity,
  generateId,
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

function isLowStockByMode(stock: number, minimum: number, mode: "lt" | "lte") {
  if (minimum <= 0 || stock <= 0) return false;
  return mode === "lte" ? stock <= minimum : stock < minimum;
}

type StatusFilter = "ALL" | "LOW" | "OUT" | "ORDERED";
const ITEMS_PER_PAGE = 100;

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const categoryTabs = [
    "All",
    "Drum Skins",
    "Percussion Skins",
    "Guitar Strings",
    "Guitar Accessories",
    "Drum Sticks",
    "Drum Accessories",
    "Batteries",
    "Tape",
    "Misc",
  ];

  /* LOAD DATA */
  useEffect(() => {
    setItems(getInventory());
    setProducts(getProducts());
  }, []);

  const productsById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const matchesStatusFilter = (item: InventoryItem, product: Product | undefined) => {
    const settings = getAppSettings();
    const stock = safeNumber(item.stock);
    const threshold = Number(product?.minimum ?? 0);
    const trackedOutOfStock =
      stock <= 0 && (settings.includeNonStockedInAlerts || threshold > 0);

    if (activeStatusFilter === "LOW") {
      return isLowStockByMode(stock, threshold, settings.lowStockMode);
    }

    if (activeStatusFilter === "OUT") {
      return trackedOutOfStock;
    }

    if (activeStatusFilter === "ORDERED") {
      return Boolean(product?.ordered);
    }

    return true;
  };

  const handleCategoryTabClick = (category: string) => {
    const scrollY = window.scrollY;
    setActiveCategory(category);

    // Prevent browser scroll anchoring from causing a visible jump when row counts change.
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollY);
    });
  };

  /* FILTER */
  const filtered = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    const matches = items.filter((item) => {
      const product = productsById.get(item.productId);
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
      const leftProduct = productsById.get(left.productId);
      const rightProduct = productsById.get(right.productId);

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
  }, [items, productsById, search, activeCategory, activeStatusFilter]);

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
    const settings = getAppSettings();
    const openOrders = getOrders().filter((order) => order.status === "OPEN");
    const stats = items.reduce(
      (acc, item) => {
        const stock = safeNumber(item.stock);
        const product = productsById.get(item.productId);
        const threshold = Number(product?.minimum ?? 0);

        acc.totalUnits += stock;
        if (stock <= 0 && (settings.includeNonStockedInAlerts || threshold > 0)) {
          acc.outOfStock += 1;
        } else if (isLowStockByMode(stock, threshold, settings.lowStockMode)) {
          acc.lowStock += 1;
        }

        return acc;
      },
      { totalUnits: 0, lowStock: 0, outOfStock: 0 }
    );

    return {
      trackedLines: items.length,
      totalUnits: stats.totalUnits,
      lowStock: stats.lowStock,
      outOfStock: stats.outOfStock,
      openOrders: openOrders.length,
    };
  }, [items, productsById]);

  const getStockStatus = (item: InventoryItem, product: Product | undefined) => {
    const settings = getAppSettings();
    const stock = safeNumber(item.stock);
    const threshold = Number(product?.minimum ?? 0);
    const trackedOutOfStock =
      stock <= 0 && (settings.includeNonStockedInAlerts || threshold > 0);

    if (trackedOutOfStock) {
      return {
        label: "Out of stock",
        fillClass: "bg-rose-500",
        badgeClass: "bg-rose-500 text-white",
        fill: 0,
      };
    }

    if (isLowStockByMode(stock, threshold, settings.lowStockMode)) {
      return {
        label: "Low stock",
        fillClass: "bg-amber-600",
        badgeClass: "bg-amber-600 text-white",
        fill: 35,
      };
    }

    return {
      label: "In stock",
      fillClass: "bg-emerald-500",
      badgeClass: "bg-emerald-500 text-white",
      fill: 100,
    };
  };

  const setOrderedFlag = (productId: number, ordered: boolean) => {
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
      setProducts(updatedProducts);
    return updatedProducts.find((product) => product.id === productId);
  };

  const syncOrderForProduct = (product: Product | undefined) => {
    if (!product) return;

    const currentOrders = getOrders();
    const existingOrder = currentOrders.find((order) => order.productId === product.id);

    if (product.ordered) {
      const order = {
        id: existingOrder?.id ?? generateId(),
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

      const product = productsById.get(item.productId);
      transactionToAdd = {
        id: generateId(),
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: delta > 0 ? "RESTOCK" : "REMOVE",
        quantity: Math.abs(delta),
        date: Date.now(),
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
    if (!amount || amount <= 0) {
      setSelected(null);
      setRestockAmount("");
      return;
    }

    let transactionToAdd: any = null;

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      const newStock = safeNumber(item.stock) + amount;

      const product = productsById.get(item.productId);
      transactionToAdd = {
        id: generateId(),
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: "RESTOCK",
        quantity: amount,
        date: Date.now(),
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
    setRestockAmount("");
  };

  const selectedProduct = selected ? productsById.get(selected.productId) : null;

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">

      {/* HEADER */}
      <div className="command-hero command-hero-inventory">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-cyan-200/80">
              STOCK CONTROL GRID
            </p>
            <div className="mt-3 command-slip-icon">
              <Boxes />
              Inventory
            </div>
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
                  onClick={() => handleCategoryTabClick(category)}
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
            <div role="table" aria-label="Inventory table" className="min-w-[1580px] w-full text-sm text-slate-700">
              <div
                role="row"
                className="grid grid-cols-[140px_200px_140px_140px_120px_220px_120px_150px_160px_150px_160px] bg-slate-100 text-slate-600"
              >
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Category</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Brand / Uses</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Model</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Size / Gauge</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Current Stock</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Status</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Ordered ✅</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Ordered Date</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Product Code</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Supplier</div>
                <div role="columnheader" className="p-3 text-left whitespace-nowrap">Last Buy Price</div>
              </div>

              <div role="rowgroup" style={{ overflowAnchor: "none" }}>
                {paginatedFiltered.map((item, rowIndex) => {
                  const product = productsById.get(item.productId);
                  const status = getStockStatus(item, product);
                  const rowKey = `${item.id}-${item.productId}-${item.variant || "-"}-${rowIndex}`;

                  return (
                    <div
                      role="row"
                      key={rowKey}
                      onClick={() => setSelected(item)}
                      className={`grid cursor-pointer grid-cols-[140px_200px_140px_140px_120px_220px_120px_150px_160px_150px_160px] border-t border-slate-200 transition hover:bg-slate-50 ${selected?.id === item.id ? "bg-cyan-50/70" : ""}`}
                    >
                      <div role="cell" className="p-3 font-medium text-slate-950 overflow-hidden text-ellipsis whitespace-nowrap">{product?.category || "-"}</div>
                      <div role="cell" className="p-3 font-medium text-slate-950 overflow-hidden text-ellipsis whitespace-nowrap">
                        {product?.brandUses || product?.category || product?.name || "Unknown"}
                      </div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.model || product?.name || "-"}</div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.sizeGauge || item.variant || "-"}</div>
                      <div role="cell" className="p-3 font-semibold underline decoration-2 underline-offset-2 text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap">{safeNumber(item.stock)}</div>
                      <div role="cell" className="p-3 text-slate-600 whitespace-nowrap">
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
                      </div>
                      <div role="cell" className="p-3 text-slate-600 whitespace-nowrap">
                        <label className="inline-flex items-center">
                          <input
                            type="checkbox"
                            checked={Boolean(product?.ordered)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const updatedProduct = setOrderedFlag(item.productId, event.target.checked);
                              syncOrderForProduct(updatedProduct);
                            }}
                            className="h-4 w-4 cursor-pointer rounded border-emerald-400 accent-emerald-600 focus:ring-emerald-500"
                          />
                        </label>
                      </div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.orderedDate || "-"}</div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.productCode || "-"}</div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.supplier || "-"}</div>
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">
                        {product?.lastBuyPrice != null ? `$${product.lastBuyPrice.toFixed(2)}` : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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
                    {selectedProduct?.model || selectedProduct?.name}
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
                  <p className="mt-2 text-3xl font-semibold underline decoration-2 underline-offset-4 text-white">{safeNumber(selected.stock)}</p>
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
                      className="h-4 w-4 cursor-pointer rounded border-emerald-400 accent-emerald-600 focus:ring-emerald-500"
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
                      min={1}
                      value={restockAmount}
                      onChange={(e) => setRestockAmount(e.target.value)}
                      placeholder="Qty"
                      className="w-full rounded-2xl border border-white/10 bg-white px-4 py-2 text-slate-900"
                    />
                    <button
                      onClick={() => restock(selected.id, Number(restockAmount))}
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
    amber: "border-amber-300/40 bg-amber-400/20 text-amber-100",
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
