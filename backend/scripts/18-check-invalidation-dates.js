'use strict';

// Prueba local sin base de datos, certificados ni transmisión a Hacienda.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const deadlines = require('../src/modules/dte/dte-invalidation-deadline.service');
const { getFiscalDateTimeParts, parseFiscalDateTime } = require('../src/utils/fiscal-dates');
const originalService = require('../src/modules/dte/dte-original-document.service');

const sourcePath = path.join(__dirname, '../src/modules/dte/dte-json.service.js');
const sourceRequire = createRequire(sourcePath);
const context = { module: { exports: {} }, Date, Intl, Buffer, process, console,
  require(name) { return name === '../invoices/invoices.service' ? {} : sourceRequire(name); }
};
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
const json = context.module.exports;
const transmissionPath = path.join(__dirname, '../src/modules/dte/dte-transmission.service.js');
const transmissionContext = { module: { exports: {} }, process,
  require(name) { assert.equal(name, './dte-hacienda-auth.service'); return {}; }
};
vm.runInNewContext(fs.readFileSync(transmissionPath, 'utf8')
  + '\nmodule.exports.checkPayload = buildInvalidationPayload;', transmissionContext, { filename: transmissionPath });
const generationCode = '00000000-0000-4000-8000-000000000001';
const eventCode = '11111111-1111-4111-8111-111111111111';
const seal = 'A'.repeat(40);
const signed = value => 'e30.' + Buffer.from(JSON.stringify(value)).toString('base64url') + '.TEST';

function fixture(code = '03', emission = '2026-10-12', reception = '2026-10-12T09:00:00-06:00', activity = '01110') {
  const controlNumber = `DTE-${code}-M001P001-000000000000001`;
  const original = { identificacion: { tipoDte: code, codigoGeneracion: generationCode,
    numeroControl: controlNumber, fecEmi: emission, horEmi: '08:00:00' },
    emisor: { nit: '06140101011018', nombre: 'Emisor de prueba', codActividad: activity,
      codEstableMH: 'M001', codPuntoVentaMH: 'P001', telefono: '22223333', correo: 'test@example.com' },
    receptor: { nit: '06140101011026', nombre: 'Receptor original', telefono: '22224444', correo: 'receiver@example.com' },
    resumen: code === '01' ? { totalIva: 13 }
      : ['11', '14'].includes(code) ? { tributos: null }
        : { tributos: [{ codigo: '20', valor: 13 }] } };
  return { id: 23, companyId: 11, documentTypeCode: code, generationCode, controlNumber,
    issuedAt: `${emission}T08:00:00-06:00`, acceptedAt: reception,
    signedJws: signed(original), receptionSeal: seal, status: 'ACEPTADO',
    company: { id: 11, nit: original.emisor.nit, legalName: 'Emisor de prueba', environment: 'PRODUCTION',
      phone: '22223333', email: 'test@example.com', establishmentCode: 'M001', pointOfSaleCode: 'P001' },
    customer: { name: 'Receptor editado después', documentType: 'NIT', documentNumber: '06140101011026' },
    user: { firstName: 'Responsable', lastName: 'Prueba', documentType: 'DUI', documentNumber: '12345678-9' },
    pointOfSale: { code: 'P001', establishment: { establishmentCode: 'M001', name: 'Matriz' } },
    invalidationGenerationCode: eventCode, invalidationReason: 'Rescisión de la operación de prueba',
    invalidatedAt: '2026-10-13T01:30:00Z', items: [], iva: 13 };
}

let count = 0;
function checkDeadline(invoice, expected) {
  const limit = deadlines.getInvalidationDeadline(invoice);
  assert.equal(getFiscalDateTimeParts(limit).date, expected);
  assert.equal(getFiscalDateTimeParts(limit).time, '23:59:59');
  deadlines.validateInvalidationDeadline(invoice, limit);
  assert.throws(() => deadlines.validateInvalidationDeadline(invoice, new Date(limit.getTime() + 1)), error => error.statusCode === 400);
  count += 1;
}

