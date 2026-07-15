"use client";

import { useEffect, useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  clearActivityLog,
  getActivityLog,
  getInventory,
  getOrders,
  getProducts,
  getSuppliers,
  getTransactions,
  type Activity,
  type InventoryItem,
  type PurchaseOrder,
  type Product,
  type Supplier,
} from "../lib/storage";
import { getMovementSummary, getTopActiveProducts } from "../lib/reports";
import type { Transaction } from "../lib/transactions";

const ITEMS_PER_PAGE = 100;

export default function ReportsPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const refreshReports = () => {
      setActivities(getActivityLog());
      setTransactions(getTransactions());
      setProducts(getProducts());
      setInventory(getInventory());
      setOrders(getOrders());
      setSuppliers(getSuppliers());
    };

    refreshReports();

    const handleStorageUpdate = () => refreshReports();
    const handleFocus = () => refreshReports();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshReports();
      }
    };
    const handleBrowserStorage = () => refreshReports();

    window.addEventListener("mgb-storage-updated", handleStorageUpdate as EventListener);
    window.addEventListener("storage", handleBrowserStorage);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mgb-storage-updated", handleStorageUpdate as EventListener);
      window.removeEventListener("storage", handleBrowserStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const stats = useMemo(() => {
    const movementSummary = getMovementSummary(transactions);
    const lowStockCount = inventory.filter((item) => {
      const product = products.find((currentProduct) => currentProduct.id === item.productId);
      const minimum = Number(product?.minimum ?? 0);
      if (minimum <= 0 || item.stock <= 0) return false;
      return item.stock < minimum;
    }).length;

    const outOfStockCount = inventory.filter((item) => {
      if (item.stock !== 0) return false;
      const product = products.find((currentProduct) => currentProduct.id === item.productId);
      return Number(product?.minimum ?? 0) > 0;
    }).length;

    return {
      totalChanges: activities.length + transactions.length,
      productEdits: activities.filter((activity) => activity.message.toLowerCase().includes("product")).length,
      supplierEdits: activities.filter((activity) => activity.message.toLowerCase().includes("supplier")).length,
      inventoryEdits: movementSummary.totalIn + movementSummary.totalOut,
      orderEdits: activities.filter((activity) => /(order|purchase)/i.test(activity.message)).length + orders.length,
      latestMessage: activities[0]?.message || transactions[0]
        ? `${transactions[0]?.type || "Movement"} activity recorded`
        : "No edits recorded yet",
      products: products.length,
      inventoryLines: inventory.length,
      suppliers: suppliers.length,
      openOrders: orders.filter((order) => order.status === "OPEN").length,
      lowStockCount,
      outOfStockCount,
      movementSummary,
    };
  }, [activities, inventory, orders, products, suppliers, transactions]);

  const handleClearHistory = () => {
    clearActivityLog();
    setActivities([]);
    setShowClearConfirm(false);
  };

  const filteredActivities = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    if (!normalizedSearch) return activities;

    return activities.filter((activity) => {
      const content = [
        activity.message,
        new Date(activity.date).toLocaleString(),
      ]
        .join(" ")
        .toLowerCase();

      return content.includes(normalizedSearch);
    });
  }, [activities, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedActivities = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredActivities.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredActivities, currentPage]);

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-reports">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-sky-200/80">ACTIVITY INTELLIGENCE</p>
            <div className="mt-3 command-slip-icon">
              <BarChart3 />
              Reports
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Reports Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/78 sm:text-base">
              Review system activity, operational churn, and change patterns across inventory, suppliers, and orders.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ReportChip label="Changes" value={stats.totalChanges} tone="sky" />
            <ReportChip label="Inventory" value={stats.inventoryEdits} tone="cyan" />
            <ReportChip label="Orders" value={stats.orderEdits} tone="emerald" />
            <ReportChip label="Suppliers" value={stats.supplierEdits} tone="violet" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="mb-4">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Performance summary</p>
          <h2 className="text-2xl font-semibold text-slate-950 mt-2">Live data snapshot</h2>
          <p className="mt-2 text-sm text-slate-600">This dashboard now tracks inventory, stock movements, suppliers, orders, and activity together.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Total changes</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.totalChanges}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Inventory lines</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.inventoryLines}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Suppliers</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.suppliers}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Open orders</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.openOrders}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Stock-in / out</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.movementSummary.totalIn} / {stats.movementSummary.totalOut}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Low stock</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.lowStockCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Out of stock</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.outOfStockCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Latest activity</p>
            <p className="mt-3 text-sm text-slate-950">{stats.latestMessage}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Movement summary</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Stock tracking</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
              <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Restock count</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.movementSummary.restockCount}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
              <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Remove count</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.movementSummary.removeCount}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
              <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Net movement</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.movementSummary.netMovement}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
              <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Total units moved</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.movementSummary.totalIn + stats.movementSummary.totalOut}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Top active products</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Most moved items</h2>
          <div className="mt-4 space-y-3">
            {getTopActiveProducts(transactions).length === 0 ? (
              <p className="text-slate-500">No movement records yet.</p>
            ) : (
              getTopActiveProducts(transactions).map((entry) => {
                const product = products.find((item) => item.id === Number(entry.productId));
                return (
                  <div key={entry.productId} className="rounded-3xl bg-slate-50 p-4 border border-slate-200">
                    <p className="font-semibold text-slate-950">{product?.model || product?.name || `Product #${entry.productId}`}</p>
                    <p className="text-sm text-slate-500">Activity score {entry.activity}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Audit trail</p>
            <h2 className="text-xl font-semibold text-slate-950 mt-2 mb-3">Activity log</h2>
          </div>
          <div className="flex flex-col items-end gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search activity..."
              className="w-full min-w-[220px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowClearConfirm((current) => !current)}
              className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              Clear history
            </button>
          </div>
        </div>
        {showClearConfirm && (
          <div className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-semibold">Clear all recent activity?</p>
            <p className="mt-1 text-slate-700">This will remove all entries from the reports activity list.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-white shadow-sm transition hover:bg-rose-700"
              >
                Confirm wipe
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-rose-700 transition hover:bg-rose-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {filteredActivities.length === 0 ? (
            <p className="text-slate-500">No activity entries match your search.</p>
          ) : (
            paginatedActivities.map((activity) => (
              <div key={activity.id} className="rounded-3xl bg-slate-50 p-4 border border-slate-200 flex items-center justify-between gap-4 transition hover:bg-sky-50/35">
                <div>
                  <p className="font-semibold text-slate-950">{activity.message}</p>
                  <p className="text-sm text-slate-500">{new Date(activity.date).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-500">Page {currentPage} of {totalPages} ({filteredActivities.length} matching entries)</p>
          <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}

function ReportChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "cyan" | "emerald" | "violet";
}) {
  const toneClass = {
    sky: "border-sky-200/70 bg-sky-400/35 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    cyan: "border-cyan-200/70 bg-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    emerald: "border-emerald-200/70 bg-emerald-400/35 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    violet: "border-violet-200/70 bg-violet-400/35 text-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
