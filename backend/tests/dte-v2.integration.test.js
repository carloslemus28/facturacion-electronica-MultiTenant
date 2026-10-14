const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { suite, load, company, uuid, sign } = require('./fixtures.cjs');
const s = suite(path.resolve(__dirname, '..'));

test('Formulario adicional: calcula letras aunque el usuario no las complete', () => {
  const data=s.additional('07');data.resumen.totalLetras='';
  const result=s.drafts.prepareDraft(s.current,'07',data,'DTE-07-M001P001-000000000000001',uuid);
  assert.ok(result.resumen.totalLetras.length>0);
  s.schema.validateFiscalJson(result);
});

test('Un borrador no puede sustituir la identidad de otro documento', () => {
  const invoice=s.standard('07');
  invoice.officialDraftJson=s.drafts.prepareDraft(s.current,'07',s.additional('07'),invoice.controlNumber,uuid);
  invoice.officialDraftJson.identificacion.codigoGeneracion='22222222-2222-4222-8222-222222222222';
  assert.throws(()=>s.builder.buildOfficialStandardDteJson(invoice),e=>e.statusCode===409);
});

test('Guardar documento adicional usa empresa, punto y correlativo del servidor', async () => {
  let stored, reservation;
  const service=load(path.join(s.dte,'dte-draft.service.js'),{
    './dte-json.service':s.builder,
    '../invoices/invoices.service':{
      resolveUserContext:async()=>s.current,
      getInvoiceById:async id=>({...stored,id})
    },
    '../invoices/invoice.model':{create:async data=>{stored=data;return {id:50};}},
    './control-numbers.service':{generateNextControlNumber:async options=>{reservation=options;return {controlNumber:'DTE-07-M001P001-000000000000025'};}}
  });
  const result=await service.saveDraft({user:{id:1},code:'07',data:s.additional('07')});
  assert.equal(result.id,50);
  assert.equal(stored.companyId,company.id);
  assert.equal(stored.pointOfSaleId,s.current.pointOfSale.id);
  assert.equal(stored.officialDraftJson.identificacion.numeroControl,'DTE-07-M001P001-000000000000025');
  assert.equal(reservation.year,Number(stored.officialDraftJson.identificacion.fecEmi.slice(0,4)));
  assert.equal(stored.total,1);
  s.schema.validateFiscalJson(stored.officialDraftJson,'07');
});

test('Borrador firmado no se puede editar por la ruta adicional', async () => {
  const service=load(path.join(s.dte,'dte-draft.service.js'),{
    '../invoices/invoices.service':{
      resolveUserContext:async()=>s.current,
      getInvoiceById:async()=>({companyId:1,documentTypeCode:'07',status:'FIRMADO',signedJws:'SIGNED',officialDraftJson:{}})
    },
    '../invoices/invoice.model':{}
  });
  await assert.rejects(service.saveDraft({id:1,user:{id:1},code:'07',data:s.additional('07')}),e=>e.statusCode===409);
});

test('Migración deshabilita novedades una sola vez y conserva elecciones posteriores',async()=>{
  const columns={companies:{id:{},allowed_document_types:{}},invoices:{id:{}},dte_events:{id:{}}};
  const row={id:1,allowed_document_types:['01','03','04','05','06','07','08','09','11','14','15'],allowed_event_types:null};
  let alterations=0, updates=0;
  const sequelize={getQueryInterface:()=>({describeTable:async table=>columns[table],addColumn:async(table,name,definition)=>{columns[table][name]=definition;alterations++;}}),
    transaction:async cb=>cb({}),query:async(sql,options)=>{
      if(sql.startsWith('SELECT'))return [row.allowed_event_types===null?[row]:[]];
      row.allowed_document_types=JSON.parse(options.replacements.documents);row.allowed_event_types=JSON.parse(options.replacements.events);updates++;
    }};
  const migrate=load(path.join(s.dte,'dte-v2-migration.js'),{'sequelize':{DataTypes:{JSON:'JSON',BOOLEAN:'BOOLEAN'}},'../../config/database':{sequelize}});
  await migrate();assert.equal(updates,1);assert.equal(alterations,5);
  for(const code of ['07','08','09','15'])assert.ok(!row.allowed_document_types.includes(code));
  assert.deepEqual(row.allowed_event_types,[]);
  for (const name of ['additional_documents_enabled','electronic_events_enabled']) {
    assert.equal(columns.companies[name].defaultValue,false);
    assert.equal(columns.companies[name].allowNull,false);
    assert.equal(columns.companies[name].type,'BOOLEAN');
  }
  row.allowed_document_types.push('07');row.allowed_event_types.push('18');
  await migrate();assert.equal(updates,1);assert.equal(alterations,5);
  assert.ok(row.allowed_document_types.includes('07'));assert.ok(row.allowed_event_types.includes('18'));
});

test('Retorno y Operaciones Especiales generan invalidación v3 con el documento original',()=>{
  const service=load(path.join(s.dte,'dte-event-actions.service.js'),{'../../config/database':{sequelize:{}},'./dte-event.model':{}});
  for(const code of ['17','18']){
    const context=s.eventContext(code);
    const json=s.events.buildOfficialEventJson(context);
    Object.assign(context.event,{signedJws:sign(json),receptionSeal:'A'.repeat(40)});
    const reason={motivoAnulacion:'Rescindir operacion de prueba',nombreResponsable:'RESPONSABLE',tipDocResponsable:'36',numDocResponsable:company.nit,nombreSolicita:'SOLICITANTE',tipDocSolicita:'36',numDocSolicita:company.nit};
    const result=service.buildEventInvalidation(context,reason,uuid);
    s.schema.validateFiscalJson(result,'invalidation');
    assert.equal(result.documento.tipoDte,code);assert.equal(result.documento.numeroControl,null);
    assert.equal(result.identificacion.fecEmi,json.identificacion.fecEmi);
  }
});


test('Navegación fiscal: oculta por defecto, independiente por contribuyente y respeta permisos', async () => {
  const { pathToFileURL } = require('node:url');
  const { canAccessFiscalModule } = await import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/fiscal-navigation.mjs')).href);
  const permissions = ['INVOICES_CREATE','INVOICES_VIEW'];
  const user = { permissions, company: {} };
  assert.equal(canAccessFiscalModule(user,'additional'),false);
  assert.equal(canAccessFiscalModule(user,'events'),false);
  user.company.additionalDocumentsEnabled = true;
  assert.equal(canAccessFiscalModule(user,'additional'),true);
  assert.equal(canAccessFiscalModule(user,'events'),false);
  user.company.electronicEventsEnabled = true;
  assert.equal(canAccessFiscalModule(user,'events'),true);
  assert.equal(canAccessFiscalModule({...user,permissions:[]},'additional'),false);
  assert.equal(canAccessFiscalModule({...user,permissions:[]},'events'),false);
  assert.equal(canAccessFiscalModule({...user,company:{}},'additional'),false);
  user.company.additionalDocumentsEnabled = false;
  assert.equal(canAccessFiscalModule(user,'additional'),false);
  assert.equal(canAccessFiscalModule(user,'events'),true);
  assert.equal(canAccessFiscalModule(null,'additional'),false);
});
