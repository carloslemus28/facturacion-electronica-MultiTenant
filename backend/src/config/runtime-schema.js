const { DataTypes, QueryTypes } = require('sequelize');
const { sequelize } = require('./database');

const DUPLICATE_COLUMN_ERRORS = new Set([
  'ER_DUP_FIELDNAME',
  'ER_DUP_COLUMNNAME'
]);

const DUPLICATE_INDEX_ERRORS = new Set([
  'ER_DUP_KEYNAME'
]);

const MISSING_TABLE_ERRORS = new Set([
  'ER_NO_SUCH_TABLE',
  'ER_BAD_TABLE_ERROR'
]);

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;

  if (table && typeof table === 'object') {
    return table.tableName || table.table_name || Object.values(table)[0];
  }

  return '';
};

const tableExists = async (tableName) => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();

  return tables
    .map(normalizeTableName)
    .some((currentTableName) => currentTableName === tableName);
};

const getDatabaseErrorCode = (error) =>
  error?.original?.code || error?.parent?.code || error?.code;

const safeDescribeTable = async (tableName) => {
  if (!(await tableExists(tableName))) return null;

  try {
    return await sequelize.getQueryInterface().describeTable(tableName);
  } catch (error) {
    if (MISSING_TABLE_ERRORS.has(getDatabaseErrorCode(error))) return null;
    throw error;
  }
};

const ensureColumn = async ({ tableName, columnName, definition }) => {
  const queryInterface = sequelize.getQueryInterface();
  const table = await safeDescribeTable(tableName);

  if (!table || table[columnName]) return false;

  try {
    await queryInterface.addColumn(tableName, columnName, definition);
    return true;
  } catch (error) {
    if (DUPLICATE_COLUMN_ERRORS.has(getDatabaseErrorCode(error))) return false;
    throw error;
  }
};

const ensureIndex = async ({ tableName, fields, name, unique = false }) => {
  if (!(await tableExists(tableName))) return false;

  const queryInterface = sequelize.getQueryInterface();
  const indexes = await queryInterface.showIndex(tableName);

  if (indexes.some((index) => index.name === name)) return false;

  try {
    await queryInterface.addIndex(tableName, fields, { name, unique });
    return true;
  } catch (error) {
    if (DUPLICATE_INDEX_ERRORS.has(getDatabaseErrorCode(error))) return false;
    throw error;
  }
};

const backfillTenantColumns = async () => {
  if (await tableExists('users') && await tableExists('points_of_sale')) {
    await sequelize.query(`
      UPDATE users u
      INNER JOIN points_of_sale p ON p.id = u.point_of_sale_id
      SET u.company_id = p.company_id
      WHERE u.company_id IS NULL
        AND u.point_of_sale_id IS NOT NULL
    `, { type: QueryTypes.UPDATE });
  }

  if (await tableExists('customers') && await tableExists('establishments')) {
    await sequelize.query(`
      UPDATE customers c
      INNER JOIN establishments e ON e.id = c.establishment_id
      SET c.company_id = e.company_id
      WHERE c.company_id IS NULL
    `, { type: QueryTypes.UPDATE });
  }

  if (await tableExists('products') && await tableExists('establishments')) {
    await sequelize.query(`
      UPDATE products p
      INNER JOIN establishments e ON e.id = p.establishment_id
      SET p.company_id = e.company_id
      WHERE p.company_id IS NULL
    `, { type: QueryTypes.UPDATE });
  }
};

const ensureRuntimeSchema = async ({ beforeSync = false } = {}) => {
  const changes = [];

  if (await ensureColumn({
    tableName: 'customers',
    columnName: 'secondary_email',
    definition: {
      type: DataTypes.STRING(160),
      allowNull: true
    }
  })) {
    changes.push('customers.secondary_email');
  }

  if (await ensureColumn({
    tableName: 'companies',
    columnName: 'use_logo_in_pdf',
    definition: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  })) {
    changes.push('companies.use_logo_in_pdf');
  }

  const companyCredentialColumns = [
    ['smtp_host', { type: DataTypes.STRING(160), allowNull: true }],
    ['smtp_port', { type: DataTypes.INTEGER, allowNull: true }],
    ['smtp_secure', { type: DataTypes.BOOLEAN, allowNull: true }],
    ['smtp_user', { type: DataTypes.STRING(180), allowNull: true }],
    ['smtp_password_encrypted', { type: DataTypes.TEXT, allowNull: true }],
    ['smtp_from_name', { type: DataTypes.STRING(160), allowNull: true }],
    ['smtp_from_email', { type: DataTypes.STRING(180), allowNull: true }]
  ];

  for (const [columnName, definition] of companyCredentialColumns) {
    if (await ensureColumn({
      tableName: 'company_credentials',
      columnName,
      definition
    })) {
      changes.push(`company_credentials.${columnName}`);
    }
  }

  // Las columnas tenant se agregan primero como NULL para que bases existentes
  // puedan arrancar sin bloquear sequelize.sync(). Luego se rellenan por relación.
  for (const [tableName, columnName] of [
    ['users', 'company_id'],
    ['customers', 'company_id'],
    ['products', 'company_id']
  ]) {
    if (await ensureColumn({
      tableName,
      columnName,
      definition: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    })) {
      changes.push(`${tableName}.${columnName}`);
    }
  }

  await backfillTenantColumns();

  if (!beforeSync) {
    const indexes = [
      ['users', ['company_id', 'is_active'], 'users_tenant_active_idx'],
      ['customers', ['company_id', 'establishment_id', 'is_active'], 'customers_tenant_est_active_idx'],
      ['customers', ['company_id', 'name'], 'customers_tenant_name_idx'],
      ['products', ['company_id', 'establishment_id', 'is_active'], 'products_tenant_est_active_idx'],
      ['products', ['company_id', 'name'], 'products_tenant_name_idx'],
      ['invoices', ['company_id', 'document_type_code', 'issued_at', 'id'], 'invoices_tenant_report_cursor']
    ];

    for (const [tableName, fields, name] of indexes) {
      if (await ensureIndex({ tableName, fields, name })) {
        changes.push(`index:${name}`);
      }
    }
  }

  if (changes.length > 0) {
    console.log(`✅ Esquema actualizado: ${changes.join(', ')}`);
  }
};

module.exports = ensureRuntimeSchema;
