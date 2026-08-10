const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const EmailLog = sequelize.define('EmailLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'invoice_id'
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'user_id'
  },

  senderUsername: {
    type: DataTypes.STRING(120),
    allowNull: true,
    field: 'sender_username'
  },

  toEmail: {
    type: DataTypes.STRING(180),
    allowNull: false,
    field: 'to_email'
  },

  subject: {
    type: DataTypes.STRING(250),
    allowNull: false
  },

  message: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  status: {
    type: DataTypes.ENUM('ENVIADO', 'ERROR'),
    allowNull: false,
    defaultValue: 'ENVIADO'
  },

  providerMessageId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'provider_message_id'
  },

  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  },

  attachmentsJson: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'attachments_json'
  },

  sentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'sent_at'
  }
}, {
  tableName: 'email_logs'
});

module.exports = EmailLog;