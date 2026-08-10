/*
  Script para crear y, opcionalmente, transmitir Evento de Contingencia.

  Guardar como:
  backend/scripts/04-create-contingency-event.js

  Ejemplo de ejecución:
  docker exec -it -e CONFIRM_CONTINGENCY_EVENT=true -e INVOICE_IDS="219" -e CONTINGENCY_TYPE=5 -e CONTINGENCY_REASON="Prueba de contingencia solicitada por Hacienda" -e RESPONSIBLE_NAME="YANDER ORLANDO FIGUEROA MAGAÑA" -e RESPONSIBLE_DOC_TYPE="36" -e RESPONSIBLE_DOC_NUMBER="01062008911010" -e TRANSMIT_NOW=true fe_backend node scripts/05-create-contingency-event.js

  Reglas:
  - El DTE indicado NO debe estar aceptado.
  - El DTE indicado NO debe tener sello de recepción.
  - El DTE indicado debe estar generado para prueba de contingencia.
  - El evento se crea como tipo 19.
  - Si TRANSMIT_NOW=true, también se firma y transmite a Hacienda.
*/

require('dotenv').config();

const { sequelize } = require('../src/config/database');
const loadModels = require('../src/config/models');

const User = require('../src/modules/users/user.model');
const Role = require('../src/modules/users/role.model');
const PointOfSale = require('../src/modules/companies/point-of-sale.model');
const Company = require('../src/modules/companies/company.model');
const Establishment = require('../src/modules/companies/establishment.model');
const Invoice = require('../src/modules/invoices/invoice.model');
const dteEventsService = require('../src/modules/dte/dte-events.service');

const CONFIRM_CONTINGENCY_EVENT = String(
  process.env.CONFIRM_CONTINGENCY_EVENT || 'false'
).toLowerCase() === 'true';

const USERNAME = process.env.EVENT_USERNAME || process.env.USERNAME_DTE || 'rosa.gonzalez';

