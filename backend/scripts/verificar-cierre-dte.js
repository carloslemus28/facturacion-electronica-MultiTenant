'use strict';
// Read-only configuration/schema check. Does not sign, connect to databases or send DTE.
require('dotenv').config({ quiet: true });
const { getInvalidationEventVersion } = require('../src/modules/dte/invalidation-version');
const { getVersion } = require('../src/modules/dte/dte-schema.service');
try {
  const version = getInvalidationEventVersion();
  console.log(`Invalidación configurada: v${version}`);
  if (version !== 3) {
    console.error('PENDIENTE: MH_INVALIDACION_EVENT_VERSION debe ser 3 para el cierre DTE 2.0. Compruebe aceptación en TEST antes del despliegue productivo.');
    process.exitCode = 1;
  }
  for (const code of ['01','03','04','05','06','07','08','09','11','14','15','17','18','19']) console.log(`Esquema ${code}: v${getVersion(code)}`);
  console.log('Esta comprobación no acredita autorización, credenciales ni aceptación de Hacienda. Revise las variables del servicio desplegado, no solo el .env local.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
