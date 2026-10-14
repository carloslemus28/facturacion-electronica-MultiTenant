const normalize = (value) => String(value || '').trim().toLowerCase();

const getConfiguredProgrammerIdentifiers = () => {
  const values = [
    process.env.PROGRAMMER_ADMIN_USERNAME,
    process.env.PROGRAMMER_ADMIN_EMAIL,
    process.env.ADMIN_USERNAME,
    process.env.ADMIN_EMAIL,
    'admin',
    'admin@facturacion.local'
  ];

  return values
    .map(normalize)
    .filter(Boolean);
};

const isProgrammerAdmin = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];

  if (!roles.includes('ADMIN')) {
    return false;
  }

  const identifiers = getConfiguredProgrammerIdentifiers();
  const username = normalize(user?.username);
  const email = normalize(user?.email);

  return identifiers.includes(username) || identifiers.includes(email);
};

module.exports = {
  isProgrammerAdmin
};
