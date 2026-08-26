const { verifyAccessToken } = require('../modules/auth/auth.tokens');
const authService = require('../modules/auth/auth.service');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        code: 'ACCESS_TOKEN_MISSING',
        message: 'Token de acceso no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    let payload;

    try {
      payload = verifyAccessToken(token);
    } catch (tokenError) {
      const expired = tokenError?.name === 'TokenExpiredError';

      return res.status(401).json({
        ok: false,
        code: expired ? 'ACCESS_TOKEN_EXPIRED' : 'ACCESS_TOKEN_INVALID',
        message: expired ? 'Token de acceso vencido' : 'Token de acceso inválido'
      });
    }

    const { user, roles, permissions } = await authService.getUserRolesAndPermissions(payload.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({
        ok: false,
        code: 'USER_NOT_AVAILABLE',
        message: 'Usuario no autorizado'
      });
    }

    const selectedCompany = await authService.resolveCompanyForUser({
      user,
      roles,
      requestedCompanyId: req.headers['x-company-id']
    });

    req.user = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      companyId: user.companyId,
      pointOfSaleId: user.pointOfSaleId,
      roles,
      permissions,
      pointOfSale: user.pointOfSale
        ? {
            id: user.pointOfSale.id,
            companyId: user.pointOfSale.companyId,
            establishmentId: user.pointOfSale.establishmentId,
            code: user.pointOfSale.code,
            name: user.pointOfSale.name,
            establishment: user.pointOfSale.establishment
              ? {
                  id: user.pointOfSale.establishment.id,
                  establishmentCode: user.pointOfSale.establishment.establishmentCode,
                  name: user.pointOfSale.establishment.name
                }
              : null
          }
        : null,
      company: selectedCompany
        ? authService.buildCompanyPayload(selectedCompany)
        : null
    };

    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;

    return res.status(statusCode).json({
      ok: false,
      message: error.message || 'Token inválido o vencido'
    });
  }
};

const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    const userPermissions = req.user?.permissions || [];

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para realizar esta acción'
      });
    }

    next();
  };
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.roles?.includes('ADMIN')) {
    return res.status(403).json({
      ok: false,
      message: 'Esta configuración está disponible únicamente para el Administrador'
    });
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  requireAdmin
};
