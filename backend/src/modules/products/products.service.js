const { Op } = require('sequelize');

const Product = require('./product.model');
const User = require('../users/user.model');
const Role = require('../users/role.model');
const Company = require('../companies/company.model');
const Establishment = require('../companies/establishment.model');
const PointOfSale = require('../companies/point-of-sale.model');

const normalizeText = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  return value;
};

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const isAdminUser = (user) => {
  return Array.isArray(user?.roles) && user.roles.includes('ADMIN');
};

const resolveUserContext = async (user) => {
  const userId = user?.id || user?.sub;

  if (!userId) {
    const error = new Error('Usuario no autenticado');
    error.statusCode = 401;
    throw error;
  }

  const dbUser = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'roles'
      },
      {
        model: PointOfSale,
        as: 'pointOfSale',
        include: [
          {
            model: Company,
            as: 'company'
          },
          {
            model: Establishment,
            as: 'establishment'
          }
        ]
      }
    ]
  });

  if (!dbUser || !dbUser.isActive) {
    const error = new Error('Usuario no disponible');
    error.statusCode = 401;
    throw error;
  }

  const roles = Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles
    : dbUser.roles.map((role) => role.code);

  let company = dbUser.pointOfSale?.company || null;

  if (roles.includes('ADMIN') && user?.company?.id) {
    company = await Company.findOne({
      where: { id: user.company.id, isActive: true }
    });
  }

  if (!company && roles.includes('ADMIN')) {
    company = await Company.findOne({
      where: { isActive: true },
      order: [['id', 'ASC']]
    });
  }

  return {
    id: dbUser.id,
    username: dbUser.username,
    roles,
    company: company
      ? {
          id: company.id,
          legalName: company.legalName
        }
      : null,
    pointOfSale: dbUser.pointOfSale
      ? {
          id: dbUser.pointOfSale.id,
          companyId: dbUser.pointOfSale.companyId,
          establishmentId: dbUser.pointOfSale.establishmentId,
          code: dbUser.pointOfSale.code,
          name: dbUser.pointOfSale.name,
          establishment: dbUser.pointOfSale.establishment
            ? {
                id: dbUser.pointOfSale.establishment.id,
                establishmentCode: dbUser.pointOfSale.establishment.establishmentCode,
                name: dbUser.pointOfSale.establishment.name
              }
            : null
        }
      : null
  };
};

const getMainEstablishmentId = async (companyId) => {
  const establishment = await Establishment.findOne({
    where: {
      companyId,
      establishmentCode: 'M001',
      isActive: true
    },
    order: [['id', 'ASC']]
  });

  if (!establishment) {
    const error = new Error('No se encontró la Casa Matriz M001 para la empresa activa');
    error.statusCode = 400;
    throw error;
  }

  return establishment.id;
};

