const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');

const User = require('./user.model');
const Role = require('./role.model');
const PointOfSale = require('../companies/point-of-sale.model');
const Establishment = require('../companies/establishment.model');

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};

const validateUsername = (username) => /^[A-Za-z0-9._-]{4,80}$/.test(username);

const userIncludes = [
  { model: Role, as: 'roles', attributes: ['id', 'code', 'name'] },
  {
    model: PointOfSale,
    as: 'pointOfSale',
    include: [{ model: Establishment, as: 'establishment' }]
  }
];

const sanitizeUser = (user) => {
  const plainUser = user.toJSON();
  delete plainUser.passwordHash;

  return {
    id: plainUser.id,
    companyId: plainUser.companyId,
    username: plainUser.username,
    firstName: plainUser.firstName,
    lastName: plainUser.lastName,
    email: plainUser.email,
    pointOfSaleId: plainUser.pointOfSaleId,
    isActive: plainUser.isActive,
    lastLoginAt: plainUser.lastLoginAt,
    createdAt: plainUser.createdAt,
    updatedAt: plainUser.updatedAt,
    roles: plainUser.roles?.map((role) => ({ id: role.id, code: role.code, name: role.name })) || [],
    pointOfSale: plainUser.pointOfSale
      ? {
          id: plainUser.pointOfSale.id,
          companyId: plainUser.pointOfSale.companyId,
          establishmentId: plainUser.pointOfSale.establishmentId,
          code: plainUser.pointOfSale.code,
          name: plainUser.pointOfSale.name,
          description: plainUser.pointOfSale.description,
          isActive: plainUser.pointOfSale.isActive,
          establishment: plainUser.pointOfSale.establishment || null
        }
      : null
  };
};

const ensureFacturadorRole = async (roleCode = 'FACTURADOR') => {
  if (roleCode !== 'FACTURADOR') {
    const error = new Error('Desde esta configuración solo se pueden administrar usuarios FACTURADOR. El usuario ADMIN es global del sistema.');
    error.statusCode = 400;
    throw error;
  }

  const role = await Role.findOne({ where: { code: 'FACTURADOR' } });
  if (!role) {
    const error = new Error('El rol FACTURADOR no existe');
    error.statusCode = 500;
    throw error;
  }
  return role;
};

const getTenantUser = async (id, companyId) => {
  const user = await User.findOne({
    where: { id, companyId },
    include: userIncludes
  });

  if (!user) {
    const error = new Error('Usuario no encontrado para el contribuyente activo');
    error.statusCode = 404;
    throw error;
  }
  return user;
};

const listUsers = async ({ companyId }) => {
  const users = await User.findAll({
    where: { companyId },
    include: userIncludes,
    order: [['id', 'ASC']]
  });
  return users.map(sanitizeUser);
};

const validatePointOfSaleForUser = async ({ companyId, pointOfSaleId }) => {
  if (!pointOfSaleId) {
    const error = new Error('El usuario facturador debe tener un punto de venta asignado');
    error.statusCode = 400;
    throw error;
  }

  const pointOfSale = await PointOfSale.findOne({ where: { id: pointOfSaleId, companyId } });
  if (!pointOfSale) {
    const error = new Error('El punto de venta no pertenece al contribuyente activo');
    error.statusCode = 404;
    throw error;
  }
  if (!pointOfSale.isActive) {
    const error = new Error('El punto de venta indicado está inactivo');
    error.statusCode = 400;
    throw error;
  }
  return pointOfSale;
};

const validateUniqueLogin = async ({ username, email, excludeId = null }) => {
  const userWhere = { username };
  if (excludeId) userWhere.id = { [Op.ne]: excludeId };
  if (await User.findOne({ where: userWhere, attributes: ['id'] })) {
    const error = new Error('Ya existe un usuario registrado con ese nombre de usuario');
    error.statusCode = 409;
    throw error;
  }

  if (email) {
    const emailWhere = { email };
    if (excludeId) emailWhere.id = { [Op.ne]: excludeId };
    if (await User.findOne({ where: emailWhere, attributes: ['id'] })) {
      const error = new Error('Ya existe un usuario registrado con ese correo');
      error.statusCode = 409;
      throw error;
    }
  }
};

const createUser = async ({ data, companyId }) => {
  const username = normalizeText(data.username);
  if (!username || !validateUsername(username)) {
    const error = new Error('El nombre de usuario debe tener entre 4 y 80 caracteres y solo puede usar letras, números, punto, guion o guion bajo');
    error.statusCode = 400;
    throw error;
  }
  if (!normalizeText(data.firstName) || !normalizeText(data.lastName)) {
    const error = new Error('Nombre y apellido del usuario son obligatorios');
    error.statusCode = 400;
    throw error;
  }
  if (!data.password || data.password.length < 8) {
    const error = new Error('La contraseña debe tener al menos 8 caracteres');
    error.statusCode = 400;
    throw error;
  }

  const email = normalizeText(data.email);
  await validateUniqueLogin({ username, email });
  const role = await ensureFacturadorRole(data.roleCode || 'FACTURADOR');
  const pointOfSaleId = data.pointOfSaleId || null;
  await validatePointOfSaleForUser({ companyId, pointOfSaleId });

  const user = await User.create({
    companyId,
    username,
    firstName: normalizeText(data.firstName),
    lastName: normalizeText(data.lastName),
    email,
    passwordHash: await bcrypt.hash(data.password, 12),
    pointOfSaleId,
    isActive: data.isActive ?? true
  });
  await user.setRoles([role]);
  return sanitizeUser(await getTenantUser(user.id, companyId));
};

const updateUser = async (id, { data, companyId }) => {
  const user = await getTenantUser(id, companyId);
  await ensureFacturadorRole(data.roleCode || user.roles?.[0]?.code || 'FACTURADOR');

  const username = normalizeText(data.username ?? user.username);
  if (!username || !validateUsername(username)) {
    const error = new Error('El nombre de usuario no tiene un formato válido');
    error.statusCode = 400;
    throw error;
  }
  const email = normalizeText(data.email ?? user.email);
  await validateUniqueLogin({ username, email, excludeId: user.id });

  const pointOfSaleId = data.pointOfSaleId ?? user.pointOfSaleId;
  await validatePointOfSaleForUser({ companyId, pointOfSaleId });

  await user.update({
    username,
    firstName: normalizeText(data.firstName ?? user.firstName),
    lastName: normalizeText(data.lastName ?? user.lastName),
    email,
    pointOfSaleId,
    isActive: data.isActive ?? user.isActive
  });

  return sanitizeUser(await getTenantUser(user.id, companyId));
};

const resetPassword = async (id, newPassword, companyId) => {
  const user = await getTenantUser(id, companyId);
  await user.update({ passwordHash: await bcrypt.hash(newPassword, 12) });
  return true;
};

module.exports = { listUsers, createUser, updateUser, resetPassword };
