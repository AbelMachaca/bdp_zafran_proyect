import { pool, testDatabaseConnection } from './database.js';

try {
  const result = await testDatabaseConnection();
  console.log('Conexión PostgreSQL correcta.');
  console.log(`Base: ${result?.database}`);
  console.log(`Usuario: ${result?.db_user}`);
  console.log(`Versión: ${result?.server_version}`);
  console.log(`Hora del servidor: ${result?.server_time?.toISOString()}`);
} catch (error) {
  console.error('No se pudo conectar a PostgreSQL.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
