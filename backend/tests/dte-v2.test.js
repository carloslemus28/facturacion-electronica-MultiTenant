const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { suite, load, company, invoice, uuid, sign } = require('./fixtures.cjs');
const base = path.resolve(__dirname, '..');
const s = suite(base);
const plain = value => JSON.parse(JSON.stringify(value));
const documents = {};
for (const code of ['01','03','04','05','06','07','08','09','11','14','15']) {
  test(`DTE ${code}: generación con esquema actual`, () => {
    let source = s.standard(code);
    if (s.drafts.SPECIAL_TYPES.includes(code)) {
      source.officialDraftJson = s.drafts.prepareDraft(s.current, code, s.additional(code), source.controlNumber, uuid);
    }
    const data = s.builder.buildOfficialStandardDteJson(source);
    s.schema.validateFiscalJson(data, code);
    assert.equal(data.identificacion.version, s.schema.getVersion(code));
    documents[code] = data;
  });
}
for (const code of ['17','18','19']) {
  test(`Evento ${code}: generación con esquema actual`, () => {
    const data = s.events.buildOfficialEventJson(s.eventContext(code));
    s.schema.validateFiscalJson(data, code);
    documents[code] = data;
  });
}
test('Invalidación v3: fecha original, sin atributos antiguos, motivo independiente del entorno', () => {
  const original = s.builder.buildOfficialStandardDteJson(s.standard('03'));
  const previous = process.env.MH_INVALIDACION_EVENT_VERSION;
  process.env.MH_INVALIDACION_EVENT_VERSION = '3';
  try {
    const data = s.builder.buildOfficialInvalidationJson({ ...s.standard('03'), signedJws: sign(original), status: 'ANULADO', receptionSeal: 'A'.repeat(40), invalidationGenerationCode: uuid, invalidatedAt: '2026-10-14T16:00:00Z', invalidationReason: 'Rescindir operacion de prueba' });
    s.schema.validateFiscalJson(data, 'invalidation');
    assert.equal(data.identificacion.version, 3);
    assert.equal(data.identificacion.fecEmi, original.identificacion.fecEmi);
    assert.equal(data.motivo.tipoAnulacion, 2);
    assert.ok(!('montoIva' in data.documento));
    assert.ok(!('fecAnula' in data.identificacion));
    documents.invalidation = data;
  } finally { if (previous === undefined) delete process.env.MH_INVALIDACION_EVENT_VERSION; else process.env.MH_INVALIDACION_EVENT_VERSION = previous; }
});
test('Tipos deshabilitados se rechazan incluso cuando la lista está vacía o mal formada', () => {
  for (const code of Object.keys(s.schema.documentNames)) {
    assert.throws(() => s.schema.assertEnabled({allowedDocumentTypes:[]}, code), e => e.statusCode === 403);
    s.schema.assertEnabled({allowedDocumentTypes:[code]}, code);
  }
  for (const code of ['17','18']) {
    assert.throws(() => s.schema.assertEnabled({}, code), e => e.statusCode === 403);
    s.schema.assertEnabled({allowedEventTypes:[code]}, code);
  }
  assert.throws(() => s.schema.assertEnabled({allowedDocumentTypes:'invalid'}, '07'));
});
test('Preparación de borrador reemplaza emisor, ambiente, UUID, versión y correlativo suministrados por el cliente', () => {
  const input = s.additional('07');
  input.emisor.nit = '99999999999999';
  Object.assign(input.identificacion, {ambiente:'01',version:1,tipoDte:'01',codigoGeneracion:'INVALID',numeroControl:'INVALID'});
  const output = s.drafts.prepareDraft(s.current,'07',input,'DTE-07-M001P001-000000000000001',uuid);
  assert.equal(output.emisor.nit,company.nit);
  assert.equal(output.identificacion.ambiente,'00');
  assert.equal(output.identificacion.tipoDte,'07');
  assert.equal(output.identificacion.codigoGeneracion,uuid);
  assert.equal(input.emisor.nit,'99999999999999');
  assert.throws(() => s.drafts.prepareDraft({...s.current,company:{...company,allowedDocumentTypes:[]}},'07',input,'DTE-07-M001P001-000000000000001',uuid), e=>e.statusCode===403);
});
test('Totales inconsistentes se rechazan antes de guardar', () => {
  const doc=s.additional('07');doc.resumen.totalIvaRetenido=99;
  assert.throws(()=>s.drafts.prepareDraft(s.current,'07',doc,'DTE-07-M001P001-000000000000001',uuid),/no coincide/);
});
test('Rechaza atributos extra, campos obligatorios ausentes y UUID no válido; acepta centavos', () => {
  const data=structuredClone(documents['01']);data.emisor.atributoInventado=true;
  assert.throws(()=>s.schema.validateFiscalJson(data),e=>e.statusCode===422);
  delete data.emisor.atributoInventado;delete data.emisor.direccion.distrito;
  assert.throws(()=>s.schema.validateFiscalJson(data),e=>e.statusCode===422);
  const invalid=structuredClone(documents['01']);invalid.identificacion.codigoGeneracion='NOT-A-UUID';
  assert.throws(()=>s.schema.validateFiscalJson(invalid));
  const decimal=structuredClone(documents['07']);decimal.resumen.totalIvaRetenido=0.29;decimal.cuerpoDocumento[0].ivaRetenido=0.29;
  s.schema.validateFiscalJson(decimal);
});
test('Archivo entregado conserva exactamente el cuerpo firmado y agrega firma/sello', () => {
  const {buildSignedFile}=require(path.join(s.dte,'dte-file.service'));
  const signed=sign(documents['18']);
  const file=buildSignedFile(signed,'SELLO',()=>{throw Error('No reconstruir');});
  const {firmaElectronica,selloRecibido,...body}=file;
  assert.deepEqual(body,plain(documents['18']));assert.equal(firmaElectronica,signed);assert.equal(selloRecibido,'SELLO');
  assert.throws(()=>buildSignedFile(null,'SELLO',()=>({})),e=>e.statusCode===409);
  assert.throws(()=>buildSignedFile('invalid','SELLO'),e=>e.statusCode===409);
});
test('Retorno/Operaciones Especiales usan recepción DTE y tipoDte en el sobre: red simulada', async () => {
  const requests=[];
  const service=load(path.join(s.dte,'dte-transmission.service.js'),{'./dte-hacienda-auth.service':{getHaciendaAuthorization:async()=>({token:'TEST_ONLY'}),clearHaciendaAuthCache:()=>{}}},{
    process:{env:{}},console:{log:()=>{},warn:()=>{}},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,statusText:'OK',text:async()=>JSON.stringify({estado:'PROCESADO',selloRecibido:'A'.repeat(40)})};}
  });
  for(const code of ['17','18']) {
    const result=await service.transmitSignedEvent({event:{id:1,eventTypeCode:code},company,officialEventJson:documents[code],signedJws:sign(documents[code])});
    assert.equal(result.accepted,true);
    assert.equal(requests.at(-1).url,'https://apitest.dtes.mh.gob.sv/fesv/recepciondte');
    assert.equal(requests.at(-1).body.tipoDte,code);assert.ok(!('tipoEvento' in requests.at(-1).body));
  }
});
test('Firma inválida estructuralmente no llama al firmador', async () => {
  let requests=0;
  const signer=load(path.join(s.dte,'dte-signer.service.js'),{}, {fetch:async()=>{requests++;throw Error('No debería enviar');}});
  await assert.rejects(signer.signDteJson({company,nit:company.nit,dteJson:{identificacion:{tipoDte:'01'}}}),e=>e.statusCode===422);
  assert.equal(requests,0);
});
test('No se permite crear borrador con punto de venta de otra empresa', async () => {
  const service=load(path.join(s.dte,'dte-draft.service.js'),{'../invoices/invoices.service':{resolveUserContext:async()=>({...s.current,pointOfSale:{...s.current.pointOfSale,companyId:999}})}});
  await assert.rejects(service.saveDraft({user:{id:1},code:'07',data:s.additional('07')}),e=>e.statusCode===403);
});
test('Programador: ADMIN ordinario no puede habilitar documentos', () => {
  const {isProgrammerAdmin}=require(path.join(base,'src/utils/programmer-admin'));
  assert.equal(isProgrammerAdmin({roles:['ADMIN'],username:'no-programmer',email:'nobody@example.invalid'}),false);
  assert.equal(isProgrammerAdmin({roles:['ADMIN'],username:'admin'}),true);
  assert.equal(isProgrammerAdmin({roles:['CASHIER'],username:'admin'}),false);
});
test('PDF de documentos nuevos y eventos se genera desde el archivo correspondiente', async () => {
  const {buildFiscalPdf}=require(path.join(s.dte,'dte-generic-pdf.service'));
  for(const code of ['07','08','09','15','17','18','invalidation']) {
    const {buffer}=await buildFiscalPdf({...documents[code],selloRecibido:'A'.repeat(40)},code);
    assert.equal(buffer.subarray(0,4).toString(),'%PDF');
  }
});

test('Invalidacion de compatibilidad v2 conserva campos requeridos; configuracion invalida falla',()=>{
 const previous=process.env.MH_INVALIDACION_EVENT_VERSION;
 try {
  process.env.MH_INVALIDACION_EVENT_VERSION='2';
  const original=s.builder.buildOfficialStandardDteJson(s.standard('03'));
  const input={...s.standard('03'),signedJws:sign(original),receptionSeal:'A'.repeat(40),invalidationGenerationCode:uuid,invalidatedAt:'2026-10-28T16:00:00Z',invalidationReason:'Rescindir operacion'};
  const result=s.builder.buildOfficialInvalidationJson(input);
  assert.equal(result.identificacion.version,2);
  assert.ok(result.identificacion.fecAnula);
  assert.ok('montoIva' in result.documento);
  s.schema.validateFiscalJson(result,'invalidation');
  process.env.MH_INVALIDACION_EVENT_VERSION='9';
  assert.throws(()=>s.builder.buildOfficialInvalidationJson(input),/debe ser 2 o 3/);
 } finally {if(previous===undefined)delete process.env.MH_INVALIDACION_EVENT_VERSION;else process.env.MH_INVALIDACION_EVENT_VERSION=previous;}
});
