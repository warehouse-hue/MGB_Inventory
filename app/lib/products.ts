export type Product = {
  id: number;
  name: string;
  category: string;
  sku: string;
  description?: string;
  image?: string;
};

let products: Product[] = [
  {
    id: 1,
    name: "Evans G2 10\"",
    category: "Drum Heads",
    sku: "EV-G2-10",
  },
  {
    id: 2,
    name: "Evans G2 14\"",
    category: "Drum Heads",
    sku: "EV-G2-14",
  },
  {
    id: 3,
    name: "Remo Emperor 14\"",
    category: "Drum Heads",
    sku: "RM-EMP-14",
  },
  {
    id: 4,
    name: "Gaffer Tape",
    category: "Consumables",
    sku: "GF-TAPE-001",
  },
];

export function getProducts(): Product[] {
  return products;
}

export function getProductById(id: number): Product | undefined {
  return products.find((p) => p.id === id);
}

export function addProduct(product: Product) {
  products = [product, ...products];
}

export function updateProduct(id: number, data: Partial<Product>) {
  products = products.map((p) =>
    p.id === id ? { ...p, ...data } : p
  );
}

export function deleteProduct(id: number) {
  products = products.filter((p) => p.id !== id);
}