// Ejemplos oficiales y límites de fin de mes.
for (const code of ['03', '04', '05', '06', '07', '08', '09', '15', '17', '18']) {
  checkDeadline(fixture(code, '2026-03-19', '2026-03-19T07:30:00-06:00'), '2026-04-20');
  checkDeadline(fixture(code, '2026-04-25', '2026-04-25T00:30:00-06:00'), '2026-05-15');
  checkDeadline(fixture(code, '2025-10-09', '2025-10-31T23:59:59-06:00'), '2025-11-14');
  checkDeadline(fixture(code), '2026-11-16');
  checkDeadline(fixture(code, '2026-07-12', '2026-07-12T09:00:00-06:00'), '2026-08-20');
  checkDeadline(fixture(code, '2026-12-31', '2026-12-31T23:59:59-06:00'), '2027-01-15');
}
for (const code of ['01', '11', '14']) {
  checkDeadline(fixture(code, '2025-11-11', '2025-11-11T07:30:00-06:00'), '2026-02-11');
  checkDeadline(fixture(code, '2026-01-31', '2026-01-31T23:59:59-06:00'), '2026-04-30');
  checkDeadline(fixture(code, '2023-11-30', '2023-11-30T07:30:00-06:00'), '2024-02-29');
}
for (const activity of ['21001', '21008', '46482', '46484', '46491', '47721']) {
  for (const code of ['01', '11']) checkDeadline(fixture(code, '2026-10-12', '2026-10-12T09:00:00-06:00', activity), '2028-10-12');
  checkDeadline(fixture('14', '2026-10-12', '2026-10-12T09:00:00-06:00', activity), '2027-01-12');
}

const invoice = fixture();
// La fecha oficial y los datos del receptor prevalecen sobre datos locales editados.
invoice.issuedAt = '2026-10-13T06:00:00Z';
const event = json.buildOfficialInvalidationJson(invoice);
assert.equal(event.identificacion.version, 2);
assert.equal(event.identificacion.fecAnula, '2026-10-12');
assert.equal(event.identificacion.horAnula, '19:30:00');
assert.equal(event.documento.fecEmi, '2026-10-12');
assert.equal(event.documento.nombre, 'Receptor original');
assert.equal(event.motivo.tipoAnulacion, 2);
assert.equal(event.emisor.tipoEstablecimiento, '02');
assert.equal(event.emisor.nomEstablecimiento, 'Matriz');
assert.equal(event.documento.montoIva, 13);
assert(!('fusion' in event.identificacion));
assert(!('fecEmi' in event.identificacion));
assert(!('horEmi' in event.identificacion));
const keys = value => Object.keys(value).sort().join(',');
assert.equal(keys(event), 'documento,emisor,identificacion,motivo');
assert.equal(keys(event.identificacion), ['version', 'ambiente', 'codigoGeneracion', 'fecAnula', 'horAnula'].sort().join(','));
assert.equal(keys(event.emisor), ['nit', 'nombre', 'tipoEstablecimiento', 'nomEstablecimiento',
  'codEstableMH', 'codEstable', 'codPuntoVentaMH', 'codPuntoVenta', 'telefono', 'correo'].sort().join(','));
assert.equal(keys(event.documento), ['tipoDte', 'codigoGeneracion', 'selloRecibido', 'numeroControl',
  'fecEmi', 'montoIva', 'codigoGeneracionR', 'tipoDocumento', 'numDocumento', 'nombre', 'telefono', 'correo'].sort().join(','));
const internal = json.buildInvalidationJson(invoice);
assert.equal(internal.identificacion.fecAnula, event.identificacion.fecAnula);
assert.equal(internal.identificacion.horAnula, event.identificacion.horAnula);

// Una configuración antigua no puede seleccionar otra versión para el sobre.
const previousVersion = process.env.MH_INVALIDACION_EVENT_VERSION;
try {
  process.env.MH_INVALIDACION_EVENT_VERSION = '3';
  const current = json.buildOfficialInvalidationJson(invoice);
  const payload = transmissionContext.module.exports.checkPayload({ invoice,
    officialInvalidationJson: current, signedJws: signed(current) });
  assert.equal(current.identificacion.version, 2);
  assert.equal(payload.version, current.identificacion.version);
  assert.equal(originalService.decodeSignedJson(payload.documento).identificacion.version, payload.version);
} finally {
  if (previousVersion === undefined) delete process.env.MH_INVALIDACION_EVENT_VERSION;
  else process.env.MH_INVALIDACION_EVENT_VERSION = previousVersion;
}

