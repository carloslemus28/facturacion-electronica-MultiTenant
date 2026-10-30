const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { suite, load, sign, uuid } = require('./fixtures.cjs');
const s = suite(path.resolve(__dirname, '..'));
const rules = require('../src/modules/dte/contingency-closure');

test('Invalidación v3 por defecto; v2 solo mediante configuración explícita', () => {
  const saved = process.env.MH_INVALIDACION_EVENT_VERSION;
  try {
    delete process.env.MH_INVALIDACION_EVENT_VERSION;
    const { getInvalidationEventVersion } = require('../src/modules/dte/invalidation-version');
    assert.equal(getInvalidationEventVersion(), 3);
    const invoice = s.standard('01'), original = s.builder.buildOfficialStandardDteJson(invoice);
    const json = s.builder.buildOfficialInvalidationJson({...invoice, signedJws: sign(original), status:'ACEPTADO', receptionSeal:'A'.repeat(40), invalidationGenerationCode:uuid, invalidatedAt:'2026-10-30T16:00:00Z', invalidationReason:'Rescindir operacion'});
    assert.equal(json.identificacion.version, 3);
    s.schema.validateFiscalJson(json, 'invalidation');
    process.env.MH_INVALIDACION_EVENT_VERSION = '2';
    assert.equal(getInvalidationEventVersion(), 2);
  } finally {
    if (saved === undefined) delete process.env.MH_INVALIDACION_EVENT_VERSION; else process.env.MH_INVALIDACION_EVENT_VERSION = saved;
  }
});

test('Exportación de servicios: persona jurídica 2, tipo ítem 2 y tributo C3, independientemente de invalidación', () => {
  const saved = process.env.MH_INVALIDACION_EVENT_VERSION;
  try {
    for (const version of ['2','3']) {
      process.env.MH_INVALIDACION_EVENT_VERSION = version;
      const invoice = s.standard('11'); invoice.customer.customerType = 'JURIDICA'; invoice.items[0].itemType = 'SERVICIO';
      const json = s.builder.buildOfficialStandardDteJson(invoice);
      assert.equal(json.receptor.tipoPersona, 2);
      assert.equal(json.emisor.tipoItemExpor, 2);
      assert.equal(json.cuerpoDocumento[0].tributos[0], 'C3');
      assert.equal(json.resumen.tributos[0].codigo, 'C3');
      assert.equal(json.resumen.tributos[0].valor, 0);
      s.schema.validateFiscalJson(json, '11');
    }
  } finally { if (saved === undefined) delete process.env.MH_INVALIDACION_EVENT_VERSION; else process.env.MH_INVALIDACION_EVENT_VERSION = saved; }
});

test('Notas 05/06 sobre CCF: totalIva cero sin perder el tributo IVA ni el importe', () => {
  for (const type of ['05','06']) {
    const invoice = s.standard(type);
    invoice.gravada = invoice.subtotal = 100; invoice.total = 113; invoice.iva = 13;
    Object.assign(invoice.items[0], {gravada:100, subtotal:100, unitPrice:100, total:113, iva:13, totalIva:13});
    const json = s.builder.buildOfficialStandardDteJson(invoice);
    assert.equal(json.cuerpoDocumento[0].totalIva, 0);
    assert.equal(json.resumen.totalIva, 0);
    assert.equal(json.resumen.tributos.find(x=>x.codigo==='20').valor, 13);
    assert.equal(json.resumen.montoTotalOperacion, 113);
    assert.equal(json.resumen.totalPagar, 113);
    s.schema.validateFiscalJson(json, type);
  }
});

test('Retornos FE/FSEE sin país; FEX conserva país; FE no duplica IVA como tributo', () => {
  for (const type of ['01','11','14']) {
    const ctx = s.eventContext('18'); ctx.event.sourceDocumentTypeCode = type; ctx.sourceInvoice.documentTypeCode = type;
    const json = s.events.buildOfficialEventJson(ctx);
    assert.equal(json.documento.codPais, type === '11' ? 'GT' : null);
    assert.equal(json.documento.nombrePais, type === '11' ? 'Guatemala' : null);
    if (type === '01') {
      assert.equal(json.cuerpoDocumento[0].tributos, null);
      assert.equal(json.resumen.tributos, null);
      assert.equal(json.resumen.totalIva, 13);
    }
  }
});

test('Respuesta PROCESADO sin sello no confirma contingencia', async () => {
  const service = load(path.join(s.dte,'dte-transmission.service.js'), {
    './dte-hacienda-auth.service': {getHaciendaAuthorization:async()=>({token:'FAKE_TEST_TOKEN'}), clearHaciendaAuthCache:()=>{}}
  }, {process:{env:{MH_ENV:'TEST'}}, console:{log(){},warn(){}}, fetch:async()=>({ok:true,status:200,statusText:'OK',text:async()=>JSON.stringify({estado:'PROCESADO'})})});
  const ctx=s.eventContext('19'),json=s.events.buildOfficialEventJson(ctx);
  const result=await service.transmitSignedContingencyEvent({event:ctx.event,company:ctx.company,officialEventJson:json,signedJws:sign(json)});
  assert.equal(result.accepted,false); assert.equal(result.receptionSeal,null);
});

test('Contingencia: fechas reales, plazo 24h, IDs y aislamiento de retornos', () => {
  const start='2026-10-30T09:00:00-06:00',end='2026-10-30T10:00:00-06:00',now='2026-10-30T11:00:00-06:00';
  assert.doesNotThrow(()=>rules.validatePeriod(start,end,now));
  for (const [a,b,c] of [[end,start,now],[start,end,start],[start,end,'2026-11-01'],[null,end,now],['bad',end,now]]) assert.throws(()=>rules.validatePeriod(a,b,c));
  assert.deepEqual(rules.normalizeReturnIds(['1',1,2]),[1,2]);
  for (const value of ['1',[0],[-1],['x'],[1.2]]) assert.throws(()=>rules.normalizeReturnIds(value));
  const event={companyId:1,pointOfSaleId:1,eventTypeCode:'18',status:'GENERADO',issuedAt:'2026-10-30T09:30:00-06:00'};
  const user={company:{id:1},pointOfSale:{id:1}};
  assert.doesNotThrow(()=>rules.validateReturn(event,user,start,end));
  for (const change of [{companyId:2},{pointOfSaleId:2},{eventTypeCode:'17'},{status:'RECHAZADO'},{signedJws:'signed'},{transmittedAt:now},{tipoOperacion:2},{issuedAt:now}]) assert.throws(()=>rules.validateReturn({...event,...change},user,start,end));
});

test('Retorno en contingencia: requiere sello y aceptación dentro de 72 horas', () => {
  const now='2026-10-30T16:00:00Z';
  const accepted={status:'ACEPTADO',receptionSeal:'SEAL',acceptedAt:'2026-10-30T15:00:00Z'};
  assert.doesNotThrow(()=>rules.validateRelease(accepted,now));
  for (const change of [{status:'GENERADO'},{receptionSeal:null},{acceptedAt:null},{acceptedAt:'2026-10-26T16:00:00Z'},{acceptedAt:'2026-10-31T16:00:00Z'}]) assert.throws(()=>rules.validateRelease({...accepted,...change},now));
  assert.throws(()=>rules.validateRelease(null,now));
});
