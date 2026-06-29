export type Role = "admin" | "bartender";
export type LocationType = "bar" | "storage";
export type ShiftType = "first" | "second";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
};

export type Product = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  package_size: string | null;
  serving_size: number | null;
  purchase_price: number | null;
  sale_price: number | null;
  vat_rate: number | null;
  coffee_per_kg: number | null;
  min_bar_stock: number | null;
  min_storage_stock: number | null;
  active: boolean;
};

export type StockRow = {
  product_id: string;
  location: LocationType;
  quantity: number;
  products?: Product;
};
