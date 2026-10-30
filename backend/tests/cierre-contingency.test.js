const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { suite, load, company, invoice, sign } = require('./fixtures.cjs');
const s = suite(path.resolve(__dirname, '..'));
function harness({sourceCompany=1,sourcePoint=1,sourceType='01',allowedEvents=['17','18']}={}) {
  const tenant={...company,allowedEventTypes:allowedEvents};
  const pos={...s.current.pointOfSale,establishmentId:1,company:tenant};
  const source={...s.standard(sourceType),companyId:sourceCompany,pointOfSaleId:sourcePoint,status:'ACEPTADO',receptionSeal:'A'.repeat(40),acceptedAt:new Date(),items:[{...invoice.items[0],quantity:4,unitPrice:28.25}]};
  const events=[],eventItems=[];const trace=[];
  let queue=Promise.resolve();
  const matches=(row,where)=>Object.entries(where).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):String(value)===String(row[key]));
  const sequelize={transaction:async fn=>{const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;try{return await fn({LOCK:{UPDATE:'UPDATE'}});}finally{release();}}};
  const models={
    '../invoices/invoice.model':{findOne:async args=>{trace.push(args.lock?'lock':'source');return matches(source,args.where)?source:null;},findAll:async args=>{trace.push(args.where);return matches(source,args.where)?[source]:[];}},
    '../invoices/invoice-item.model':{},'../customers/customer.model':{},'../products/product.model':{},
    '../companies/company.model':{findByPk:async()=>tenant,findOne:async()=>tenant},
    '../companies/point-of-sale.model':{findOne:async()=>pos,findByPk:async()=>pos},'../companies/establishment.model':{},
    '../users/user.model':{findByPk:async()=>({id:1,isActive:true,roles:[{code:'USER'}],pointOfSale:pos})},'../users/role.model':{},
    './dte-event.model':{
      findAll:async args=>{trace.push('reserved');return events.filter(row=>matches(row,args.where));},
      findOne:async args=>events.find(row=>matches(row,args.where)),
      create:async data=>{const event={...data,id:events.length+1,update:async function(values){Object.assign(this,values);}};events.push(event);return event;}
    },
    './dte-event-item.model':{findAll:async args=>eventItems.filter(row=>matches(row,args.where)),create:async data=>{eventItems.push(data);return data;}}
  };
  const service=load(path.join(s.dte,'dte-events.service.js'),{
    ...models,'../../config/database':{sequelize},'./dte-signer.service':{signDteJson:async({dteJson})=>({signedJws:sign(dteJson)})},'./dte-transmission.service':{transmitSignedContingencyEvent:async()=>({accepted:true,receptionSeal:'S'.repeat(40),response:{estado:'PROCESADO',selloRecibido:'S'.repeat(40)}}),transmitSignedEvent:async()=>({accepted:true,receptionSeal:'R'.repeat(40),response:{estado:'PROCESADO',selloRecibido:'R'.repeat(40)}})},'./dte-event-json.service':s.events
  });
  return {service,source,events,eventItems,trace,tenant,user:{id:1,roles:['USER']}};
}

const createReturn = h => h.service.createReturnEvent({user:h.user,data:{sourceInvoiceId:1,reason:'Retorno parcial de prueba',items:[{sourceInvoiceItemId:1,quantity:1}]}});
const contingencyData = ids => ({returnEventIds:ids,startDate:new Date(Date.now()-60000).toISOString(),endDate:new Date().toISOString(),tipoContingencia:5,reason:'Interrupcion de prueba controlada',responsibleName:'RESPONSABLE PRUEBA',responsibleDocumentType:'36',responsibleDocumentNumber:company.nit});

