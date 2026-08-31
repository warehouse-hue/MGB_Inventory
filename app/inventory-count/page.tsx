"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare, Search, RefreshCcw } from "lucide-react";
import {
  getInventory,
  saveInventory,
  getProducts,
  generateId,
  InventoryItem,
  Product,
} from "../lib/storage";
import { addTransaction } from "../lib/transactions";

function safeNumber(value: string | number | undefined) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function normalizeText(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

type InventoryCountDraft = {
  countInputs: Record<number, string>;
  countedIds: Record<number, boolean>;
  search: string;
  sizeGaugeSearch: string;
  activeCategory: string;
};

const INVENTORY_COUNT_DRAFT_KEY = "inventory-count-draft";

function loadDraft(): InventoryCountDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(INVENTORY_COUNT_DRAFT_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as InventoryCountDraft;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: InventoryCountDraft) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(INVENTORY_COUNT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage errors
  }
}

function clearDraft() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(INVENTORY_COUNT_DRAFT_KEY);
  } catch {
    // ignore storage errors
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesSizeGaugeValue(field: string | undefined, searchValue: string) {
  if (!field) {
    return false;
  }

  const normalizedField = field.toLowerCase();
  const escapedSearch = escapeRegExp(searchValue);
  const regex = new RegExp(`(^|[^0-9.])${escapedSearch}([^0-9.]|$)`);

  return regex.test(normalizedField);
}

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

export default function InventoryCountPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [sizeGaugeSearch, setSizeGaugeSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [countInputs, setCountInputs] = useState<Record<number, string>>({});
  const [countedIds, setCountedIds] = useState<Record<number, boolean>>({});
  const [saveMessage, setSaveMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const inventory = getInventory();
    const products = getProducts();
    const draft = loadDraft();

    setItems(inventory);
    setProducts(products);
    setSearch(draft?.search ?? "");
    setSizeGaugeSearch(draft?.sizeGaugeSearch ?? "");
    setActiveCategory(draft?.activeCategory ?? "All");
    setCountInputs(
      draft?.countInputs ??
        Object.fromEntries(inventory.map((item) => [item.id, String(safeNumber(item.stock))]))
    );
    setCountedIds(
      draft?.countedIds ??
        Object.fromEntries(inventory.map((item) => [item.id, false]))
    );
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    saveDraft({
      countInputs,
      countedIds,
      search,
      sizeGaugeSearch,
      activeCategory,
    });
  }, [countInputs, countedIds, search, sizeGaugeSearch, activeCategory, hydrated]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedSizeGaugeSearch = sizeGaugeSearch.trim().toLowerCase();

    return items
      .filter((item) => {
        const product = productsById.get(item.productId);
        const matchesText = [
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
          .toLowerCase()
          .includes(normalizedSearch);

        const matchesSizeGauge =
          !normalizedSizeGaugeSearch ||
          [product?.sizeGauge, item.variant]
            .filter(Boolean)
            .some((field) => matchesSizeGaugeValue(field, normalizedSizeGaugeSearch));

        const matchesCategory =
          activeCategory === "All" || (product?.category || "Misc") === activeCategory;

        return matchesText && matchesSizeGauge && matchesCategory;
      })
      .sort((left, right) => {
        const leftProduct = productsById.get(left.productId);
        const rightProduct = productsById.get(right.productId);

        const byBrand = normalizeText(leftProduct?.brandUses).localeCompare(normalizeText(rightProduct?.brandUses));
        if (byBrand !== 0) return byBrand;

        const byModel = normalizeText(leftProduct?.model || leftProduct?.name).localeCompare(
          normalizeText(rightProduct?.model || rightProduct?.name)
        );
        if (byModel !== 0) return byModel;

        return left.id - right.id;
      });
  }, [items, productsById, search, sizeGaugeSearch, activeCategory]);

  const summary = useMemo(() => {
    const changedRows = filteredItems.filter((item) => {
      const inputValue = countInputs[item.id];
      return safeNumber(inputValue) !== safeNumber(item.stock);
    });

    const countedRows = filteredItems.filter((item) => countedIds[item.id]).length;

    const totalDifference = changedRows.reduce((acc, item) => {
      return acc + (safeNumber(countInputs[item.id]) - safeNumber(item.stock));
    }, 0);

    return {
      totalRows: filteredItems.length,
      changedRows: changedRows.length,
      countedRows,
      totalDifference,
    };
  }, [filteredItems, countInputs, countedIds]);

  if (!hydrated) {
    return (
      <div className="p-6 max-w-[2200px] mx-auto animate-fade-in-up">
        <div className="command-hero command-hero-inventory">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mt-3 command-slip-icon">
                <CheckSquare />
                Count Inventory
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Inventory Count</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Loading inventory data...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const updateCount = (id: number, value: string) => {
    if (/^[0-9]*$/.test(value) || value === "") {
      setCountInputs((prev) => ({ ...prev, [id]: value }));
      setSaveMessage("");
    }
  };

  const resetCounts = () => {
    setCountInputs(Object.fromEntries(items.map((item) => [item.id, String(safeNumber(item.stock))])));
    setCountedIds(Object.fromEntries(items.map((item) => [item.id, false])));
    setSaveMessage("");
  };

  const saveChanges = () => {
    const changes = items.reduce<InventoryItem[]>((acc, item) => {
      const rawValue = countInputs[item.id];
      const newStock = safeNumber(rawValue);
      if (newStock !== safeNumber(item.stock)) {
        const product = productsById.get(item.productId);
        addTransaction({
          id: generateId(),
          type: "ADJUST",
          productId: item.productId,
          inventoryItemId: item.id,
          productName: product?.name || product?.model || "",
          variant: item.variant,
          quantity: newStock - safeNumber(item.stock),
          previousStock: safeNumber(item.stock),
          newStock,
          date: Date.now(),
        });

        acc.push({
          ...item,
          stock: newStock,
        });
      }
      return acc;
    }, []);

    if (changes.length === 0) {
      setSaveMessage("No quantity changes found to save.");
      return;
    }

    const updatedInventory = items.map((item) => {
      const changed = changes.find((change) => change.id === item.id);
      return changed ?? item;
    });

    saveInventory(updatedInventory);
    setItems(updatedInventory);
    setCountedIds(Object.fromEntries(updatedInventory.map((item) => [item.id, false])));
    clearDraft();
    setSaveMessage(`${changes.length} inventory count ${changes.length === 1 ? "update" : "updates"} saved.`);
  };

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-inventory">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mt-3 command-slip-icon">
              <CheckSquare />
              Count Inventory
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Inventory Count</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              Count and reconcile current stock.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatChip label="Visible lines" value={summary.totalRows} tone="slate" />
            <StatChip label="Changed" value={summary.changedRows} tone="amber" />
            <StatChip label="Net diff" value={summary.totalDifference} tone="slate" />
            <button
              type="button"
              onClick={resetCounts}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <span className="inline-flex items-center gap-2 text-slate-700">
                <RefreshCcw className="h-4 w-4" /> Reset counts
              </span>
            </button>
            <button
              type="button"
              onClick={saveChanges}
              disabled={summary.changedRows === 0}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save updates
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
                  Count inventory by item
                </p>
                <h2 className="text-xl font-semibold text-slate-950 mt-2">Physical count reconciliation</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Search and filter inventory rows, then enter the actual count for each product variant.
                </p>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-[1fr_220px]">
                <div className="relative w-full">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
                    <Search className="h-4 w-4" />
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search inventory..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
                <div className="relative w-full">
                  <input
                    value={sizeGaugeSearch}
                    onChange={(e) => setSizeGaugeSearch(e.target.value)}
                    placeholder='Size / gauge (try 8" for exact size)'
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
                  />
                </div>
              </div>
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
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Inventory count table</p>
                <p className="mt-2 text-sm text-slate-500">
                  {summary.totalRows} rows, {summary.changedRows} changed, net diff {summary.totalDifference}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                Click a count field to update physical quantities.
              </div>
            </div>

            <div role="table" aria-label="Inventory count table" className="min-w-[1320px] w-full text-sm text-slate-700">
              <div className="grid grid-cols-[160px_220px_160px_140px_120px_120px_120px_120px] bg-slate-100 text-slate-600">
                <div className="p-3 text-left whitespace-nowrap">Category</div>
                <div className="p-3 text-left whitespace-nowrap">Brand / Uses</div>
                <div className="p-3 text-left whitespace-nowrap">Product</div>
                <div className="p-3 text-left whitespace-nowrap">Size / Gauge</div>
                <div className="p-3 text-left whitespace-nowrap">Current</div>
                <div className="p-3 text-left whitespace-nowrap">Counted</div>
                <div className="p-3 text-left whitespace-nowrap">Counted?</div>
                <div className="p-3 text-left whitespace-nowrap">Difference</div>
              </div>

              <div role="rowgroup" style={{ overflowAnchor: "none" }}>
                {filteredItems.map((item) => {
                  const product = productsById.get(item.productId);
                  const currentStock = safeNumber(item.stock);
                  const inputValue = countInputs[item.id] ?? String(currentStock);
                  const countedStock = safeNumber(inputValue);
                  const difference = countedStock - currentStock;
                  const differenceLabel = difference === 0 ? "OK" : difference > 0 ? `+${difference}` : String(difference);
                  const isChanged = difference !== 0;

                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[160px_220px_160px_140px_120px_120px_120px_120px] border-t border-slate-200 transition hover:bg-slate-50 ${
                        isChanged ? "bg-amber-100" : "bg-white"
                      }`}
                    >
                      <div className="p-3 font-medium text-slate-950 overflow-hidden text-ellipsis whitespace-nowrap">{product?.category || "Misc"}</div>
                      <div className="p-3 font-medium text-slate-950 overflow-hidden text-ellipsis whitespace-nowrap">
                        {product?.brandUses || product?.name || "Unknown"}
                      </div>
                      <div className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.model || product?.name || "-"}</div>
                      <div className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{product?.sizeGauge || item.variant || "-"}</div>
                      <div className="p-3 text-slate-700 font-semibold whitespace-nowrap">{currentStock}</div>
                      <div className="p-3">
                        <input
                          type="number"
                          min={0}
                          value={inputValue}
                          onChange={(event) => updateCount(item.id, event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
                        />
                      </div>
                      <div className="p-3 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={Boolean(countedIds[item.id])}
                          onChange={() => setCountedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="h-5 w-5 rounded border-slate-300 bg-slate-50 accent-cyan-600 shadow-sm focus:ring-cyan-500"
                        />
                      </div>
                      <div className="p-3 whitespace-nowrap font-semibold text-slate-900">
                        <span className={isChanged ? "text-rose-600" : "text-slate-500"}>{differenceLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="glass-card p-6 text-slate-900">
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Inventory reconciliation</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Count summary</h2>
            <div className="mt-5 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Changed rows</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.changedRows}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Total variance</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.totalDifference >= 0 ? `+${summary.totalDifference}` : summary.totalDifference}</p>
              </div>
            </div>
            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">How to use</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
                <li>Search or filter to the rows you want to count.</li>
                <li>Enter the physical quantity in the Counted column.</li>
                <li>Check the box in the Counted? column when that item is verified.</li>
                <li>Press Save updates to apply new stock levels.</li>
              </ol>
            </div>
          </div>

          {saveMessage ? (
            <div className="rounded-3xl border border-slate-200/25 bg-slate-50 p-4 text-slate-900">
              <p className="font-semibold">Update status</p>
              <p className="mt-2 text-sm">{saveMessage}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "slate" | "amber" | "rose" | "sky";
}) {
  const toneClass = {
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-950",
    slate: "border-slate-200 bg-slate-100 text-slate-950",
    amber: "border-amber-300/40 bg-amber-100 text-amber-950",
    rose: "border-rose-300/25 bg-rose-100 text-rose-950",
    sky: "border-sky-300/25 bg-sky-100 text-slate-950",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
