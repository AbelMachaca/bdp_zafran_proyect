import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from './database.js';
import { config } from './config.js';
import { wooGet } from './woocommerce.js';

type WooMeta = { key?: string; value?: unknown };
type WooLineItem = {
  id?: number; product_id?: number; variation_id?: number; name?: string; sku?: string;
  quantity?: number; subtotal?: string; total?: string; meta_data?: WooMeta[];
  _categories?: Array<{ id: number; name: string }>;
};
type RetentionAutomation = 'cross_sell' | 'win_back';
type StoredJobPayload = {
  order_id?: number; order_number?: string; currency?: string; total?: string;
  products?: Array<{
    product_id?: number; variation_id?: number; name?: string; sku?: string;
    quantity?: number; total?: string; categories?: Array<{ id?: number; name?: string }>;
  }>;
  categories?: string[]; marketing_categories?: MarketingCategory[];
  primary_marketing_category?: MarketingCategory;
  marketing_category_amounts?: { granolas?: number; barras?: number };
  marketing_category_quantities?: { granolas?: number; barras?: number };
  bought_granolas?: boolean; bought_barras?: boolean;
};
type EmblueJobRow = {
  id: string; due_at: Date | string; attempts: number; payload: StoredJobPayload;
  contact_id: string; email: string; first_name: string; last_name: string; phone: string;
  marketing_opt_in: boolean; marketing_opt_in_at: Date | string | null;
  trigger_order_id: string; order_number: string; order_status: string; currency: string | null;
  order_total: string | null; processing_at: Date | string | null;
};
export type MarketingCategory = 'granolas' | 'barras' | 'sin_categoria_clara';
export type MarketingCategorySummary = {
  categories: MarketingCategory[];
  primary: MarketingCategory;
  amounts: { granolas: number; barras: number };
  quantities: { granolas: number; barras: number };
};
export type WooAutomationOrder = {
  id?: number; number?: string; status?: string; currency?: string; total?: string;
  customer_id?: number; date_created?: string; date_created_gmt?: string; date_modified?: string; date_modified_gmt?: string;
  date_paid?: string | null; date_paid_gmt?: string | null;
  billing?: { email?: string; first_name?: string; last_name?: string; phone?: string };
  line_items?: WooLineItem[]; meta_data?: WooMeta[];
  [key: string]: unknown;
};

const invalidStatuses = new Set(['cancelled', 'failed', 'refunded', 'trash']);
const productCategoryCache = new Map<number, { expires: number; categories: Array<{ id: number; name: string }> }>();
const testRequests = new Map<string, { windowStartedAt: number; count: number }>();

export async function enrichOrderCategories(order: WooAutomationOrder) {
  const productIds = [...new Set((order.line_items || []).map((item) => Number(item.product_id || 0)).filter(Boolean))].slice(0, 30);
  const categoriesByProduct = new Map<number, Array<{ id: number; name: string }>>();
  await Promise.all(productIds.map(async (productId) => {
    const cached = productCategoryCache.get(productId);
    if (cached && cached.expires > Date.now()) return categoriesByProduct.set(productId, cached.categories);
    try {
      const product = await wooGet<{ categories?: Array<{ id?: number; name?: string }> }>(`products/${productId}`);
      const categories = (product.data.categories || [])
        .filter((category) => Number.isInteger(category.id) && category.name)
        .map((category) => ({ id: Number(category.id), name: String(category.name) }));
      productCategoryCache.set(productId, { expires: Date.now() + 6 * 60 * 60_000, categories });
      categoriesByProduct.set(productId, categories);
    } catch {
      categoriesByProduct.set(productId, []);
    }
  }));
  for (const item of order.line_items || []) item._categories = categoriesByProduct.get(Number(item.product_id || 0)) || [];
}

export function marketingConsent(metaItems: WooMeta[] = []) {
  const meta = new Map(metaItems.map((item) => [String(item.key || ''), item.value]));
  const canonical = normalizedBoolean(meta.get('_bdp_newsletter_opt_in'));
  if (canonical !== null) return { allowed: canonical, source: '_bdp_newsletter_opt_in' };
  for (const key of ['billing_opt-in', '_billing_opt-in', '_billing_opt-infmebilling']) {
    const value = normalizedBoolean(meta.get(key));
    if (value !== null) return { allowed: value, source: key };
  }
  return { allowed: false, source: null };
}

export function retainedMarketingConsent(previouslyAllowed: boolean, allowedInOrder: boolean) {
  return previouslyAllowed || allowedInOrder;
}

export function automationDueAt(type: 'post_purchase' | RetentionAutomation, processingAt: Date) {
  const delayDays = type === 'post_purchase' ? 10 : type === 'cross_sell' ? 35 : 90;
  return addDays(processingAt, delayDays);
}

export function marketingCategories(order: WooAutomationOrder): MarketingCategory[] {
  return marketingCategorySummary(order).categories;
}