test('Flujo integrado: retorno parcial -> contingencia sellada -> retorno; UUID y cantidad se conservan',async()=>{
 const h=harness();const returned=await createReturn(h);const originalCode=returned.event.generationCode;
 const contingency=await h.service.createContingencyEvent({user:h.user,data:contingencyData([returned.event.id])});
 const detail=contingency.event.officialEventJson.detalleDTE[0];
 assert.equal(detail.tipoDoc,'18');assert.equal(detail.codigoGeneracion,originalCode);
 assert.equal(returned.event.tipoOperacion,2);
 assert.equal(returned.event.officialEventJson.identificacion.tipoOperacion,2);
 assert.equal(returned.event.officialEventJson.cuerpoDocumento[0].cantidad,1);
 await assert.rejects(h.service.transmitEventToHacienda({id:returned.event.id,user:h.user}),/Primero transmita/);
 await h.service.transmitEventToHacienda({id:contingency.event.id,user:h.user});
 assert.equal(contingency.event.status,'ACEPTADO');assert.ok(contingency.event.receptionSeal);
 await h.service.transmitEventToHacienda({id:returned.event.id,user:h.user});
 assert.equal(returned.event.status,'ACEPTADO');assert.equal(returned.event.generationCode,originalCode);
});

test('Contingencia rechaza retornos ajenos, firmados, deshabilitados y duplicados sin crear otro evento',async()=>{
 for(const change of [{companyId:2},{pointOfSaleId:2},{signedJws:'EXISTING_SIGNATURE'},{transmittedAt:new Date()},{status:'RECHAZADO'}]) {
  const h=harness();const r=await createReturn(h);Object.assign(r.event,change);
  await assert.rejects(h.service.createContingencyEvent({user:h.user,data:contingencyData([r.event.id])}));
  assert.equal(h.events.length,1);
 }
 const h=harness();const r=await createReturn(h);h.tenant.allowedEventTypes=[];
 await assert.rejects(h.service.createContingencyEvent({user:h.user,data:contingencyData([r.event.id])}),e=>e.statusCode===403);
 h.tenant.allowedEventTypes=['18'];
 await h.service.createContingencyEvent({user:h.user,data:contingencyData([r.event.id])});
 await assert.rejects(h.service.createContingencyEvent({user:h.user,data:contingencyData([r.event.id])}));
 assert.equal(h.events.length,2);
});

test('Contingencias simultáneas no pueden incorporar dos veces el mismo retorno',async()=>{
 const h=harness();const r=await createReturn(h);const data=contingencyData([r.event.id]);
 const results=await Promise.allSettled([1,2].map(()=>h.service.createContingencyEvent({user:h.user,data})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(h.events.length,2);
});

test('Contingencia ordinaria conserva 01 y excluye 08/09/15',async()=>{
 for(const type of ['01','08','09','15']) {
  const h=harness({sourceType:type});h.source.status='GENERADO';h.source.receptionSeal=null;
  h.source.update=async values=>Object.assign(h.source,values);
  const promise=h.service.createContingencyEvent({user:h.user,data:{...contingencyData([]),invoiceIds:[1]}});
  if(type==='01') { const result=await promise; assert.equal(result.event.officialEventJson.detalleDTE[0].tipoDoc,'01'); }
  else {await assert.rejects(promise,/permitido/);assert.equal(h.events.length,0);}
 }
});

test('Fechas de contingencia inválidas no se reemplazan por la fecha actual',async()=>{
 const h=harness();const r=await createReturn(h);
 for(const change of [{startDate:'no-es-fecha'},{endDate:'no-es-fecha'},{startDate:''},{endDate:''}]) {
  await assert.rejects(h.service.createContingencyEvent({user:h.user,data:{...contingencyData([r.event.id]),...change}}));
  assert.equal(h.events.length,1);
 }
});

test('Retorno de FSEE parcial no duplica compra como venta gravada',async()=>{
 const h=harness({sourceType:'14'});const r=await createReturn(h);
 const json=r.event.officialEventJson;
 assert.equal(json.cuerpoDocumento[0].compra,28.25);
 assert.equal(json.cuerpoDocumento[0].ventaGravada,0);
 assert.equal(json.resumen.totalPagar,28.25);
 assert.equal(json.documento.codPais,null);
});