const parseInvoiceIds = () => {
  const raw = process.env.INVOICE_IDS || process.env.INVOICE_ID || '';

  return String(raw)
    .split(',')
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const getSvDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}:${values.second}`
  };
};

const getDefaultStartAndEnd = () => {
  const now = new Date();
  const start = new Date(now.getTime() - (30 * 60 * 1000));

  return {
    start: getSvDateParts(start),
    end: getSvDateParts(now)
  };
};

const buildUserPayload = (user) => {
  const roles = Array.isArray(user.roles)
    ? user.roles.map((role) => role.code)
    : ['FACTURADOR'];

  return {
    id: user.id,
    sub: user.id,
    username: user.username,
    roles
  };
};

const main = async () => {
  if (!CONFIRM_CONTINGENCY_EVENT) {
    throw new Error(
      'Protección activa. Ejecuta con: -e CONFIRM_CONTINGENCY_EVENT=true'
    );
  }

  loadModels();

  await sequelize.authenticate();

  const invoiceIds = parseInvoiceIds();

  if (invoiceIds.length === 0) {
    throw new Error(
      'Debes indicar al menos un DTE con -e INVOICE_IDS="219" o -e INVOICE_IDS="219,220"'
    );
  }

  const user = await User.findOne({
    where: {
      username: USERNAME
    },
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

  if (!user) {
    throw new Error(`No se encontró el usuario ${USERNAME}`);
  }

  if (!user.pointOfSale || !user.pointOfSale.company) {
    throw new Error(`El usuario ${USERNAME} no tiene empresa o punto de venta asignado`);
  }

  const invoices = await Invoice.findAll({
    where: {
      id: invoiceIds
    },
    order: [['id', 'ASC']]
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error('Uno o más DTE indicados no existen en la base de datos');
  }

  console.log('🚀 Preparando Evento de Contingencia...');
  console.log(`👤 Usuario: ${user.username}`);
  console.log(`🏢 Empresa: ${user.pointOfSale.company.legalName}`);
  console.log(`📄 DTE incluidos: ${invoiceIds.join(', ')}`);

  for (const invoice of invoices) {
    console.log(
      `   - ID ${invoice.id} | ${invoice.controlNumber} | ${invoice.documentTypeCode} | ${invoice.status}`
    );
  }

  const defaults = getDefaultStartAndEnd();

  const data = {
    invoiceIds,
    contingencyType: Number(process.env.CONTINGENCY_TYPE || process.env.TIPO_CONTINGENCIA || 5),
    reason:
      process.env.CONTINGENCY_REASON ||
      process.env.MOTIVO_CONTINGENCIA ||
      'Prueba de evento de contingencia solicitada por Hacienda',

    startDate:
      process.env.CONTINGENCY_START_DATE ||
      process.env.START_DATE ||
      defaults.start.date,

    startTime:
      process.env.CONTINGENCY_START_TIME ||
      process.env.START_TIME ||
      defaults.start.time,

    endDate:
      process.env.CONTINGENCY_END_DATE ||
      process.env.END_DATE ||
      defaults.end.date,

    endTime:
      process.env.CONTINGENCY_END_TIME ||
      process.env.END_TIME ||
      defaults.end.time,

    responsibleName:
      process.env.RESPONSIBLE_NAME ||
      user.pointOfSale.company.legalName,

    responsibleDocumentType:
      process.env.RESPONSIBLE_DOC_TYPE ||
      '36',

    responsibleDocumentNumber:
      process.env.RESPONSIBLE_DOC_NUMBER ||
      user.pointOfSale.company.nit,

    notes:
      process.env.CONTINGENCY_NOTES ||
      process.env.CONTINGENCY_REASON ||
      'Evento de contingencia generado desde script de pruebas.'
  };

  console.log('\n📌 Datos del evento:');
  console.log({
    tipoContingencia: data.contingencyType,
    motivo: data.reason,
    inicio: `${data.startDate} ${data.startTime}`,
    fin: `${data.endDate} ${data.endTime}`,
    responsable: data.responsibleName,
    tipoDocResponsable: data.responsibleDocumentType,
    numeroDocResponsable: data.responsibleDocumentNumber
  });

  const eventContext = await dteEventsService.createContingencyEvent({
    data,
    user: buildUserPayload(user)
  });

  console.log('\n✅ Evento de Contingencia creado correctamente.');
  console.log(`   ID evento: ${eventContext.event.id}`);
  console.log(`   Código generación: ${eventContext.event.generationCode}`);
  console.log(`   Estado: ${eventContext.event.status}`);

  const transmitNow = String(process.env.TRANSMIT_NOW || 'false').toLowerCase() === 'true';

  if (!transmitNow) {
    console.log('\nℹ️ El evento quedó generado, pero NO fue transmitido.');
    console.log('Para transmitirlo desde este mismo script, ejecuta con -e TRANSMIT_NOW=true');
    await sequelize.close();
    return;
  }

  console.log('\n📡 Transmitiendo Evento de Contingencia a Hacienda...');

  const transmittedContext = await dteEventsService.transmitEventToHacienda({
    id: eventContext.event.id,
    user: buildUserPayload(user)
  });

  console.log('\n✅ Evento de Contingencia transmitido.');
  console.log(`   Estado: ${transmittedContext.event.status}`);
  console.log(`   Sello / validación: ${transmittedContext.event.receptionSeal || 'Sin sello en respuesta'}`);

  console.log('\nSiguiente paso:');
  console.log('Si el evento quedó ACEPTADO, ahora transmite el DTE incluido en la contingencia desde Documentos emitidos.');

  await sequelize.close();
};

main().catch(async (error) => {
  console.error('\n❌ Error ejecutando Evento de Contingencia:');
  console.error(error.message);

  if (error.mhResponse) {
    console.error('\nRespuesta Hacienda:');
    console.error(JSON.stringify(error.mhResponse, null, 2));
  }

  if (error.mhObservations) {
    console.error('\nObservaciones Hacienda:');
    console.error(JSON.stringify(error.mhObservations, null, 2));
  }

  if (error.stack) {
    console.error('\nStack:');
    console.error(error.stack);
  }

  try {
    await sequelize.close();
  } catch {
    // Sin acción adicional.
  }

  process.exit(1);
});