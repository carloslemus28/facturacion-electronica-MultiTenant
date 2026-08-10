const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const InvoiceItem = sequelize.define('InvoiceItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'invoice_id'
  },

  productId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_id'
  },

  itemType: {
    type: DataTypes.ENUM('PRODUCTO', 'SERVICIO'),
    allowNull: false,
    field: 'item_type'
  },

  code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  description: {
    type: DataTypes.STRING(500),
    allowNull: false
  },

  unitOfMeasure: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'unit_of_measure'
  },

  unitOfMeasureName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'unit_of_measure_name'
  },

  saleType: {
    type: DataTypes.ENUM('GRAVADA', 'EXENTA', 'NO_SUJETA'),
    allowNull: false,
    defaultValue: 'GRAVADA',
    field: 'sale_type'
  },

  quantity: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 1
  },

  unitPrice: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    field: 'unit_price'
  },

  purchasePrice: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: true,
    field: 'purchase_price'
  },

  noSuj: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'no_suj'
  },

  exenta: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  gravada: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  subtotal: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  iva: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  retention1: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'retention_1'
  },

  fovial: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  cotrans: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  total: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'invoice_items'
});

module.exports = InvoiceItem;