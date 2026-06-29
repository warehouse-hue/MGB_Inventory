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

function parseNumber(value: any) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

export default function InventoryOrderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");

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

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Inventory order</h1>
        <p className="text-slate-600 mt-1">
          Automatically surface products that are below their configured minimum stock threshold.
        </p>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Automatic reorder</p>
            <h2 className="text-2xl font-semibold text-slate-950 mt-2">Low-stock products</h2>
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
        <table className="min-w-full text-sm text-slate-700">
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
              lowStockProducts.map(({ product, stock, minimum, variantSummary }) => (
                <tr key={product.id} className="border-t border-slate-200 hover:bg-slate-50">
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
      </div>
    </div>
  );
}
