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

/* Stable ID generator (prevents collisions) */
function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState(1);
  const categoryTabs = ["All", "Drum Skins", "Guitar Strings", "Drum Sticks", "Misc"];

  /* LOAD DATA */
  useEffect(() => {
    setItems(getInventory());
  }, []);

  /* FILTER */
  const filtered = useMemo(() => {
    return items.filter((item) => {
      const product = getProductById(item.productId);
      const matchesSearch = product?.name?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        activeCategory === "All" || (product?.category || "") === activeCategory;

      return Boolean(matchesSearch) && matchesCategory;
    });
  }, [items, search, activeCategory]);

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
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Inventory</h1>
        <p className="text-slate-600 mt-1">
          Product-linked warehouse stock system with live restock controls.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                  Inventory search
                </p>
                <h2 className="text-xl font-semibold text-slate-950 mt-2">
                  Find product stock fast
                </h2>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full sm:w-80 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
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
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card overflow-x-auto">
            <div className="px-6 py-4 border-b border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {filtered.length} {activeCategory === "All" ? "items" : `${activeCategory} items`}.
              </p>
            </div>
            <table className="min-w-full text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Brand / Uses</th>
                  <th className="p-3 text-left">Model</th>
                  <th className="p-3 text-left">Size / Gauge</th>
                  <th className="p-3 text-left">Current Stock</th>
                  <th className="p-3 text-left">Order Qty</th>
                  <th className="p-3 text-left">Priority</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Ordered ✅</th>
                  <th className="p-3 text-left">Ordered Date</th>
                  <th className="p-3 text-left">Product Code</th>
                  <th className="p-3 text-left">Supplier</th>
                  <th className="p-3 text-left">Last Buy Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const product = getProductById(item.productId);
                  const status = getStockStatus(item, product);

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="p-3 font-medium text-slate-950">{product?.category || "-"}</td>
                      <td className="p-3 font-medium text-slate-950">
                        {product?.brandUses || product?.category || product?.name || "Unknown"}
                      </td>
                      <td className="p-3 text-slate-600">{product?.model || product?.name || "-"}</td>
                      <td className="p-3 text-slate-600">{product?.sizeGauge || item.variant || "-"}</td>
                      <td className="p-3 text-slate-600">{safeNumber(item.stock)}</td>
                      <td className="p-3 text-slate-600">{product?.orderQty ?? 0}</td>
                      <td className="p-3 text-slate-600">-</td>
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
          </div>
        </div>

        {selected && (
          <div className="glass-card p-6 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                  Inventory detail
                </p>
                <h2 className="text-xl font-semibold text-slate-950 mt-2">
                  {getProductById(selected.productId)?.model || getProductById(selected.productId)?.name}
                </h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4 border border-slate-200">
                <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Current Stock</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{safeNumber(selected.stock)}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 border border-slate-200">
                <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Ordered</p>
                <label className="mt-2 inline-flex items-center gap-2 text-slate-900">
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

            <div className="rounded-3xl bg-slate-50 p-4 border border-slate-200">
              <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Adjust stock</p>
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
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900"
                  />
                  <button
                    onClick={() => restock(selected.id, restockAmount)}
                    className="rounded-2xl bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                  >
                    Restock
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
