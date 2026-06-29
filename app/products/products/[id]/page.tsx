"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { getProducts, getInventory } from "../../../lib/storage";
import { getTransactions } from "../../../lib/transactions";

export default function ProductDetailPage() {
  const params = useParams();
  const id = Number(params?.id);

  const product = useMemo(() => {
    return getProducts().find((p) => p.id === id);
  }, [id]);

  const inventory = useMemo(() => {
    return getInventory().filter((i) => i.productId === id);
  }, [id]);

  const transactions = useMemo(() => {
    return getTransactions()
      .filter((t) => t.productId === id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [id]);

  const stats = useMemo(() => {
    const restock = transactions
      .filter((t) => t.type === "RESTOCK")
      .reduce((sum, t) => sum + t.quantity, 0);

    const remove = transactions
      .filter((t) => t.type === "REMOVE")
      .reduce((sum, t) => sum + t.quantity, 0);

    const totalStock = inventory.reduce((sum, i) => sum + i.stock, 0);

    return {
      restock,
      remove,
      net: restock - remove,
      totalStock,
    };
  }, [transactions, inventory]);

  if (!product) {
    return <div className="p-6 text-white/60">Product not found</div>;
  }

  return (
    <div className="p-6 space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">{product.name}</h1>
        <p className="text-white/60">
          SKU: {product.sku} • Category: {product.category}
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <Card label="Total Stock" value={stats.totalStock} />
        <Card label="Restocked" value={stats.restock} />
        <Card label="Removed" value={stats.remove} />
        <Card label="Net Movement" value={stats.net} />

      </div>

      {/* INVENTORY BY LOCATION */}
      <div className="bg-white/5 p-4 rounded-lg border border-white/10">
        <h2 className="font-semibold mb-2">Stock by Location</h2>

        {inventory.length === 0 ? (
          <p className="text-white/40">No inventory found</p>
        ) : (
          inventory.map((i) => (
            <div
              key={i.id}
              className="flex justify-between text-sm py-1"
            >
              <span>{i.location} • {i.variant}</span>
              <span className="font-bold">{i.stock}</span>
            </div>
          ))
        )}
      </div>

      {/* TRANSACTIONS */}
      <div className="bg-white/5 p-4 rounded-lg border border-white/10">
        <h2 className="font-semibold mb-2">Activity Timeline</h2>

        {transactions.length === 0 ? (
          <p className="text-white/40">No activity yet</p>
        ) : (
          transactions.map((t) => (
            <div
              key={t.id}
              className="flex justify-between text-sm py-1"
            >
              <div>
                <span className="font-medium">{t.type}</span>
                <span className="text-white/50 ml-2">
                  {new Date(t.date).toLocaleString()}
                </span>
              </div>

              <span className="font-bold">{t.quantity}</span>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

function Card({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
      <p className="text-white/60 text-xs">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}