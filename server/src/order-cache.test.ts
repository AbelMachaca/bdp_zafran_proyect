import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderCache } from './order-cache.js';

const annual = { from: '2026-01-01', to: '2026-12-31' };
const september = { from: '2026-09-01', to: '2026-09-30' };
test('comparte consultas concurrentes y reutiliza rangos mayores sin mezclar fechas', async () => {
  let calls = 0;
  const load = createOrderCache(async () => {
    calls++;
    return [{ date_created: '2026-09-06T12:00:00' }, { date_created: '2026-01-01T10:00:00' }];
  });
  const [all, month] = await Promise.all([load(annual), load(september)]);
  assert.equal(calls, 1);
  assert.equal(all.length, 2);
  assert.equal(month.length, 1);
  await load(september);
  assert.equal(calls, 1);
  await load(september, true);
  assert.equal(calls, 2);
  await load(annual);
  assert.equal(calls, 3, 'la actualización invalida rangos superpuestos');
});

test('no conserva errores ni datos vencidos', async () => {
  let calls = 0;
  const load = createOrderCache(async () => {
    if (++calls === 1) throw new Error('sin conexión');
    return [];
  }, 0);
  await assert.rejects(load(annual), /sin conexión/);
  await load(annual);
  await load(annual);
  assert.equal(calls, 3);
});
