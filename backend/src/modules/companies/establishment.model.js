const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Establishment = sequelize.define('Establishment', {
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

  establishmentType: {
    type: DataTypes.ENUM('CASA_MATRIZ', 'SUCURSAL', 'BODEGA', 'PREDIO'),
    allowNull: false,
    defaultValue: 'CASA_MATRIZ',
    field: 'establishment_type'
  },

  establishmentCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'establishment_code'
  },

  name: {
    type: DataTypes.STRING(160),
    allowNull: false
  },

  departmentCode: {
    type: DataTypes.STRING(2),
    allowNull: false,
    field: 'department_code'
  },

  departmentName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'department_name'
  },

  districtName: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'district_name'
  },

  municipalityCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'municipality_code'
  },

  municipalityName: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'municipality_name'
  },

  addressComplement: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'address_complement'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'establishments',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'establishment_code']
    },
    {
      fields: ['company_id']
    },
    {
      fields: ['establishment_type']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = Establishment;