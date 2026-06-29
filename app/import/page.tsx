"use client";

import { useState } from "react";
import {
  getProducts,
  saveProducts,
  getInventory,
  saveInventory,
  addActivity,
  Product,
  InventoryItem,
} from "../lib/storage";

function parseCSV(text: string) {
  const rows: string[] = [];
  const lines = text.split(/\r?\n/);

  const parseLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current);
    return values;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(trimmed);
  }

  return rows.map(parseLine);
}

function parseNumber(value: string | undefined) {
  if (!value) return 0;
  const n = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export default function ImportPage() {
  const [preview, setPreview] = useState<Product[]>([]);
  const [inventoryPreview, setInventoryPreview] = useState<InventoryItem[]>([]);
  const [message, setMessage] = useState<string>("");
  const [isReadyToImport, setIsReadyToImport] = useState(false);
  const [error, setError] = useState<string>("");
  const [appendData, setAppendData] = useState(true);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage("");
    setError("");
    setPreview([]);
    setInventoryPreview([]);
    setIsReadyToImport(false);

    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      setError("CSV does not contain enough rows.");
      return;
    }

    const header = rows[0].map((value) => value.trim());
    const dataRows = rows.slice(1);

    const products: Product[] = [];
    const inventory: InventoryItem[] = [];
    const existingProducts = getProducts();
    const nextProductId = Math.max(0, ...existingProducts.map((item) => item.id)) + 1;
    const existingInventory = getInventory();
    const nextInventoryId = Math.max(0, ...existingInventory.map((item) => item.id)) + 1;

    let productCounter = 0;
    let inventoryCounter = 0;

    for (const row of dataRows) {
      const itemName = row[0]?.trim();
      const size = row[1]?.trim();
      const current = parseNumber(row[2]);
      const minimum = parseNumber(row[3]);
      const orderQty = parseNumber(row[4]);
      const defaultOrderQty = parseNumber(row[7]);
      const productCode = row[8]?.trim();
      const supplier = row[9]?.trim();
      const lastBuyPrice = parseNumber(row[10]);

      if (!itemName || !productCode) continue;

      const product: Product = {
        id: nextProductId + productCounter,
        name: itemName,
        sku: productCode,
        category: "",
        sizeGauge: size,
        orderQty: orderQty || defaultOrderQty || 0,
        minimum: minimum || undefined,
        ordered: false,
        orderedDate: "",
        productCode,
        supplier,
        lastBuyPrice: lastBuyPrice || undefined,
      };

      const inventoryItem: InventoryItem = {
        id: nextInventoryId + inventoryCounter,
        productId: product.id,
        variant: size,
        stock: current,
        location: "Main",
      };

      products.push(product);
      inventory.push(inventoryItem);
      productCounter += 1;
      inventoryCounter += 1;
    }

    if (products.length === 0) {
      setError("No importable rows were detected in the CSV.");
      return;
    }

    setPreview(products.slice(0, 10));
    setInventoryPreview(inventory.slice(0, 10));
    setIsReadyToImport(true);
    setMessage(`${products.length} product rows are ready to import.`);

    window.sessionStorage.setItem("csvImportProducts", JSON.stringify(products));
    window.sessionStorage.setItem("csvImportInventory", JSON.stringify(inventory));
  };

  const handleImport = () => {
    const rawProducts = window.sessionStorage.getItem("csvImportProducts");
    const rawInventory = window.sessionStorage.getItem("csvImportInventory");
    if (!rawProducts || !rawInventory) {
      setError("No parsed import data found. Please upload the CSV again.");
      return;
    }

    const products: Product[] = JSON.parse(rawProducts);
    const inventory: InventoryItem[] = JSON.parse(rawInventory);

    if (appendData) {
      saveProducts([...getProducts(), ...products]);
      saveInventory([...getInventory(), ...inventory]);
    } else {
      saveProducts(products);
      saveInventory(inventory);
    }

    addActivity(`Imported ${products.length} products`);
    setMessage(`Imported ${products.length} products and ${inventory.length} inventory records.`);
    setPreview([]);
    setInventoryPreview([]);
    setIsReadyToImport(false);
    window.sessionStorage.removeItem("csvImportProducts");
    window.sessionStorage.removeItem("csvImportInventory");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Import Inventory</h1>
        <p className="text-slate-600 mt-1">
          Upload a CSV export from Google Sheets to bulk load products and stock.
        </p>
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">CSV file</label>
          <input type="file" accept=".csv" onChange={handleFile} className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900" />
          <p className="text-sm text-slate-500">The upload expects rows with product name, size, current stock, order quantities, SKU, supplier, and price.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={appendData} onChange={(event) => setAppendData(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-slate-900" />
            Append to existing data (uncheck to replace current inventory)
          </label>
        </div>

        {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div> : null}
        {error ? <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div> : null}

        {isReadyToImport ? (
          <button type="button" onClick={handleImport} className="rounded-2xl bg-slate-950 px-5 py-3 text-white font-semibold transition hover:bg-slate-800">
            Import now
          </button>
        ) : null}
      </div>

      {preview.length > 0 ? (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-slate-950">Preview</h2>
          <p className="text-sm text-slate-500">First {preview.length} products from the uploaded file.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Size</th>
                  <th className="p-3 text-left">SKU</th>
                  <th className="p-3 text-left">Stock</th>
                  <th className="p-3 text-left">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((product) => {
                  const inventoryItem = inventoryPreview.find((item) => item.productId === product.id);
                  return (
                    <tr key={product.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="p-3 text-slate-950">{product.name}</td>
                      <td className="p-3 text-slate-600">{product.sizeGauge}</td>
                      <td className="p-3 text-slate-600">{product.sku}</td>
                      <td className="p-3 text-slate-600">{inventoryItem?.stock ?? 0}</td>
                      <td className="p-3 text-slate-600">{product.supplier || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