// IVA del JSON original, no del detalle local que pudo cambiar tras la recepción.
for (const [code, summary, expected] of [
  ['01', { totalIva: 1.31 }, 1.31], ['01', { totalIva: 0 }, 0],
  ['03', { tributos: [{ codigo: '20', valor: 7.19 }, { codigo: 'D1', valor: 2 }] }, 7.19],
  ['03', { tributos: [{ codigo: '20', valor: 0 }] }, 0],
  ['03', { tributos: null }, 0], ['03', { tributos: [{ codigo: 'D1', valor: 2 }] }, 0],
  ['05', { totalIva: 2.6, tributos: [{ codigo: '20', valor: 2.6 }] }, 2.6],
  ['11', { tributos: null }, 0], ['14', { ivaRete1: 0.4 }, 0]
]) {
  const record = fixture(code);
  const original = originalService.decodeSignedJson(record.signedJws);
  original.resumen = summary;
  record.signedJws = signed(original);
  record.iva = 999;
  assert.equal(json.buildOfficialInvalidationJson(record).documento.montoIva, expected);
}
const invalidIva = fixture();
const invalidOriginal = originalService.decodeSignedJson(invalidIva.signedJws);
invalidOriginal.resumen.tributos[0].valor = 'IVA NO VÁLIDO';
invalidIva.signedJws = signed(invalidOriginal);
assert.throws(() => json.buildOfficialInvalidationJson(invalidIva), error => error.statusCode === 400);

// Un intento V3 rechazado no sustituye la fecha original ni la nueva firma V2.
invoice.invalidationSignedJws = signed({ identificacion: { version: 3, fecEmi: '2030-01-01' } });
assert.equal(json.buildOfficialInvalidationJson(invoice).identificacion.fecAnula, '2026-10-12');
assert.equal(json.buildOfficialInvalidationJson(invoice).identificacion.version, 2);
const recovered = { ...invoice, signedJws: null, mhResponseJson: JSON.stringify({ payload: { documento: invoice.signedJws } }) };
assert.equal(json.buildOfficialInvalidationJson(recovered).documento.fecEmi, '2026-10-12');
const oldAccepted = { ...invoice, status: 'ANULADO', invalidationSignedJws: signed({
  identificacion: { version: 2, fecAnula: '2026-10-12', horAnula: '18:30:00' } }) };
assert.equal(json.buildInvalidationJson(oldAccepted).identificacion.version, 2);
const acceptedV3 = { ...invoice, status: 'ANULADO', invalidationSignedJws: signed({
  identificacion: { version: 3, fecEmi: '2026-10-12', horEmi: '18:15:00' } }) };
assert.equal(json.buildInvalidationJson(acceptedV3).identificacion.version, 3);
assert.equal(json.buildInvalidationJson(acceptedV3).identificacion.horAnula, '18:15:00');

const receipt = fixture('03', '2026-03-01');
receipt.mhResponseJson = { response: { estado: 'PROCESADO', codigoGeneracion: generationCode,
  selloRecibido: seal, fhProcesamiento: '15/04/2026 07:30:00' } };
checkDeadline(receipt, '2026-05-15');
const missingReceipt = { ...fixture(), acceptedAt: null, transmittedAt: '2026-10-12T09:00:00-06:00' };
assert.throws(() => deadlines.getInvalidationDeadline(missingReceipt), error => error.statusCode === 400);
const foreign = originalService.decodeSignedJson(invoice.signedJws);
foreign.emisor.nit = '00000000000000';
assert.throws(() => originalService.getStoredOriginalDocument(invoice, foreign), error => error.statusCode === 400);
assert.equal(parseFiscalDateTime('2026-02-30'), null);
assert.equal(deadlines.getTenthBusinessDayOfNextMonth('2026-10-12', { extraNonWorkingDates: ['2026-11-03'] }), '2026-11-17');

const anonymous = fixture('01');
const anonymousOriginal = originalService.decodeSignedJson(anonymous.signedJws);
anonymousOriginal.receptor = null;
anonymous.signedJws = signed(anonymousOriginal);
const anonymousEvent = json.buildOfficialInvalidationJson(anonymous);
assert.equal(anonymousEvent.documento.nombre, null);
assert.equal(anonymousEvent.documento.numDocumento, null);
assert.equal(anonymousEvent.documento.telefono, null);

console.log(`OK: ${count} fechas límite; calendario hábil, tres meses, dos años farmacéuticos y vencimiento exacto.`);
console.log('OK: invalidación V2, fecha del DTE firmado, hora de El Salvador y receptor original.');
console.log('OK: campos del rechazo 096 corregidos; versión del sobre igual a la del JSON firmado.');
console.log('OK: IVA original, IVA cero, FEX/FSEE y nuevo intento tras rechazo V3.');
console.log('OK: datos de otro emisor y recepción desconocida se detectan; formato interno de PDF conservado.');
console.log('Prueba local: no consulta la base ni envía anulaciones a Hacienda.');
