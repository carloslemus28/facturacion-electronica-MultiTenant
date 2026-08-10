const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const PointOfSale = sequelize.define('PointOfSale', {
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
    type: DataTypes.STRING(4),
    allowNull: false
  },

  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },

  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'points_of_sale',
  indexes: [
    {
      unique: true,
      fields: ['establishment_id', 'code']
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['establishment_id']
    }
  ]
});

module.exports = PointOfSale;