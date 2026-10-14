'use strict';
const { randomUUID } = require('crypto');
const { schemas, documentNames, validateFiscalJson, assertEnabled } = require('./dte-schema.service');
const SPECIAL_TYPES = ["04", "06", "07", "08", "09", "15"];
const fail = (message, statusCode = 400) => { const e = new Error(message); e.statusCode = statusCode; throw e; };
const clone = value => JSON.parse(JSON.stringify(value));
const emptyValue = schema => {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length === 1) return schema.enum[0];
  if ((Array.isArray(schema.type) ? schema.type : [schema.type]).includes('object') && !(Array.isArray(schema.type) && schema.type.includes('null'))) return Object.fromEntries(Object.entries(schema.properties || {}).filter(([key]) => (schema.required || []).includes(key)).map(([key, child]) => [key, emptyValue(child)]));
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('null')) return null;
  if (types.includes('array')) return Array.from({length: schema.minItems || 0}, () => emptyValue(schema.items));
  if (types.includes('number') || types.includes('integer')) return schema.minimum > 0 ? schema.minimum : 0;
  if (types.includes('boolean')) return false;
  return '';
};
const projectObject = (schema, value) => Object.fromEntries(Object.entries(schema.properties || {}).map(([key, child]) => [key, value[key] === undefined ? emptyValue(child) : value[key]]));
const fiscalTime = value => {
  const instant = value ? new Date(value) : new Date();
  if (!Number.isFinite(instant.getTime())) fail('La fecha de emisión no es válida');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
};
const context = async user => {
  const current = await require('../invoices/invoices.service').resolveUserContext(user);
  if (!current.company || !current.pointOfSale) fail('Debe seleccionar una empresa y un punto de venta');
  if (Number(current.company.id) !== Number(current.pointOfSale.companyId)) fail('El punto de venta no pertenece al contribuyente seleccionado', 403);
  return current;
};
const issuerFor = (current, code) => {
  const json = require('./dte-json.service').buildStandardDteJson({company:current.company,pointOfSale:current.pointOfSale,documentTypeCode:'01',issuedAt:new Date(),items:[],status:'GENERADO'});
  return projectObject(schemas[code].properties.emisor, {...json.emisor, tipoDocumento:String(json.emisor.nit).length===9?'13':'36', numDocumento:json.emisor.nit});
};
const templateFor = (current, code) => {
  if (!SPECIAL_TYPES.includes(code)) fail('Utilice el formulario habitual para este tipo de documento');
  const data = emptyValue(schemas[code]);
  const now = fiscalTime();
  Object.assign(data.identificacion,{ambiente:current.company.environment==='PRODUCTION'?'01':'00',tipoDte:code,numeroControl:'',codigoGeneracion:'',fecEmi:now.date,horEmi:now.time,tipoModelo:1,tipoOperacion:1,tipoMoneda:'USD'});
  data.emisor = issuerFor(current,code);
  return data;
};
const validateTotals = data => {
  const body = data.cuerpoDocumento, summary = data.resumen || data.cuerpoDocumento;
  const code = data.identificacion.tipoDte;
  const near = (actual, expected, field) => {
    if (!Number.isFinite(Number(actual)) || Math.abs(Number(actual) - expected) > 0.011) fail(`El total ${field} no coincide con el detalle`);
  };
  if (Array.isArray(body) && summary) {
    const sum = key => Math.round(body.reduce((total,item) => total + Number(item[key] || 0),0)*100)/100;
    body.forEach((item,index) => { if (item.numItem !== index+1) fail('Los números de ítem deben ser consecutivos desde 1'); });
    const pairs = code === '07' ? [['totalSujetoRetencion','montoSujetoGrav'],['totalIvaRetenido','ivaRetenido']]
      : code === '15' ? [['valorTotal','valor']]
      : [['totalNoSuj','ventaNoSuj'],['totalExenta','ventaExenta'],['totalGravada','ventaGravada']];
    for (const [total,item] of pairs) if (summary[total] !== undefined) near(summary[total],sum(item),total);
    if (code === '15') body.forEach(item => near(item.valor,item.cantidad * item.valorUni - item.tipoDepreciacion,'valor donado'));
    if (code === '08') {
      near(summary.exportacion,sum('exportaciones'),'exportación');
      near(summary.subTotalVentas,summary.totalNoSuj+summary.totalExenta+summary.totalGravada+summary.exportacion,'suma de operaciones');
      near(summary.total,summary.montoTotalOperacion+summary.ivaPerci,'total de liquidación');
    }
  }
  if (code === '09') {
    if (body.periodoLiquidacionFechaInicio > body.periodoLiquidacionFechaFin) fail('El fin del período debe ser igual o posterior al inicio');
    near(body.ivaPercibido,Math.round(body.montoSujetoPercepcion*0.02*100)/100,'IVA percibido (2%)');
    near(body.ivaComision,Math.round(body.comision*0.13*100)/100,'IVA de la comisión');
  }
  const words = require('./dte-json.service').amountToSpanishWords;
  if (summary?.totalLetras !== undefined) summary.totalLetras = words(summary.totalPagar ?? summary.total ?? summary.liquidoApagar ?? summary.valorTotal ?? summary.totalIvaRetenido ?? summary.montoTotalOperacion ?? 0);
};
const prepareDraft = (current, code, submitted, controlNumber, generationCode) => {
  if (!SPECIAL_TYPES.includes(code)) fail('Tipo de documento no habilitado en este formulario');
  assertEnabled(current.company, code);
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) fail('Complete los datos del documento');
  const data = clone(submitted);
  if (!data.identificacion) fail('Falta la identificación del documento');
  const dates = fiscalTime(`${data.identificacion.fecEmi}T${data.identificacion.horEmi}-06:00`);
  const issued = new Date(`${dates.date}T${dates.time}-06:00`);
  if (issued.getTime() > Date.now() + 5*86400000) fail('La fecha no puede superar cinco días futuros');
  const today = fiscalTime().date;
  if (dates.date > today && !current.company.allowFutureInvoiceDates) fail('La empresa no tiene habilitada la emisión con fechas futuras');
  const shape = schemas[code].properties.identificacion;
  data.identificacion = projectObject(shape,{...data.identificacion,version:shape.properties.version.const ?? shape.properties.version.enum?.[0],ambiente:current.company.environment==='PRODUCTION'?'01':'00',tipoDte:code,numeroControl:controlNumber,codigoGeneracion:generationCode});
  data.emisor = issuerFor(current,code);
  const summary = data.resumen || data.cuerpoDocumento;
  if (summary && !Array.isArray(summary) && 'totalLetras' in summary) summary.totalLetras = require('./dte-json.service').amountToSpanishWords(summary.totalPagar ?? summary.total ?? summary.liquidoApagar ?? summary.valorTotal ?? summary.totalIvaRetenido ?? summary.montoTotalOperacion ?? 0);
  validateFiscalJson(data, code); validateTotals(data); validateFiscalJson(data, code);
  return data;
};
const summaryValues = data => {
  const s=data.resumen || data.cuerpoDocumento;
  return {noSuj:s.totalNoSuj || 0,exenta:s.totalExenta || 0,gravada:s.totalGravada || s.totalSujetoRetencion || 0,subtotal:s.subTotalVentas || s.subTotal || s.valorTotal || s.valorOperaciones || 0,iva:s.totalIva || s.iva || 0,retention1:s.ivaRete || s.totalIvaRetenido || 0,total:s.totalPagar ?? s.total ?? s.valorTotal ?? s.liquidoApagar ?? s.montoTotalOperacion ?? s.totalIvaRetenido ?? 0};
};
const listTemplates = async user => {
  const current=await context(user);
  return { types:SPECIAL_TYPES.filter(code => (current.company.allowedDocumentTypes || []).includes(code)).map(code=>({code,name:documentNames[code]})) };
};
const getTemplate = async (user,code) => {
  const current=await context(user);assertEnabled(current.company,code);
  return {schema:schemas[code],document:templateFor(current,code)};
};
const saveDraft = async ({user,code,data,id}) => {
  const current=await context(user);
  if (!SPECIAL_TYPES.includes(code)) fail('Tipo de documento no soportado');
  assertEnabled(current.company,code);
  const Invoice=require('../invoices/invoice.model');
  if (id) {
    const original=await require('../invoices/invoices.service').getInvoiceById(id,{user});
    if (Number(original.companyId)!==Number(current.company.id) || !original.officialDraftJson || original.documentTypeCode!==code) fail('Documento no disponible',404);
    if (original.signedJws || !['GENERADO','RECHAZADO'].includes(original.status)) fail('No se puede editar un documento firmado o transmitido',409);
    const originalPoint = original.pointOfSale;
    if (!originalPoint || Number(originalPoint.companyId) !== Number(current.company.id)) fail('No se encontró el punto de venta original del documento',409);
    const draft=prepareDraft({...current,pointOfSale:originalPoint},code,data,original.controlNumber,original.generationCode);
    const {sequelize}=require('../../config/database');
    await sequelize.transaction(async transaction => {
      const row=await Invoice.findOne({where:{id,companyId:current.company.id},transaction,lock:transaction.LOCK.UPDATE});
      if (!row || row.signedJws || !['GENERADO','RECHAZADO'].includes(row.status)) fail('El documento cambió de estado; vuelva a cargarlo',409);
      await row.update({officialDraftJson:draft,...summaryValues(draft),issuedAt:new Date(`${draft.identificacion.fecEmi}T${draft.identificacion.horEmi}-06:00`)},{transaction});
    });
    return require('../invoices/invoices.service').getInvoiceById(id,{user});
  }
  const generationCode=randomUUID().toUpperCase();
  // Validate before reserving a real sequence. The preliminary number is never stored or sent.
  prepareDraft(current,code,data,`DTE-${code}-M001P001-000000000000001`,generationCode);
  const {controlNumber}=await require('./control-numbers.service').generateNextControlNumber({companyId:current.company.id,pointOfSaleId:current.pointOfSale.id,documentTypeCode:code,year:Number(data.identificacion.fecEmi.slice(0,4))});
  const draft=prepareDraft(current,code,data,controlNumber,generationCode);
  const invoice=await Invoice.create({companyId:current.company.id,pointOfSaleId:current.pointOfSale.id,userId:current.id,customerId:null,documentTypeCode:code,documentTypeName:documentNames[code],controlNumber,generationCode,status:'GENERADO',issuedAt:new Date(`${draft.identificacion.fecEmi}T${draft.identificacion.horEmi}-06:00`),operationCondition:({1:'CONTADO',2:'CREDITO',3:'OTRO'})[draft.resumen?.condicionOperacion] || 'CONTADO',officialDraftJson:draft,...summaryValues(draft)});
  return require('../invoices/invoices.service').getInvoiceById(invoice.id,{user});
};
module.exports={SPECIAL_TYPES,emptyValue,templateFor,prepareDraft,validateTotals,listTemplates,getTemplate,saveDraft};
