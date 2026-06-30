import { queueCloudSync } from "./cloud-sync";

export type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  brandUses?: string;
  model?: string;
  sizeGauge?: string;
  orderQty?: number;
  minimum?: number;
  ordered?: boolean;
  orderedDate?: string;
  productCode?: string;
  supplier?: string;
  lastBuyPrice?: number;
};

export type InventoryItem = {
  id: number;
  productId: number;
  variant: string;
  stock: number;
  location: string;
};

export type Transaction = {
  id: number;
  productId: number;
  variant: string;
  type: "RESTOCK" | "REMOVE";
  quantity: number;
  date: number;
};

export type PurchaseOrder = {
  id: number;
  productId: number;
  productName: string;
  variant: string;
  quantity: number;
  orderedDate: string;
  supplier?: string;
  lastBuyPrice?: number;
  status: "OPEN" | "DELIVERED_PENDING" | "CLOSED";
};

export type Supplier = {
  id: number;
  name: string;
  email: string;
  phone: string;
  category: string;
};

const PRODUCT_CATEGORIES = [
  "Drum Skins",
  "Guitar Strings",
  "Drum Sticks",
  "Misc",
] as const;

function normalizeProductCategory(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "Misc";

  const normalized = raw.toLowerCase();

  if (normalized === "drum skins" || normalized === "drum skin") return "Drum Skins";
  if (normalized === "guitar strings" || normalized === "guitar string") return "Guitar Strings";
  if (normalized === "drum sticks" || normalized === "drum stick") return "Drum Sticks";
  if (normalized === "misc") return "Misc";

  if (
    /(drum\s?head|drum\s?skin|snare\s?head|tom\s?head|kick\s?head|bass\s?drum\s?head|remo|evans|aquarian|emperor)/.test(
      normalized
    )
  ) {
    return "Drum Skins";
  }

  if (
    /(guitar\s?string|string\s?set|electric\s?string|acoustic\s?string|bass\s?string|ernie\s?ball|daddario|elixir|phosphor\s?bronze|nickel\s?wound)/.test(
      normalized
    )
  ) {
    return "Guitar Strings";
  }

  if (
    /(drum\s?stick|drumstick|stick\s?pair|vic\s?firth|promark|vater|ahead|nylon\s?tip|wood\s?tip|\b[257]a\b|\b2b\b|\b5b\b)/.test(
      normalized
    )
  ) {
    return "Drum Sticks";
  }

  return "Misc";
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    category: normalizeProductCategory(product.category),
  };
}

/* ---------------- SAFE STORAGE ---------------- */
function safeNumber(value: any): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}
function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
}

function safeSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  queueCloudSync();
}

/* ---------------- PRODUCTS ---------------- */

export function getProducts(): Product[] {
  const products = safeGet<Product[]>("mgb-products", []);
  return products.map(normalizeProduct);
}

export function saveProducts(products: Product[]) {
  safeSet("mgb-products", products.map(normalizeProduct));
}

export function addProduct(product: Product) {
  const updated = [product, ...getProducts()];
  saveProducts(updated);
  return updated;
}

export function addInventoryItems(items: InventoryItem[]) {
  const updated = [...items, ...getInventory()];
  saveInventory(updated);
  return updated;
}

export function getProductById(id: number) {
  return getProducts().find((p) => p.id === id);
}

/* ---------------- INVENTORY ---------------- */

export function getInventory(): InventoryItem[] {
  return safeGet<InventoryItem[]>("mgb-inventory", []);
}

export function saveInventory(items: InventoryItem[]) {
  safeSet("mgb-inventory", items);
}

/* ---------------- TRANSACTIONS ---------------- */

export function getTransactions(): Transaction[] {
  return safeGet<Transaction[]>("mgb-transactions", []);
}

export function saveTransactions(items: Transaction[]) {
  safeSet("mgb-transactions", items);
}

export type Activity = {
  id: number;
  date: number;
  message: string;
};

export function getActivityLog(): Activity[] {
  return safeGet<Activity[]>("mgb-activity-log", []);
}

export function saveActivityLog(items: Activity[]) {
  safeSet("mgb-activity-log", items);
}

export function addActivity(message: string) {
  const current = getActivityLog();
  const next: Activity = {
    id: Date.now(),
    date: Date.now(),
    message,
  };
  const updated = [next, ...current];
  saveActivityLog(updated);
  return updated;
}

export function clearActivityLog() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("mgb-activity-log");
  queueCloudSync();
}

export function getOrders(): PurchaseOrder[] {
  return safeGet<PurchaseOrder[]>("mgb-orders", []);
}

export function saveOrders(orders: PurchaseOrder[]) {
  safeSet("mgb-orders", orders);
}

export function addOrder(order: PurchaseOrder) {
  const updated = [order, ...getOrders()];
  saveOrders(updated);
  return updated;
}

export function updateOrder(order: PurchaseOrder) {
  const updated = getOrders().map((item) =>
    item.id === order.id ? order : item
  );
  saveOrders(updated);
  return updated;
}

export function removeOrder(productId: number) {
  const updated = getOrders().filter((order) => order.productId !== productId);
  saveOrders(updated);
  return updated;
}

export function getSuppliers(): Supplier[] {
  return safeGet<Supplier[]>("mgb-suppliers", []);
}

export function saveSuppliers(suppliers: Supplier[]) {
  safeSet("mgb-suppliers", suppliers);
}

export function addSupplier(supplier: Supplier) {
  const updated = [supplier, ...getSuppliers()];
  saveSuppliers(updated);
  return updated;
}

/* ---------------- TRANSACTION LOGGER ---------------- */

export function addTransaction(
  t: Omit<Transaction, "id" | "date">
) {
  const current = getTransactions();

  const newTransaction: Transaction = {
    id: Date.now(),
    date: Date.now(),
    ...t,
  };

  const updated = [newTransaction, ...current];

  saveTransactions(updated);

  return updated;
}

/* ---------------- VALIDATION ---------------- */

export function validateInventoryItem(
  item: InventoryItem,
  products: Product[]
): boolean {
  const product = products.find((p) => p.id === item.productId);
  if (!product) return false;

  return product.sizeGauge === item.variant;
}