"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  getOrders,
  saveOrders,
  updateOrder,
  addActivity,
  generateId,
  PurchaseOrder,
  getProducts,
  saveProducts,
  getInventory,
  saveInventory,
} from "../lib/storage";

const ITEMS_PER_PAGE = 100;
type OrderTab = "OPEN" | "AWAITING" | "ARCHIVED";

function normalizeText(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showClearArchiveConfirm, setShowClearArchiveConfirm] = useState(false);
  const [applyStockOrderId, setApplyStockOrderId] = useState<number | null>(null);
  const [newStockAmount, setNewStockAmount] = useState("");
  const [search, setSearch] = useState("");
  const [orderTab, setOrderTab] = useState<OrderTab>("OPEN");
  const [activePage, setActivePage] = useState(1);
  const [awaitingPage, setAwaitingPage] = useState(1);
  const [archivedPage, setArchivedPage] = useState(1);

  useEffect(() => {
    setOrders(getOrders());
  }, []);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const applyStockOrder = orders.find((order) => order.id === applyStockOrderId) ?? null;
  const activeOrders = orders.filter((order) => order.status === "OPEN");
  const awaitingOrders = orders.filter((order) => order.status === "DELIVERED_PENDING");
  const archivedOrders = orders.filter((order) => order.status === "CLOSED");
  const normalizedSearch = search.toLowerCase().trim();
  const matchesSearch = (order: PurchaseOrder) => {
    if (!normalizedSearch) return true;

    const content = [
      order.productName,
      order.variant,
      order.supplier,
      order.orderedDate,
      order.status,
      String(order.quantity),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return content.includes(normalizedSearch);
  };

  const filteredActiveOrders = activeOrders.filter(matchesSearch);
  const filteredAwaitingOrders = awaitingOrders.filter(matchesSearch);
  const filteredArchivedOrders = archivedOrders.filter(matchesSearch);

  const totalActivePages = Math.max(1, Math.ceil(filteredActiveOrders.length / ITEMS_PER_PAGE));
  const totalAwaitingPages = Math.max(1, Math.ceil(filteredAwaitingOrders.length / ITEMS_PER_PAGE));
  const totalArchivedPages = Math.max(1, Math.ceil(filteredArchivedOrders.length / ITEMS_PER_PAGE));
  const paginatedActiveOrders = filteredActiveOrders.slice(
    (activePage - 1) * ITEMS_PER_PAGE,
    activePage * ITEMS_PER_PAGE
  );
  const paginatedAwaitingOrders = filteredAwaitingOrders.slice(
    (awaitingPage - 1) * ITEMS_PER_PAGE,
    awaitingPage * ITEMS_PER_PAGE
  );
  const paginatedArchivedOrders = filteredArchivedOrders.slice(
    (archivedPage - 1) * ITEMS_PER_PAGE,
    archivedPage * ITEMS_PER_PAGE
  );
  const inboundUnits = activeOrders.reduce((sum, order) => sum + order.quantity, 0);

  useEffect(() => {
    setActivePage(1);
    setAwaitingPage(1);
    setArchivedPage(1);
  }, [search]);

  useEffect(() => {
    setActivePage((previous) => Math.min(previous, totalActivePages));
  }, [totalActivePages]);

  useEffect(() => {
    setAwaitingPage((previous) => Math.min(previous, totalAwaitingPages));
  }, [totalAwaitingPages]);

  useEffect(() => {
    setArchivedPage((previous) => Math.min(previous, totalArchivedPages));
  }, [totalArchivedPages]);

  const getStatusLabel = (status: PurchaseOrder["status"]) => {
    if (status === "OPEN") return "On board";
    if (status === "DELIVERED_PENDING") return "Awaiting stock";
    return "Archived";
  };

  const getStatusClasses = (status: PurchaseOrder["status"]) =>
    status === "OPEN"
      ? "inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700"
      : status === "DELIVERED_PENDING"
        ? "inline-flex items-center rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-900"
        : "inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700";

  const handleMarkReceived = (orderId: number) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;

    const updatedOrder: PurchaseOrder = {
      ...order,
      status: "DELIVERED_PENDING",
    };

    const updatedOrders = updateOrder(updatedOrder);
    setOrders(updatedOrders);

    const updatedProducts = getProducts().map((product) =>
      product.id === order.productId
        ? {
            ...product,
            ordered: false,
            orderedDate: "",
          }
        : product
    );
    saveProducts(updatedProducts);

    addActivity(`Delivered order for ${order.productName}; awaiting stock readjustment`);
  };

  const handleApplyStockReadjustment = (orderId: number, quantityToAdd: number) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;

    const currentInventory = getInventory();
    let adjusted = false;

    const updatedInventory = currentInventory.map((item) => {
      if (adjusted || item.productId !== order.productId) {
        return item;
      }

      if (
        normalizeText(order.variant) &&
        normalizeText(item.variant) &&
        normalizeText(order.variant) !== normalizeText(item.variant)
      ) {
        return item;
      }

      adjusted = true;
      return {
        ...item,
        stock: Number(item.stock || 0) + Number(quantityToAdd || 0),
      };
    });

    if (!adjusted) {
      updatedInventory.unshift({
        id: generateId(),
        productId: order.productId,
        variant: order.variant || "",
        stock: Number(quantityToAdd || 0),
        location: "Main Warehouse",
      });
    }

    saveInventory(updatedInventory);

    const updatedOrder: PurchaseOrder = {
      ...order,
      status: "CLOSED",
    };

    const updatedOrders = updateOrder(updatedOrder);
    setOrders(updatedOrders);
    setApplyStockOrderId(null);
    setNewStockAmount("");
    addActivity(`Applied stock readjustment for ${order.productName}`);
  };

  const openApplyStockModal = (order: PurchaseOrder) => {
    setApplyStockOrderId(order.id);
    setNewStockAmount(String(order.quantity || 0));
  };

  const submitApplyStock = () => {
    if (!applyStockOrder) return;

    const quantityToAdd = Number(newStockAmount);
    if (!Number.isFinite(quantityToAdd) || quantityToAdd <= 0) return;

    handleApplyStockReadjustment(applyStockOrder.id, quantityToAdd);
  };

  const handleClearArchive = () => {
    const remainingOrders = orders.filter((order) => order.status !== "CLOSED");
    saveOrders(remainingOrders);
    setOrders(remainingOrders);

    if (selectedOrderId != null && archivedOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(null);
    }

    setShowClearArchiveConfirm(false);
    addActivity("Cleared archived purchase orders");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-orders">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80">
              DELIVERY BOARD
            </p>
            <div className="mt-3 command-slip-icon">
              <ClipboardList />
              Orders
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Orders Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/85 sm:text-base">
              Track inbound orders, mark received deliveries, and monitor archive turnover in one place.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OrderChip label="Open" value={activeOrders.length} tone="sky" />
            <OrderChip label="Awaiting" value={awaitingOrders.length} tone="amber" />
            <OrderChip label="Units Inbound" value={inboundUnits} tone="cyan" />
            <OrderChip label="Delivered" value={archivedOrders.length} tone="emerald" />
            <OrderChip label="Selected" value={selectedOrder ? 1 : 0} tone="slate" />
          </div>
        </div>
      </div>

      <div className="glass-card p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOrderTab("OPEN")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              orderTab === "OPEN"
                ? "bg-slate-950 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Open Orders
          </button>
          <button
            type="button"
            onClick={() => setOrderTab("AWAITING")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              orderTab === "AWAITING"
                ? "bg-slate-950 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Awaiting Stock Readjustment
          </button>
          <button
            type="button"
            onClick={() => setOrderTab("ARCHIVED")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              orderTab === "ARCHIVED"
                ? "bg-slate-950 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Track Order</p>
            <h2 className="text-2xl font-semibold text-slate-950 mt-2">Follow delivery status</h2>
            <p className="mt-2 text-sm text-slate-600">Select an active order to monitor arrival state and close it once delivered.</p>
          </div>
          <div className="space-y-3 md:w-[28rem]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search orders..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              {selectedOrder ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-500">Selected order</p>
                  <p className="font-semibold text-slate-950">{selectedOrder.productName}</p>
                  <p className="text-sm">{selectedOrder.quantity} unit(s)</p>
                  <p className="text-sm text-slate-500">
                    Status: <span className={getStatusClasses(selectedOrder.status)}>{getStatusLabel(selectedOrder.status)}</span>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Choose an order below to track it.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {orderTab === "OPEN" ? (
      <div className="glass-card overflow-x-auto">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Active orders table</p>
            <p className="mt-2 text-sm text-slate-500">Showing page {activePage} of {totalActivePages} ({filteredActiveOrders.length} matching active purchase orders).</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            Track a row to expose delivery actions
          </div>
        </div>
        <table className="sticky-table-header min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Variant</th>
              <th className="p-3 text-left">Quantity</th>
              <th className="p-3 text-left">Ordered Date</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Last Buy Price</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredActiveOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No active purchase orders match your search.
                </td>
              </tr>
            ) : (
              paginatedActiveOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 transition hover:bg-sky-50/35">
                  <td className="p-3 font-medium text-slate-950">{order.productName}</td>
                  <td className="p-3 text-slate-600">{order.variant || "-"}</td>
                  <td className="p-3 text-slate-600">{order.quantity}</td>
                  <td className="p-3 text-slate-600">{order.orderedDate}</td>
                  <td className="p-3 text-slate-600">{order.supplier || "-"}</td>
                  <td className="p-3 text-slate-600">
                    {order.lastBuyPrice != null ? `$${order.lastBuyPrice.toFixed(2)}` : "-"}
                  </td>
                  <td className="p-3 text-slate-600">
                    <span className={getStatusClasses(order.status)}>{getStatusLabel(order.status)}</span>
                  </td>
                  <td className="p-3 text-slate-600">
                    <button
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className="text-slate-700 underline transition hover:text-slate-950"
                    >
                      Track
                    </button>
                    {selectedOrderId === order.id && order.status === "OPEN" ? (
                      <button
                        type="button"
                        onClick={() => handleMarkReceived(order.id)}
                        className="ml-3 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 transition hover:bg-emerald-200"
                      >
                        Mark received
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-4">
          {Array.from({ length: totalActivePages }, (_, index) => {
            const page = index + 1;
            const isActive = page === activePage;

            return (
              <button
                key={page}
                type="button"
                onClick={() => setActivePage(page)}
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
      ) : null}

      {orderTab === "AWAITING" ? (
      <div className="glass-card overflow-x-auto">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Awaiting stock readjustment</p>
            <p className="mt-2 text-sm text-slate-500">Showing page {awaitingPage} of {totalAwaitingPages} ({filteredAwaitingOrders.length} delivered orders awaiting stock readjustment).</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Apply stock then move to archive
          </div>
        </div>
        <table className="sticky-table-header min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Product</th>
              <th className="p-3 text-left">Variant</th>
              <th className="p-3 text-left">Quantity</th>
              <th className="p-3 text-left">Ordered Date</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAwaitingOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">
                  No delivered orders are waiting for stock readjustment.
                </td>
              </tr>
            ) : (
              paginatedAwaitingOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 transition hover:bg-amber-50/35">
                  <td className="p-3 font-medium text-slate-950">{order.productName}</td>
                  <td className="p-3 text-slate-600">{order.variant || "-"}</td>
                  <td className="p-3 text-slate-600">{order.quantity}</td>
                  <td className="p-3 text-slate-600">{order.orderedDate}</td>
                  <td className="p-3 text-slate-600">{order.supplier || "-"}</td>
                  <td className="p-3 text-slate-600">
                    <span className={getStatusClasses(order.status)}>{getStatusLabel(order.status)}</span>
                  </td>
                  <td className="p-3 text-slate-600">
                    <button
                      type="button"
                      onClick={() => openApplyStockModal(order)}
                      className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 transition hover:bg-emerald-200"
                    >
                      Apply stock + archive
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-4">
          {Array.from({ length: totalAwaitingPages }, (_, index) => {
            const page = index + 1;
            const isActive = page === awaitingPage;

            return (
              <button
                key={page}
                type="button"
                onClick={() => setAwaitingPage(page)}
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
      ) : null}

      {orderTab === "ARCHIVED" ? (
      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Archived</p>
            <h2 className="text-2xl font-semibold text-slate-950 mt-2">Delivered orders</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowClearArchiveConfirm((current) => !current)}
            className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Clear archive
          </button>
        </div>

        {showClearArchiveConfirm && (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-semibold">Clear all archived orders?</p>
            <p className="mt-1 text-slate-700">This will remove all delivered orders from the archived section.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearArchive}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-white shadow-sm transition hover:bg-rose-700"
              >
                Confirm clear
              </button>
              <button
                type="button"
                onClick={() => setShowClearArchiveConfirm(false)}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-rose-700 transition hover:bg-rose-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {filteredArchivedOrders.length === 0 ? (
            <p className="text-slate-500">No delivered orders match your search.</p>
          ) : (
            paginatedArchivedOrders.map((order) => (
              <div key={order.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{order.productName}</p>
                  <span className={getStatusClasses(order.status)}>{getStatusLabel(order.status)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {order.variant || "-"} • {order.quantity} unit(s) • Ordered {order.orderedDate}
                </p>
              </div>
            ))
          )}
        </div>
        {filteredArchivedOrders.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            {Array.from({ length: totalArchivedPages }, (_, index) => {
              const page = index + 1;
              const isActive = page === archivedPage;

              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => setArchivedPage(page)}
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
        ) : null}
      </div>
      ) : null}

      {applyStockOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">Stock Readjustment</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-950">Enter New Stock</h3>
            <p className="mt-2 text-sm text-slate-600">
              Add this number to current stock for {applyStockOrder.productName} ({applyStockOrder.variant || "-"}).
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-700">New Stock</label>
            <input
              type="number"
              min={1}
              value={newStockAmount}
              onChange={(event) => setNewStockAmount(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setApplyStockOrderId(null);
                  setNewStockAmount("");
                }}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitApplyStock}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-white transition hover:bg-slate-800"
              >
                Apply + Archive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "amber" | "cyan" | "emerald" | "slate";
}) {
  const toneClass = {
    sky: "border-sky-200/70 bg-sky-400/35 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    amber: "border-amber-200/70 bg-amber-400/35 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    cyan: "border-cyan-200/70 bg-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
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
