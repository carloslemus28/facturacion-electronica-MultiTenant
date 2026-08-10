const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const DteEventItem = sequelize.define('DteEventItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  eventId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'event_id'
  },

  sourceInvoiceItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'source_invoice_item_id'
  },

  numItem: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'num_item'
  },

  itemType: {
    type: DataTypes.ENUM('PRODUCTO', 'SERVICIO'),
    allowNull: true,
    field: 'item_type'
  },

  codigoGeneracion: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'codigo_generacion'
  },

  code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  unitOfMeasure: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'unit_of_measure'
  },

  description: {
    type: DataTypes.STRING(1500),
    allowNull: false
  },

  quantity: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 1
  },

  unitPrice: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'unit_price'
  },

  montoDescu: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'monto_descu'
  },

  codTributo: {
    type: DataTypes.STRING(2),
    allowNull: true,
    field: 'cod_tributo'
  },

  ventaNoSuj: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'venta_no_suj'
  },

  ventaExenta: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'venta_exenta'
  },

  ventaGravada: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'venta_gravada'
  },

  compra: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0
  },

  tributosJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'tributos_json'
  },

  psv: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0
  },

  ivaItem: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'iva_item'
  },

  noGravado: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'no_gravado'
  },

  seguro: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0
  },

  flete: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0
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

  total: {
    type: DataTypes.DECIMAL(14, 8),
    allowNull: false,
    defaultValue: 0
  },

  codigoGeneracionRef: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'codigo_generacion_ref'
  },

  tipoDocumento: {
    type: DataTypes.STRING(10),
    allowNull: true,
    field: 'tipo_documento'
  },

  numDocumento: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'num_documento'
  },

  fechaEmision: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'fecha_emision'
  },

  docDel: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'doc_del'
  },

  docAl: {
    type: DataTypes.STRING(36),
    allowNull: true,
    field: 'doc_al'
  }
}, {
  tableName: 'dte_event_items',
  indexes: [
    { fields: ['event_id'] },
    { fields: ['source_invoice_item_id'] }
  ]
});

module.exports = DteEventItem;