export function marketingCategorySummary(order: WooAutomationOrder): MarketingCategorySummary {
  const scores = (order.line_items || []).map((item, index) => {
    const searchable = [item.name || '', ...(item._categories || []).map((category) => category.name)]
      .map(normalizedText).join(' ');
    return {
      index,
      granolas: /\bgranolas?\b/.test(searchable),
      barras: /\bbarras?\b/.test(searchable),
      amount: numeric(item.total) || 0,
      quantity: numeric(item.quantity) || 0,
    };
  });
  const amount = (category: 'granolas' | 'barras') => scores.reduce((sum, item) => sum + (item[category] ? item.amount : 0), 0);
  const quantity = (category: 'granolas' | 'barras') => scores.reduce((sum, item) => sum + (item[category] ? item.quantity : 0), 0);
  const amounts = { granolas: amount('granolas'), barras: amount('barras') };
  const quantities = { granolas: quantity('granolas'), barras: quantity('barras') };
  const categories: MarketingCategory[] = [];
  if (scores.some((item) => item.granolas)) categories.push('granolas');
  if (scores.some((item) => item.barras)) categories.push('barras');
  if (!categories.length) return { categories: ['sin_categoria_clara'], primary: 'sin_categoria_clara', amounts, quantities };
  if (categories.length === 1) return { categories, primary: categories[0] || 'sin_categoria_clara', amounts, quantities };
  let primary: MarketingCategory;
  if (amounts.granolas !== amounts.barras) primary = amounts.granolas > amounts.barras ? 'granolas' : 'barras';
  else if (quantities.granolas !== quantities.barras) primary = quantities.granolas > quantities.barras ? 'granolas' : 'barras';
  else {
    const firstGranola = scores.find((item) => item.granolas)?.index ?? Number.MAX_SAFE_INTEGER;
    const firstBar = scores.find((item) => item.barras)?.index ?? Number.MAX_SAFE_INTEGER;
    primary = firstGranola <= firstBar ? 'granolas' : 'barras';
  }
  return { categories, primary, amounts, quantities };
}

export async function persistWooOrder(client: PoolClient, order: WooAutomationOrder) {
  if (!Number.isInteger(order.id) || Number(order.id) <= 0) throw new Error('El webhook no contiene un ID de pedido válido');
  const orderId = Number(order.id);
  const status = String(order.status || 'unknown');
  const email = String(order.billing?.email || '').trim().toLowerCase();
  const consent = marketingConsent(order.meta_data);
  let effectiveConsent = consent.allowed;
  const existing = await client.query<{ status: string; processing_at: Date | null; contact_id: string | null }>(
    'SELECT status, processing_at, contact_id FROM automation_orders WHERE woo_order_id = $1 FOR UPDATE', [orderId],
  );
  const previous = existing.rows[0];
  const enteredProcessing = status === 'processing' && previous?.status !== 'processing';
  const estimatedCompleted = status === 'completed' && !previous?.processing_at
    ? wooDate(order.date_paid, order.date_paid_gmt) || wooDate(order.date_modified, order.date_modified_gmt)
    : null;
  const processingAt = enteredProcessing ? new Date() : previous?.processing_at || estimatedCompleted;

  let contactId: string | null = previous?.contact_id || null;
  if (email) {
    const contact = await client.query<{ id: string; marketing_opt_in: boolean }>(`
      INSERT INTO automation_contacts
        (email, woo_customer_id, first_name, last_name, phone, marketing_opt_in, marketing_opt_in_source,
         marketing_opt_in_at, raw)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $6 THEN NOW() ELSE NULL END, $8::jsonb)
      ON CONFLICT (email) DO UPDATE SET
        woo_customer_id = COALESCE(EXCLUDED.woo_customer_id, automation_contacts.woo_customer_id),
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone,
        marketing_opt_in = CASE WHEN automation_contacts.marketing_opt_out_at IS NOT NULL THEN FALSE
          ELSE automation_contacts.marketing_opt_in OR EXCLUDED.marketing_opt_in END,
        marketing_opt_in_source = CASE WHEN automation_contacts.marketing_opt_out_at IS NULL
          AND EXCLUDED.marketing_opt_in AND NOT automation_contacts.marketing_opt_in
          THEN EXCLUDED.marketing_opt_in_source ELSE automation_contacts.marketing_opt_in_source END,
        marketing_opt_in_at = CASE
          WHEN automation_contacts.marketing_opt_out_at IS NULL
            AND EXCLUDED.marketing_opt_in AND NOT automation_contacts.marketing_opt_in THEN NOW()
          ELSE automation_contacts.marketing_opt_in_at END,
        raw = EXCLUDED.raw,
        updated_at = NOW()
      RETURNING id, marketing_opt_in
    `, [
      email, order.customer_id || null, order.billing?.first_name || '', order.billing?.last_name || '',
      order.billing?.phone || '', consent.allowed, consent.source, JSON.stringify(order.billing || {}),
    ]);
    contactId = contact.rows[0]?.id || null;
    if (contact.rows[0]) effectiveConsent = contact.rows[0].marketing_opt_in;
  } else if (contactId) {
    const contact = await client.query<{ marketing_opt_in: boolean }>(
      'SELECT marketing_opt_in FROM automation_contacts WHERE id = $1', [contactId],
    );
    effectiveConsent = contact.rows[0]?.marketing_opt_in || false;
  }

  await client.query(`
    INSERT INTO automation_orders
      (woo_order_id, order_number, contact_id, status, currency, total, date_created, date_modified, date_paid,
       processing_at, marketing_opt_in, marketing_opt_in_source, raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
    ON CONFLICT (woo_order_id) DO UPDATE SET
      order_number = EXCLUDED.order_number,
      contact_id = COALESCE(EXCLUDED.contact_id, automation_orders.contact_id),
      status = EXCLUDED.status,
      currency = EXCLUDED.currency,
      total = EXCLUDED.total,
      date_created = EXCLUDED.date_created,
      date_modified = EXCLUDED.date_modified,
      date_paid = EXCLUDED.date_paid,
      processing_at = COALESCE(EXCLUDED.processing_at, automation_orders.processing_at),
      marketing_opt_in = EXCLUDED.marketing_opt_in,
      marketing_opt_in_source = EXCLUDED.marketing_opt_in_source,
      raw = EXCLUDED.raw,
      updated_at = NOW()
  `, [
    orderId, order.number || String(orderId), contactId, status, order.currency || null, numeric(order.total),
    wooDate(order.date_created, order.date_created_gmt), wooDate(order.date_modified, order.date_modified_gmt),
    wooDate(order.date_paid, order.date_paid_gmt), processingAt,
    consent.allowed, consent.source, JSON.stringify(order),
  ]);

  await client.query('DELETE FROM automation_order_items WHERE woo_order_id = $1', [orderId]);
  for (const item of order.line_items || []) {
    if (!Number.isInteger(item.id)) continue;
    await client.query(`
      INSERT INTO automation_order_items
        (woo_order_id, woo_line_item_id, product_id, variation_id, name, sku, quantity, subtotal, total,
         category_ids, category_names, raw)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
    `, [
      orderId, item.id, item.product_id || null, item.variation_id || null, item.name || '', item.sku || '',
      numeric(item.quantity) ?? 0, numeric(item.subtotal), numeric(item.total),
      (item._categories || []).map((category) => category.id), (item._categories || []).map((category) => category.name),
      JSON.stringify(item),
    ]);
  }

  if (invalidStatuses.has(status)) {
    await cancelOrderJobs(client, orderId, `Pedido en estado ${status}`);
    if (contactId) await restorePreviousRetention(client, contactId, orderId);
    return { orderId, status, action: 'cancelled' as const };
  }

  const activeFrom = config.automationsActiveFrom;
  if (!contactId || !processingAt || !activeFrom || processingAt < activeFrom) {
    return { orderId, status, action: 'stored' as const };
  }

  if (status === 'processing' || status === 'completed') {
    await ensurePostPurchase(client, contactId, orderId, processingAt, order);
  }
  if (enteredProcessing) {
    await resetRetention(client, contactId, orderId, processingAt, order, effectiveConsent);
  }
  return { orderId, status, action: 'scheduled' as const };
}

