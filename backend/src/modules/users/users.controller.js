const usersService = require('./users.service');

const tenantId = (req) => req.user?.company?.id;

const listUsers = async (req, res, next) => {
  try {
    const users = await usersService.listUsers({ companyId: tenantId(req) });
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, users });
  } catch (error) { next(error); }
};

const createUser = async (req, res, next) => {
  try {
    const user = await usersService.createUser({ data: req.body, companyId: tenantId(req) });
    res.status(201).json({ ok: true, message: 'Usuario facturador registrado correctamente', user });
  } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await usersService.updateUser(req.params.id, { data: req.body, companyId: tenantId(req) });
    res.status(200).json({ ok: true, message: 'Usuario actualizado correctamente', user });
  } catch (error) { next(error); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ ok: false, message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    await usersService.resetPassword(req.params.id, password, tenantId(req));
    return res.status(200).json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) { next(error); }
};

module.exports = { listUsers, createUser, updateUser, resetPassword };
