import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { automationDueAt, marketingConsent, retainedMarketingConsent } from './automations.js';
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