async function ensurePostPurchase(client: PoolClient, contactId: string, orderId: number, processingAt: Date, order: WooAutomationOrder) {
  await client.query(`
    INSERT INTO automation_jobs
      (automation_type, contact_id, trigger_order_id, dedupe_key, due_at, payload)
    VALUES ('post_purchase', $1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (dedupe_key) DO NOTHING
  `, [contactId, orderId, `post_purchase:${orderId}`, automationDueAt('post_purchase', processingAt), JSON.stringify(jobPayload(order))]);
}

async function resetRetention(
  client: PoolClient, contactId: string, orderId: number, processingAt: Date, order: WooAutomationOrder, allowed: boolean,
) {
  await client.query(`
    UPDATE automation_jobs SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(),
      last_error = 'Reprogramado por una compra posterior'
    WHERE contact_id = $1 AND automation_type IN ('cross_sell', 'win_back')
      AND status IN ('scheduled', 'ready') AND trigger_order_id <> $2
  `, [contactId, orderId]);
  if (!allowed) return;
  await scheduleRetention(client, 'cross_sell', contactId, orderId, processingAt, order);
  await scheduleRetention(client, 'win_back', contactId, orderId, processingAt, order);
}

async function scheduleRetention(
  client: PoolClient, type: RetentionAutomation, contactId: string, orderId: number,
  processingAt: Date, order: WooAutomationOrder,
) {
  await client.query(`
    INSERT INTO automation_jobs
      (automation_type, contact_id, trigger_order_id, dedupe_key, due_at, payload)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    ON CONFLICT (dedupe_key) DO UPDATE SET
      due_at = EXCLUDED.due_at,
      status = 'scheduled',
      payload = EXCLUDED.payload,
      cancelled_at = NULL,
      last_error = NULL,
      updated_at = NOW()
    WHERE automation_jobs.status IN ('cancelled', 'skipped', 'failed')
  `, [type, contactId, orderId, `${type}:${orderId}`, automationDueAt(type, processingAt), JSON.stringify(jobPayload(order))]);
}

