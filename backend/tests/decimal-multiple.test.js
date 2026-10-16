const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv = require('ajv');
const { isDecimalMultiple, installDecimalMultiple } = require('../src/modules/dte/decimal-multiple');
const { validateFiscalJson, schemas } = require('../src/modules/dte/dte-schema.service');
const ivaSchema = schemas['01'].properties.cuerpoDocumento.items.properties.ivaItem;

test('Regresión: el validador anterior rechaza IVA 1.15 válido; el nuevo lo acepta', () => {
  const old = new Ajv({multipleOfPrecision:8}).compile(ivaSchema);
  assert.equal(old(1.15),false);
  assert.equal(old.errors[0].keyword,'multipleOf');
  const fixed = installDecimalMultiple(new Ajv()).compile(ivaSchema);
  for (const value of [0,0.01,0.29,1.15,2.3,4.6,123456.78,0.12345678,1e-8]) assert.equal(fixed(value),true,String(value));
  for (const value of [1e-9,1.150000001,0.123456789,-1,Infinity,NaN,'1.15']) assert.equal(fixed(value),false,String(value));
});

test('Barrido: los primeros 100000 importes de centavos cumplen la precisión de ocho decimales', () => {
  for(let cents=0;cents<100000;cents++) assert.equal(isDecimalMultiple(cents/100,1e-8),true,String(cents));
});

test('Divisores generales y exponentes: no se relajan las reglas', () => {
  for(const [v,d,result] of [[0.3,0.1,true],[0.31,0.1,false],[0.15,0.05,true],[0.16,0.05,false],[-1.15,0.01,true],[1e21,1e-8,true],[1e-7,1e-8,true],[1e-9,1e-8,false],[1,3,false],[0,0.01,true],[1,0,false],[1,Infinity,false]]) assert.equal(isDecimalMultiple(v,d),result,`${v}/${d}`);
  assert.equal(isDecimalMultiple(0.1+0.2,0.01),false); // Does not silently round payloads.
});

test('Factura generada: IVA de venta de $10 se valida sin alterar datos; el exceso decimal conserva ruta y regla', () => {
  const { suite } = require('./fixtures.cjs');
  const s = suite(path.resolve(__dirname,'..'));
  const invoice = s.standard('01');
  Object.assign(invoice.items[0],{quantity:1,unitPrice:10,gravada:10,subtotal:10,total:10,iva:1.15});
  Object.assign(invoice,{total:10,totalPagar:10,totalGravada:10,subTotal:10,totalIva:1.15});
  const data = s.builder.buildOfficialStandardDteJson(invoice);
  assert.equal(data.cuerpoDocumento[0].ivaItem,1.15);
  const before=JSON.stringify(data);
  assert.equal(validateFiscalJson(data,'01'),data);
  assert.equal(JSON.stringify(data),before);
  data.cuerpoDocumento[0].ivaItem=1.150000001;
  assert.throws(()=>validateFiscalJson(data,'01'),e=>e.statusCode===422&&e.validationErrors.some(issue=>issue.campo==='/cuerpoDocumento/0/ivaItem'&&issue.regla==='multipleOf'&&issue.parametros.multipleOf===1e-8));
});
