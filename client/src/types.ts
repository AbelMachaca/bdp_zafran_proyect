export type Health = { ok: boolean; configured: boolean; storeUrl: string; mode: string };
export type Dashboard = {
  orders: number; validOrders: number; paidOrders: number; revenue: number; averageTicket: number; discounts: number;
  shipping: number; taxes: number; uniqueCustomers: number; byStatus: Record<string, number>;
  byDay: { date: string; total: number }[]; payments: { name: string; count: number }[];
  topProducts: { id: number; name: string; quantity: number; revenue: number }[];
  financials: Financials;
  periods: { current: Period; previous: Period; previousYear: Period; custom?: Period };
  comparisons: { previous: Comparison; previousYear: Comparison; custom?: Comparison };
  selectedStatuses: string[];
  attribution: Attribution;
  geography: Geography;
  generatedAt: string; cached: boolean;
};
export type Period = { from: string; to: string };
export type Comparison = {
  revenue: number; orders: number; validOrders: number; averageTicket: number; uniqueCustomers: number;
  byDay: { date: string; total: number }[];
  delta: { revenue: number | null; orders: number | null; averageTicket: number | null; uniqueCustomers: number | null };
};
export type Financials = {
  productSubtotalExTax: number; productSubtotalTax: number; productNetExTax: number; productTax: number;
  discountsExTax: number; discountTax: number; shippingExTax: number; shippingTax: number;
  feesExTax: number; feesTax: number; taxesTotal: number; chargedTotal: number; refunds: number; netCollected: number;
  wooGrossSales: number; wooNetSales: number;
};
export type Aggregate = { name: string; orders: number; revenue: number; averageTicket: number };
export type Attribution = { attributedOrders: number; attributionRate: number; channels: Aggregate[]; sources: Aggregate[]; campaigns: Aggregate[]; devices: Aggregate[]; landingPages: Aggregate[] };
export type Geography = { provinces: Aggregate[]; cities: Aggregate[]; postcodes: Aggregate[] };
export type Order = {
  id: number; number: string; status: string; currency: string; date_created: string; date_paid?: string;
  total: string; subtotal?: string; discount_total: string; shipping_total: string; total_tax: string;
  payment_method_title: string; transaction_id?: string; customer_id: number; customer_note?: string;
  billing: Address; shipping: Address; line_items: LineItem[]; shipping_lines?: Array<Record<string, unknown>>;
  coupon_lines?: Array<{ code: string; discount: string }>; fee_lines?: Array<Record<string, unknown>>;
  tax_lines?: Array<Record<string, unknown>>; meta_data?: Meta[];
  _attribution?: { source: string; channel: string; campaign: string; medium: string; device: string; landing: string; province: string; city: string };
  _related?: { notes: Array<Record<string, unknown>>; refunds: Array<Record<string, unknown>> };
  [key: string]: unknown;
};
export type Address = { first_name?: string; last_name?: string; company?: string; address_1?: string; address_2?: string; city?: string; state?: string; postcode?: string; country?: string; email?: string; phone?: string };
export type LineItem = { id: number; name: string; product_id: number; variation_id: number; quantity: number; sku?: string; subtotal: string; total: string; total_tax?: string; meta_data?: Meta[]; image?: { src?: string } };
export type Meta = { id?: number; key: string; value: unknown };
export type CapabilityResponse = {
  namespaces: string[];
  capabilities: Array<{ id: string; group: string; title: string; description: string; path: string; sensitive?: boolean; routeDetected: boolean; access: { status: string; detail?: string } | null }>;
  extensions: Array<{ id: string; title: string; namespace: string; description: string; detected: boolean }>;
};
