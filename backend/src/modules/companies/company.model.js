const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  nit: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },

  nrc: {
    type: DataTypes.STRING(20),
    allowNull: true
  },

  legalName: {
    type: DataTypes.STRING(250),
    allowNull: false,
    field: 'legal_name'
  },

  commercialName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'commercial_name'
  },

  logoDataUrl: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'logo_data_url'
  },

  useLogoInPdf: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'use_logo_in_pdf'
  },

  economicActivityCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'economic_activity_code'
  },

  economicActivityName: {
    type: DataTypes.STRING(250),
    allowNull: false,
    field: 'economic_activity_name'
  },

  economicActivityCode2: {
  type: DataTypes.STRING(10),
  allowNull: true,
  field: 'economic_activity_code_2'
},

economicActivityName2: {
  type: DataTypes.STRING(255),
  allowNull: true,
  field: 'economic_activity_name_2'
},

economicActivityCode3: {
  type: DataTypes.STRING(10),
  allowNull: true,
  field: 'economic_activity_code_3'
},

economicActivityName3: {
  type: DataTypes.STRING(255),
  allowNull: true,
  field: 'economic_activity_name_3'
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
    defaultValue: 'M001',
    field: 'establishment_code'
  },

  pointOfSaleCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    defaultValue: 'P001',
    field: 'point_of_sale_code'
  },

  environment: {
    type: DataTypes.ENUM('TEST', 'PRODUCTION'),
    allowNull: false,
    defaultValue: 'TEST'
  },

  email: {
    type: DataTypes.STRING(160),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },

  phone: {
    type: DataTypes.STRING(30),
    allowNull: true
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

  allowedDocumentTypes: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['01', '03'],
    field: 'allowed_document_types'
  },

  usesFuelTaxes: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'uses_fuel_taxes'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'companies'
});

module.exports = Company;