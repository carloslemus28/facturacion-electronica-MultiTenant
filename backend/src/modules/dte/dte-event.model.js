const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const DteEvent = sequelize.define('DteEvent', {
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

  sourceInvoiceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'source_invoice_id'
  },

  eventTypeCode: {
  type: DataTypes.ENUM('17', '18', '19'),
  allowNull: false,
  field: 'event_type_code'
},

  eventTypeName: {
    type: DataTypes.STRING(150),
    allowNull: false,
    field: 'event_type_name'
  },

  generationCode: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
    field: 'generation_code'
  },

  status: {
    type: DataTypes.ENUM(
      'GENERADO',
      'FIRMADO',
      'ACEPTADO',
      'RECHAZADO',
      'ANULADO'
    ),
    allowNull: false,
    defaultValue: 'GENERADO'
  },

  issuedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'issued_at'
  },

  contingencyStartedAt: {
  type: DataTypes.DATE,
  allowNull: true,
  field: 'contingency_started_at'
},

contingencyEndedAt: {
  type: DataTypes.DATE,
  allowNull: true,
  field: 'contingency_ended_at'
},

responsibleName: {
  type: DataTypes.STRING(100),
  allowNull: true,
  field: 'responsible_name'
},

responsibleDocumentType: {
  type: DataTypes.STRING(2),
  allowNull: true,
  field: 'responsible_document_type'
},

responsibleDocumentNumber: {
  type: DataTypes.STRING(25),
  allowNull: true,
  field: 'responsible_document_number'
},

  contingencyStartedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'contingency_started_at'
  },

  contingencyEndedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'contingency_ended_at'
  },

  responsibleName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'responsible_name'
  },

  responsibleDocumentType: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'responsible_document_type'
  },

  responsibleDocumentNumber: {
    type: DataTypes.STRING(25),
    allowNull: true,
    field: 'responsible_document_number'
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

  fusion: {
    type: DataTypes.STRING(14),
    allowNull: true
  },

  recintoFiscal: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'recinto_fiscal'
  },

  tipoRegimen: {
    type: DataTypes.STRING(4),
    allowNull: true,
    field: 'tipo_regimen'
  },

  regimen: {
    type: DataTypes.STRING(13),
    allowNull: true
  },

  tipoItemExpor: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tipo_item_expor'
  },

  sourceDocumentTypeCode: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'source_document_type_code'
  },

  sourceControlNumber: {
    type: DataTypes.STRING(40),
    allowNull: true,
    field: 'source_control_number'
  },

  sourceGenerationCode: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'source_generation_code'
  },

  sourceIssuedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'source_issued_at'
  },

  sourceReceptionSeal: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'source_reception_seal'
  },

  receiverSnapshotJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'receiver_snapshot_json'
  },

  totalNoSuj: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_no_suj'
  },

  totalExenta: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_exenta'
  },

  totalGravada: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_gravada'
  },

  totalCompraExcluidos: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_compra_excluidos'
  },

  subTotal: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'sub_total'
  },

  totalSeguro: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_seguro'
  },

  totalFlete: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_flete'
  },

  ivaRete: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'iva_rete'
  },

  reteRenta: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'rete_renta'
  },

  totalNoGravado: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_no_gravado'
  },

  totalNoOnerosas: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_no_onerosas'
  },

  totalIva: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_iva'
  },

  totalPagar: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'total_pagar'
  },

  total: {
    type: DataTypes.DECIMAL(14, 4),
    allowNull: false,
    defaultValue: 0
  },

  officialEventJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'official_event_json'
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

  receptionSeal: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'reception_seal'
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

  notes: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'dte_events',
  indexes: [
    { fields: ['company_id', 'issued_at'] },
    { fields: ['company_id', 'event_type_code', 'issued_at'] },
    { fields: ['company_id', 'status', 'issued_at'] },
    { fields: ['company_id', 'event_type_code', 'contingency_started_at'] },
    { fields: ['source_invoice_id'] },
    { fields: ['generation_code'] },
    { fields: ['event_type_code'] },
    { fields: ['status'] }
  ]
});

module.exports = DteEvent;