async function restorePreviousRetention(client: PoolClient, contactId: string, excludedOrderId: number) {
  const activeFrom = config.automationsActiveFrom;
  if (!activeFrom) return;
  const candidate = await client.query<{ woo_order_id: string; processing_at: Date; raw: WooAutomationOrder }>(`
    SELECT woo_order_id, processing_at, raw
    FROM automation_orders o
    WHERE o.contact_id = $1 AND o.woo_order_id <> $2
      AND status IN ('processing', 'completed')
      AND processing_at >= $3
      AND EXISTS (SELECT 1 FROM automation_contacts c WHERE c.id = o.contact_id AND c.marketing_opt_in = TRUE)
    ORDER BY processing_at DESC LIMIT 1
  `, [contactId, excludedOrderId, activeFrom]);
  const row = candidate.rows[0];
  if (row) {
    await scheduleRetention(client, 'cross_sell', contactId, Number(row.woo_order_id), row.processing_at, row.raw);
    await scheduleRetention(client, 'win_back', contactId, Number(row.woo_order_id), row.processing_at, row.raw);
  }
}

async function cancelOrderJobs(client: PoolClient, orderId: number, reason: string) {
  await client.query(`
    UPDATE automation_jobs SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(), last_error = $2
    WHERE trigger_order_id = $1 AND status IN ('scheduled', 'ready')
  `, [orderId, reason]);
}

function jobPayload(order: WooAutomationOrder) {
  const segment = marketingCategorySummary(order);
  return {
    order_id: order.id,
    order_number: order.number || String(order.id),
    currency: order.currency,
    total: order.total,
    products: (order.line_items || []).map((item) => ({
      product_id: item.product_id, variation_id: item.variation_id, name: item.name,
      sku: item.sku, quantity: item.quantity, total: item.total, categories: item._categories || [],
    })),
    categories: [...new Set((order.line_items || []).flatMap((item) => (item._categories || []).map((category) => category.name)))],
    marketing_categories: segment.categories,
    primary_marketing_category: segment.primary,
    marketing_category_amounts: segment.amounts,
    marketing_category_quantities: segment.quantities,
    bought_granolas: segment.categories.includes('granolas'),
    bought_barras: segment.categories.includes('barras'),
  };
}

export function buildEmbluePostPurchasePayload(job: EmblueJobRow) {
  return buildEmbluePayload(job, 'post_purchase');
}

export function buildEmblueCrossSellPayload(job: EmblueJobRow) {
  return buildEmbluePayload(job, 'cross_sell');
}

function buildEmbluePayload(job: EmblueJobRow, automationType: 'post_purchase' | 'cross_sell') {
  const stored = job.payload || {};
  return {
    event_id: `zafran-${automationType.replace('_', '-')}-${job.id}`,
    schema_version: 1,
    automation_type: automationType,
    email: job.email,
    first_name: job.first_name || '',
    last_name: job.last_name || '',
    phone: job.phone || '',
    marketing_opt_in: job.marketing_opt_in,
    marketing_opt_in_at: isoDate(job.marketing_opt_in_at),
    order_id: Number(job.trigger_order_id),
    order_number: job.order_number || String(job.trigger_order_id),
    order_status: job.order_status,
    currency: job.currency || stored.currency || 'ARS',
    order_total: numeric(job.order_total ?? stored.total) || 0,
    order_processing_at: isoDate(job.processing_at),
    scheduled_at: isoDate(job.due_at),
    marketing_category: stored.primary_marketing_category || 'sin_categoria_clara',
    marketing_categories: (stored.marketing_categories || ['sin_categoria_clara']).join(', '),
    bought_granolas: Boolean(stored.bought_granolas),
    bought_barras: Boolean(stored.bought_barras),
    granolas_amount: numeric(stored.marketing_category_amounts?.granolas) || 0,
    barras_amount: numeric(stored.marketing_category_amounts?.barras) || 0,
    granolas_quantity: numeric(stored.marketing_category_quantities?.granolas) || 0,
    barras_quantity: numeric(stored.marketing_category_quantities?.barras) || 0,
    woocommerce_categories: (stored.categories || []).join(', '),
    products: (stored.products || []).map((product) => ({
      product_id: product.product_id || null,
      variation_id: product.variation_id || null,
      name: product.name || '',
      sku: product.sku || '',
      quantity: numeric(product.quantity) || 0,
      total: numeric(product.total) || 0,
      categories: (product.categories || []).map((category) => category.name).filter(Boolean).join(', '),
    })),
  };
}

