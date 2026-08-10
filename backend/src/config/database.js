const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
  process.env.MYSQLUSER || process.env.MYSQL_USER,
  process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQLHOST || process.env.MYSQL_HOST || process.env.DB_HOST || 'mysql',
    port: Number(
      process.env.MYSQLPORT ||
      process.env.MYSQL_INTERNAL_PORT ||
      process.env.DB_PORT ||
      3306
    ),
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    timezone: '-06:00',
    pool: {
      max: Number(process.env.DB_POOL_MAX || 5),
      min: Number(process.env.DB_POOL_MIN || 0),
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 30000),
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
      evict: Number(process.env.DB_POOL_EVICT_MS || 10000)
    },
    define: {
      timestamps: true,
      underscored: true
    }
  }
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const getPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const testConnection = async () => {
  const maxAttempts = getPositiveInteger(
    process.env.DB_CONNECTION_RETRIES,
    30
  );

  const retryDelayMs = getPositiveInteger(
    process.env.DB_CONNECTION_RETRY_DELAY_MS,
    5000
  );

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sequelize.authenticate();
      console.log('✅ Conexión a MySQL establecida correctamente');
      return;
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        break;
      }

      console.error(
        `⚠️ MySQL aún no está disponible. Reintento ${attempt}/${maxAttempts} en ${retryDelayMs / 1000} segundos: ${error.message}`
      );

      await sleep(retryDelayMs);
    }
  }

  throw lastError;
};

module.exports = {
  sequelize,
  testConnection
};