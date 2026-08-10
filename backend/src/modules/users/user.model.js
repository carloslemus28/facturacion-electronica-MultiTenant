const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  username: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true
  },

  firstName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'first_name'
  },

  lastName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'last_name'
  },

  /*
    El correo queda como opcional para usos futuros:
    notificaciones, recuperación de cuenta, envío de avisos, etc.
    Ya no se usará para iniciar sesión.
  */
  email: {
    type: DataTypes.STRING(160),
    allowNull: true,
    unique: true,
    validate: {
      isEmail: true
    }
  },

  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'password_hash'
  },

  companyId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'company_id'
  },

  pointOfSaleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'point_of_sale_id'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },

  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at'
  }
}, {
  tableName: 'users',
  indexes: [
    { fields: ['company_id', 'is_active'] },
    { fields: ['point_of_sale_id'] }
  ]
});

User.prototype.comparePassword = async function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = User;