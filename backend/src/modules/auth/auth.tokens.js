const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const jwtConfig = require('../../config/jwt');

const createAccessToken = (user, roles = [], permissions = []) => {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      roles,
      permissions
    },
    jwtConfig.accessSecret,
    {
      expiresIn: jwtConfig.accessExpiresIn
    }
  );
};

const createRefreshToken = (user) => {
  const tokenId = uuidv4();

  const token = jwt.sign(
    {
      sub: user.id,
      jti: tokenId,
      type: 'refresh'
    },
    jwtConfig.refreshSecret,
    {
      expiresIn: jwtConfig.refreshExpiresIn
    }
  );

  return {
    token,
    tokenId
  };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, jwtConfig.accessSecret);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, jwtConfig.refreshSecret);
};

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};