"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Boxes } from "lucide-react";
import {
  getAppSettings,
  getInventory,
  saveInventory,
  getProducts,
  saveProducts,
  getOrders,
  saveOrders,
  getSuppliers,
  addActivity,
  generateId,
  resolveSupplierName,
  InventoryItem,
  Product,
  Supplier,
} from "../lib/storage";

import {
  addTransaction,
  getTransactions,
  removeTransaction,
  Transaction,
  updateTransaction,
} from "../lib/transactions";

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
type MovementTab = "RESTOCK" | "REMOVE";
const ITEMS_PER_PAGE = 100;

export default function InventoryPage() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeStatusFilter, setActiveStatusFilter] = useState<StatusFilter>("ALL");
  const [activeMovementTab, setActiveMovementTab] = useState<MovementTab>("RESTOCK");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState("");
  const [movementError, setMovementError] = useState("");
  const [editingMovementId, setEditingMovementId] = useState<number | null>(null);
  const [movementForm, setMovementForm] = useState({
    inventoryItemId: "",
    quantity: "",
    date: todayIso,
  });
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
    setSuppliers(getSuppliers());
    setTransactions(getTransactions());
  }, []);

  const productsById = useMemo(() => {
    return new Map(products.map((product) => [product.id, product]));
  }, [products]);

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

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

  const movementItemOptions = useMemo(() => {
    return items
      .map((item) => {
        const product = productsById.get(item.productId);
        const label = `${product?.brandUses || "-"} | ${product?.model || product?.name || "-"} | ${
          product?.sizeGauge || item.variant || "-"
        } | Stock ${safeNumber(item.stock)}`;
        return {
          item,
          label,
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [items, productsById]);

  const filteredMovementTransactions = useMemo(() => {
    return transactions
      .filter((transaction) => transaction.type === activeMovementTab)
      .sort((left, right) => right.date - left.date)
      .slice(0, 30);
  }, [transactions, activeMovementTab]);

  const parseMovementDate = (dateValue: string) => {
    if (!dateValue) return Date.now();
    const parsed = new Date(`${dateValue}T12:00:00`);
    const ms = parsed.getTime();
    return Number.isNaN(ms) ? Date.now() : ms;
  };

  const applyInventoryDelta = (inventoryItemId: number, delta: number) => {
    const target = itemsById.get(inventoryItemId);
    if (!target) {
      return { ok: false, message: "Inventory line not found." };
    }

    const previousStock = safeNumber(target.stock);
    const nextStock = previousStock + delta;
    if (nextStock < 0) {
      return { ok: false, message: "Not enough stock for that stock-out movement." };
    }

    const updatedInventory = items.map((item) =>
      item.id === inventoryItemId
        ? {
            ...item,
            stock: nextStock,
          }
        : item
    );

    saveInventory(updatedInventory);
    setItems(updatedInventory);
    setSelected((prev) =>
      prev && prev.id === inventoryItemId
        ? updatedInventory.find((item) => item.id === inventoryItemId) ?? prev
        : prev
    );

    return {
      ok: true,
      previousStock,
      nextStock,
      target,
    };
  };

  const resolveInventoryItemIdForTransaction = (transaction: Transaction) => {
    if (transaction.inventoryItemId && itemsById.has(transaction.inventoryItemId)) {
      return transaction.inventoryItemId;
    }

    const variant = normalizeText(transaction.variant);
    const matched = items.find((item) => {
      if (item.productId !== transaction.productId) return false;
      if (!variant) return true;
      return normalizeText(item.variant) === variant;
    });

    return matched?.id || 0;
  };

  const createMovement = () => {
    setMovementError("");
    const inventoryItemId = Number(movementForm.inventoryItemId);
    const quantity = safeNumber(movementForm.quantity);

    if (!inventoryItemId || quantity <= 0) {
      setMovementError("Select an item and enter a quantity greater than 0.");
      return;
    }

    const signedDelta = activeMovementTab === "RESTOCK" ? quantity : -quantity;
    const applied = applyInventoryDelta(inventoryItemId, signedDelta);

    if (!applied.ok || !applied.target) {
      setMovementError(applied.message || "Could not apply stock movement.");
      return;
    }

    const product = productsById.get(applied.target.productId);
    const transaction: Transaction = {
      id: generateId(),
      type: activeMovementTab,
      productId: applied.target.productId,
      inventoryItemId: applied.target.id,
      productName: product?.name || product?.model || "",
      variant: applied.target.variant,
      quantity,
      previousStock: applied.previousStock,
      newStock: applied.nextStock,
      date: parseMovementDate(movementForm.date),
    };

    addTransaction(transaction);
    setTransactions(getTransactions());
    addActivity(
      `${activeMovementTab === "RESTOCK" ? "Stock-in" : "Stock-out"} logged for ${
        product?.model || product?.name || "inventory item"
      } (Qty ${quantity})`
    );

    setMovementForm((current) => ({ ...current, quantity: "" }));
  };

  const startEditMovement = (transaction: Transaction) => {
    const resolvedItemId = resolveInventoryItemIdForTransaction(transaction);
    setMovementError("");
    setEditingMovementId(transaction.id);
    setMovementForm({
      inventoryItemId: resolvedItemId ? String(resolvedItemId) : "",
      quantity: String(transaction.quantity),
      date: new Date(transaction.date).toISOString().slice(0, 10),
    });
  };

  const cancelEditMovement = () => {
    setEditingMovementId(null);
    setMovementError("");
    setMovementForm({
      inventoryItemId: "",
      quantity: "",
      date: todayIso,
    });
  };

  const saveEditedMovement = () => {
    setMovementError("");
    const current = transactions.find((transaction) => transaction.id === editingMovementId);
    if (!current) {
      setMovementError("Movement record not found.");
      return;
    }

    const fallbackItemId = resolveInventoryItemIdForTransaction(current);
    const inventoryItemId = Number(movementForm.inventoryItemId || fallbackItemId || 0);
    const quantity = safeNumber(movementForm.quantity);
    if (!inventoryItemId || quantity <= 0) {
      setMovementError("Select an item and enter a quantity greater than 0.");
      return;
    }

    const oldSignedQty = current.type === "RESTOCK" ? current.quantity : -current.quantity;
    const newSignedQty = current.type === "RESTOCK" ? quantity : -quantity;
    const delta = newSignedQty - oldSignedQty;

    const applied = applyInventoryDelta(inventoryItemId, delta);
    if (!applied.ok || !applied.target) {
      setMovementError(applied.message || "Could not update stock movement.");
      return;
    }

    const product = productsById.get(applied.target.productId);
    const updatedTransaction: Transaction = {
      ...current,
      productId: applied.target.productId,
      inventoryItemId: applied.target.id,
      productName: product?.name || product?.model || "",
      variant: applied.target.variant,
      quantity,
      previousStock: applied.previousStock,
      newStock: applied.nextStock,
      date: parseMovementDate(movementForm.date),
    };

    updateTransaction(updatedTransaction);
    setTransactions(getTransactions());
    addActivity(
      `Updated ${current.type === "RESTOCK" ? "stock-in" : "stock-out"} for ${
        product?.model || product?.name || "inventory item"
      } (Qty ${quantity})`
    );

    cancelEditMovement();
  };

  const deleteMovementEntry = (transaction: Transaction) => {
    setMovementError("");
    const inventoryItemId = resolveInventoryItemIdForTransaction(transaction);
    if (!inventoryItemId) {
      setMovementError("This entry cannot be safely reversed because no stock line is linked.");
      return;
    }

    const reverseDelta = transaction.type === "RESTOCK" ? -transaction.quantity : transaction.quantity;
    const applied = applyInventoryDelta(inventoryItemId, reverseDelta);
    if (!applied.ok || !applied.target) {
      setMovementError(applied.message || "Could not delete movement entry.");
      return;
    }

    removeTransaction(transaction.id);
    setTransactions(getTransactions());

    const product = productsById.get(applied.target.productId);
    addActivity(
      `Deleted ${transaction.type === "RESTOCK" ? "stock-in" : "stock-out"} entry for ${
        product?.model || product?.name || "inventory item"
      }`
    );

    if (editingMovementId === transaction.id) {
      cancelEditMovement();
    }
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
        supplier: resolveSupplierName(product.supplier || "", suppliers),
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
    let transactionToAdd: Transaction | null = null;

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      const newStock = Math.max(0, safeNumber(item.stock) + delta);
      const previousStock = safeNumber(item.stock);

      const product = productsById.get(item.productId);
      transactionToAdd = {
        id: generateId(),
        inventoryItemId: item.id,
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: delta > 0 ? "RESTOCK" : "REMOVE",
        quantity: Math.abs(delta),
        previousStock,
        newStock,
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
      const tx = transactionToAdd as Transaction;
      addTransaction(tx);
      setTransactions(getTransactions());
      addActivity(
        `${tx.type === "RESTOCK" ? "Restocked" : "Removed stock from"} ${tx.productName || "inventory item"}`
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

    let transactionToAdd: Transaction | null = null;

    const updated = items.map((item) => {
      if (item.id !== id) return item;

      const previousStock = safeNumber(item.stock);
      const newStock = previousStock + amount;

      const product = productsById.get(item.productId);
      transactionToAdd = {
        id: generateId(),
        inventoryItemId: item.id,
        productId: item.productId,
        productName: product?.name || "",
        variant: item.variant,
        type: "RESTOCK",
        quantity: amount,
        previousStock,
        newStock,
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
      const tx = transactionToAdd as Transaction;
      addTransaction(tx);
      setTransactions(getTransactions());
      addActivity(`Restocked ${tx.productName || "inventory item"}`);
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

          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Stock movement recorder</p>
                <p className="mt-2 text-sm text-slate-600">
                  Use dedicated stock-in/stock-out entries so every change is logged once and can be edited later.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMovementTab("RESTOCK");
                    setEditingMovementId(null);
                    setMovementError("");
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    activeMovementTab === "RESTOCK"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-700 hover:bg-white"
                  }`}
                >
                  <ArrowDownCircle className="h-4 w-4" />
                  Stock-In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMovementTab("REMOVE");
                    setEditingMovementId(null);
                    setMovementError("");
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    activeMovementTab === "REMOVE"
                      ? "bg-rose-500 text-white"
                      : "text-slate-700 hover:bg-white"
                  }`}
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Stock-Out
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <select
                value={movementForm.inventoryItemId}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    inventoryItemId: event.target.value,
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              >
                <option value="">Select inventory line</option>
                {movementItemOptions.map(({ item, label }) => (
                  <option key={item.id} value={item.id}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={movementForm.quantity}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                placeholder="Quantity"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                type="date"
                value={movementForm.date}
                onChange={(event) =>
                  setMovementForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              {editingMovementId ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEditedMovement}
                    className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
                  >
                    Save Edit
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditMovement}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={createMovement}
                  className={`rounded-2xl px-4 py-3 font-semibold text-white transition ${
                    activeMovementTab === "RESTOCK"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-rose-600 hover:bg-rose-500"
                  }`}
                >
                  {activeMovementTab === "RESTOCK" ? "Record Stock-In" : "Record Stock-Out"}
                </button>
              )}
            </div>

            {movementError ? <p className="mt-3 text-sm text-rose-700">{movementError}</p> : null}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                {activeMovementTab === "RESTOCK" ? "Recent stock-in records" : "Recent stock-out records"}
              </p>
              <div className="mt-3 space-y-2">
                {filteredMovementTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500">No records yet for this tab.</p>
                ) : (
                  filteredMovementTransactions.map((transaction) => {
                    const product = productsById.get(transaction.productId);
                    const label =
                      product?.model || product?.name || transaction.productName || `Product #${transaction.productId}`;

                    return (
                      <div
                        key={transaction.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <p className="text-sm text-slate-700">
                          {label} ({transaction.variant || "-"}) • Qty {transaction.quantity} • {new Date(transaction.date).toLocaleDateString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditMovement(transaction)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMovementEntry(transaction)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
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
                      <div role="cell" className="p-3 text-slate-600 overflow-hidden text-ellipsis whitespace-nowrap">{resolveSupplierName(product?.supplier || "", suppliers) || "-"}</div>
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
