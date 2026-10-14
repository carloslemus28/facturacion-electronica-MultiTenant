const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { suite, load, company, invoice, customer, pointOfSale } = require('./fixtures.cjs');
const { SALES_DOCUMENT_TYPES, assertSalesType, filterTypes } = require('../src/modules/dte/sales-policy');
const { remainingItems, validateSelection } = require('../src/modules/dte/return-quantities');
const s = suite(path.resolve(__dirname, '..'));
const plain = value => JSON.parse(JSON.stringify(value));

test('Solo ventas: filtra compras, retenciones, liquidaciones y donaciones', () => {
  assert.deepEqual(filterTypes(['01','03','04','05','06','07','08','09','11','14','15'], SALES_DOCUMENT_TYPES), ['01','03','04','05','06','11']);
  for(const code of ['07','08','09','14','15']) assert.throws(()=>assertSalesType(code), e=>e.statusCode===403);
  for(const code of SALES_DOCUMENT_TYPES) assert.doesNotThrow(()=>assertSalesType(code));
});

test('Nota de Remisión y Débito desde el formulario habitual cumplen sus esquemas',()=>{
  for(const code of ['04','06']) {
    const source=s.standard(code);
    assert.equal(source.officialDraftJson,undefined);
    s.schema.validateFiscalJson(s.builder.buildOfficialStandardDteJson(source),code);
  }
});

test('Cantidades: permite fracciones y varios productos, rechaza vacíos, duplicados, exceso y números inválidos',()=>{
  const rows=remainingItems([{id:1,quantity:5,description:'Producto A'},{id:2,quantity:2,description:'Producto B'}],[{sourceInvoiceItemId:1,quantity:1.25}]);
  assert.equal(rows[0].availableQuantity,3.75);
  assert.equal(validateSelection([{sourceInvoiceItemId:1,quantity:0.25},{sourceInvoiceItemId:2,quantity:1}],rows).length,2);
  for(const bad of [[],[{sourceInvoiceItemId:1,quantity:0}],[{sourceInvoiceItemId:1,quantity:-1}],[{sourceInvoiceItemId:1,quantity:4}],[{sourceInvoiceItemId:1,quantity:Infinity}],[{sourceInvoiceItemId:1,quantity:'abc'}],[{sourceInvoiceItemId:9,quantity:1}],[{sourceInvoiceItemId:1,quantity:1},{sourceInvoiceItemId:1,quantity:1}]]) assert.throws(()=>validateSelection(bad,rows));
});

function harness({sourceCompany=1,sourcePoint=1,sourceType='01'}={}) {
  const tenant={...company,allowedEventTypes:['17','18']};
  const pos={...s.current.pointOfSale,establishmentId:1,company:tenant};
  const source={...s.standard(sourceType),companyId:sourceCompany,pointOfSaleId:sourcePoint,status:'ACEPTADO',receptionSeal:'A'.repeat(40),acceptedAt:new Date(),items:[{...invoice.items[0],quantity:4,unitPrice:28.25}]};
  const events=[],eventItems=[];const trace=[];
  let queue=Promise.resolve();
  const matches=(row,where)=>Object.entries(where).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):String(value)===String(row[key]));
  const sequelize={transaction:async fn=>{const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;try{return await fn({LOCK:{UPDATE:'UPDATE'}});}finally{release();}}};
  const models={
    '../invoices/invoice.model':{findOne:async args=>{trace.push(args.lock?'lock':'source');return matches(source,args.where)?source:null;},findAll:async args=>{trace.push(args.where);return[];}},
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
    ...models,'../../config/database':{sequelize},'./dte-signer.service':{},'./dte-transmission.service':{},'./dte-event-json.service':s.events
  });
  return {service,source,events,eventItems,trace,user:{id:1,roles:['USER']}};
}

test('Retorno parcial: guarda cantidades elegidas, calcula importes y valida JSON oficial',async()=>{
  const h=harness();
  const result=await h.service.createReturnEvent({user:h.user,data:{sourceInvoiceId:1,reason:'Devolución de una unidad',items:[{sourceInvoiceItemId:1,quantity:1,unitPrice:999,description:'Manipulado'}]}});
  assert.equal(result.items.length,1);assert.equal(result.items[0].quantity,1);
  assert.equal(result.items[0].unitPrice,28.25);assert.equal(result.items[0].description,invoice.items[0].description);
  assert.equal(result.event.total,28.25);assert.equal(result.event.totalIva,3.25);
  s.schema.validateFiscalJson(result.event.officialEventJson,'18');
  assert.equal(h.trace[0],'lock');assert.ok(h.trace.indexOf('reserved')>h.trace.indexOf('lock'));
  const options=await h.service.getReturnOptions({id:1,user:h.user});
  assert.equal(options.items[0].availableQuantity,3);
});

test('Retornos sucesivos: reserva generados/rechazados, descuenta aceptados y libera anulados',async()=>{
  const h=harness();
  const data={sourceInvoiceId:1,items:[{sourceInvoiceItemId:1,quantity:1}]};
  await h.service.createReturnEvent({user:h.user,data});h.events[0].status='ACEPTADO';
  await h.service.createReturnEvent({user:h.user,data});h.events[1].status='RECHAZADO';
  assert.equal((await h.service.getReturnOptions({id:1,user:h.user})).items[0].availableQuantity,2);
  await assert.rejects(h.service.createReturnEvent({user:h.user,data:{...data,items:[{sourceInvoiceItemId:1,quantity:3}]}}),/supera/);
  h.events[0].status='ANULADO';
  assert.equal((await h.service.getReturnOptions({id:1,user:h.user})).items[0].availableQuantity,3);
});

test('Retornos simultáneos sobre el mismo saldo: solamente uno puede reservarlo',async()=>{
  const h=harness();const create=()=>h.service.createReturnEvent({user:h.user,data:{sourceInvoiceId:1,items:[{sourceInvoiceItemId:1,quantity:3}]}});
  const results=await Promise.allSettled([create(),create()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
});

test('Aislamiento: rechaza otra empresa, otro punto de venta y documentos de compras',async()=>{
  for(const options of [{sourceCompany:2},{sourcePoint:2},{sourceType:'14'}]) {
    const h=harness(options);
    await assert.rejects(h.service.getReturnOptions({id:1,user:h.user}));
    await assert.rejects(h.service.createReturnEvent({user:h.user,data:{sourceInvoiceId:1,items:[{sourceInvoiceItemId:1,quantity:1}]}}));
    assert.equal(h.events.length,0);
  }
});

test('Operaciones especiales permanece deshabilitado aunque se invoque directamente',async()=>{
  const h=harness();await assert.rejects(h.service.createSpecialOperationsEvent({user:h.user,data:{items:[]}}),e=>e.statusCode===403);
});
