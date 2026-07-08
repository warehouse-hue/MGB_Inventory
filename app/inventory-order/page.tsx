"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  addActivity,
  getAppSettings,
  getInventory,
  getProducts,
  getOrders,
  saveOrders,
  saveProducts,
  generateId,
  InventoryItem,
  Product,
} from "../lib/storage";

const ITEMS_PER_PAGE = 100;

function parseNumber(value: any) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function isLowStockByMode(stock: number, threshold: number, mode: "lt" | "lte") {
  if (threshold <= 0 || stock <= 0) return false;
  return mode === "lte" ? stock <= threshold : stock < threshold;
}

export default function InventoryOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const refreshFromStorage = () => {
    setProducts(getProducts());
    setInventory(getInventory());
  };

  useEffect(() => {
    refreshFromStorage();

    const handleStorageUpdate = () => {
      refreshFromStorage();
    };

    const handleFocus = () => {
      refreshFromStorage();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromStorage();
      }
    };

    window.addEventListener("mgb-storage-updated", handleStorageUpdate as EventListener);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("mgb-storage-updated", handleStorageUpdate as EventListener);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const setOrderedFlag = (productId: number, ordered: boolean) => {
    const targetProduct = products.find((product) => product.id === productId);
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

    if (targetProduct) {
      addActivity(
        `${ordered ? "Marked ordered" : "Cleared ordered"} for ${
          targetProduct.model || targetProduct.brandUses || targetProduct.name
        } in Low/Out of Stock`
      );
    }

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

  const alertProducts = useMemo(() => {
    const settings = getAppSettings();
    const stockByProductId = new Map<number, number>();
    const variantsByProductId = new Map<number, Set<string>>();

    for (const item of inventory) {
      stockByProductId.set(item.productId, (stockByProductId.get(item.productId) ?? 0) + Number(item.stock || 0));

      const variant = item.variant?.trim();
      if (variant) {
        if (!variantsByProductId.has(item.productId)) {
          variantsByProductId.set(item.productId, new Set<string>());
        }
        variantsByProductId.get(item.productId)?.add(variant);
      }
    }

    return products
      .map((product) => {
        const stock = stockByProductId.get(product.id) ?? 0;
        const variantSummary = Array.from(variantsByProductId.get(product.id) ?? []).join(", ");

        const threshold =
          product.minimum != null
            ? parseNumber(product.minimum)
            : parseNumber(product.orderQty ?? 0);

        const belowConfiguredThreshold = isLowStockByMode(stock, threshold, settings.lowStockMode);
        const outOfStockAlert =
          stock <= 0 && (settings.includeNonStockedInAlerts || threshold > 0);

        return {
          product,
          stock,
          variantSummary,
          minimum: threshold > 0 ? threshold : undefined,
          isAlert: belowConfiguredThreshold || outOfStockAlert,
        };
      })
      .filter((item) => item.isAlert)
  }, [products, inventory]);

  const lowStockProducts = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return alertProducts
      .filter((item) =>
        !normalizedSearch ||
        item.product.name.toLowerCase().includes(normalizedSearch) ||
        item.product.brandUses?.toLowerCase().includes(normalizedSearch) ||
        item.product.model?.toLowerCase().includes(normalizedSearch) ||
        item.product.sizeGauge?.toLowerCase().includes(normalizedSearch) ||
        item.variantSummary.toLowerCase().includes(normalizedSearch) ||
        item.product.productCode?.toLowerCase().includes(normalizedSearch) ||
        item.product.sku?.toLowerCase().includes(normalizedSearch)
      );
  }, [alertProducts, search]);

  useEffect(() => {
    const settings = getAppSettings();
    if (!settings.autoCreateOrderSuggestion) {
      return;
    }

    const currentOrders = getOrders();
    const existingOrderProductIds = new Set(currentOrders.map((order) => order.productId));
    let updatedOrders = currentOrders;
    let hasOrderChanges = false;
    let hasProductChanges = false;

    const updatedProducts = products.map((product) => {
      const row = alertProducts.find((item) => item.product.id === product.id);
      if (!row) {
        return product;
      }

      const reorderQty = Math.max(1, Math.max(0, (row.minimum ?? 0) - row.stock) || parseNumber(product.orderQty || 1));

      if (!existingOrderProductIds.has(product.id)) {
        updatedOrders = [
          {
            id: generateId(),
            productId: product.id,
            productName: product.model || product.brandUses || product.sku || product.name || "Product",
            variant: product.sizeGauge || "",
            quantity: reorderQty,
            orderedDate: new Date().toISOString().slice(0, 10),
            supplier: product.supplier || "",
            lastBuyPrice: product.lastBuyPrice,
            status: "OPEN" as const,
          },
          ...updatedOrders,
        ];
        existingOrderProductIds.add(product.id);
        hasOrderChanges = true;
      }

      if (!product.ordered) {
        hasProductChanges = true;
        return {
          ...product,
          ordered: true,
          orderedDate: product.orderedDate || new Date().toISOString().slice(0, 10),
        };
      }

      return product;
    });

    if (hasOrderChanges) {
      saveOrders(updatedOrders);
      addActivity("Auto-created purchase order suggestions for low/out-of-stock items.");
    }

    if (hasProductChanges) {
      saveProducts(updatedProducts);
      setProducts(updatedProducts);
    }
  }, [alertProducts, products]);

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
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-inventory-order">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80">
              REORDER MONITOR
            </p>
            <div className="mt-3 command-slip-icon">
              <TriangleAlert />
              Low/Out of Stock
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Low/Out of Stock Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/85 sm:text-base">
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
              <th className="p-3 text-left">Size / Gauge</th>
              <th className="p-3 text-left">Current Stock</th>
              <th className="p-3 text-left">Minimum Stock</th>
              <th className="p-3 text-left">Order Qty</th>
              <th className="p-3 text-left">Ordered Date</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lowStockProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  No products are currently below their minimum stock threshold.
                </td>
              </tr>
            ) : (
              paginatedLowStockProducts.map(({ product, stock, minimum, variantSummary }) => (
                <tr key={product.id} className="border-t border-slate-200 transition hover:bg-amber-50/35">
                  <td className="p-3 text-slate-600">
                    <p className="font-semibold text-slate-950">{product.brandUses || product.model || product.name}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {product.model || "-"} • {product.sizeGauge || variantSummary || "-"} • {product.productCode || "-"}
                    </p>
                  </td>
                  <td className="p-3 text-slate-600">{product.sizeGauge || variantSummary || "-"}</td>
                  <td className="p-3 font-semibold underline decoration-2 underline-offset-2 text-slate-700">{stock}</td>
                  <td className="p-3 text-slate-600">{minimum}</td>
                  <td className="p-3 text-slate-600">{Math.max(1, Number(product.orderQty ?? 0))}</td>
                  <td className="p-3 text-slate-600">{product.orderedDate || "-"}</td>
                  <td className="p-3 text-slate-600">{product.supplier || "-"}</td>
                  <td className="p-3 text-slate-600">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 ${
                          stock <= 0
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-200 text-amber-900"
                        }`}
                      >
                        {stock <= 0 ? "Out of stock" : "Low stock"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-slate-600">
                    <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(product.ordered)}
                        onChange={(event) => {
                          const updatedProduct = setOrderedFlag(product.id, event.target.checked);
                          syncOrderForProduct(updatedProduct);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                      {product.ordered ? "Ordered" : "Mark ordered"}
                    </label>
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
    amber: "border-amber-200/70 bg-amber-400/35 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]",
    rose: "border-rose-200/70 bg-rose-400/35 text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    emerald: "border-emerald-200/70 bg-emerald-400/35 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    slate: "border-slate-200/45 bg-slate-200/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
