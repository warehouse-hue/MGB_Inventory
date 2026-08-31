"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SquarePlus } from "lucide-react";
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
  saveInventory,
  saveOrders,
  saveProducts,
  Supplier,
} from "../lib/storage";

const PRODUCT_CATEGORIES = [
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

type FormState = {
  brandUses: string;
  model: string;
  sizeGauge: string;
  productCode: string;
  category: string;
  orderQty: string;
  minimum: string;
  currentStock: string;
  ordered: boolean;
  orderedDate: string;
  supplier: string;
  lastBuyPrice: string;
};

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function createInitialForm(): FormState {
  const settings = getAppSettings();
  return {
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    category: "",
    orderQty: "0",
    minimum: settings.defaultMinimumStock > 0 ? String(settings.defaultMinimumStock) : "",
    currentStock: "0",
    ordered: false,
    orderedDate: "",
    supplier: "",
    lastBuyPrice: "",
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<FormState>({
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    category: "",
    orderQty: "0",
    minimum: "",
    currentStock: "0",
    ordered: false,
    orderedDate: "",
    supplier: "",
    lastBuyPrice: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdName, setCreatedName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(createInitialForm());
  const isCreatingRef = useRef(false);

  useEffect(() => {
    setProducts(getProducts());
    setInventory(getInventory());
    setSuppliers(getSuppliers());
    setForm(createInitialForm());
  }, []);

  const supplierNames = useMemo(
    () => Array.from(new Set(suppliers.map((supplier) => supplier.name).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [suppliers]
  );

  const stockByProductId = useMemo(() => {
    const stock = new Map<number, number>();
    for (const item of inventory) {
      stock.set(item.productId, (stock.get(item.productId) ?? 0) + safeNumber(item.stock));
    }
    return stock;
  }, [inventory]);

  const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCreatedName("");
  };

  const resetForm = () => {
    setForm(createInitialForm());
    setErrors({});
    setCreatedName("");
  };

  const startEditProduct = (product: Product) => {
    const stock = inventory
      .filter((item) => item.productId === product.id)
      .reduce((sum, item) => sum + safeNumber(item.stock), 0);
    setEditTarget(product.id);
    setEditForm({
      brandUses: product.brandUses || "",
      model: product.model || product.name || "",
      sizeGauge: product.sizeGauge || "",
      productCode: product.productCode || product.sku || "",
      category: product.category || "",
      orderQty: String(product.orderQty ?? 0),
      minimum: product.minimum != null ? String(product.minimum) : "",
      currentStock: String(stock),
      ordered: Boolean(product.ordered),
      orderedDate: product.orderedDate || "",
      supplier: resolveSupplierName(product.supplier || "", suppliers),
      lastBuyPrice: product.lastBuyPrice != null ? String(product.lastBuyPrice) : "",
    });
  };

  const saveProductEdits = () => {
    if (editTarget === null) return;
    const currentProduct = products.find((product) => product.id === editTarget);
    if (!currentProduct || !editForm.category || (!editForm.model.trim() && !editForm.productCode.trim())) return;

    const orderedDate = editForm.ordered ? (editForm.orderedDate || new Date().toISOString().slice(0, 10)) : "";
    const updatedProduct: Product = {
      ...currentProduct,
      name: editForm.model.trim() || editForm.productCode.trim(),
      sku: editForm.productCode.trim() || editForm.model.trim() || currentProduct.sku,
      category: editForm.category,
      brandUses: editForm.brandUses.trim(),
      model: editForm.model.trim(),
      sizeGauge: editForm.sizeGauge.trim(),
      productCode: editForm.productCode.trim(),
      orderQty: Math.max(0, safeNumber(editForm.orderQty)),
      minimum: editForm.minimum ? Math.max(0, safeNumber(editForm.minimum)) : undefined,
      ordered: editForm.ordered,
      orderedDate,
      supplier: resolveSupplierName(editForm.supplier, suppliers),
      lastBuyPrice: editForm.lastBuyPrice ? Math.max(0, safeNumber(editForm.lastBuyPrice)) : undefined,
    };
    const updatedProducts = products.map((product) => product.id === editTarget ? updatedProduct : product);
    const productInventory = inventory.filter((item) => item.productId === editTarget);
    const updatedInventory = [
      ...inventory.filter((item) => item.productId !== editTarget),
      {
        id: productInventory[0]?.id ?? generateId(),
        productId: editTarget,
        variant: updatedProduct.sizeGauge || productInventory[0]?.variant || "",
        stock: Math.max(0, safeNumber(editForm.currentStock)),
        location: productInventory[0]?.location || getAppSettings().defaultLocation,
      },
    ];
    const existingOrders = getOrders();
    const existingOrder = existingOrders.find((order) => order.productId === editTarget);
    const updatedOrders = editForm.ordered
      ? [
          {
            id: existingOrder?.id ?? generateId(),
            productId: editTarget,
            productName: updatedProduct.model || updatedProduct.brandUses || updatedProduct.sku || updatedProduct.name,
            variant: updatedProduct.sizeGauge || "",
            quantity: updatedProduct.orderQty ?? 0,
            orderedDate,
            supplier: updatedProduct.supplier,
            lastBuyPrice: updatedProduct.lastBuyPrice,
            status: "OPEN" as const,
          },
          ...existingOrders.filter((order) => order.productId !== editTarget),
        ]
      : existingOrders.filter((order) => order.productId !== editTarget);

    saveProducts(updatedProducts);
    saveInventory(updatedInventory);
    saveOrders(updatedOrders);
    setProducts(updatedProducts);
    setInventory(updatedInventory);
    addActivity(`Updated product ${updatedProduct.name}`);
    setEditTarget(null);
  };

  const addProduct = () => {
    if (isCreatingRef.current) return;

    const nextErrors: Record<string, string> = {};
    if (!form.category) nextErrors.category = "Choose a category.";
    if (!form.model.trim() && !form.productCode.trim()) {
      nextErrors.identity = "Enter a model or product code.";
    }
    if (safeNumber(form.currentStock) < 0) nextErrors.currentStock = "Current stock cannot be negative.";
    if (safeNumber(form.minimum) < 0) nextErrors.minimum = "Minimum stock cannot be negative.";
    if (safeNumber(form.orderQty) < 0) nextErrors.orderQty = "Order quantity cannot be negative.";
    if (safeNumber(form.lastBuyPrice) < 0) nextErrors.lastBuyPrice = "Last buy price cannot be negative.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    isCreatingRef.current = true;
    setIsCreating(true);
    const newProductId = generateId();
    const name = form.model.trim() || form.productCode.trim();
    const product: Product = {
      id: newProductId,
      name,
      sku: form.productCode.trim() || name || "UNKNOWN",
      category: form.category,
      brandUses: form.brandUses.trim(),
      model: form.model.trim(),
      sizeGauge: form.sizeGauge.trim(),
      orderQty: safeNumber(form.orderQty),
      minimum: form.minimum ? safeNumber(form.minimum) : undefined,
      productCode: form.productCode.trim(),
      ordered: form.ordered,
      orderedDate: form.ordered ? (form.orderedDate || new Date().toISOString().slice(0, 10)) : "",
      supplier: resolveSupplierName(form.supplier.trim(), suppliers),
      lastBuyPrice: form.lastBuyPrice ? safeNumber(form.lastBuyPrice) : undefined,
    };
    const inventoryItem: InventoryItem = {
      id: generateId(),
      productId: product.id,
      variant: product.sizeGauge || "",
      stock: Math.max(0, safeNumber(form.currentStock)),
      location: getAppSettings().defaultLocation,
    };

    if (form.ordered) {
      saveOrders([
        {
          id: generateId(),
          productId: product.id,
          productName: product.model || product.brandUses || product.sku || product.name || "Product",
          variant: product.sizeGauge || "",
          quantity: safeNumber(form.orderQty),
          orderedDate: product.orderedDate || new Date().toISOString().slice(0, 10),
          supplier: product.supplier,
          lastBuyPrice: product.lastBuyPrice,
          status: "OPEN",
        },
        ...getOrders(),
      ]);
    }

    const updatedProducts = [product, ...products];
    const updatedInventory = [inventoryItem, ...getInventory()];
    saveInventory(updatedInventory);
    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    setInventory(updatedInventory);
    addActivity(`Added product ${product.name}`);
    setForm(createInitialForm());
    setErrors({});
    setCreatedName(product.name);
    setIsCreating(false);
    isCreatingRef.current = false;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-products">
        <div className="mt-3 command-slip-icon"><SquarePlus />Add Inventory</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Add Inventory</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Create a new inventory item.</p>
      </div>

      {createdName ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>Item created successfully: {createdName}</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={resetForm} className="font-medium text-cyan-700">Add another</button>
            <Link href="/inventory" className="font-medium text-cyan-700">View in Inventory</Link>
          </div>
        </div>
      ) : null}

      <section className="glass-card p-6">
        <div className="space-y-7">
          <FormSection title="Product">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Category" error={errors.category}>
                <select value={form.category} onChange={(event) => updateForm("category", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">
                  <option value="">Select category</option>
                  {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Brand / Uses">
                <input value={form.brandUses} onChange={(event) => updateForm("brandUses", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Model" error={errors.identity}>
                <input value={form.model} onChange={(event) => updateForm("model", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Size / Gauge">
                <input value={form.sizeGauge} onChange={(event) => updateForm("sizeGauge", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Product Code" error={errors.identity}>
                <input value={form.productCode} onChange={(event) => updateForm("productCode", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Current Stock" error={errors.currentStock}>
                <input type="number" min="0" value={form.currentStock} onChange={(event) => updateForm("currentStock", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Minimum Stock" error={errors.minimum}>
                <input type="number" min="0" value={form.minimum} onChange={(event) => updateForm("minimum", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Order Qty" error={errors.orderQty}>
                <input type="number" min="0" value={form.orderQty} onChange={(event) => updateForm("orderQty", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Purchasing">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Supplier">
                <select value={form.supplier} onChange={(event) => updateForm("supplier", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">
                  <option value="">Select supplier</option>
                  {supplierNames.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                </select>
              </Field>
              <Field label="Last Buy Price" error={errors.lastBuyPrice}>
                <input type="number" min="0" step="0.01" value={form.lastBuyPrice} onChange={(event) => updateForm("lastBuyPrice", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.ordered}
                  onChange={(event) => updateForm("ordered", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Ordered
              </label>
              {form.ordered ? (
                <Field label="Ordered Date">
                  <input type="date" value={form.orderedDate} onChange={(event) => updateForm("orderedDate", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
                </Field>
              ) : null}
            </div>
          </FormSection>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <button type="button" onClick={addProduct} disabled={isCreating} className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60">
            {isCreating ? "Creating..." : "Create Inventory Item"}
          </button>
          <button type="button" onClick={resetForm} disabled={isCreating} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60">Clear</button>
        </div>
      </section>

      <section className="glass-card overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">Inventory items</h2>
          <p className="mt-1 text-sm text-slate-600">Product, stock, and purchasing details.</p>
        </div>
        <table className="min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Brand / Uses</th>
              <th className="p-3 text-left">Model</th>
              <th className="p-3 text-left">Size / Gauge</th>
              <th className="p-3 text-left">Stock</th>
              <th className="p-3 text-left">Minimum</th>
              <th className="p-3 text-left">Product Code</th>
              <th className="p-3 text-left">Supplier</th>
              <th className="p-3 text-left">Last Buy Price</th>
              <th className="p-3 text-left">Ordered</th>
              <th className="p-3 text-left">Ordered Date</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <Fragment key={product.id}>
              <tr className="border-t border-slate-200 hover:bg-slate-50">
                <td className="p-3">{product.category || "-"}</td>
                <td className="p-3">{product.brandUses || "-"}</td>
                <td className="p-3 font-medium text-slate-950">{product.model || product.name || "-"}</td>
                <td className="p-3">{product.sizeGauge || "-"}</td>
                <td className="p-3 font-semibold text-slate-950">{stockByProductId.get(product.id) ?? 0}</td>
                <td className="p-3">{product.minimum ?? 0}</td>
                <td className="p-3">{product.productCode || product.sku || "-"}</td>
                <td className="p-3">{resolveSupplierName(product.supplier, suppliers) || "-"}</td>
                <td className="p-3">{product.lastBuyPrice != null ? `$${product.lastBuyPrice.toFixed(2)}` : "-"}</td>
                <td className="p-3">{product.ordered ? "Yes" : "No"}</td>
                <td className="p-3">{product.orderedDate || "-"}</td>
                <td className="p-3 text-right"><button type="button" onClick={() => startEditProduct(product)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">Edit details</button></td>
              </tr>
              {editTarget === product.id ? (
                <tr className="border-t border-slate-200 bg-slate-50"><td colSpan={12} className="p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <EditField label="Category"><select value={editForm.category} onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900">{PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></EditField>
                    <EditField label="Brand / Uses"><input value={editForm.brandUses} onChange={(event) => setEditForm({ ...editForm, brandUses: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Model"><input value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Size / Gauge"><input value={editForm.sizeGauge} onChange={(event) => setEditForm({ ...editForm, sizeGauge: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Product Code"><input value={editForm.productCode} onChange={(event) => setEditForm({ ...editForm, productCode: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Current Stock"><input type="number" min="0" value={editForm.currentStock} onChange={(event) => setEditForm({ ...editForm, currentStock: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Minimum Stock"><input type="number" min="0" value={editForm.minimum} onChange={(event) => setEditForm({ ...editForm, minimum: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Order Qty"><input type="number" min="0" value={editForm.orderQty} onChange={(event) => setEditForm({ ...editForm, orderQty: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <EditField label="Supplier"><select value={editForm.supplier} onChange={(event) => setEditForm({ ...editForm, supplier: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900"><option value="">Select supplier</option>{supplierNames.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}</select></EditField>
                    <EditField label="Last Buy Price"><input type="number" min="0" step="0.01" value={editForm.lastBuyPrice} onChange={(event) => setEditForm({ ...editForm, lastBuyPrice: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900" /></EditField>
                    <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={editForm.ordered} onChange={(event) => setEditForm({ ...editForm, ordered: event.target.checked })} className="h-4 w-4 rounded border-slate-300" />Ordered</label>
                    {editForm.ordered ? <EditField label="Ordered Date"><input type="date" value={editForm.orderedDate} onChange={(event) => setEditForm({ ...editForm, orderedDate: event.target.value })} className="edit-input" /></EditField> : null}
                  </div>
                  <div className="mt-4 flex gap-3"><button type="button" onClick={saveProductEdits} className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">Save changes</button><button type="button" onClick={() => setEditTarget(null)} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Cancel</button></div>
                </td></tr>
              ) : null}
              </Fragment>
            ))}
            {products.length === 0 ? (
              <tr><td colSpan={12} className="p-5 text-slate-600">No inventory items yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 border-t border-slate-200 pt-4">{children}</div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : null}
    </label>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<div className="mt-1.5">{children}</div></label>;
}