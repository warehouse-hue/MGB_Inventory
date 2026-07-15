import { queueCloudSync } from "./cloud-sync";

export type TransactionType = "RESTOCK" | "REMOVE" | "ADJUST";

export type Transaction = {
  id: number;
  type: TransactionType;
  productId: number;
  inventoryItemId?: number;
  productName?: string;
  variant?: string;
  quantity: number;
  previousStock?: number;
  newStock?: number;
  date: number;
};

const STORAGE_KEY = "mgb-transactions";

/**
 * Load transactions safely from localStorage
 */
export function getTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];

  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save full transaction list
 */
function saveTransactions(transactions: Transaction[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  window.dispatchEvent(new Event("mgb-storage-updated"));
  queueCloudSync();
}

/**
 * Add transaction (main function you use everywhere)
 */
export function addTransaction(transaction: Transaction) {
  const current = getTransactions();
  const updated = [transaction, ...current];
  saveTransactions(updated);
}

export function updateTransaction(transaction: Transaction) {
  const current = getTransactions();
  const updated = current.map((item) => (item.id === transaction.id ? transaction : item));
  saveTransactions(updated);
}

export function removeTransaction(id: number) {
  const current = getTransactions();
  const updated = current.filter((item) => item.id !== id);
  saveTransactions(updated);
}

/**
 * Get recent transactions
 */
export function getRecentTransactions(limit = 50) {
  const current = getTransactions();
  return current.slice(0, limit);
}

/**
 * Clear all transactions
 */
export function clearTransactions() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("mgb-storage-updated"));
  queueCloudSync();
}