export function startAutomationWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await pool.query(`
        UPDATE automation_jobs SET status = 'scheduled', locked_at = NULL, updated_at = NOW(),
          last_error = COALESCE(last_error, 'Intento anterior interrumpido; reprogramado automáticamente')
        WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '15 minutes'
      `);
      await pool.query(`
        UPDATE automation_jobs j
        SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(),
          last_error = CASE
            WHEN o.status IN ('cancelled', 'failed', 'refunded', 'trash') THEN 'El pedido disparador dejó de ser válido'
            WHEN c.email = '' THEN 'El contacto no tiene correo electrónico'
            WHEN NOT c.marketing_opt_in THEN 'El contacto no tiene consentimiento promocional activo'
            ELSE 'Existe una compra posterior'
          END
        FROM automation_contacts c, automation_orders o
        WHERE j.contact_id = c.id AND j.trigger_order_id = o.woo_order_id
          AND j.status IN ('scheduled', 'ready') AND j.due_at <= NOW()
          AND (
            o.status IN ('cancelled', 'failed', 'refunded', 'trash')
            OR c.email = ''
            OR (j.automation_type IN ('cross_sell', 'win_back') AND (
              NOT c.marketing_opt_in OR EXISTS (
                SELECT 1 FROM automation_orders newer
                WHERE newer.contact_id = j.contact_id
                  AND newer.woo_order_id <> j.trigger_order_id
                  AND newer.status IN ('processing', 'completed')
                  AND newer.processing_at > o.processing_at
              )
            ))
          )
      `);
      if (config.embluePostPurchaseActiveFrom) {
        await pool.query(`
          UPDATE automation_jobs SET status = 'expired', expired_at = NOW(), updated_at = NOW(),
            last_error = 'No enviado: vencido antes de habilitar Postcompra en emBlue'
          WHERE automation_type = 'post_purchase' AND status IN ('scheduled', 'ready')
            AND due_at < $1
        `, [config.embluePostPurchaseActiveFrom]);
      }
      if (config.emblueCrossSellActiveFrom) {
        await pool.query(`
          UPDATE automation_jobs SET status = 'expired', expired_at = NOW(), updated_at = NOW(),
            last_error = 'No enviado: vencido antes de habilitar Cross-sell en emBlue'
          WHERE automation_type = 'cross_sell' AND status IN ('scheduled', 'ready')
            AND due_at < $1
        `, [config.emblueCrossSellActiveFrom]);
      }
      if (postPurchaseDeliveryEnabled()) await processPostPurchaseJobs();
      if (crossSellDeliveryEnabled()) await processCrossSellJobs();
      const result = await pool.query(`
        UPDATE automation_jobs SET status = 'ready', updated_at = NOW()
        WHERE status = 'scheduled' AND due_at <= NOW()
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND NOT ((automation_type = 'post_purchase' AND $1) OR (automation_type = 'cross_sell' AND $2))
        RETURNING id
      `, [postPurchaseDeliveryEnabled(), crossSellDeliveryEnabled()]);
      if (result.rowCount) console.log(`${result.rowCount} automatización(es) listas en modo prueba.`);
    } catch (error) {
      console.error('No se pudo actualizar la cola de automatizaciones.', error);
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), 60_000);
  timer.unref();
}

function postPurchaseDeliveryEnabled() {
  return config.emblueEnabled && config.embluePostPurchaseEnabled
    && Boolean(config.embluePostPurchaseUrl && config.embluePostPurchaseActiveFrom);
}

function crossSellDeliveryEnabled() {
  return config.emblueEnabled && config.emblueCrossSellEnabled
    && Boolean(config.emblueCrossSellUrl && config.emblueCrossSellActiveFrom);
}

async function processPostPurchaseJobs() {
  for (let processed = 0; processed < 20; processed += 1) {
    const job = await claimPostPurchaseJob();
    if (!job) return;
    await deliverPostPurchaseJob(job);
  }
}

async function processCrossSellJobs() {
  for (let processed = 0; processed < 20; processed += 1) {
    const job = await claimCrossSellJob();
    if (!job) return;
    await deliverAutomationJob(
      job, buildEmblueCrossSellPayload(job), config.emblueCrossSellUrl, config.emblueCrossSellToken,
    );
  }
}

async function claimPostPurchaseJob() {
  const result = await pool.query<EmblueJobRow>(`
    WITH candidate AS (
      SELECT j.id
      FROM automation_jobs j
      JOIN automation_contacts c ON c.id = j.contact_id
      JOIN automation_orders o ON o.woo_order_id = j.trigger_order_id
      WHERE j.automation_type = 'post_purchase'
        AND j.status IN ('scheduled', 'ready')
        AND j.due_at <= NOW()
        AND j.due_at >= $1
        AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= NOW())
        AND o.status NOT IN ('cancelled', 'failed', 'refunded', 'trash')
        AND c.email <> ''
      ORDER BY COALESCE(j.next_attempt_at, j.due_at), j.id
      FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE automation_jobs j SET status = 'processing', locked_at = NOW(), updated_at = NOW()
      FROM candidate WHERE j.id = candidate.id RETURNING j.*
    )
    SELECT claimed.id, claimed.due_at, claimed.attempts, claimed.payload,
      c.id AS contact_id, c.email, c.first_name, c.last_name, c.phone,
      c.marketing_opt_in, c.marketing_opt_in_at,
      o.woo_order_id AS trigger_order_id, o.order_number, o.status AS order_status,
      o.currency, o.total AS order_total, o.processing_at
    FROM claimed
    JOIN automation_contacts c ON c.id = claimed.contact_id
    JOIN automation_orders o ON o.woo_order_id = claimed.trigger_order_id
  `, [config.embluePostPurchaseActiveFrom]);
  return result.rows[0] || null;
}

