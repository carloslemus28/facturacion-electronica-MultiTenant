const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Customer = sequelize.define('Customer', {
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

  /*
    Este campo se conserva internamente por compatibilidad con documentos anteriores,
    pero ya no se mostrará ni se pedirá en el formulario.
    El sistema lo calculará automáticamente según los datos registrados.
  */
  customerType: {
    type: DataTypes.ENUM(
      'CONSUMIDOR_FINAL',
      'CONTRIBUYENTE',
      'SUJETO_EXCLUIDO',
      'EXTRANJERO'
    ),
    allowNull: false,
    defaultValue: 'CONSUMIDOR_FINAL',
    field: 'customer_type'
  },

  documentType: {
    type: DataTypes.ENUM(
      'NIT',
      'DUI',
      'PASAPORTE',
      'CARNET_RESIDENTE',
      'OTRO',
      'SIN_DOCUMENTO'
    ),
    allowNull: false,
    defaultValue: 'SIN_DOCUMENTO',
    field: 'document_type'
  },

  documentNumber: {
    type: DataTypes.STRING(30),
    allowNull: true,
    field: 'document_number'
  },

  nrc: {
    type: DataTypes.STRING(20),
    allowNull: true
  },

  name: {
    type: DataTypes.STRING(250),
    allowNull: false
  },

  commercialName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'commercial_name'
  },

  economicActivityCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'economic_activity_code'
  },

  economicActivityName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'economic_activity_name'
  },

  secondaryEconomicActivityCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'secondary_economic_activity_code'
  },

  secondaryEconomicActivityName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'secondary_economic_activity_name'
  },

  tertiaryEconomicActivityCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'tertiary_economic_activity_code'
  },

  tertiaryEconomicActivityName: {
    type: DataTypes.STRING(250),
    allowNull: true,
    field: 'tertiary_economic_activity_name'
  },

  email: {
    type: DataTypes.STRING(160),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },

  secondaryEmail: {
    type: DataTypes.STRING(160),
    allowNull: true,
    field: 'secondary_email',
    validate: {
      isEmail: true
    }
  },

  phone: {
    type: DataTypes.STRING(30),
    allowNull: true
  },

  phoneCountryCode: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'phone_country_code'
  },

  phoneDialCode: {
    type: DataTypes.STRING(8),
    allowNull: true,
    field: 'phone_dial_code'
  },

  phoneNationalNumber: {
    type: DataTypes.STRING(30),
    allowNull: true,
    field: 'phone_national_number'
  },

  departmentCode: {
    type: DataTypes.STRING(2),
    allowNull: true,
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
    allowNull: true,
    field: 'municipality_code'
  },

  municipalityName: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'municipality_name'
  },

  addressComplement: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'address_complement'
  },

  countryCode: {
    type: DataTypes.STRING(3),
    allowNull: true,
    field: 'country_code'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'customers',
  indexes: [
    {
      fields: ['establishment_id']
    },
    {
      fields: ['establishment_id', 'document_type', 'document_number']
    },
    {
      fields: ['name']
    },
    {
      fields: ['email']
    }
  ]
});

module.exports = Customer;