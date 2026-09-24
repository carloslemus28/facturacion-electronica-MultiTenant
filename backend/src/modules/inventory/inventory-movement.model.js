const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const InventoryMovement = sequelize.define('InventoryMovement', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'company_id'
  },
  establishmentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'establishment_id'
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_id'
  },
  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'invoice_id'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'user_id'
  },
  inventoryType: {
    type: DataTypes.ENUM('PRODUCTO'),
    allowNull: false,
    defaultValue: 'PRODUCTO',
    field: 'inventory_type'
  },
  movementType: {
    type: DataTypes.ENUM('ENTRADA', 'SALIDA', 'AJUSTE'),
    allowNull: false,
    field: 'movement_type'
  },
  source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'MANUAL'
  },
  reference: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  supplierName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'supplier_name'
  },
  supplierNationality: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'supplier_nationality'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  quantityIn: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_in'
  },
  quantityOut: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_out'
  },
  unitCost: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true,
    field: 'unit_cost'
  },
  unitSalePrice: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true,
    field: 'unit_sale_price'
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(16, 4),
    allowNull: true,
    field: 'balance_after'
  },
  movementDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'movement_date'
  }
}, {
  tableName: 'inventory_movements',
  indexes: [
    { fields: ['company_id', 'establishment_id', 'movement_date'] },
    { fields: ['company_id', 'product_id', 'movement_date'] },
    { fields: ['invoice_id'] },
    { fields: ['user_id'] }
  ]
});

module.exports = InventoryMovement;
