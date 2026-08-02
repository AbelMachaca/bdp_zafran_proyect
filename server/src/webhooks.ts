import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pool } from './database.js';
import { config } from './config.js';
import { enrichOrderCategories, persistWooOrder, type WooAutomationOrder } from './automations.js';

export function validWooSignature(body: Buffer, providedSignature: string, secret: string) {
  if (!providedSignature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(providedSignature.trim());
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function wooOrderWebhookHandler(req: Request, res: Response, next: NextFunction) {
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const signature = String(req.header('x-wc-webhook-signature') || '');
  if (!config.wooWebhookSecret) return res.status(503).json({ error: 'El receptor todavía no tiene configurado WC_WEBHOOK_SECRET' });
  if (!validWooSignature(body, signature, config.wooWebhookSecret)) return res.status(401).json({ error: 'Firma de WooCommerce inválida' });

  try {
    const payload = JSON.parse(body.toString('utf8')) as WooAutomationOrder;
    const topic = String(req.header('x-wc-webhook-topic') || 'unknown');
    const deliveryId = String(req.header('x-wc-webhook-delivery-id') || crypto.createHash('sha256').update(body).digest('hex'));
    if (!payload.id) return res.status(200).json({ ok: true, ping: true });

    const event = await pool.query<{ id: string }>(`
      INSERT INTO woocommerce_events (delivery_id, topic, resource_id, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (delivery_id) DO UPDATE SET
        status = 'received', error = NULL, received_at = NOW()
      WHERE woocommerce_events.status = 'failed'
      RETURNING id
    `, [deliveryId, topic, payload.id, JSON.stringify(payload)]);
    const eventId = event.rows[0]?.id;
    if (!eventId) return res.status(200).json({ ok: true, duplicate: true });

    await enrichOrderCategories(payload);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await persistWooOrder(client, payload);
      await client.query(`
        UPDATE woocommerce_events SET status = 'processed', processed_at = NOW(), error = NULL WHERE id = $1
      `, [eventId]);
      await client.query('COMMIT');
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      await client.query('ROLLBACK');
      await pool.query(`UPDATE woocommerce_events SET status = 'failed', error = $2 WHERE id = $1`, [
        eventId, error instanceof Error ? error.message.slice(0, 2000) : 'Error desconocido',
      ]);
      throw error;
    } finally { client.release(); }
  } catch (error) { return next(error); }
}
