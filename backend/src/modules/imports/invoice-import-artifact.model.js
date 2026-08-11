const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const InvoiceImportArtifact = sequelize.define('InvoiceImportArtifact', {
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
  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'invoice_id'
  },
  sourceJsonName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'source_json_name'
  },
  sourcePdfName: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'source_pdf_name'
  },
  jsonRelativePath: {
    type: DataTypes.STRING(600),
    allowNull: false,
    field: 'json_relative_path'
  },
  pdfRelativePath: {
    type: DataTypes.STRING(600),
    allowNull: true,
    field: 'pdf_relative_path'
  },
  importedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'imported_at'
  }
}, {
  tableName: 'invoice_import_artifacts',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'invoice_id'],
      name: 'invoice_import_artifacts_tenant_invoice_unique'
    },
    {
      fields: ['company_id', 'imported_at'],
      name: 'invoice_import_artifacts_tenant_date_idx'
    }
  ]
});

module.exports = InvoiceImportArtifact;
