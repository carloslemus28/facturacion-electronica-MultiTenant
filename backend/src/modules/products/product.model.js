const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Product = sequelize.define('Product', {
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

  code: {
    type: DataTypes.STRING(50),
    allowNull: false
  },

  itemType: {
    type: DataTypes.ENUM('PRODUCTO', 'SERVICIO'),
    allowNull: false,
    defaultValue: 'PRODUCTO',
    field: 'item_type'
  },

  name: {
    type: DataTypes.STRING(250),
    allowNull: false
  },

  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },

  unitOfMeasure: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '59',
    field: 'unit_of_measure'
  },

  unitOfMeasureName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Unidad',
    field: 'unit_of_measure_name'
  },

  purchasePrice: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    field: 'purchase_price'
  },

  salePrice: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    field: 'sale_price'
  },

  unitPrice: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    field: 'unit_price'
  },

  appliesIva: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'applies_iva'
  },

  stock: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'products',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'establishment_id', 'code']
    },
    {
      fields: ['company_id', 'establishment_id', 'is_active']
    },
    {
      fields: ['company_id', 'name']
    }
  ]
});

module.exports = Product;