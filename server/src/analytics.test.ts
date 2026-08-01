import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOrders } from './analytics.js';

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
