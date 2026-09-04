import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { automationDueAt, buildEmbluePostPurchasePayload, marketingCategories, marketingCategorySummary, marketingConsent, retainedMarketingConsent } from './automations.js';
import { isWooPing, parseWooPayload, validWooSignature } from './webhooks.js';

test('valida la firma HMAC enviada por WooCommerce', () => {
  const body = Buffer.from('{"id":5961}');
  const secret = 'secreto-de-prueba';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(validWooSignature(body, signature, secret), true);
  assert.equal(validWooSignature(body, 'firma-incorrecta', secret), false);
});

test('reconoce el ping inicial de WooCommerce aunque no sea JSON', () => {
  const ping = Buffer.from('webhook_id=142');
  assert.equal(isWooPing(ping), true);
  assert.deepEqual(parseWooPayload(ping), { webhook_id: '142' });
  assert.equal(isWooPing(Buffer.from('webhook_id=142&order_id=5961')), false);
});

test('prioriza el consentimiento normalizado de BDP', () => {
  assert.deepEqual(marketingConsent([
    { key: 'billing_opt-in', value: 'yes' },
    { key: '_bdp_newsletter_opt_in', value: 'no' },
  ]), { allowed: false, source: '_bdp_newsletter_opt_in' });
  assert.deepEqual(marketingConsent([{ key: '_bdp_newsletter_opt_in', value: 'yes' }]), {
    allowed: true, source: '_bdp_newsletter_opt_in',
  });
});

test('conserva un consentimiento anterior aunque el pedido nuevo no marque la casilla', () => {
  assert.equal(retainedMarketingConsent(true, false), true);
  assert.equal(retainedMarketingConsent(false, true), true);
  assert.equal(retainedMarketingConsent(false, false), false);
});

test('programa win-back exactamente 90 días después de entrar en procesando', () => {
  const processingAt = new Date('2026-08-02T18:37:14.000Z');
  assert.equal(automationDueAt('win_back', processingAt).toISOString(), '2026-10-31T18:37:14.000Z');
  assert.equal(automationDueAt('cross_sell', processingAt).toISOString(), '2026-09-06T18:37:14.000Z');
});

test('clasifica las compras para la segmentación de emBlue', () => {
  assert.deepEqual(marketingCategories({ line_items: [
    { name: 'Granola artesanal', _categories: [{ id: 1, name: 'Granolas' }] },
  ] }), ['granolas']);
  assert.deepEqual(marketingCategories({ line_items: [
    { name: 'Caja surtida', _categories: [{ id: 2, name: 'Barras de cereal' }] },
    { name: 'Granola clásica', _categories: [] },
  ] }), ['granolas', 'barras']);
  assert.deepEqual(marketingCategories({ line_items: [
    { name: 'Frutos secos', _categories: [{ id: 3, name: 'Snacks' }] },
  ] }), ['sin_categoria_clara']);
});

test('elige la categoría principal por monto y usa cantidad como desempate', () => {
  const byAmount = marketingCategorySummary({ line_items: [
    { id: 1, name: 'Granola', quantity: 3, total: '3000', _categories: [] },
    { id: 2, name: 'Barras', quantity: 1, total: '5000', _categories: [] },
  ] });
  assert.equal(byAmount.primary, 'barras');
  assert.deepEqual(byAmount.amounts, { granolas: 3000, barras: 5000 });

  const byQuantity = marketingCategorySummary({ line_items: [
    { id: 1, name: 'Granola', quantity: 3, total: '5000', _categories: [] },
    { id: 2, name: 'Barras', quantity: 2, total: '5000', _categories: [] },
  ] });
  assert.equal(byQuantity.primary, 'granolas');
});

test('construye el contrato estable de Postcompra para Data Lab', () => {
  const payload = buildEmbluePostPurchasePayload({
    id: '42', due_at: '2026-09-12T15:00:00.000Z', attempts: 0,
    contact_id: '7', email: 'cliente@example.com', first_name: 'Ana', last_name: 'Pérez', phone: '11223344',
    marketing_opt_in: true, marketing_opt_in_at: '2026-09-02T15:00:00.000Z',
    trigger_order_id: '95968', order_number: '95968', order_status: 'processing', currency: 'ARS',
    order_total: '38600', processing_at: '2026-09-02T15:00:00.000Z',
    payload: {
      primary_marketing_category: 'granolas', marketing_categories: ['granolas'],
      bought_granolas: true, bought_barras: false,
      products: [{ product_id: 12, name: 'Granola clásica', sku: 'GRA-1', quantity: 2, total: '12000', categories: [{ name: 'Granolas' }] }],
    },
  });
  assert.equal(payload.event_id, 'zafran-post-purchase-42');
  assert.equal(payload.email, 'cliente@example.com');
  assert.equal(payload.marketing_category, 'granolas');
  assert.deepEqual(payload.products[0], {
    product_id: 12, variation_id: null, name: 'Granola clásica', sku: 'GRA-1', quantity: 2, total: 12000, categories: 'Granolas',
  });
});