async function claimCrossSellJob() {
  const result = await pool.query<EmblueJobRow>(`
    WITH candidate AS (
      SELECT j.id
      FROM automation_jobs j
      JOIN automation_contacts c ON c.id = j.contact_id
      JOIN automation_orders o ON o.woo_order_id = j.trigger_order_id
      WHERE j.automation_type = 'cross_sell'
        AND j.status IN ('scheduled', 'ready')
        AND j.due_at <= NOW()
        AND j.due_at >= $1
        AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= NOW())
        AND o.status NOT IN ('cancelled', 'failed', 'refunded', 'trash')
        AND c.email <> ''
        AND c.marketing_opt_in
        AND NOT EXISTS (
          SELECT 1 FROM automation_orders newer
          WHERE newer.contact_id = j.contact_id
            AND newer.woo_order_id <> j.trigger_order_id
            AND newer.status IN ('processing', 'completed')
            AND newer.processing_at > o.processing_at
        )
      ORDER BY COALESCE(j.next_attempt_at, j.due_at), j.id
      FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE automation_jobs j SET status = 'processing', locked_at = NOW(), updated_at = NOW()
      FROM candidate WHERE j.id = candidate.id RETURNING j.*
    )
    SELECT claimed.id, claimed.due_at, claimed.attempts, claimed.payload,
      c.id AS contact_id, c.email, c.first_name, c.last_name, c.phone,
      c.marketing_opt_in, c.marketing_opt_in_at,
      o.woo_order_id AS trigger_order_id, o.order_number, o.status AS order_status,
      o.currency, o.total AS order_total, o.processing_at
    FROM claimed
    JOIN automation_contacts c ON c.id = claimed.contact_id
    JOIN automation_orders o ON o.woo_order_id = claimed.trigger_order_id
  `, [config.emblueCrossSellActiveFrom]);
  return result.rows[0] || null;
}

async function deliverPostPurchaseJob(job: EmblueJobRow) {
  await deliverAutomationJob(
    job, buildEmbluePostPurchasePayload(job), config.embluePostPurchaseUrl, config.embluePostPurchaseToken,
  );
}

