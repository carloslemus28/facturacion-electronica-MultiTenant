const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const RefreshToken = sequelize.define('RefreshToken', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  tokenId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'token_id'
  },
  tokenHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'token_hash'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'expires_at'
  },
  revokedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'revoked_at'
  },
  replacedByTokenId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'replaced_by_token_id'
  },
  ipAddress: {
    type: DataTypes.STRING(80),
    allowNull: true,
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'user_agent'
  }
}, {
  tableName: 'refresh_tokens'
});

module.exports = RefreshToken;