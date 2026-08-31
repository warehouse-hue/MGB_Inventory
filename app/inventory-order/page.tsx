"use client";

import { useEffect, useMemo, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import {
  addActivity,
  generateId,
  getAppSettings,
  getInventory,
  getOrders,
  getProducts,
  getSuppliers,
  InventoryItem,
  Product,
  resolveSupplierName,
  saveOrders,
  saveProducts,
  Supplier,
} from "../lib/storage";

type StatusFilter = "ALL" | "OUT" | "LOW" | "ORDERED";

type AlertItem = {
  product: Product;
  stock: number;
  minimum: number;
  variant: string;
  onOrderQuantity: number;
};

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function isLowStock(stock: number, minimum: number, mode: "lt" | "lte") {
  if (minimum <= 0 || stock <= 0) return false;
  return mode === "lte" ? stock <= minimum : stock < minimum;
}

function productLabel(product: Product) {
  return product.model || product.name || product.brandUses || "Unnamed product";
}

export default function InventoryOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<ReturnType<typeof getOrders>>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [ordering, setOrdering] = useState<AlertItem | null>(null);
  const [orderQuantity, setOrderQuantity] = useState("");

  const refreshFromStorage = () => {
    setProducts(getProducts());
    setInventory(getInventory());
    setOrders(getOrders());
    setSuppliers(getSuppliers());
  };

  useEffect(() => {
    refreshFromStorage();
    window.addEventListener("mgb-storage-updated", refreshFromStorage as EventListener);
    window.addEventListener("focus", refreshFromStorage);
    return () => {
      window.removeEventListener("mgb-storage-updated", refreshFromStorage as EventListener);
      window.removeEventListener("focus", refreshFromStorage);
    };
  }, []);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort()],
    [products]
  );

  const alertItems = useMemo(() => {
    const settings = getAppSettings();
    const stockByProduct = new Map<number, number>();
    const variantsByProduct = new Map<number, Set<string>>();
    const openOrdersByProduct = new Map<number, number>();

    for (const item of inventory) {
      stockByProduct.set(item.productId, (stockByProduct.get(item.productId) ?? 0) + safeNumber(item.stock));
      if (item.variant) {
        const variants = variantsByProduct.get(item.productId) ?? new Set<string>();
        variants.add(item.variant);
        variantsByProduct.set(item.productId, variants);
      }
    }
    for (const order of orders) {
      if (order.status === "OPEN") openOrdersByProduct.set(order.productId, (openOrdersByProduct.get(order.productId) ?? 0) + safeNumber(order.quantity));
    }

    return products
      .map((product) => {
        const stock = stockByProduct.get(product.id) ?? 0;
        const minimum = safeNumber(product.minimum);
        const outOfStock = stock === 0 && (settings.includeNonStockedInAlerts || minimum > 0);
        const lowStock = isLowStock(stock, minimum, settings.lowStockMode);
        return {
          product,
          stock,
          minimum,
          variant: product.sizeGauge || Array.from(variantsByProduct.get(product.id) ?? []).join(", "),
          onOrderQuantity: openOrdersByProduct.get(product.id) ?? 0,
          isAlert: outOfStock || lowStock,
        };
      })
      .filter((item) => item.isAlert)
      .sort((left, right) => {
        const leftPriority = left.stock === 0 ? (left.onOrderQuantity ? 3 : 1) : (left.onOrderQuantity ? 4 : 2);
        const rightPriority = right.stock === 0 ? (right.onOrderQuantity ? 3 : 1) : (right.onOrderQuantity ? 4 : 2);
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return (right.minimum - right.stock) - (left.minimum - left.stock);
      });
  }, [inventory, orders, products]);

  const filteredItems = useMemo(() => {
    const queryTokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return alertItems.filter((item) => {
      const fields = [item.product.name, item.product.brandUses, item.product.model, item.product.sizeGauge, item.product.category, item.product.productCode, item.product.sku, item.product.supplier]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesStatus = status === "ALL" || (status === "OUT" && item.stock === 0) || (status === "LOW" && item.stock > 0) || (status === "ORDERED" && item.onOrderQuantity > 0);
      return queryTokens.every((token) => fields.includes(token)) && (category === "All" || item.product.category === category) && matchesStatus;
    });
  }, [alertItems, category, search, status]);

  const summary = {
    outOfStock: alertItems.filter((item) => item.stock === 0).length,
    lowStock: alertItems.filter((item) => item.stock > 0).length,
    onOrder: alertItems.filter((item) => item.onOrderQuantity > 0).length,
  };

  const openOrderDialog = (item: AlertItem) => {
    setOrdering(item);
    setOrderQuantity(item.product.orderQty && item.product.orderQty > 0 ? String(item.product.orderQty) : "");
  };

  const addToOrder = () => {
    if (!ordering) return;
    const quantity = safeNumber(orderQuantity);
    if (quantity <= 0) return;

    const currentOrders = getOrders();
    if (currentOrders.some((order) => order.productId === ordering.product.id && order.status === "OPEN")) {
      setOrdering(null);
      return;
    }

    const orderedDate = new Date().toISOString().slice(0, 10);
    const updatedProducts = products.map((product) => product.id === ordering.product.id ? { ...product, ordered: true, orderedDate } : product);
    const nextOrder = {
      id: generateId(),
      productId: ordering.product.id,
      productName: productLabel(ordering.product),
      variant: ordering.variant,
      quantity,
      orderedDate,
      supplier: resolveSupplierName(ordering.product.supplier || "", suppliers),
      lastBuyPrice: ordering.product.lastBuyPrice,
      status: "OPEN" as const,
    };

    saveProducts(updatedProducts);
    saveOrders([nextOrder, ...currentOrders]);
    setProducts(updatedProducts);
    setOrders([nextOrder, ...currentOrders]);
    addActivity(`Created purchase order for ${quantity} ${productLabel(ordering.product)} from Low / Out of Stock`);
    setOrdering(null);
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("All");
    setStatus("ALL");
  };

  const filtersActive = Boolean(search || category !== "All" || status !== "ALL");

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-inventory-order">
        <div className="mt-3 command-slip-icon"><TriangleAlert />Low / Out of Stock</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Low / Out of Stock</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Items that need restocking.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <SummaryMetric label="Out of Stock" value={summary.outOfStock} tone="danger" />
        <SummaryMetric label="Low Stock" value={summary.lowStock} tone="warning" />
        <SummaryMetric label="On Order" value={summary.onOrder} tone="neutral" />
      </div>

      <section className="glass-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items to restock..." className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900" />
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900"><option value="ALL">All status</option><option value="OUT">Out of Stock</option><option value="LOW">Low Stock</option><option value="ORDERED">On Order</option></select>
          </div>
          {filtersActive ? <button type="button" onClick={clearFilters} className="text-sm font-medium text-cyan-700">Clear filters</button> : null}
        </div>
      </section>

      <section className="glass-card overflow-x-auto">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-semibold text-slate-950">Restock items</h2><span className="text-sm text-slate-600">{filteredItems.length} items</span></div>
        {filteredItems.length === 0 ? <p className="p-6 text-sm text-slate-600">{filtersActive ? "No items match these filters." : "No items currently need restocking."}</p> : (
          <table className="min-w-[1050px] w-full text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-600"><tr><th className="p-3 text-left">Product</th><th className="p-3 text-left">Current</th><th className="p-3 text-left">Minimum</th><th className="p-3 text-left">Order Qty</th><th className="p-3 text-left">Supplier</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Action</th></tr></thead>
            <tbody>{filteredItems.map((item) => {
              const supplier = resolveSupplierName(item.product.supplier || "", suppliers);
              const isOut = item.stock === 0;
              return <tr key={item.product.id} className="border-t border-slate-200 hover:bg-slate-50"><td className="p-3"><p className="font-medium text-slate-950">{item.product.brandUses || productLabel(item.product)}</p><p className="mt-1 text-xs text-slate-500">{productLabel(item.product)}{item.variant ? ` · ${item.variant}` : ""}</p></td><td className={`p-3 text-lg font-semibold ${isOut ? "text-rose-700" : "text-slate-950"}`}>{item.stock}</td><td className="p-3">{item.minimum || "-"}</td><td className="p-3">{item.product.orderQty && item.product.orderQty > 0 ? item.product.orderQty : "No default"}</td><td className="p-3">{supplier || "NO SUPPLIER"}</td><td className="p-3"><span className={item.onOrderQuantity > 0 ? "text-sm font-medium text-cyan-700" : isOut ? "text-sm font-medium text-rose-700" : "text-sm font-medium text-amber-700"}>{item.onOrderQuantity > 0 ? `${item.onOrderQuantity} ON ORDER` : isOut ? "OUT OF STOCK" : "LOW STOCK"}</span></td><td className="p-3 text-right">{item.onOrderQuantity > 0 ? <span className="text-sm text-slate-600">On order</span> : <button type="button" onClick={() => openOrderDialog(item)} className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">Add to Order</button>}</td></tr>;
            })}</tbody>
          </table>
        )}
      </section>

      {ordering ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="order-dialog-title" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="order-dialog-title" className="text-xl font-semibold text-slate-950">Add to Order</h2><p className="mt-1 text-sm text-slate-600">{productLabel(ordering.product)}{ordering.variant ? ` · ${ordering.variant}` : ""}</p></div><button type="button" onClick={() => setOrdering(null)} aria-label="Close" className="text-slate-600"><X className="h-5 w-5" /></button></div><dl className="mt-4 grid grid-cols-3 gap-3 border-y border-slate-200 py-4 text-sm"><div><dt className="text-slate-500">Current</dt><dd className="mt-1 font-semibold text-slate-950">{ordering.stock}</dd></div><div><dt className="text-slate-500">Minimum</dt><dd className="mt-1 font-semibold text-slate-950">{ordering.minimum || "-"}</dd></div><div><dt className="text-slate-500">Supplier</dt><dd className="mt-1 truncate font-semibold text-slate-950">{resolveSupplierName(ordering.product.supplier || "", suppliers) || "NO SUPPLIER"}</dd></div></dl><label className="mt-4 block text-sm font-medium text-slate-700">Order Quantity<input type="number" min="1" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} placeholder="Enter quantity" className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900" /></label>{!ordering.product.orderQty ? <p className="mt-2 text-xs text-amber-700">No default order quantity is saved for this item.</p> : null}<div className="mt-5 flex gap-3"><button type="button" disabled={safeNumber(orderQuantity) <= 0} onClick={addToOrder} className="rounded-lg bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">Add to Order</button><button type="button" onClick={() => setOrdering(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">Cancel</button></div></section></div> : null}
    </div>
  );
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "neutral" }) {
  const valueClass = tone === "danger" && value > 0 ? "text-rose-700" : tone === "warning" && value > 0 ? "text-amber-700" : "text-slate-950";
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-sm font-medium text-slate-600">{label}</p><p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p></div>;
}