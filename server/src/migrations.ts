import type { PoolClient } from 'pg';
import { pool } from './database.js';

type Migration = { version: number; name: string; sql: string };

const migrations: Migration[] = [
  {
    version: 1,
    name: 'automation_core',
    sql: `
      CREATE TABLE IF NOT EXISTS automation_contacts (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        woo_customer_id BIGINT,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_opt_in_source TEXT,
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS automation_contacts_woo_customer_idx
        ON automation_contacts (woo_customer_id) WHERE woo_customer_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS automation_orders (
        woo_order_id BIGINT PRIMARY KEY,
        order_number TEXT,
        contact_id BIGINT REFERENCES automation_contacts(id) ON DELETE SET NULL,
        status TEXT NOT NULL,
        currency TEXT,
        total NUMERIC(18, 2),
        date_created TIMESTAMPTZ,
        date_modified TIMESTAMPTZ,
        date_paid TIMESTAMPTZ,
        processing_at TIMESTAMPTZ,
        marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_opt_in_source TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS automation_orders_contact_idx ON automation_orders (contact_id);
      CREATE INDEX IF NOT EXISTS automation_orders_status_idx ON automation_orders (status);
      CREATE INDEX IF NOT EXISTS automation_orders_processing_idx ON automation_orders (processing_at);

      CREATE TABLE IF NOT EXISTS automation_order_items (
        woo_order_id BIGINT NOT NULL REFERENCES automation_orders(woo_order_id) ON DELETE CASCADE,
        woo_line_item_id BIGINT NOT NULL,
        product_id BIGINT,
        variation_id BIGINT,
        name TEXT NOT NULL DEFAULT '',
        sku TEXT NOT NULL DEFAULT '',
        quantity NUMERIC(12, 3) NOT NULL DEFAULT 0,
        subtotal NUMERIC(18, 2),
        total NUMERIC(18, 2),
        category_ids BIGINT[] NOT NULL DEFAULT '{}',
        category_names TEXT[] NOT NULL DEFAULT '{}',
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (woo_order_id, woo_line_item_id)
      );

      CREATE TABLE IF NOT EXISTS woocommerce_events (
        id BIGSERIAL PRIMARY KEY,
        delivery_id TEXT NOT NULL UNIQUE,
        topic TEXT NOT NULL,
        resource_id BIGINT,
        status TEXT NOT NULL DEFAULT 'received'
          CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
        payload JSONB NOT NULL,
        error TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS woocommerce_events_status_idx
        ON woocommerce_events (status, received_at);

      CREATE TABLE IF NOT EXISTS automation_jobs (
        id BIGSERIAL PRIMARY KEY,
        automation_type TEXT NOT NULL CHECK (automation_type IN ('post_purchase', 'cross_sell')),
        contact_id BIGINT NOT NULL REFERENCES automation_contacts(id) ON DELETE CASCADE,
        trigger_order_id BIGINT NOT NULL REFERENCES automation_orders(woo_order_id) ON DELETE CASCADE,
        dedupe_key TEXT NOT NULL UNIQUE,
        due_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'scheduled'
          CHECK (status IN ('scheduled', 'ready', 'processing', 'sent', 'cancelled', 'skipped', 'failed')),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        locked_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS automation_jobs_due_idx
        ON automation_jobs (status, due_at);
      CREATE INDEX IF NOT EXISTS automation_jobs_contact_idx
        ON automation_jobs (contact_id, automation_type);

      CREATE TABLE IF NOT EXISTS automation_attempts (
        id BIGSERIAL PRIMARY KEY,
        job_id BIGINT NOT NULL REFERENCES automation_jobs(id) ON DELETE CASCADE,
        outcome TEXT NOT NULL,
        http_status INTEGER,
        response_body TEXT,
        error TEXT,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS automation_sync_state (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
  {
    version: 2,
    name: 'persistent_consent_and_win_back',
    sql: `
      ALTER TABLE automation_contacts
        ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS marketing_opt_out_at TIMESTAMPTZ;

      UPDATE automation_contacts c
      SET marketing_opt_in = TRUE,
          marketing_opt_in_at = COALESCE(c.marketing_opt_in_at, consent.first_granted_at),
          marketing_opt_in_source = COALESCE(consent.source, c.marketing_opt_in_source),
          updated_at = NOW()
      FROM (
        SELECT
          o.contact_id,
          MIN(COALESCE(o.processing_at, o.date_created, o.first_seen_at)) AS first_granted_at,
          (ARRAY_AGG(o.marketing_opt_in_source ORDER BY COALESCE(o.processing_at, o.date_created, o.first_seen_at)))[1] AS source
        FROM automation_orders o
        WHERE o.contact_id IS NOT NULL AND o.marketing_opt_in = TRUE
        GROUP BY o.contact_id
      ) consent
      WHERE c.id = consent.contact_id;

      UPDATE automation_contacts
      SET marketing_opt_in_at = COALESCE(marketing_opt_in_at, created_at)
      WHERE marketing_opt_in = TRUE;

      ALTER TABLE automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_automation_type_check;
      ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_automation_type_check
        CHECK (automation_type IN ('post_purchase', 'cross_sell', 'win_back'));

      WITH latest_orders AS (
        SELECT DISTINCT ON (o.contact_id)
          o.contact_id, o.woo_order_id, o.processing_at, pp.payload
        FROM automation_orders o
        JOIN automation_contacts c ON c.id = o.contact_id AND c.marketing_opt_in = TRUE
        JOIN automation_jobs pp ON pp.trigger_order_id = o.woo_order_id AND pp.automation_type = 'post_purchase'
        WHERE o.status IN ('processing', 'completed') AND o.processing_at IS NOT NULL
        ORDER BY o.contact_id, o.processing_at DESC, o.woo_order_id DESC
      )
      UPDATE automation_jobs j
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(),
          last_error = 'Reprogramado por una compra posterior'
      FROM latest_orders latest
      WHERE j.contact_id = latest.contact_id
        AND j.automation_type IN ('cross_sell', 'win_back')
        AND j.status IN ('scheduled', 'ready')
        AND j.trigger_order_id <> latest.woo_order_id;

      WITH latest_orders AS (
        SELECT DISTINCT ON (o.contact_id)
          o.contact_id, o.woo_order_id, o.processing_at, pp.payload
        FROM automation_orders o
        JOIN automation_contacts c ON c.id = o.contact_id AND c.marketing_opt_in = TRUE
        JOIN automation_jobs pp ON pp.trigger_order_id = o.woo_order_id AND pp.automation_type = 'post_purchase'
        WHERE o.status IN ('processing', 'completed') AND o.processing_at IS NOT NULL
        ORDER BY o.contact_id, o.processing_at DESC, o.woo_order_id DESC
      ), retention_jobs AS (
        SELECT 'cross_sell'::text AS automation_type, 35 AS delay_days, * FROM latest_orders
        UNION ALL
        SELECT 'win_back'::text AS automation_type, 90 AS delay_days, * FROM latest_orders
      )
      INSERT INTO automation_jobs
        (automation_type, contact_id, trigger_order_id, dedupe_key, due_at, payload)
      SELECT automation_type, contact_id, woo_order_id,
        automation_type || ':' || woo_order_id, processing_at + make_interval(days => delay_days), payload
      FROM retention_jobs
      ON CONFLICT (dedupe_key) DO UPDATE SET
        due_at = EXCLUDED.due_at,
        status = 'scheduled',
        payload = EXCLUDED.payload,
        cancelled_at = NULL,
        last_error = NULL,
        updated_at = NOW()
      WHERE automation_jobs.status IN ('cancelled', 'skipped', 'failed');
    `,
  },
  {
    version: 3,
    name: 'emblue_marketing_categories',
    sql: `
      WITH classified AS (
        SELECT j.id,
          COALESCE(BOOL_OR(
            LOWER(i.name) LIKE '%granola%'
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_names) category WHERE LOWER(category) LIKE '%granola%')
          ), FALSE) AS bought_granolas,
          COALESCE(BOOL_OR(
            LOWER(i.name) LIKE '%barra%'
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_names) category WHERE LOWER(category) LIKE '%barra%')
          ), FALSE) AS bought_barras
        FROM automation_jobs j
        LEFT JOIN automation_order_items i ON i.woo_order_id = j.trigger_order_id
        GROUP BY j.id
      ), normalized AS (
        SELECT id, bought_granolas, bought_barras,
          CASE
            WHEN bought_granolas AND bought_barras THEN '["granolas", "barras"]'::jsonb
            WHEN bought_granolas THEN '["granolas"]'::jsonb
            WHEN bought_barras THEN '["barras"]'::jsonb
            ELSE '["sin_categoria_clara"]'::jsonb
          END AS marketing_categories,
          CASE
            WHEN bought_granolas AND bought_barras THEN 'mixta'
            WHEN bought_granolas THEN 'granolas'
            WHEN bought_barras THEN 'barras'
            ELSE 'sin_categoria_clara'
          END AS primary_marketing_category
        FROM classified
      )
      UPDATE automation_jobs j
      SET payload = j.payload || JSONB_BUILD_OBJECT(
        'marketing_categories', normalized.marketing_categories,
        'primary_marketing_category', normalized.primary_marketing_category,
        'bought_granolas', normalized.bought_granolas,
        'bought_barras', normalized.bought_barras
      ), updated_at = NOW()
      FROM normalized
      WHERE j.id = normalized.id;
    `,
  },
  {
    version: 4,
    name: 'primary_marketing_category_by_value',
    sql: `
      WITH item_classes AS (
        SELECT j.id, i.woo_line_item_id,
          COALESCE(i.total, 0) AS amount,
          COALESCE(i.quantity, 0) AS quantity,
          COALESCE(
            LOWER(i.name) LIKE '%granola%'
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_names) category WHERE LOWER(category) LIKE '%granola%'),
            FALSE
          ) AS is_granola,
          COALESCE(
            LOWER(i.name) LIKE '%barra%'
            OR EXISTS (SELECT 1 FROM UNNEST(i.category_names) category WHERE LOWER(category) LIKE '%barra%'),
            FALSE
          ) AS is_barra
        FROM automation_jobs j
        LEFT JOIN automation_order_items i ON i.woo_order_id = j.trigger_order_id
      ), scores AS (
        SELECT id,
          COALESCE(BOOL_OR(is_granola), FALSE) AS bought_granolas,
          COALESCE(BOOL_OR(is_barra), FALSE) AS bought_barras,
          COALESCE(SUM(amount) FILTER (WHERE is_granola), 0) AS granolas_amount,
          COALESCE(SUM(amount) FILTER (WHERE is_barra), 0) AS barras_amount,
          COALESCE(SUM(quantity) FILTER (WHERE is_granola), 0) AS granolas_quantity,
          COALESCE(SUM(quantity) FILTER (WHERE is_barra), 0) AS barras_quantity,
          MIN(woo_line_item_id) FILTER (WHERE is_granola) AS first_granola,
          MIN(woo_line_item_id) FILTER (WHERE is_barra) AS first_barra
        FROM item_classes GROUP BY id
      ), normalized AS (
        SELECT *,
          CASE
            WHEN bought_granolas AND bought_barras THEN '["granolas", "barras"]'::jsonb
            WHEN bought_granolas THEN '["granolas"]'::jsonb
            WHEN bought_barras THEN '["barras"]'::jsonb
            ELSE '["sin_categoria_clara"]'::jsonb
          END AS marketing_categories,
          CASE
            WHEN NOT bought_granolas AND NOT bought_barras THEN 'sin_categoria_clara'
            WHEN bought_granolas AND NOT bought_barras THEN 'granolas'
            WHEN bought_barras AND NOT bought_granolas THEN 'barras'
            WHEN granolas_amount > barras_amount THEN 'granolas'
            WHEN barras_amount > granolas_amount THEN 'barras'
            WHEN granolas_quantity > barras_quantity THEN 'granolas'
            WHEN barras_quantity > granolas_quantity THEN 'barras'
            WHEN COALESCE(first_granola, 9223372036854775807) <= COALESCE(first_barra, 9223372036854775807) THEN 'granolas'
            ELSE 'barras'
          END AS primary_marketing_category
        FROM scores
      )
      UPDATE automation_jobs j
      SET payload = j.payload || JSONB_BUILD_OBJECT(
        'marketing_categories', normalized.marketing_categories,
        'primary_marketing_category', normalized.primary_marketing_category,
        'marketing_category_amounts', JSONB_BUILD_OBJECT(
          'granolas', normalized.granolas_amount, 'barras', normalized.barras_amount
        ),
        'marketing_category_quantities', JSONB_BUILD_OBJECT(
          'granolas', normalized.granolas_quantity, 'barras', normalized.barras_quantity
        ),
        'bought_granolas', normalized.bought_granolas,
        'bought_barras', normalized.bought_barras
      ), updated_at = NOW()
      FROM normalized
      WHERE j.id = normalized.id;
    `,
  },
  {
    version: 5,
    name: 'automation_delivery_retries',
    sql: `
      ALTER TABLE automation_jobs
        ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS automation_jobs_delivery_idx
        ON automation_jobs (automation_type, status, next_attempt_at, due_at);
    `,
  },
  {
    version: 6,
    name: 'expired_jobs_and_emblue_tests',
    sql: `
      ALTER TABLE automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_status_check;
      ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_status_check
        CHECK (status IN ('scheduled', 'ready', 'processing', 'sent', 'cancelled', 'skipped', 'failed', 'expired'));
      ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

      UPDATE automation_jobs
      SET status = 'expired', expired_at = NOW(), updated_at = NOW(),
        last_error = 'No enviado: vencido antes de habilitar Postcompra en emBlue'
      WHERE automation_type = 'post_purchase'
        AND status IN ('scheduled', 'ready') AND due_at <= NOW();

      CREATE TABLE IF NOT EXISTS automation_test_deliveries (
        id BIGSERIAL PRIMARY KEY,
        automation_type TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        payload JSONB NOT NULL,
        outcome TEXT NOT NULL,
        http_status INTEGER,
        response_body TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  },
];

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [92740117]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const versions = new Set(applied.rows.map((row) => row.version));
    for (const migration of migrations) {
      if (versions.has(migration.version)) continue;
      await applyMigration(client, migration);
      console.log(`Migración ${migration.version} aplicada: ${migration.name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [92740117]).catch(() => undefined);
    client.release();
  }
}

async function applyMigration(client: PoolClient, migration: Migration) {
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