async function deliverAutomationJob(
  job: EmblueJobRow,
  payload: ReturnType<typeof buildEmbluePayload>,
  url: string,
  token: string,
) {
  const delivery = await postToEmblue(payload, url, token);
  const { httpStatus, responseBody, deliveryError } = delivery;

  const attempt = Number(job.attempts) + 1;
  const success = !deliveryError;
  const exhausted = !success && attempt >= config.emblueMaxAttempts;
  const nextAttemptAt = success || exhausted ? null : new Date(Date.now() + retryDelayMs(attempt));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO automation_attempts (job_id, outcome, http_status, response_body, error)
      VALUES ($1, $2, $3, $4, $5)
    `, [job.id, success ? 'sent' : exhausted ? 'failed' : 'retry_scheduled', httpStatus, responseBody || null, deliveryError || null]);
    await client.query(`
      UPDATE automation_jobs SET status = $2, attempts = $3, last_error = $4,
        next_attempt_at = $5, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
        locked_at = NULL, updated_at = NOW()
      WHERE id = $1
    `, [job.id, success ? 'sent' : exhausted ? 'failed' : 'scheduled', attempt, deliveryError || null, nextAttemptAt]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function postToEmblue(payload: ReturnType<typeof buildEmbluePayload>, url: string, token: string) {
  let httpStatus: number | null = null;
  let responseBody = '';
  let deliveryError = '';
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(config.emblueTimeoutMs),
    });
    httpStatus = response.status;
    responseBody = (await response.text()).slice(0, 4000);
    if (!response.ok) deliveryError = `emBlue Data Lab respondió HTTP ${response.status}`;
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : 'Error desconocido al enviar a emBlue';
  }
  return { httpStatus, responseBody, deliveryError };
}

function retryDelayMs(attempt: number) {
  const minutes = [5, 30, 120, 480, 1440];
  return (minutes[Math.min(attempt - 1, minutes.length - 1)] || 1440) * 60_000;
}

const postPurchaseTestSchema = z.object({
  email: z.string().trim().email().max(254),
  first_name: z.string().trim().max(100).default(''),
  last_name: z.string().trim().max(100).default(''),
  phone: z.string().trim().max(40).default(''),
  order_number: z.string().trim().min(1).max(50),
  currency: z.string().trim().length(3).default('ARS'),
  order_total: z.coerce.number().min(0).max(999_999_999),
  marketing_category: z.enum(['granolas', 'barras', 'sin_categoria_clara']),
  product_name: z.string().trim().min(1).max(200),
  product_sku: z.string().trim().max(100).default(''),
  product_quantity: z.coerce.number().positive().max(10_000),
  product_total: z.coerce.number().min(0).max(999_999_999),
});

export async function postPurchaseTestHandler(req: Request, res: Response, next: NextFunction) {
  return automationTestHandler(req, res, next, 'post_purchase');
}

export async function crossSellTestHandler(req: Request, res: Response, next: NextFunction) {
  return automationTestHandler(req, res, next, 'cross_sell');
}

async function automationTestHandler(
  req: Request, res: Response, next: NextFunction, automationType: 'post_purchase' | 'cross_sell',
) {
  try {
    if (!config.automationTestSecret) return res.status(503).json({ error: 'Falta configurar AUTOMATION_TEST_SECRET' });
    const url = automationType === 'post_purchase' ? config.embluePostPurchaseUrl : config.emblueCrossSellUrl;
    const token = automationType === 'post_purchase' ? config.embluePostPurchaseToken : config.emblueCrossSellToken;
    if (!url) return res.status(503).json({ error: `Falta configurar ${automationType === 'post_purchase' ? 'EMBLUE_POST_PURCHASE_URL' : 'EMBLUE_CROSS_SELL_URL'}` });
    const providedSecret = String(req.header('x-automation-test-secret') || '');
    if (!safeSecretMatch(providedSecret, config.automationTestSecret)) return res.status(401).json({ error: 'Clave de prueba incorrecta' });
    if (!allowTestRequest(`${req.ip || 'unknown'}:${automationType}`)) return res.status(429).json({ error: 'Demasiadas pruebas; esperá un minuto' });
    const input = postPurchaseTestSchema.parse(req.body);
    const now = new Date();
    const categoryName = input.marketing_category === 'granolas' ? 'Granolas'
      : input.marketing_category === 'barras' ? 'Barras' : 'Sin categoría clara';
    const isGranola = input.marketing_category === 'granolas';
    const isBarra = input.marketing_category === 'barras';
    const job: EmblueJobRow = {
      id: `test-${crypto.randomUUID()}`, due_at: addDays(now, automationType === 'post_purchase' ? 10 : 35), attempts: 0,
      contact_id: 'test', email: input.email, first_name: input.first_name, last_name: input.last_name,
      phone: input.phone, marketing_opt_in: true, marketing_opt_in_at: now,
      trigger_order_id: String(Date.now()), order_number: input.order_number, order_status: 'processing',
      currency: input.currency.toUpperCase(), order_total: String(input.order_total), processing_at: now,
      payload: {
        order_number: input.order_number, currency: input.currency.toUpperCase(), total: String(input.order_total),
        categories: [categoryName], marketing_categories: [input.marketing_category],
        primary_marketing_category: input.marketing_category,
        marketing_category_amounts: { granolas: isGranola ? input.product_total : 0, barras: isBarra ? input.product_total : 0 },
        marketing_category_quantities: { granolas: isGranola ? input.product_quantity : 0, barras: isBarra ? input.product_quantity : 0 },
        bought_granolas: isGranola, bought_barras: isBarra,
        products: [{
          product_id: 999999, name: input.product_name, sku: input.product_sku,
          quantity: input.product_quantity, total: String(input.product_total), categories: [{ name: categoryName }],
        }],
      },
    };
    const payload = buildEmbluePayload(job, automationType);
    const delivery = await postToEmblue(payload, url, token);
    await pool.query(`
      INSERT INTO automation_test_deliveries
        (automation_type, recipient_email, payload, outcome, http_status, response_body, error)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
    `, [
      automationType, input.email, JSON.stringify(payload), delivery.deliveryError ? 'failed' : 'sent', delivery.httpStatus,
      delivery.responseBody || null, delivery.deliveryError || null,
    ]);
    if (delivery.deliveryError) return res.status(502).json({ error: delivery.deliveryError, httpStatus: delivery.httpStatus });
    return res.json({ ok: true, httpStatus: delivery.httpStatus, eventId: payload.event_id });
  } catch (error) { return next(error); }
}

function safeSecretMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function allowTestRequest(key: string) {
  const now = Date.now();
  for (const [storedKey, value] of testRequests) if (now - value.windowStartedAt >= 60_000) testRequests.delete(storedKey);
  const current = testRequests.get(key);
  if (!current) { testRequests.set(key, { windowStartedAt: now, count: 1 }); return true; }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export async function automationStatusHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const counts = await pool.query<{ status: string; automation_type: string; count: string }>(`
      SELECT status, automation_type, COUNT(*)::text AS count
      FROM automation_jobs GROUP BY status, automation_type ORDER BY automation_type, status
    `);
    res.json({
      enabled: Boolean(config.automationsActiveFrom), emblueEnabled: config.emblueEnabled,
      connectors: { postPurchase: postPurchaseDeliveryEnabled(), crossSell: crossSellDeliveryEnabled(), winBack: false },
      testDeliveryConfigured: Boolean(config.embluePostPurchaseUrl && config.automationTestSecret),
      testCrossSellDeliveryConfigured: Boolean(config.emblueCrossSellUrl && config.automationTestSecret),
      postPurchaseActiveFrom: config.embluePostPurchaseActiveFrom?.toISOString() || null,
      crossSellActiveFrom: config.emblueCrossSellActiveFrom?.toISOString() || null,
      activeFrom: config.automationsActiveFrom?.toISOString() || null, jobs: counts.rows,
    });
  } catch (error) { next(error); }
}

export async function automationJobsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const optionalQueryValue = (schema: z.ZodType) => z.preprocess(
      (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
      schema.optional(),
    );
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      per_page: z.coerce.number().int().min(1).max(100).default(25),
      status: optionalQueryValue(z.enum(['scheduled', 'ready', 'processing', 'sent', 'cancelled', 'skipped', 'failed', 'expired', 'problems'])),
      type: optionalQueryValue(z.enum(['post_purchase', 'cross_sell', 'win_back'])),
      search: optionalQueryValue(z.string().trim().max(100)),
    }).parse(req.query);
    const parameters: unknown[] = [];
    const filters: string[] = [];
    if (query.status === 'problems') filters.push("j.status IN ('cancelled', 'skipped', 'failed')");
    else if (query.status) { parameters.push(query.status); filters.push(`j.status = $${parameters.length}`); }
    if (query.type) { parameters.push(query.type); filters.push(`j.automation_type = $${parameters.length}`); }
    if (query.search) {
      parameters.push(`%${query.search}%`);
      const index = parameters.length;
      filters.push(`(c.email ILIKE $${index} OR c.first_name ILIKE $${index} OR c.last_name ILIKE $${index}
        OR o.order_number ILIKE $${index} OR o.woo_order_id::text ILIKE $${index})`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.per_page;
    const [summary, total, jobs] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
          COUNT(*) FILTER (WHERE status = 'ready')::int AS ready,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
          COUNT(*) FILTER (WHERE status IN ('failed', 'skipped'))::int AS problems,
          COUNT(*) FILTER (WHERE automation_type = 'post_purchase')::int AS post_purchase,
          COUNT(*) FILTER (WHERE automation_type = 'cross_sell')::int AS cross_sell,
          COUNT(*) FILTER (WHERE automation_type = 'win_back')::int AS win_back
        FROM automation_jobs
      `),
      pool.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM automation_jobs j
        JOIN automation_contacts c ON c.id = j.contact_id
        JOIN automation_orders o ON o.woo_order_id = j.trigger_order_id
        ${where}
      `, parameters),
      pool.query(`
        SELECT j.id, j.automation_type, j.trigger_order_id, j.due_at, j.next_attempt_at, j.status, j.attempts,
          j.last_error, j.created_at, j.updated_at, j.sent_at, j.cancelled_at, j.expired_at, j.payload,
          EXTRACT(EPOCH FROM (j.due_at - NOW()))::bigint AS remaining_seconds,
          c.id AS contact_id, c.email, c.first_name, c.last_name, c.phone,
          c.marketing_opt_in AS current_marketing_opt_in,
          c.marketing_opt_in_source AS current_consent_source,
          c.marketing_opt_in_at AS current_marketing_opt_in_at,
          o.order_number, o.status AS order_status, o.currency, o.total, o.date_created,
          o.processing_at, o.marketing_opt_in AS order_marketing_opt_in,
          o.marketing_opt_in_source AS consent_source,
          attempt.outcome AS last_attempt_outcome, attempt.http_status AS last_attempt_http_status,
          attempt.error AS last_attempt_error, attempt.attempted_at AS last_attempt_at
        FROM automation_jobs j
        JOIN automation_contacts c ON c.id = j.contact_id
        JOIN automation_orders o ON o.woo_order_id = j.trigger_order_id
        LEFT JOIN LATERAL (
          SELECT outcome, http_status, error, attempted_at
          FROM automation_attempts WHERE job_id = j.id ORDER BY attempted_at DESC LIMIT 1
        ) attempt ON TRUE
        ${where}
        ORDER BY
          CASE WHEN j.status IN ('scheduled', 'ready', 'processing') THEN 0 ELSE 1 END,
          CASE WHEN j.status IN ('scheduled', 'ready', 'processing') THEN j.due_at END ASC,
          j.created_at DESC
        LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
      `, [...parameters, query.per_page, offset]),
    ]);
    res.json({
      summary: summary.rows[0], data: jobs.rows, total: total.rows[0]?.count || 0,
      page: query.page, perPage: query.per_page,
      mode: {
        enabled: Boolean(config.automationsActiveFrom), emblueEnabled: config.emblueEnabled,
        connectors: { postPurchase: postPurchaseDeliveryEnabled(), crossSell: crossSellDeliveryEnabled(), winBack: false },
        testDeliveryConfigured: Boolean(config.embluePostPurchaseUrl && config.automationTestSecret),
        testCrossSellDeliveryConfigured: Boolean(config.emblueCrossSellUrl && config.automationTestSecret),
        postPurchaseActiveFrom: config.embluePostPurchaseActiveFrom?.toISOString() || null,
        crossSellActiveFrom: config.emblueCrossSellActiveFrom?.toISOString() || null,
      },
    });
  } catch (error) { next(error); }
}

function normalizedBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['yes', '1', 'true', 'si', 'sí'].includes(normalized)) return true;
  if (['no', '0', 'false'].includes(normalized)) return false;
  return null;
}
function wooDate(local?: string | null, gmt?: string | null) {
  const value = gmt ? `${gmt.replace(/Z$/, '')}Z` : local;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function numeric(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function normalizedText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function addDays(value: Date, days: number) { return new Date(value.getTime() + days * 86_400_000); }
