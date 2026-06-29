"use client";

import { useEffect, useState } from "react";
import { getOrders, saveOrders, updateOrder, addActivity, PurchaseOrder } from "../lib/storage";

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [showClearArchiveConfirm, setShowClearArchiveConfirm] = useState(false);

  useEffect(() => {
    setOrders(getOrders());
  }, []);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const activeOrders = orders.filter((order) => order.status === "OPEN");
  const archivedOrders = orders.filter((order) => order.status === "CLOSED");

  const getStatusLabel = (status: PurchaseOrder["status"]) =>
    status === "OPEN" ? "On board" : "Delivered";

  const getStatusClasses = (status: PurchaseOrder["status"]) =>
    status === "OPEN"
      ? "inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700"
      : "inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700";

  const handleMarkReceived = (orderId: number) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;

    const updatedOrder: PurchaseOrder = {
      ...order,
      status: "CLOSED",
    };

    const updatedOrders = updateOrder(updatedOrder);
    setOrders(updatedOrders);
    addActivity(`Delivered order for ${order.productName}`);
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
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Purchase Orders</h1>
        <p className="text-slate-600 mt-1">
          Create and track purchase orders across suppliers and inventory locations.
        </p>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Track Order</p>
            <h2 className="text-2xl font-semibold text-slate-950 mt-2">Follow delivery status</h2>
          </div>
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

      <div className="glass-card overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
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
            {activeOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No active purchase orders.
                </td>
              </tr>
            ) : (
              activeOrders.map((order) => (
                <tr key={order.id} className="border-t border-slate-200 hover:bg-slate-50">
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
      </div>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Archived</p>
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
          {archivedOrders.length === 0 ? (
            <p className="text-slate-500">No delivered orders archived yet.</p>
          ) : (
            archivedOrders.map((order) => (
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
      </div>
    </div>
  );
}
