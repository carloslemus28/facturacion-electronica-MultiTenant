'use strict';
const buildSignedFile = (signedJws, seal, fallback) => {
  if (!signedJws) {
    if (seal) { const error = new Error('Falta el archivo firmado del documento aceptado. Recupere el original antes de entregarlo.'); error.statusCode = 409; throw error; }
    return fallback();
  }
  let json;
  try { const parts = signedJws.split('.'); if (parts.length !== 3) throw new Error(); json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); if (!json || typeof json !== 'object' || !json.identificacion) throw new Error(); }
  catch { const error = new Error('El documento firmado almacenado no es válido'); error.statusCode = 409; throw error; }
  return { ...json, firmaElectronica: signedJws, ...(seal ? { selloRecibido: seal } : {}) };
};
module.exports = { buildSignedFile };
