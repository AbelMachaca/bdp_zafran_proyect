import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { marketingConsent } from './automations.js';
import { parseWooPayload, validWooSignature } from './webhooks.js';

test('valida la firma HMAC enviada por WooCommerce', () => {
  const body = Buffer.from('{"id":5961}');
  const secret = 'secreto-de-prueba';
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');
  assert.equal(validWooSignature(body, signature, secret), true);
  assert.equal(validWooSignature(body, 'firma-incorrecta', secret), false);
});

test('reconoce el ping inicial de WooCommerce aunque no sea JSON', () => {
  assert.deepEqual(parseWooPayload(Buffer.from('webhook_id=142')), { webhook_id: '142' });
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
