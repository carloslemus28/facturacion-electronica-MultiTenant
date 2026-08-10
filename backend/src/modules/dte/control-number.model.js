const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const ControlNumber = sequelize.define('ControlNumber', {
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

  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  documentTypeCode: {
    type: DataTypes.STRING(2),
    allowNull: false,
    field: 'document_type_code'
  },

  establishmentCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'establishment_code'
  },

  pointOfSaleCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'point_of_sale_code'
  },

  currentSequence: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'current_sequence'
  }
}, {
  tableName: 'control_numbers',
  indexes: [
    {
      unique: true,
      fields: [
        'company_id',
        'year',
        'document_type_code',
        'establishment_code',
        'point_of_sale_code'
      ],
      name: 'control_numbers_unique_scope'
    }
  ]
});

module.exports = ControlNumber;