const getWritableEstablishmentId = async ({ user, requestedEstablishmentId = null }) => {
  if (!user?.company) {
    const error = new Error('El usuario no tiene empresa emisora asignada');
    error.statusCode = 400;
    throw error;
  }

  if (isAdminUser(user)) {
    if (requestedEstablishmentId) {
      const establishment = await Establishment.findOne({
        where: { id: requestedEstablishmentId, companyId: user.company.id }
      });

      if (!establishment || Number(establishment.companyId) !== Number(user.company.id)) {
        const error = new Error('El establecimiento seleccionado no pertenece a la empresa activa');
        error.statusCode = 400;
        throw error;
      }

      return establishment.id;
    }

    return getMainEstablishmentId(user.company.id);
  }

  if (!user.pointOfSale?.establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  return user.pointOfSale.establishmentId;
};

const buildVisibilityWhere = async ({ user, requestedEstablishmentId = '' }) => {
  const where = { companyId: user.company.id };

  if (isAdminUser(user)) {
    if (requestedEstablishmentId) {
      where.establishmentId = Number(requestedEstablishmentId);
    }

    return where;
  }

  if (!user.pointOfSale?.establishmentId) {
    const error = new Error('El usuario no tiene establecimiento o sucursal asignada');
    error.statusCode = 403;
    throw error;
  }

  where.establishmentId = user.pointOfSale.establishmentId;

  return where;
};

const validateProductData = (data) => {
  const itemType = data.itemType || 'PRODUCTO';

  if (!data.code || !data.code.trim()) {
    const error = new Error('El código del producto o servicio es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (!data.name || !data.name.trim()) {
    const error = new Error('El nombre del producto o servicio es obligatorio');
    error.statusCode = 400;
    throw error;
  }

  if (itemType === 'PRODUCTO') {
    if (!data.description || !data.description.trim()) {
      const error = new Error('La descripción del producto es obligatoria');
      error.statusCode = 400;
      throw error;
    }

    if (data.description.trim().length > 500) {
      const error = new Error('La descripción no puede superar los 500 caracteres');
      error.statusCode = 400;
      throw error;
    }

    if (data.purchasePrice === undefined || data.purchasePrice === null || data.purchasePrice === '') {
      const error = new Error('El precio de compra es obligatorio para productos');
      error.statusCode = 400;
      throw error;
    }

    if (data.salePrice === undefined || data.salePrice === null || data.salePrice === '') {
      const error = new Error('El precio de venta es obligatorio para productos');
      error.statusCode = 400;
      throw error;
    }

    if (Number(data.purchasePrice) < 0) {
      const error = new Error('El precio de compra debe ser mayor o igual a cero');
      error.statusCode = 400;
      throw error;
    }

    if (Number(data.salePrice) < 0) {
      const error = new Error('El precio de venta debe ser mayor o igual a cero');
      error.statusCode = 400;
      throw error;
    }

    if (data.stock !== undefined && data.stock !== null && data.stock !== '' && Number(data.stock) < 0) {
      const error = new Error('El stock no puede ser negativo');
      error.statusCode = 400;
      throw error;
    }
  }

  if (itemType === 'SERVICIO' && data.description && data.description.trim().length > 500) {
    const error = new Error('La descripción no puede superar los 500 caracteres');
    error.statusCode = 400;
    throw error;
  }
};

const listProducts = async ({ query = {}, user }) => {
  const currentUser = await resolveUserContext(user);
  const { q = '', itemType = '', isActive = '', establishmentId = '' } = query;

  const where = await buildVisibilityWhere({
    user: currentUser,
    requestedEstablishmentId: establishmentId
  });

  if (q) {
    where[Op.or] = [
      { code: { [Op.like]: `%${q}%` } },
      { name: { [Op.like]: `%${q}%` } },
      { description: { [Op.like]: `%${q}%` } }
    ];
  }

  if (itemType) {
    where.itemType = itemType;
  }

  if (isActive !== '') {
    where.isActive = isActive === 'true';
  }

  const products = await Product.findAll({
    where,
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ],
    order: [['name', 'ASC']]
  });

  return products;
};

const getProductById = async (id, { user } = {}) => {
  const currentUser = await resolveUserContext(user);

  const product = await Product.findOne({
    where: { id, companyId: currentUser.company.id },
    include: [
      {
        model: Establishment,
        as: 'establishment'
      }
    ]
  });

  if (!product) {
    const error = new Error('Producto o servicio no encontrado');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdminUser(currentUser) && Number(product.establishmentId) !== Number(currentUser.pointOfSale?.establishmentId)) {
    const error = new Error('No tiene permiso para consultar productos o servicios de otra sucursal');
    error.statusCode = 403;
    throw error;
  }

  return product;
};

const validateDuplicateCode = async ({
  companyId,
  establishmentId,
  code,
  excludeId = null
}) => {
  const where = {
    companyId,
    establishmentId,
    code
  };

  if (excludeId) {
    where.id = {
      [Op.ne]: excludeId
    };
  }

  const existingProduct = await Product.findOne({ where });

  if (existingProduct) {
    const error = new Error('Ya existe un producto o servicio con ese código en este establecimiento');
    error.statusCode = 409;
    throw error;
  }
};

const createProduct = async ({ data, user }) => {
  const currentUser = await resolveUserContext(user);

  const establishmentId = await getWritableEstablishmentId({
    user: currentUser,
    requestedEstablishmentId: data.establishmentId
  });

  const itemType = data.itemType || 'PRODUCTO';

  validateProductData({
    ...data,
    itemType
  });

  const code = data.code.trim();
  const isService = itemType === 'SERVICIO';

  await validateDuplicateCode({
    companyId: currentUser.company.id,
    establishmentId,
    code
  });

  const product = await Product.create({
    companyId: currentUser.company.id,
    establishmentId,
    code,
    itemType,
    name: data.name.trim(),
    description: isService ? normalizeText(data.description) : normalizeText(data.description),
    unitOfMeasure: data.unitOfMeasure || (isService ? '99' : '59'),
    unitOfMeasureName: data.unitOfMeasureName || (isService ? 'Servicio' : 'Unidad'),

    purchasePrice: isService ? null : normalizeNumber(data.purchasePrice),
    salePrice: isService ? null : normalizeNumber(data.salePrice),

    unitPrice: isService ? null : normalizeNumber(data.salePrice),

    appliesIva: true,
    stock: isService ? null : normalizeNumber(data.stock),
    isActive: data.isActive ?? true
  });

  return getProductById(product.id, {
    user: currentUser
  });
};

const updateProduct = async (id, { data, user }) => {
  const currentUser = await resolveUserContext(user);
  const product = await getProductById(id, { user: currentUser });

  const nextEstablishmentId = await getWritableEstablishmentId({
    user: currentUser,
    requestedEstablishmentId: data.establishmentId ?? product.establishmentId
  });

  if (!isAdminUser(currentUser) && Number(nextEstablishmentId) !== Number(product.establishmentId)) {
    const error = new Error('No puede mover productos o servicios entre establecimientos');
    error.statusCode = 403;
    throw error;
  }

  const nextItemType = data.itemType ?? product.itemType;
  const isService = nextItemType === 'SERVICIO';
  const nextCode = data.code ? data.code.trim() : product.code;
  const nextDescription = data.description !== undefined
    ? normalizeText(data.description)
    : product.description;

  validateProductData({
    ...product.toJSON(),
    ...data,
    code: nextCode,
    description: nextDescription,
    itemType: nextItemType
  });

  await validateDuplicateCode({
    companyId: currentUser.company.id,
    establishmentId: nextEstablishmentId,
    code: nextCode,
    excludeId: product.id
  });

  await product.update({
    establishmentId: nextEstablishmentId,
    code: nextCode,
    itemType: nextItemType,
    name: data.name ?? product.name,
    description: nextDescription,
    unitOfMeasure: data.unitOfMeasure ?? product.unitOfMeasure,
    unitOfMeasureName: data.unitOfMeasureName ?? product.unitOfMeasureName,

    purchasePrice: isService ? null : normalizeNumber(data.purchasePrice ?? product.purchasePrice),
    salePrice: isService ? null : normalizeNumber(data.salePrice ?? product.salePrice),

    unitPrice: isService ? null : normalizeNumber(data.salePrice ?? product.salePrice),

    appliesIva: true,
    stock: isService ? null : normalizeNumber(data.stock ?? product.stock),
    isActive: data.isActive ?? product.isActive
  });

  return getProductById(product.id, {
    user: currentUser
  });
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct
};