"use client";

import { Fragment, useEffect, useState } from "react";
import {
  getProducts,
  saveProducts,
  getInventory,
  saveInventory,
  getOrders,
  saveOrders,
  addActivity,
  Product,
  InventoryItem,
} from "../lib/storage";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState({
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    category: "",
    orderQty: "0",
    minimum: "",
  });
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    orderQty: "0",
    minimum: "",
    ordered: false,
    orderedDate: "",
    supplier: "",
    lastBuyPrice: "",
  });
  const [editInventoryItems, setEditInventoryItems] = useState<InventoryItem[]>([]);
  const [showMinimumSettings, setShowMinimumSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  const productCategories = [
    "All",
    "Drum Skins",
    "Guitar Strings",
    "Drum Sticks",
    "Misc",
  ];

  useEffect(() => {
    setProducts(getProducts());
    setInventory(getInventory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveProducts(products);
  }, [hydrated, products]);

  const selectedCategoryLabel =
    form.category.trim() || (activeCategory !== "All" ? activeCategory : "Misc");

  const addProduct = () => {
    const categoryValue = selectedCategoryLabel;
    if (!categoryValue || (!form.model.trim() && !form.productCode.trim())) return;

    const product: Product = {
      id: Date.now(),
      name: form.model.trim() || form.productCode.trim(),
      sku: form.productCode.trim() || form.model.trim() || "UNKNOWN",
      category: categoryValue,
      brandUses: form.brandUses.trim(),
      model: form.model.trim(),
      sizeGauge: form.sizeGauge.trim(),
      orderQty: Number(form.orderQty) || 0,
      minimum: form.minimum ? Number(form.minimum) : undefined,
      productCode: form.productCode.trim(),
    };

    const inventoryItems: InventoryItem[] = [
      {
        id: Date.now(),
        productId: product.id,
        variant: product.sizeGauge || "",
        stock: 0,
        location: "Main Warehouse",
      },
    ];

    saveInventory([...inventoryItems, ...getInventory()]);
    setProducts((prev) => [product, ...prev]);
    addActivity(`Added product ${product.name}`);
    setForm({
      brandUses: "",
      model: "",
      sizeGauge: "",
      productCode: "",
      category: activeCategory !== "All" ? activeCategory : "",
      orderQty: "0",
      minimum: "",
    });
  };

  const deleteProduct = (productId: number) => {
    const removed = products.find((product) => product.id === productId);
    const updatedProducts = products.filter((product) => product.id !== productId);
    saveProducts(updatedProducts);
    const updatedInventory = getInventory().filter((item) => item.productId !== productId);
    saveInventory(updatedInventory);
    setProducts(updatedProducts);
    setInventory(updatedInventory);
    addActivity(`Deleted product ${removed?.name ?? productId}`);
    setDeleteTarget(null);
  };

  const startEditProduct = (product: Product) => {
    setEditTarget(product.id);
    setEditForm({
      brandUses: product.brandUses || "",
      model: product.model || "",
      sizeGauge: product.sizeGauge || "",
      productCode: product.productCode || product.sku || "",
      orderQty: String(product.orderQty ?? 0),
      minimum: product.minimum != null ? String(product.minimum) : "",
      ordered: Boolean(product.ordered),
      orderedDate: product.orderedDate || "",
      supplier: product.supplier || "",
      lastBuyPrice: product.lastBuyPrice != null ? String(product.lastBuyPrice) : "",
    });
    setEditInventoryItems(getInventory().filter((item) => item.productId === product.id));
  };

  const saveProductEdits = () => {
    if (editTarget === null) return;

    const currentProduct = products.find((product) => product.id === editTarget);
    if (!currentProduct) return;

    const updatedProducts = products.map((product) =>
      product.id === editTarget
        ? {
            ...product,
            brandUses: editForm.brandUses.trim(),
            model: editForm.model.trim(),
            sizeGauge: editForm.sizeGauge.trim(),
            productCode: editForm.productCode.trim(),
            orderQty: Number(editForm.orderQty) || 0,
            minimum: editForm.minimum ? Number(editForm.minimum) : undefined,
            ordered: editForm.ordered,
            orderedDate: editForm.orderedDate,
            supplier: editForm.supplier.trim(),
            lastBuyPrice: editForm.lastBuyPrice
              ? Number(editForm.lastBuyPrice)
              : undefined,
          }
        : product
    );

    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    addActivity(`Updated product ${currentProduct.name}`);

    const existingOrder = getOrders().find((order) => order.productId === editTarget);
    let updatedOrders = getOrders();

    if (editForm.ordered) {
      const order = {
        id: existingOrder?.id ?? Date.now(),
        productId: editTarget,
        productName:
          currentProduct.model || currentProduct.brandUses || currentProduct.sku || currentProduct.name || "Product",
        variant: currentProduct.sizeGauge || "",
        quantity: Number(editForm.orderQty) || 0,
        orderedDate: editForm.orderedDate || new Date().toISOString().slice(0, 10),
        supplier: editForm.supplier.trim(),
        lastBuyPrice: editForm.lastBuyPrice ? Number(editForm.lastBuyPrice) : undefined,
        status: "OPEN" as const,
      };

      updatedOrders = existingOrder
        ? updatedOrders.map((item) =>
            item.productId === editTarget ? order : item
          )
        : [order, ...updatedOrders];
    } else {
      updatedOrders = updatedOrders.filter((item) => item.productId !== editTarget);
    }

    saveOrders(updatedOrders);

    const existingInventory = getInventory().filter((item) => item.productId !== editTarget);
    const updatedInventory = [
      ...existingInventory,
      ...editInventoryItems.map((item) => ({
        ...item,
        productId: editTarget,
      })),
    ];

    saveInventory(updatedInventory);
    setInventory(updatedInventory);
    setEditTarget(null);
  };

  const getProductStock = (productId: number) => {
    return inventory
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + Number(item.stock || 0), 0);
  };

  const filteredProducts =
    activeCategory === "All"
      ? products
      : products.filter((product) => product.category === activeCategory);

  const getStockStatus = (product: Product) => {
    const stock = getProductStock(product.id);
    const threshold = Number(product.minimum ?? 0);

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

    if (threshold > 0 && stock <= threshold * 1.5) {
      return {
        label: "Reorder soon",
        fillClass: "bg-amber-500",
        badgeClass: "bg-amber-500 text-slate-950",
        fill: 65,
      };
      return {
        label: "Reorder soon",
        fillClass: "bg-amber-500",
        badgeClass: "bg-amber-500 text-slate-950",
        fill: 65,
      };
    }

    return {
      label: "In stock",
      fillClass: "bg-emerald-500",
      badgeClass: "bg-emerald-500 text-white",
      fill: 100,
    };
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Products</h1>
        <p className="text-slate-600 mt-1">
          Master product data and variant details synced to inventory.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.6fr]">
        <div className="glass-card p-6 space-y-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
              Add a new product
            </p>
            <h2 className="text-xl font-semibold text-slate-950 mt-2">
              New {selectedCategoryLabel} product
            </h2>
          </div>

          <div className="grid gap-4">
            <input
              placeholder="Brand / Uses"
              value={form.brandUses}
              onChange={(e) => setForm({ ...form, brandUses: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />
            <input
              placeholder="Model"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />
            <input
              placeholder="Size / Gauge"
              value={form.sizeGauge}
              onChange={(e) => setForm({ ...form, sizeGauge: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />
            <input
              placeholder="Product Code"
              value={form.productCode}
              onChange={(e) => setForm({ ...form, productCode: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />
            <button
              type="button"
              onClick={() => setShowMinimumSettings((prev) => !prev)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {showMinimumSettings ? "Hide minimum" : "Minimum stock settings"}
            </button>
            {showMinimumSettings ? (
              <input
                type="number"
                min={0}
                placeholder="Minimum stock threshold"
                value={form.minimum}
                onChange={(e) => setForm({ ...form, minimum: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
              />
            ) : null}
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            >
              <option value="">Select category</option>
              {productCategories
                .filter((category) => category !== "All")
                .map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={addProduct}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-white font-semibold transition hover:bg-slate-800"
            >
              Create product
            </button>
          </div>
        </div>

        <div className="glass-card p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
            Inventory sync
          </p>
          <h2 className="text-xl font-semibold text-slate-950 mt-2">
            Auto-seeded stock
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Each product variant creates a matching inventory record with zero stock so you can begin restocking immediately.
          </p>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap gap-3">
          {productCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                setActiveCategory(category);
                if (category !== "All") {
                  setForm((prev) => ({ ...prev, category }));
                }
              }}
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
            Showing {filteredProducts.length} {activeCategory === "All" ? "products" : `${activeCategory} products`}.
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
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => {
              const stockIn = getProductStock(product.id);
              return (
                <Fragment key={product.id}>
                  <tr className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-950">{product.category || "-"}</td>
                    <td className="p-3 font-medium text-slate-950">{product.brandUses || "-"}</td>
                    <td className="p-3 text-slate-600">{product.model || "-"}</td>
                    <td className="p-3 text-slate-600">{product.sizeGauge || "-"}</td>
                    <td className="p-3 text-slate-600">{stockIn}</td>
                    <td className="p-3 text-slate-600">{product.orderQty ?? 0}</td>
                    <td className="p-3 text-slate-600">-</td>
                    <td className="p-3 text-slate-600">
                      {(() => {
                        const status = getStockStatus(product);
                        return (
                          <div className="inline-flex items-center gap-2">
                            <span className="inline-flex h-5 w-10 items-center rounded-full border border-slate-300 bg-slate-100 p-0.5">
                              <span
                                className={`${status.fillClass} h-full rounded-full transition-all duration-200`}
                                style={{ width: `${status.fill}%` }}
                              />
                            </span>
                            <span className={`inline-flex min-w-[90px] justify-center rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap ${status.badgeClass}`}>
                              {status.label}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-3 text-slate-600">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded border ${product.ordered ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                        {product.ordered ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        ) : null}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{product.orderedDate || "-"}</td>
                    <td className="p-3 text-slate-600">{product.productCode || product.sku || "-"}</td>
                    <td className="p-3 text-slate-600">{product.supplier || "-"}</td>
                    <td className="p-3 text-slate-600">{product.lastBuyPrice != null ? `$${product.lastBuyPrice.toFixed(2)}` : "-"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => startEditProduct(product)}
                        >
                          Edit details
                        </button>
                        {deleteTarget === product.id ? (
                          <>
                            <button
                              type="button"
                              className="rounded-2xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600"
                              onClick={() => deleteProduct(product.id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                              onClick={() => setDeleteTarget(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                            onClick={() => setDeleteTarget(product.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editTarget === product.id ? (
                    <tr className="bg-slate-50">
                      <td colSpan={14} className="p-0">
                        <div className="glass-card m-4 p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                                Edit product details
                              </p>
                              <h2 className="text-xl font-semibold text-slate-950 mt-2">
                                {products.find((product) => product.id === editTarget)?.model || "Product details"}
                              </h2>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                onClick={saveProductEdits}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                onClick={() => setEditTarget(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>

                          <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="text-sm text-slate-600">Brand / Uses</label>
                              <input
                                type="text"
                                value={editForm.brandUses}
                                onChange={(e) => setEditForm({ ...editForm, brandUses: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Model</label>
                              <input
                                type="text"
                                value={editForm.model}
                                onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Size / Gauge</label>
                              <input
                                type="text"
                                value={editForm.sizeGauge}
                                onChange={(e) => setEditForm({ ...editForm, sizeGauge: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Product Code</label>
                              <input
                                type="text"
                                value={editForm.productCode}
                                onChange={(e) => setEditForm({ ...editForm, productCode: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Order Qty</label>
                              <input
                                type="number"
                                value={editForm.orderQty}
                                onChange={(e) => setEditForm({ ...editForm, orderQty: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Minimum threshold</label>
                              <input
                                type="number"
                                min={0}
                                value={editForm.minimum}
                                onChange={(e) => setEditForm({ ...editForm, minimum: e.target.value })}
                                placeholder="e.g. 10"
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                              <p className="mt-2 text-xs text-slate-500">
                                Use this to flag the product for inventory ordering when stock falls below the threshold.
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Minimum threshold</label>
                              <input
                                type="number"
                                min={0}
                                value={editForm.minimum}
                                onChange={(e) => setEditForm({ ...editForm, minimum: e.target.value })}
                                placeholder="e.g. 10"
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                              <p className="mt-2 text-xs text-slate-500">
                                Use this to flag the product for inventory ordering when stock falls below the threshold.
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Ordered</label>
                              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                                <label className="flex items-center gap-2 text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={editForm.ordered}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setEditForm({
                                        ...editForm,
                                        ordered: checked,
                                        orderedDate: checked ? new Date().toISOString().slice(0, 10) : "",
                                      });
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-slate-900"
                                  />
                                  Ordered
                                </label>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900">
                                  {editForm.orderedDate ? `Ordered on ${editForm.orderedDate}` : "Not ordered yet"}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Supplier</label>
                              <input
                                type="text"
                                value={editForm.supplier}
                                onChange={(e) => setEditForm({ ...editForm, supplier: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="text-sm text-slate-600">Last Buy Price</label>
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.lastBuyPrice}
                                onChange={(e) => setEditForm({ ...editForm, lastBuyPrice: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm text-slate-600">Inventory records</label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditInventoryItems((prev) => [
                                      ...prev,
                                      {
                                        id: Date.now(),
                                        productId: editTarget ?? Date.now(),
                                        variant: "",
                                        stock: 0,
                                        location: "Main Warehouse",
                                      },
                                    ])
                                  }
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  Add row
                                </button>
                              </div>
                              <div className="mt-3 space-y-3">
                                {editInventoryItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1.5fr_1fr_1fr_auto]"
                                  >
                                    <input
                                      placeholder="Variant"
                                      value={item.variant}
                                      onChange={(e) =>
                                        setEditInventoryItems((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id ? { ...row, variant: e.target.value } : row
                                          )
                                        )
                                      }
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                                    />
                                    <input
                                      type="number"
                                      placeholder="Stock"
                                      value={item.stock}
                                      onChange={(e) =>
                                        setEditInventoryItems((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id ? { ...row, stock: Number(e.target.value) } : row
                                          )
                                        )
                                      }
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                                    />
                                    <input
                                      placeholder="Location"
                                      value={item.location}
                                      onChange={(e) =>
                                        setEditInventoryItems((prev) =>
                                          prev.map((row) =>
                                            row.id === item.id ? { ...row, location: e.target.value } : row
                                          )
                                        )
                                      }
                                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditInventoryItems((prev) => prev.filter((row) => row.id !== item.id))
                                      }
                                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

