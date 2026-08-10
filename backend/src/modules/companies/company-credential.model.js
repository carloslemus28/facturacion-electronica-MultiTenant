const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const CompanyCredential = sequelize.define('CompanyCredential', {
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

  mhUser: {
    type: DataTypes.STRING(80),
    allowNull: true,
    field: 'mh_user'
  },

  mhPasswordEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'mh_password_encrypted'
  },

  signerPrivateKeyPasswordEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'signer_private_key_password_encrypted'
  },

  certificateFileName: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'certificate_file_name'
  },

  smtpHost: {
    type: DataTypes.STRING(160),
    allowNull: true,
    field: 'smtp_host'
  },

  smtpPort: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'smtp_port'
  },

  smtpSecure: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    field: 'smtp_secure'
  },

  smtpUser: {
    type: DataTypes.STRING(180),
    allowNull: true,
    field: 'smtp_user'
  },

  smtpPasswordEncrypted: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'smtp_password_encrypted'
  },

  smtpFromName: {
    type: DataTypes.STRING(160),
    allowNull: true,
    field: 'smtp_from_name'
  },

  smtpFromEmail: {
    type: DataTypes.STRING(180),
    allowNull: true,
    field: 'smtp_from_email'
  }
}, {
  tableName: 'company_credentials',
  indexes: [
    {
      unique: true,
      fields: ['company_id'],
      name: 'company_credentials_company_unique'
    }
  ]
});

module.exports = CompanyCredential;
