import 'dotenv/config';

export const config = {
  storeUrl: (process.env.WC_STORE_URL || 'https://zafran.com.ar').replace(/\/$/, ''),
  key: process.env.WC_CONSUMER_KEY || '',
  secret: process.env.WC_CONSUMER_SECRET || '',
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};

export const credentialsConfigured = () =>
  config.key.startsWith('ck_') && config.secret.startsWith('cs_');
