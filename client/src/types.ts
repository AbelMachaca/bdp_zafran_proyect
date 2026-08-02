export type Health = {
  ok: boolean; configured: boolean; databaseConfigured?: boolean; automationsConfigured?: boolean;
  storeUrl: string; mode: string;
};
export type AutomationType = 'post_purchase' | 'cross_sell';
export type AutomationStatus = 'scheduled' | 'ready' | 'processing' | 'sent' | 'cancelled' | 'skipped' | 'failed';
export type AutomationProduct = {
  product_id?: number; variation_id?: number; name: string; sku?: string; quantity: number; total?: string;
  categories?: Array<{ id?: number; name: string }>;
};
export type AutomationJob = {
  id: string; automation_type: AutomationType; trigger_order_id: string; due_at: string; status: AutomationStatus;
  attempts: number; last_error?: string | null; created_at: string; updated_at: string; sent_at?: string | null;
  cancelled_at?: string | null; remaining_seconds: number | string; email: string; first_name?: string; last_name?: string;
  phone?: string; current_marketing_opt_in: boolean; order_number?: string; order_status?: string; currency?: string;
  total?: string; date_created?: string; processing_at?: string; order_marketing_opt_in: boolean; consent_source?: string;
  latest_attempt_outcome?: string | null; latest_attempt_http_status?: number | null; latest_attempt_error?: string | null;
  latest_attempt_at?: string | null;
  payload?: {
    order_id?: number; order_number?: string; currency?: string; total?: string;
    products?: AutomationProduct[]; categories?: string[];
  };
};
export type AutomationJobsResponse = {
  summary: {
    total: number; scheduled: number; ready: number; sent: number; cancelled: number; problems: number;
    post_purchase: number; cross_sell: number;
  };
  data: AutomationJob[]; total: number; page: number; perPage: number;
  mode: { enabled: boolean; emblueEnabled: boolean };
};
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
