import test from 'node:test';
import assert from 'node:assert/strict';
import { matchedMarketingMonths } from './marketing-comparison.js';
import { summarizeEmailMarketing, summarizeOrders } from './analytics.js';

test('excluye reembolsados por defecto y permite incluirlos explícitamente', () => {
  const orders = [{ id: 1, status: 'completed', total: '100' }, { id: 2, status: 'refunded', total: '50' }];
  assert.equal(summarizeOrders(orders).orders, 1);
  assert.equal(summarizeEmailMarketing(orders, [], 2026).overview.storeOrders, 1);
  assert.equal(summarizeOrders(orders, ['completed', 'refunded']).orders, 2);
});

test('compara hasta el mismo segundo argentino y conserva diciembre al comparar enero', () => {
  const current = [
    { id: 1, status: 'completed', date_created: '2026-01-06T10:30:00', total: '100' },
    { id: 2, status: 'completed', date_created: '2026-01-06T10:30:01', total: '200' },
  ];
  const previous = [
    { id: 3, status: 'completed', date_created: '2025-12-06T10:30:00', total: '50' },
    { id: 4, status: 'completed', date_created: '2025-12-07T10:30:00', total: '300' },
  ];
  const result = matchedMarketingMonths(current, previous, 2026, ['completed'], new Date('2026-01-06T13:30:00Z'))[0]!;
  assert.equal(result.current.storeOrders, 1);
  assert.equal(result.previous.storeOrders, 1);
  assert.equal(result.currentTo, '2026-01-06T10:30:00');
  assert.equal(result.previousTo, '2025-12-06T10:30:00');
});

test('limita ambos meses al último día común incluyendo años bisiestos', () => {
  const regular = matchedMarketingMonths([], [], 2026, ['completed'], new Date('2026-03-31T23:00:00Z'))[2]!;
  assert.equal(regular.currentTo, '2026-03-28T20:00:00');
  assert.equal(regular.previousTo, '2026-02-28T20:00:00');
  const leap = matchedMarketingMonths([], [], 2024, ['completed'], new Date('2024-03-31T23:00:00Z'))[2]!;
  assert.equal(leap.previousTo, '2024-02-29T20:00:00');
});
