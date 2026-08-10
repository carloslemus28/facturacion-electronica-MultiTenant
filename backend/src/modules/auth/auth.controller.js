const authService = require('./auth.service');

const getCookieOptions = () => {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    signed: true,
    path: '/'
  };
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const result = await authService.login({
      username,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestedCompanyId: req.headers['x-company-id']
    });

    res.cookie('refreshToken', result.refreshToken, {
      ...getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      ok: true,
      message: 'Inicio de sesión correcto',
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.signedCookies.refreshToken;

    const result = await authService.refresh({
      refreshToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestedCompanyId: req.headers['x-company-id']
    });

    res.cookie('refreshToken', result.refreshToken, {
      ...getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      ok: true,
      message: 'Token renovado correctamente',
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.signedCookies.refreshToken;

    await authService.logout(refreshToken);

    res.clearCookie('refreshToken', {
      ...getCookieOptions()
    });

    res.status(200).json({
      ok: true,
      message: 'Sesión cerrada correctamente'
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res) => {
  res.set('Cache-Control', 'no-store');

  res.status(200).json({
    ok: true,
    user: req.user
  });
};

module.exports = {
  login,
  refresh,
  logout,
  me
};