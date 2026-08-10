const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const Permission = sequelize.define('Permission', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING(80),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  module: {
    type: DataTypes.STRING(80),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'permissions'
});

module.exports = Permission;