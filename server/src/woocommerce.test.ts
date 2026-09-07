import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.js';
import { getAll } from './woocommerce.js';

test('descarga más de 50 páginas y limita la concurrencia global entre reportes', async (t) => {
  const key = config.key; const secret = config.secret;
  config.key = 'ck_test'; config.secret = 'cs_test';
  t.after(() => { config.key = key; config.secret = secret; });
  let active = 0; let peak = 0;
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    return new Response(JSON.stringify([{ id: Number(input.searchParams.get('page')) }]), {
      headers: { 'x-wp-totalpages': '51', 'x-wp-total': '51', 'Content-Type': 'application/json' },
    });
  });
  const reports = await Promise.all([getAll<{ id: number }>('orders'), getAll<{ id: number }>('orders')]);
  for (const report of reports) {
    assert.equal(report.length, 51);
    assert.deepEqual(report.map((order) => order.id), Array.from({ length: 51 }, (_, i) => i + 1));
  }
  assert.ok(peak <= 5);
  await assert.rejects(getAll('orders', {}, 50), /informe completo/);
});
