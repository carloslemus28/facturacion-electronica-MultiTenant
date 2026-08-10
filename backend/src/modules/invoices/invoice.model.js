const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Invoice = sequelize.define('Invoice', {
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

  pointOfSaleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'point_of_sale_id'
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },

  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'customer_id'
  },

  documentTypeCode: {
    type: DataTypes.STRING(2),
    allowNull: false,
    field: 'document_type_code'
  },

  documentTypeName: {
    type: DataTypes.STRING(120),
    allowNull: false,
    field: 'document_type_name'
  },

  controlNumber: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true,
    field: 'control_number'
  },

  generationCode: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
    field: 'generation_code'
  },

  signedJws: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'signed_jws'
  },

  signedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'signed_at'
  },

  validationStatus: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'PENDIENTE',
    field: 'validation_status'
  },

  validationErrorsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'validation_errors_json'
  },

  mhResponseJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'mh_response_json'
  },

  mhObservationsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'mh_observations_json'
  },

  receptionSeal: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'reception_seal'
  },

  relatedInvoiceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'related_invoice_id'
  },

  relatedControlNumber: {
    type: DataTypes.STRING(40),
    allowNull: true,
    field: 'related_control_number'
  },

  relatedGenerationCode: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'related_generation_code'
  },

  relatedDocumentTypeCode: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'related_document_type_code'
  },

  transmittedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'transmitted_at'
  },

  acceptedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'accepted_at'
  },

  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },

  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },

  invalidatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invalidated_at'
  },

  invalidationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'invalidation_reason'
  },

  invalidationReceptionSeal: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'invalidation_reception_seal'
  },

  invalidationGenerationCode: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'invalidation_generation_code'
  },

  invalidationDeadlineAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invalidation_deadline_at'
  },

  invalidationSignedJws: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    field: 'invalidation_signed_jws'
  },

  invalidationSignedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'invalidation_signed_at'
  },

  invalidationResponseJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'invalidation_response_json'
  },

  invalidationObservationsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'invalidation_observations_json'
  },

  status: {
    type: DataTypes.ENUM(
      'BORRADOR',
      'GENERADO',
      'FIRMADO',
      'TRANSMITIDO',
      'ACEPTADO',
      'RECHAZADO',
      'ANULADO'
    ),
    allowNull: false,
    defaultValue: 'BORRADOR'
  },

  issuedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'issued_at'
  },

  tipoModelo: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 1,
  field: 'tipo_modelo'
},

tipoOperacion: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 1,
  field: 'tipo_operacion'
},

tipoContingencia: {
  type: DataTypes.INTEGER,
  allowNull: true,
  field: 'tipo_contingencia'
},

motivoContin: {
  type: DataTypes.STRING(500),
  allowNull: true,
  field: 'motivo_contin'
},

  tipoModelo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'tipo_modelo'
  },

  tipoOperacion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'tipo_operacion'
  },

  tipoContingencia: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tipo_contingencia'
  },

  motivoContin: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'motivo_contin'
  },

  operationCondition: {
    type: DataTypes.ENUM('CONTADO', 'CREDITO', 'OTRO'),
    allowNull: false,
    defaultValue: 'CONTADO',
    field: 'operation_condition'
  },

  paymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'payment_method'
  },

  saleDescription: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'sale_description'
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
  },

  notes: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'invoices',
  indexes: [
    { fields: ['company_id', 'issued_at'] },
    { fields: ['company_id', 'document_type_code', 'issued_at', 'id'], name: 'invoices_tenant_report_cursor' },
    { fields: ['company_id', 'status', 'issued_at'] },
    { fields: ['document_type_code'] },
    { fields: ['status'] },
    { fields: ['issued_at'] },
    { fields: ['control_number'] },
    { fields: ['generation_code'] }
  ]
});

module.exports = Invoice;
