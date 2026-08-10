require('dotenv').config();

const app = require('./app');
const { sequelize, testConnection } = require('./config/database');
const loadModels = require('./config/models');
const seedSecurityData = require('./config/seed');
const ensureRuntimeSchema = require('./config/runtime-schema');

const PORT = process.env.PORT || process.env.BACKEND_PORT || 4000;

let httpServer;
let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`Recibida señal ${signal}. Cerrando backend de forma ordenada...`);

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }

    await sequelize.close();
    console.log('Conexiones a MySQL cerradas correctamente');
    process.exit(0);
  } catch (error) {
    console.error('Error cerrando el backend:', error);
    process.exit(1);
  }
};

const startServer = async () => {
  await testConnection();

  loadModels();

  // En bases existentes, algunas columnas nuevas deben existir antes de
  // sequelize.sync(), porque Sequelize puede intentar crear índices sobre
  // esas columnas y MySQL rechaza el arranque si aún no existen.
  await ensureRuntimeSchema({ beforeSync: true });

  await sequelize.sync();

  // Segunda verificación para bases nuevas: si las tablas se acaban de crear,
  // esta llamada garantiza que cualquier ajuste de compatibilidad quede aplicado.
  await ensureRuntimeSchema();

  await seedSecurityData();

  httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend ejecutándose en el puerto ${PORT}`);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch(async (error) => {
  console.error('❌ El backend no pudo iniciarse:', error);

  try {
    await sequelize.close();
  } catch (closeError) {
    console.error('No se pudo cerrar la conexión a MySQL tras el fallo:', closeError.message);
  }

  process.exit(1);
});
