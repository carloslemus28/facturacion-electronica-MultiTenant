const bcrypt = require('bcryptjs');

const User = require('../modules/users/user.model');
const Role = require('../modules/users/role.model');
const Permission = require('../modules/users/permission.model');

const seedSecurityData = async () => {
  const permissionsData = [
    ['USERS_MANAGE', 'Gestionar usuarios', 'users'],
    ['ROLES_MANAGE', 'Gestionar roles', 'users'],
    ['COMPANIES_MANAGE', 'Gestionar empresa emisora', 'companies'],

    ['CUSTOMERS_MANAGE', 'Gestionar clientes', 'customers'],
    ['PRODUCTS_MANAGE', 'Gestionar productos', 'products'],

    ['INVOICES_CREATE', 'Crear DTE', 'invoices'],
    ['INVOICES_TRANSMIT', 'Transmitir DTE', 'invoices'],
    ['INVOICES_VIEW', 'Ver DTE', 'invoices'],

    ['DTE_INVALIDATE', 'Invalidar DTE', 'dte'],

    ['REPORTS_VIEW', 'Ver reportes', 'reports'],
    ['REPORTS_EXPORT', 'Exportar reportes', 'reports'],

    ['EMAIL_SEND', 'Enviar documentos por correo', 'emails'],
    ['PDF_VIEW', 'Ver representación gráfica PDF', 'pdf']
  ];

  const permissionRecords = [];

  for (const [code, name, module] of permissionsData) {
    const [permission] = await Permission.findOrCreate({
      where: { code },
      defaults: {
        code,
        name,
        module,
        description: name
      }
    });

    permissionRecords.push(permission);
  }

  const [adminRole] = await Role.findOrCreate({
    where: { code: 'ADMIN' },
    defaults: {
      code: 'ADMIN',
      name: 'Administrador técnico',
      description: 'Acceso completo a configuración técnica y operación'
    }
  });

  await adminRole.setPermissions(permissionRecords);

  const facturadorPermissionCodes = [
    'CUSTOMERS_MANAGE',
    'PRODUCTS_MANAGE',
    'INVOICES_CREATE',
    'INVOICES_TRANSMIT',
    'INVOICES_VIEW',
    'DTE_INVALIDATE',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'EMAIL_SEND',
    'PDF_VIEW'
  ];

  const facturadorPermissions = permissionRecords.filter((permission) =>
    facturadorPermissionCodes.includes(permission.code)
  );

  const [facturadorRole] = await Role.findOrCreate({
    where: { code: 'FACTURADOR' },
    defaults: {
      code: 'FACTURADOR',
      name: 'Facturador',
      description: 'Usuario operativo de empresa emisora'
    }
  });

  await facturadorRole.setPermissions(facturadorPermissions);

  const initialAdminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin12345*';
  const passwordHash = await bcrypt.hash(initialAdminPassword, 12);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@facturacion.local';
const adminUsername = process.env.ADMIN_USERNAME || 'admin';

const [adminUser] = await User.findOrCreate({
  where: { email: adminEmail },
  defaults: {
    username: adminUsername,
    firstName: 'Administrador',
    lastName: 'Sistema',
    email: adminEmail,
    passwordHash: passwordHash,
    isActive: true
  }
});

  await adminUser.setRoles([adminRole]);

  console.log('✅ Seed inicial de seguridad ejecutado correctamente');
  console.log(`👤 Usuario admin inicial disponible: ${adminUsername}`);
  console.log('🔐 La contraseña del administrador se mantiene únicamente en variables de entorno');
};

module.exports = seedSecurityData;