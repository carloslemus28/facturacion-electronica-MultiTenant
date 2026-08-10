'use strict';

/*
  Reinicio total exclusivo para ambiente TEST.

  Conserva un único usuario administrador, sus roles/permisos y la estructura
  de la base. Elimina empresas, establecimientos, puntos de venta, usuarios
  operativos, clientes, productos, DTE, eventos, correos, tokens y correlativos.
*/

const fs = require('fs');
const path = require('path');
const { QueryTypes } = require('sequelize');

const rootEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath, quiet: true });
}
require('dotenv').config({ quiet: true });

const { sequelize } = require('../src/config/database');
const loadModels = require('../src/config/models');

const CONFIRM_RESET = String(
  process.env.CONFIRM_RESET_TOTAL_PRUEBAS || 'false'
).toLowerCase() === 'true';

const PREFERRED_ADMIN_EMAIL = String(
  process.env.ADMIN_EMAIL_TO_KEEP || process.env.ADMIN_EMAIL || ''
).trim().toLowerCase();

const OPERATIONAL_TABLES = [
  'refresh_tokens',
  'email_logs',
  'dte_event_items',
  'dte_events',
  'invoice_items',
  'invoices',
  'control_numbers',
  'products',
  'customers',
  'points_of_sale',
  'establishments',
  'companies'
];

const AUTO_INCREMENT_TABLES = [
  ...OPERATIONAL_TABLES
];

const SUMMARY_TABLES = [
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  ...OPERATIONAL_TABLES
];

const tableExists = async (tableName, transaction = null) => {
  const rows = await sequelize.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = :tableName
      LIMIT 1
    `,
    {
      replacements: { tableName },
      type: QueryTypes.SELECT,
      transaction
    }
  );

  return rows.length > 0;
};

const getAdminToKeep = async () => {
  const rows = await sequelize.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        MIN(
          CASE
            WHEN :preferredEmail <> '' AND LOWER(COALESCE(u.email, '')) = :preferredEmail THEN 1
            WHEN r.code = 'ADMIN' THEN 2
            WHEN LOWER(u.username) = 'admin' THEN 3
            ELSE 4
          END
        ) AS prioridad
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE (:preferredEmail <> '' AND LOWER(COALESCE(u.email, '')) = :preferredEmail)
         OR r.code = 'ADMIN'
         OR LOWER(u.username) = 'admin'
      GROUP BY u.id, u.username, u.email
      ORDER BY prioridad ASC, u.id ASC
      LIMIT 1
    `,
    {
      replacements: { preferredEmail: PREFERRED_ADMIN_EMAIL },
      type: QueryTypes.SELECT
    }
  );

  if (!rows.length) {
    throw new Error(
      'No se encontró un administrador para conservar. Defina ADMIN_EMAIL_TO_KEEP con el correo del administrador.'
    );
  }

  return rows[0];
};

const deleteAllRows = async (tableName, transaction) => {
  if (!(await tableExists(tableName, transaction))) {
    console.log(`ℹ️ Tabla no existe, se omite: ${tableName}`);
    return;
  }

  await sequelize.query(`DELETE FROM \`${tableName}\`;`, { transaction });
  console.log(`🧹 Tabla vaciada: ${tableName}`);
};

const resetAutoIncrement = async (tableName, nextValue = 1) => {
  if (!(await tableExists(tableName))) return;

  await sequelize.query(
    `ALTER TABLE \`${tableName}\` AUTO_INCREMENT = ${Number(nextValue)};`
  );

  console.log(`🔢 AUTO_INCREMENT reiniciado: ${tableName} → ${nextValue}`);
};

const getTableCount = async (tableName) => {
  if (!(await tableExists(tableName))) return null;

  const rows = await sequelize.query(
    `SELECT COUNT(*) AS total FROM \`${tableName}\`;`,
    { type: QueryTypes.SELECT }
  );

  return Number(rows[0]?.total || 0);
};

const main = async () => {
  if (!CONFIRM_RESET) {
    throw new Error(
      'Protección activa. Ejecute con CONFIRM_RESET_TOTAL_PRUEBAS=true.'
    );
  }

  if (String(process.env.MH_ENV || '').toUpperCase() !== 'TEST') {
    throw new Error(
      'Este script solo puede ejecutarse con MH_ENV=TEST. No se permite en producción.'
    );
  }

  loadModels();
  await sequelize.authenticate();

  const admin = await getAdminToKeep();

  console.log('🚨 INICIANDO REINICIO TOTAL DE BASE DE DATOS DE PRUEBAS');
  console.log(
    `👤 Administrador conservado: ID ${admin.id} | ${admin.username} | ${admin.email || '(sin correo)'}`
  );

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;', { transaction });

    try {
      if (await tableExists('user_roles', transaction)) {
        await sequelize.query(
          'DELETE FROM user_roles WHERE user_id <> :adminId;',
          {
            replacements: { adminId: admin.id },
            transaction
          }
        );
        console.log('🧹 Roles de usuarios no administradores eliminados');
      }

      await sequelize.query(
        `
          UPDATE users
          SET point_of_sale_id = NULL,
              last_login_at = NULL
          WHERE id = :adminId;
        `,
        {
          replacements: { adminId: admin.id },
          transaction
        }
      );

      for (const tableName of OPERATIONAL_TABLES) {
        await deleteAllRows(tableName, transaction);
      }

      await sequelize.query(
        'DELETE FROM users WHERE id <> :adminId;',
        {
          replacements: { adminId: admin.id },
          transaction
        }
      );

      console.log('🧹 Usuarios no administradores eliminados');
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;', { transaction });
    }
  });

  for (const tableName of AUTO_INCREMENT_TABLES) {
    await resetAutoIncrement(tableName, 1);
  }

  await resetAutoIncrement('users', Number(admin.id) + 1);

  const summary = [];
  for (const tableName of SUMMARY_TABLES) {
    const total = await getTableCount(tableName);
    if (total !== null) summary.push({ tabla: tableName, total });
  }

  console.log('\n✅ REINICIO COMPLETADO');
  console.table(summary);
  console.log('\nResultado esperado:');
  console.log('- users = 1 (administrador conservado).');
  console.log('- Roles, permisos y relación de rol del administrador se conservan.');
  console.log('- Todas las tablas operativas quedan en 0.');
  console.log('- control_numbers queda vacío; el próximo DTE inicia en correlativo 1.');
  console.log('- Todas las sesiones quedan cerradas.');
};

main()
  .catch((error) => {
    console.error('\n✗ Error durante el reinicio total:', error.message);
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch (error) {
      // No se requiere una acción adicional al cerrar.
    }
  });
