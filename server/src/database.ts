import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

export const databaseConfig = {
  connectionString: process.env.DATABASE_URL || '',
  host: process.env.DB_HOST || '',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
};

export function missingDatabaseVariables() {
  if (databaseConfig.connectionString) return [];
  return Object.entries({
    DB_HOST: databaseConfig.host,
    DB_NAME: databaseConfig.database,
    DB_USER: databaseConfig.user,
    DB_PASSWORD: databaseConfig.password,
  }).filter(([, value]) => !value).map(([key]) => key);
}

export function databaseConfigured() {
  return missingDatabaseVariables().length === 0;
}

export const pool = new Pool({
  ...(databaseConfig.connectionString
    ? { connectionString: databaseConfig.connectionString }
    : {
        host: databaseConfig.host,
        port: databaseConfig.port,
        database: databaseConfig.database,
        user: databaseConfig.user,
        password: databaseConfig.password,
      }),
  ssl: databaseConfig.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
  application_name: 'zafran-automation',
});

export async function testDatabaseConnection() {
  const missing = missingDatabaseVariables();
  if (missing.length) throw new Error(`Faltan variables de PostgreSQL: ${missing.join(', ')}`);
  const client = await pool.connect();
  try {
    const result = await client.query<{
      database: string;
      db_user: string;
      server_version: string;
      server_time: Date;
    }>(`SELECT current_database() AS database,
              current_user AS db_user,
              current_setting('server_version') AS server_version,
              NOW() AS server_time`);
    return result.rows[0];
  } finally {
    client.release();
  }
}
