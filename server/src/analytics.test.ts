import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEmailMarketing, summarizeOrders } from './analytics.js';

test('resume solamente pedidos considerados pagados', () => {
  const result = summarizeOrders([
    { id: 1, status: 'processing', total: '100', line_items: [{ product_id: 9, name: 'Barra', quantity: 2, total: '80' }] },
    { id: 2, status: 'cancelled', total: '500' },
  ]);
  assert.equal(result.revenue, 100);
  assert.equal(result.paidOrders, 1);
  assert.equal(result.topProducts[0]?.quantity, 2);
});

test('desglosa impuestos, envío, descuentos y reembolsos', () => {
  const result = summarizeOrders([{
    id: 3, status: 'completed', total: '121', discount_total: '10', discount_tax: '2',
    shipping_total: '5', shipping_tax: '1', total_tax: '21', refunds: [{ total: '-20' }],
    line_items: [{ product_id: 1, name: 'Producto', quantity: 1, subtotal: '100', subtotal_tax: '20', total: '90', total_tax: '18' }],
  }]);
  assert.equal(result.financials.chargedTotal, 121);
  assert.equal(result.financials.refunds, 20);
  assert.equal(result.financials.netCollected, 101);
  assert.equal(result.financials.productNetExTax, 90);
});

test('separa atribución de email, cupón principal y su unión sin duplicar pedidos', () => {
  const result = summarizeEmailMarketing([
    {
      id: 10, status: 'processing', date_created: '2026-01-12T10:00:00', total: '121', total_tax: '21',
      coupon_lines: [{ code: '¡HOLA20%!', discount: '20' }], billing: { email: 'uno@example.com' },
      meta_data: [{ key: '_wc_order_attribution_utm_source', value: 'emblue' }],
    },
    {
      id: 11, status: 'completed', date_created: '2026-02-03T10:00:00', total: '80',
      coupon_lines: [{ code: 'OTRO10', discount: '10' }], billing: { email: 'dos@example.com' },
    },
  ], [{
    id: 9, status: 'completed', date_created: '2025-01-05T10:00:00', total: '50',
    coupon_lines: [{ code: '¡hola20%!', discount: '5' }],
  }], 2026);

  assert.equal(result.overview.emailAttributed.orders, 1);
  assert.equal(result.overview.emailInfluenced.orders, 1);
  assert.equal(result.primary.uses, 1);
  assert.equal(result.primary.delta.uses, 0);
  assert.equal(result.months[0]!.primaryCouponUses, 1);
  assert.equal(result.months[0]!.primaryCouponCustomers, 1);
  assert.equal(result.coupons[0]!.uses, 1);
  assert.equal(result.emailBreakdown.sources[0]?.name, 'emBlue');
  assert.equal(result.emailCoverage.source, 100);
  assert.equal(result.emailCoverage.campaign, 0);
});
