import 'dotenv/config';

export const config = {
  storeUrl: (process.env.WC_STORE_URL || 'https://zafran.com.ar').replace(/\/$/, ''),
  key: process.env.WC_CONSUMER_KEY || '',
  secret: process.env.WC_CONSUMER_SECRET || '',
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  wooWebhookSecret: process.env.WC_WEBHOOK_SECRET || '',
  automationsActiveFrom: validDate(process.env.AUTOMATIONS_ACTIVE_FROM),
  emblueEnabled: process.env.EMBLUE_ENABLED === 'true',
  embluePostPurchaseEnabled: process.env.EMBLUE_POST_PURCHASE_ENABLED === 'true',
  embluePostPurchaseUrl: process.env.EMBLUE_POST_PURCHASE_URL || '',
  embluePostPurchaseToken: process.env.EMBLUE_POST_PURCHASE_TOKEN || '',
  embluePostPurchaseActiveFrom: validDate(process.env.EMBLUE_POST_PURCHASE_ACTIVE_FROM),
  emblueTimeoutMs: positiveNumber(process.env.EMBLUE_TIMEOUT_MS, 12_000),
  emblueMaxAttempts: positiveNumber(process.env.EMBLUE_MAX_ATTEMPTS, 5),
  automationTestSecret: process.env.AUTOMATION_TEST_SECRET || '',
};

export const credentialsConfigured = () =>
  config.key.startsWith('ck_') && config.secret.startsWith('cs_');

function validDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
