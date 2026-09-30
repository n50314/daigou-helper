
export type ShippingMethod = '賣貨便' | '面交' | '店到店' | '宅配' | '其他';
export type OrderStatus = 'unpaid' | 'paid' | 'shipping' | 'completed' | 'cancelled';

// Dynamic Product Type Configuration
export interface ProductTypeConfig {
  id: string;
  label: string;        // e.g. "服飾配件", "一般商品"
  color: string;        // Tailwind color class key e.g. "blue", "pink"
  requiresMember: boolean; // Does this type need member selection?
  requiresSpecs: boolean;  // Does this type need size/color inputs?
}

// Dynamic Member/Group Configuration
export interface MemberGroup {
  id: string;
  name: string;         // 品牌或系列；沿用舊欄位以保持備份相容
  subgroups: {
    name: string;       // 選項分組
    members: string[];  // e.g. ["森田ひかる", ...]
  }[];
}

export interface Batch {
  id: string;
  name: string;      // e.g., "9月日本連線"
  exchangeRate: number;
  isActive: boolean; // Is this the currently active batch for taking orders?
  allowedGroupIds?: string[]; // IDs of MemberGroups allowed in this batch
  currency?: string;
  costRate?: number;
  archived?: boolean;
  missingMetadata?: boolean; // Display-only placeholder for an orphaned legacy batch.
}

export interface Product {
  id: string;
  batchId: string;   // Link to a specific batch
  name: string;
  originalPrice: number; // Price in foreign currency
  productType: string;   // Now refers to ProductTypeConfig.id
  note?: string;
  archived?: boolean;
}

export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;        // TWD price per unit
  originalUnitPrice: number; // Foreign currency price per unit
  totalPrice: number;       // Total TWD price
  spec?: string; // Stores "Size/Color" or "Member Name"
}

export interface Order {
  id: string;
  batchId: string; // Link order to a batch
  customerName: string;
  items: CartItem[];
  totalAmount: number;
  shippingMethod: ShippingMethod;
  status: OrderStatus;
  createdAt: string; // ISO string
}

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface UserProfile {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
}

export const SHIPPING_METHODS: ShippingMethod[] = ['賣貨便', '店到店', '宅配', '面交', '其他'];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'F'];

// Default Colors for UI
export const TYPE_COLORS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  red: 'bg-red-50 text-red-700 border-red-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
  green: 'bg-green-50 text-green-700 border-green-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  purple: 'bg-purple-50 text-purple-700 border-purple-100',
  pink: 'bg-pink-50 text-pink-700 border-pink-100',
};
