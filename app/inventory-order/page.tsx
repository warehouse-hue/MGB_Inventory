"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getInventory,
  getProducts,
  getOrders,
  saveOrders,
  saveProducts,
  InventoryItem,
  Product,
} from "../lib/storage";

const ITEMS_PER_PAGE = 100;

function parseNumber(value: any) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

export default function InventoryOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setProducts(getProducts());
    setInventory(getInventory());
  }, []);

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

  const lowStockProducts = useMemo(() => {
    return products
      .map((product) => {
        const productInventory = inventory.filter((item) => item.productId === product.id);

        const stock = productInventory
          .reduce((sum, item) => sum + Number(item.stock || 0), 0);

        const variantSummary = Array.from(
          new Set(
            productInventory
              .map((item) => item.variant?.trim())
              .filter((variant): variant is string => Boolean(variant))
          )
        ).join(", ");

        const threshold =
          product.minimum != null
            ? parseNumber(product.minimum)
            : parseNumber(product.orderQty ?? 0);

        return {
          product,
          stock,
          variantSummary,
          minimum: threshold > 0 ? threshold : undefined,
        };
      })
      .filter((item) => item.minimum != null && item.stock < item.minimum)
      .filter((item) =>
        item.product.name.toLowerCase().includes(search.toLowerCase()) ||
        item.product.brandUses?.toLowerCase().includes(search.toLowerCase()) ||
        item.product.model?.toLowerCase().includes(search.toLowerCase()) ||
        item.product.sizeGauge?.toLowerCase().includes(search.toLowerCase()) ||
        item.variantSummary.toLowerCase().includes(search.toLowerCase()) ||
        item.product.productCode?.toLowerCase().includes(search.toLowerCase()) ||
        item.product.sku?.toLowerCase().includes(search.toLowerCase())
      );
  }, [products, inventory, search]);

  const orderStats = useMemo(() => {
    const orderedCount = lowStockProducts.filter(({ product }) => product.ordered).length;
    const reorderUnits = lowStockProducts.reduce(
      (sum, { stock, minimum }) => sum + Math.max(0, (minimum ?? 0) - stock),
      0
    );

    return {
      lowStockLines: lowStockProducts.length,
      orderedCount,
      pendingCount: Math.max(0, lowStockProducts.length - orderedCount),
      reorderUnits,
    };
  }, [lowStockProducts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(lowStockProducts.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedLowStockProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return lowStockProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [lowStockProducts, currentPage]);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(120,53,15,0.95),rgba(217,119,6,0.86))] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,15,24,0.22)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-amber-200/80">
              REORDER MONITOR
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Low/Out of Stock Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-50/80 sm:text-base">
              Live low-stock queue for products below minimum threshold, with direct ordered-state control.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OrderStatChip label="Alerts" value={orderStats.lowStockLines} tone="amber" />
            <OrderStatChip label="Pending" value={orderStats.pendingCount} tone="rose" />
            <OrderStatChip label="Ordered" value={orderStats.orderedCount} tone="emerald" />
            <OrderStatChip label="Reorder Units" value={orderStats.reorderUnits} tone="slate" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Automatic reorder</p>
            <h2 className="text-2xl font-semibold text-slate-950 mt-2">Low-stock products</h2>
            <p className="mt-2 text-sm text-slate-600">
              Search the active shortage queue and mark items as ordered when purchase action has started.
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search low-stock items..."
            className="w-full md:w-80 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Low-stock table
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Showing page {currentPage} of {totalPages} ({lowStockProducts.length} products currently below their configured threshold).
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Ordered toggle syncs directly to purchase orders
          </div>
        </div>
        <table className="sticky-table-header min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Inventory</th>
              <th className="p-3 text-left">Min threshold</th>
              <th className="p-3 text-left">Reorder point</th>
              <th className="p-3 text-left">Ordered ✅</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lowStockProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No products are currently below their minimum stock threshold.
                </td>
              </tr>
            ) : (
              paginatedLowStockProducts.map(({ product, stock, minimum, variantSummary }) => (
                <tr key={product.id} className="border-t border-slate-200 transition hover:bg-amber-50/35">
                  <td className="p-3 text-slate-600">
                    <p className="font-semibold text-slate-950">{product.brandUses || product.model || product.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {product.model || "-"} • {product.sizeGauge || variantSummary || "-"} • {product.productCode || product.sku || "-"}
                    </p>
                  </td>
                  <td className="p-3 text-slate-600">{product.category || "Misc"}</td>
                  <td className="p-3 text-slate-600">{stock}</td>
                  <td className="p-3 text-slate-600">{minimum}</td>
                  <td className="p-3 text-slate-600">{Math.max(0, (minimum ?? 0) - stock)}</td>
                  <td className="p-3 text-slate-600">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={Boolean(product.ordered)}
                        onChange={(event) => {
                          const updatedProduct = setOrderedFlag(product.id, event.target.checked);
                          syncOrderForProduct(updatedProduct);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                    </label>
                  </td>
                  <td className="p-3 text-slate-600">{product.supplier || "-"}</td>
                  <td className="p-3 text-slate-600">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">Reorder needed</span>
                      <span
                        className={`rounded-full px-3 py-1 ${
                          product.ordered
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {product.ordered ? "Ordered" : "Not ordered"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
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
  );
}

function OrderStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "rose" | "emerald" | "slate";
}) {
  const toneClass = {
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-50",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-50",
    emerald: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
    slate: "border-white/15 bg-white/8 text-white",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
