"use client";

import { useEffect, useState } from "react";
import { getSuppliers, saveSuppliers, addSupplier, addActivity, Supplier } from "../lib/storage";

type LocalSupplier = Supplier;

const initialSuppliers: LocalSupplier[] = [];

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<LocalSupplier[]>(initialSuppliers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    category: "",
  });
  const [editId, setEditId] = useState<number | null>(null);

  useEffect(() => {
    const saved = getSuppliers();
    if (saved.length) {
      setSuppliers(saved);
    }
  }, []);

  const handleSaveSupplier = () => {
    if (!form.name.trim()) return;

    if (editId !== null) {
      const updated = suppliers.map((supplier) =>
        supplier.id === editId
          ? {
              ...supplier,
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              category: form.category.trim(),
            }
          : supplier
      );
      setSuppliers(updated);
      addActivity(`Updated supplier ${form.name.trim()}`);
      setEditId(null);
    } else {
      const nextSupplier: LocalSupplier = {
        id: Date.now(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        category: form.category.trim(),
      };
      const next = addSupplier(nextSupplier);
      setSuppliers(next);
      addActivity(`Added supplier ${nextSupplier.name}`);
    }

    setForm({ name: "", email: "", phone: "", category: "" });
  };

  const handleEditSupplier = (supplier: LocalSupplier) => {
    setEditId(supplier.id);
    setForm({
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      category: supplier.category,
    });
  };

  const handleDeleteSupplier = (id: number) => {
    const removed = suppliers.find((supplier) => supplier.id === id);
    const next = suppliers.filter((supplier) => supplier.id !== id);
    setSuppliers(next);
    addActivity(`Deleted supplier ${removed?.name ?? id}`);
    if (editId === id) {
      setEditId(null);
      setForm({ name: "", email: "", phone: "", category: "" });
    }
  };

  useEffect(() => {
    saveSuppliers(suppliers);
  }, [suppliers]);

  const filtered = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Suppliers</h1>
        <p className="text-slate-600 mt-1">
          Manage your supplier contacts and vendor categories easily.
        </p>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
              Supplier directory
            </p>
            <h2 className="text-xl font-semibold text-slate-950 mt-2">
              Find vendor details quickly
            </h2>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Add supplier
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Name"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Category"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveSupplier}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-white font-semibold transition hover:bg-slate-800"
            >
              {editId !== null ? "Save supplier" : "Add supplier"}
            </button>
            {editId !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setForm({ name: "", email: "", phone: "", category: "" });
                }}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 font-semibold transition hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((supplier) => (
          <div key={supplier.id} className="glass-card p-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-950">{supplier.name}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {supplier.category}
              </span>
            </div>
            <p className="text-slate-600 text-sm mt-3">{supplier.email}</p>
            <p className="text-slate-600 text-sm">{supplier.phone}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleEditSupplier(supplier)}
                className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSupplier(supplier.id)}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
