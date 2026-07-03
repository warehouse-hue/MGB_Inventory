"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  getProducts,
  saveProducts,
  getInventory,
  saveInventory,
  getOrders,
  saveOrders,
  addActivity,
  generateId,
  Product,
  InventoryItem,
} from "../lib/storage";

const ITEMS_PER_PAGE = 100;

function safeNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function normalizeText(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

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
    category: "",
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
  const [editCurrentStock, setEditCurrentStock] = useState("0");
  const [showMinimumSettings, setShowMinimumSettings] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const productCategories = [
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

  useEffect(() => {
    setProducts(getProducts());
    setInventory(getInventory());
    setHydrated(true);
  }, []);

  const stockByProductId = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventory) {
      map.set(item.productId, (map.get(item.productId) ?? 0) + safeNumber(item.stock));
    }
    return map;
  }, [inventory]);

  const selectedCategoryLabel =
    form.category.trim() || (activeCategory !== "All" ? activeCategory : "Misc");

  const addProduct = () => {
    const categoryValue = selectedCategoryLabel;
    if (!categoryValue || (!form.model.trim() && !form.productCode.trim())) return;

    const newProductId = generateId();

    const product: Product = {
      id: newProductId,
      name: form.model.trim() || form.productCode.trim(),
      sku: form.productCode.trim() || form.model.trim() || "UNKNOWN",
      category: categoryValue,
      brandUses: form.brandUses.trim(),
      model: form.model.trim(),
      sizeGauge: form.sizeGauge.trim(),
      orderQty: safeNumber(form.orderQty),
      minimum: form.minimum ? safeNumber(form.minimum) : undefined,
      productCode: form.productCode.trim(),
    };

    const inventoryItems: InventoryItem[] = [
      {
        id: generateId(),
        productId: product.id,
        variant: product.sizeGauge || "",
        stock: 0,
        location: "Main Warehouse",
      },
    ];

    const updatedInventory = [...inventoryItems, ...inventory];
    saveInventory(updatedInventory);
    const updatedProducts = [product, ...products];
    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    setInventory(updatedInventory);
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
      category: product.category || "",
      brandUses: product.brandUses || "",
      model: product.model || "",
      sizeGauge: product.sizeGauge || "",
      productCode: product.productCode || "",
      orderQty: String(product.orderQty ?? 0),
      minimum: product.minimum != null ? String(product.minimum) : "",
      ordered: Boolean(product.ordered),
      orderedDate: product.orderedDate || "",
      supplier: product.supplier || "",
      lastBuyPrice: product.lastBuyPrice != null ? String(product.lastBuyPrice) : "",
    });
    const currentStock = inventory
      .filter((item) => item.productId === product.id)
      .reduce((sum, item) => sum + safeNumber(item.stock), 0);
    setEditCurrentStock(String(currentStock));
  };

  const saveProductEdits = () => {
    if (editTarget === null) return;

    const currentProduct = products.find((product) => product.id === editTarget);
    if (!currentProduct) return;

    const updatedProducts = products.map((product) =>
      product.id === editTarget
        ? {
            ...product,
          category: editForm.category || product.category,
            brandUses: editForm.brandUses.trim(),
            model: editForm.model.trim(),
            sizeGauge: editForm.sizeGauge.trim(),
            productCode: editForm.productCode.trim(),
            orderQty: safeNumber(editForm.orderQty),
            minimum: editForm.minimum ? safeNumber(editForm.minimum) : undefined,
            ordered: editForm.ordered,
            orderedDate: editForm.orderedDate,
            supplier: editForm.supplier.trim(),
            lastBuyPrice: editForm.lastBuyPrice
              ? safeNumber(editForm.lastBuyPrice)
              : undefined,
          }
        : product
    );

    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    addActivity(`Updated product ${currentProduct.name}`);

    const currentOrders = getOrders();
    const existingOrder = currentOrders.find((order) => order.productId === editTarget);
    let updatedOrders = currentOrders;

    if (editForm.ordered) {
      const order = {
        id: existingOrder?.id ?? generateId(),
        productId: editTarget,
        productName:
          currentProduct.model || currentProduct.brandUses || currentProduct.sku || currentProduct.name || "Product",
        variant: currentProduct.sizeGauge || "",
        quantity: safeNumber(editForm.orderQty),
        orderedDate: editForm.orderedDate || new Date().toISOString().slice(0, 10),
        supplier: editForm.supplier.trim(),
        lastBuyPrice: editForm.lastBuyPrice ? safeNumber(editForm.lastBuyPrice) : undefined,
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

    const currentStock = Math.max(0, safeNumber(editCurrentStock));
    const existingForProduct = inventory.filter((item) => item.productId === editTarget);
    const baseRow = existingForProduct[0];

    const updatedInventory = [
      ...inventory.filter((item) => item.productId !== editTarget),
      {
        id: baseRow?.id ?? generateId(),
        productId: editTarget,
        variant: baseRow?.variant || currentProduct.sizeGauge || "",
        stock: currentStock,
        location: baseRow?.location || "Main Warehouse",
      },
    ];

    saveInventory(updatedInventory);
    setInventory(updatedInventory);
    setEditTarget(null);
  };

  const getProductStock = (productId: number) => {
    return stockByProductId.get(productId) ?? 0;
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const matchesCategory =
          activeCategory === "All" || product.category === activeCategory;

        const normalizedSearch = search.toLowerCase().trim();
        if (!normalizedSearch) {
          return matchesCategory;
        }

        const searchFields = [
          product.name,
          product.brandUses,
          product.model,
          product.sizeGauge,
          product.productCode,
          product.sku,
          product.supplier,
          product.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return matchesCategory && searchFields.includes(normalizedSearch);
      })
      .sort((left, right) => {
        const byBrand = normalizeText(left.brandUses).localeCompare(normalizeText(right.brandUses));
        if (byBrand !== 0) return byBrand;

        const byModel = normalizeText(left.model || left.name).localeCompare(normalizeText(right.model || right.name));
        if (byModel !== 0) return byModel;

        const bySize = normalizeText(left.sizeGauge).localeCompare(normalizeText(right.sizeGauge));
        if (bySize !== 0) return bySize;

        return left.id - right.id;
      });
  }, [products, activeCategory, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedFilteredProducts = useMemo(() => {
    return filteredProducts.slice(
      (currentPage - 1) * ITEMS_PER_PAGE,
      currentPage * ITEMS_PER_PAGE
    );
  }, [filteredProducts, currentPage]);

  const productStats = useMemo(() => {
    return {
      totalItems: products.length,
      lowStock: products.filter((product) => {
        const stock = getProductStock(product.id);
        const threshold = Number(product.minimum ?? 0);
        return threshold > 0 && stock > 0 && stock <= threshold;
      }).length,
      outOfStock: products.filter((product) => getProductStock(product.id) <= 0).length,
      ordered: products.filter((product) => product.ordered).length,
    };
  }, [products, stockByProductId]);

  const getStockStatus = (product: Product) => {
    const stock = getProductStock(product.id);
    const threshold = safeNumber(product.minimum ?? 0);

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
        fillClass: "bg-amber-600",
        badgeClass: "bg-amber-600 text-white",
        fill: 35,
      };
    }

    if (threshold > 0 && stock <= threshold * 1.5) {
      return {
        label: "Reorder soon",
        fillClass: "bg-amber-600",
        badgeClass: "bg-amber-600 text-white",
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
      <div className="rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(17,94,89,0.95),rgba(8,145,178,0.86))] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,15,24,0.22)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-cyan-200/80">
              ITEM CREATION BAY
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Add Inventory Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/78 sm:text-base">
              Create new inventory items, assign reorder thresholds, and seed stock lines directly into the warehouse system.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProductStatChip label="Items" value={productStats.totalItems} tone="cyan" />
            <ProductStatChip label="Low" value={productStats.lowStock} tone="amber" />
            <ProductStatChip label="Zero" value={productStats.outOfStock} tone="rose" />
            <ProductStatChip label="Ordered" value={productStats.ordered} tone="emerald" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_0.6fr]">
        <div className="glass-card p-6 space-y-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
              Add a new inventory item
            </p>
            <h2 className="text-xl font-semibold text-slate-950 mt-2">
              New {selectedCategoryLabel} item
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Create the product master record first, then manage stock and ordering from the linked inventory views.
            </p>
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
              Create inventory item
            </button>
          </div>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
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
        <div className="space-y-4">
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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
          />
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Inventory master table
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Showing page {currentPage} of {totalPages} ({filteredProducts.length} total {activeCategory === "All" ? "items" : `${activeCategory} items`}).
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            Edit rows to manage suppliers, thresholds, and stock variants
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
            {paginatedFilteredProducts.map((product) => {
              const stockIn = getProductStock(product.id);
              return (
                <Fragment key={product.id}>
                  <tr className="border-t border-slate-200 transition hover:bg-cyan-50/35">
                    <td className="p-3 font-medium text-slate-950">{product.category || "-"}</td>
                    <td className="p-3 font-medium text-slate-950">{product.brandUses || "-"}</td>
                    <td className="p-3 text-slate-600">{product.model || "-"}</td>
                    <td className="p-3 text-slate-600">{product.sizeGauge || "-"}</td>
                    <td className="p-3 font-semibold underline decoration-2 underline-offset-2 text-slate-700">{stockIn}</td>
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
                    <td className="p-3 text-slate-600">{product.productCode || "-"}</td>
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
                      <td colSpan={12} className="p-0">
                        <div className="glass-card m-4 p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                              <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
                                Edit inventory item
                              </p>
                              <h2 className="text-xl font-semibold text-slate-950 mt-2">
                                {products.find((product) => product.id === editTarget)?.model || "Inventory item details"}
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
                              <label className="text-sm text-slate-600">Category</label>
                              <select
                                value={editForm.category}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              >
                                {productCategories
                                  .filter((category) => category !== "All")
                                  .map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                              </select>
                            </div>
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
                            <div>
                              <label className="text-sm text-slate-600">Edit Current Stock</label>
                              <input
                                type="number"
                                min={0}
                                value={editCurrentStock}
                                onChange={(e) => setEditCurrentStock(e.target.value)}
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
                              />
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

function ProductStatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "rose" | "emerald";
}) {
  const toneClass = {
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
    amber: "border-amber-300/40 bg-amber-400/20 text-amber-100",
    rose: "border-rose-300/25 bg-rose-300/10 text-rose-50",
    emerald: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

