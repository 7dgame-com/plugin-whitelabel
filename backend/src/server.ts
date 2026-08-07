import { createPool } from 'mysql2/promise';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createApp } from './app';
import { loadConfig } from './config';
import { MainFrontendDomainImportCatalog } from './domainImportCatalog';
import { MysqlWhiteLabelRepository } from './mysqlRepository';
import { MainApiSessionVerifier } from './sessionVerifier';

if (process.env.NODE_ENV !== 'production') {
  try {
    loadEnvFile(resolve(__dirname, '../../.env'));
  } catch (error) {
    if (
      !error
      || typeof error !== 'object'
      || !('code' in error)
      || error.code !== 'ENOENT'
    ) {
      throw error;
    }
  }
}

const config = loadConfig();
const pool = createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  database: config.mysql.database,
  user: config.mysql.user,
  password: config.mysql.password,
  connectionLimit: config.mysql.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  dateStrings: true,
  decimalNumbers: false,
  enableKeepAlive: true,
});

const repository = new MysqlWhiteLabelRepository(pool);
const sessionVerifier = new MainApiSessionVerifier(
  config.verifyTokenUrl,
  config.mainApiTimeoutMs,
);
const domainImportCatalog = config.domainCatalogManifestUrl === null
  ? undefined
  : new MainFrontendDomainImportCatalog(
    config.domainCatalogManifestUrl,
    config.domainCatalogTimeoutMs,
  );
const app = createApp({
  repository,
  sessionVerifier,
  domainImportCatalog,
});

const server = app.listen(config.port, () => {
  console.log(`plugin-whitelabel backend listening on port ${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down plugin-whitelabel backend`);
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Failed to close MySQL pool', error);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
