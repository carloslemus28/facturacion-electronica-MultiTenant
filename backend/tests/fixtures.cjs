const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { createRequire } = require('module');
const uuid = '11111111-1111-4111-8111-111111111111';
function load(file, stubs = {}, globals = {}) {
  const module = { exports: {} };
  const nativeRequire = createRequire(file);
  const req = name => Object.hasOwn(stubs, name) ? stubs[name] : nativeRequire(name);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: req, process, console, Buffer, Date, Intl, URL, structuredClone, setTimeout, clearTimeout, AbortController, ...globals }, { filename: file });
  return module.exports;
}
const company = { id: 1, environment: 'TEST', nit: '06140101011011', nrc: '1234567', legalName: 'EMPRESA DE PRUEBA SA DE CV', commercialName: 'EMPRESA DE PRUEBA', economicActivityCode: '47119', economicActivityName: 'Venta al por menor', departmentCode: '06', municipalityCode: '14', districtName: 'San Salvador', municipalityName: 'San Salvador Centro', addressComplement: 'Colonia de prueba, calle de prueba 123', phone: '22222222', email: 'prueba@example.com', establishmentCode: 'M001', pointOfSaleCode: 'P001', allowedDocumentTypes: ['01','03','04','05','06','07','08','09','11','14','15'], allowedEventTypes: ['17','18'] };
const customer = { ...company, id: 1, name: 'CLIENTE DE PRUEBA', documentType: 'NIT', documentNumber: company.nit, countryCode: 'GT', country: 'Guatemala', personType: 'JURIDICA' };
const pointOfSale = { id: 1, companyId: 1, code: 'P001', establishment: { ...company, establishmentType: 'CASA_MATRIZ' } };
const invoice = { id: 1, company, customer, pointOfSale, generationCode: uuid, issuedAt: '2026-10-13T16:00:00Z', status: 'GENERADO', operationCondition: 'CONTADO', paymentMethod: 'EFECTIVO', subtotal: 113, total: 113, gravada: 113, iva: 13, totalIva: 13, notes: null, relatedGenerationCode: uuid, relatedControlNumber: 'DTE-03-M001P001-000000000000001', relatedDocumentTypeCode: '03', relatedIssuedAt: '2026-10-12T16:00:00Z', items: [{ id: 1, itemType: 'PRODUCTO', quantity: 1, code: 'TEST', unitOfMeasure: '59', description: 'Producto de prueba', unitPrice: 113, gravada: 113, iva: 13, totalIva: 13, subtotal: 113, total: 113 }] };
const sign = data => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify(data)).toString('base64url') + '.TEST_SIGNATURE_NOT_VALID';
function suite(base) {
  const dte = path.join(base, 'src/modules/dte');
  const schema = require(path.join(dte, 'dte-schema.service'));
  const builder = load(path.join(dte, 'dte-json.service.js'), { '../invoices/invoices.service': {}, '../imports/import-storage': {} });
  const drafts = load(path.join(dte, 'dte-draft.service.js'), { './dte-json.service': builder });
  const events = load(path.join(dte, 'dte-event-json.service.js'), { './dte-json.service': builder });
  const current = { id: 1, company, pointOfSale };
  function standard(code) { return { ...structuredClone(invoice), documentTypeCode: code, controlNumber: `DTE-${code}-M001P001-000000000000001` }; }
  function additional(code) {
    if (['04','06'].includes(code)) return builder.buildOfficialStandardDteJson(standard(code));
    const doc = drafts.templateFor(current, code);
    const receiver = { tipoDocumento: '36', numDocumento: company.nit, nit: company.nit, nrc: company.nrc, nombre: customer.name, codActividad: company.economicActivityCode, descActividad: company.economicActivityName, nombreComercial: null, direccion: { departamento: '06', municipio: '23', distrito: '14', complemento: company.addressComplement }, telefono: company.phone, correo: company.email, codDomiciliado: 1, codPais: 'SV', tipoEstablecimiento: '02' };
    doc.receptor = Object.fromEntries(Object.keys(schema.schemas[code].properties.receptor.properties).map(key => [key, receiver[key] ?? null]));
    if (code === '07') {
      doc.cuerpoDocumento = [{ numItem: 1, tipoDte: '03', tipoGeneracion: 2, numeroDocumento: uuid, fechaEmision: '2026-10-12', montoSujetoGrav: 100, codigoRetencionMH: '22', ivaRetenido: 1, descripcion: 'Retencion de prueba' }];
      doc.resumen = { totalSujetoRetencion: 100, totalIva: 13, totalIvaRetenido: 1, totalLetras: 'UN DOLAR', observaciones: null };
    }
    if (code === '08') {
      doc.cuerpoDocumento = [{ numItem: 1, tipoDte: '03', tipoGeneracion: 2, numeroDocumento: uuid, fechaEmision: '2026-10-12', ventaNoSuj: 0, ventaExenta: 0, ventaGravada: 100, exportaciones: 0, tributos: ['20'], ivaItem: 13, observaciones: null }];
      doc.resumen = { totalNoSuj: 0, totalExenta: 0, totalGravada: 100, exportacion: 0, subTotalVentas: 100, tributos: [{codigo:'20',descripcion:'IVA 13%',valor:13}], montoTotalOperacion: 113, ivaPerci: 0, total: 113, totalLetras: 'CIENTO TRECE DOLARES', condicionOperacion: 1, observaciones: null };
    }
    if (code === '09') {
      doc.cuerpoDocumento = { periodoLiquidacionFechaInicio: '2026-10-01', periodoLiquidacionFechaFin: '2026-10-12', valorOperaciones: 113, subTotal: 100, iva: 13, montoSujetoPercepcion: 100, ivaPercibido: 2, comision: 0, porcentComision: 0, ivaComision: 0, liquidoApagar: 111, codLiquidacion: null, cantidadDoc: 1, montoSinPercepcion: 0, descripSinPercepcion: null, totalLetras: 'CIENTO ONCE DOLARES', observaciones: null };
      doc.extension = { nombEntrega: 'RESPONSABLE DE PRUEBA', docuEntrega: '012345678', codEmpleado: null };
    }
    if (code === '15') {
      doc.otrosDocumentos = [{ codDocAsociado: null, descDocumento: null, detalleDocumento: null }];
      doc.cuerpoDocumento = [{ numItem: 1, tipoDonacion: 1, descripcion: 'Donacion de prueba', cantidad: 1, codigo: null, uniMedida: 99, valor: 100, valorUni: 100, tipoDepreciacion: 0 }];
      doc.resumen = { valorTotal: 100, totalLetras: 'CIEN DOLARES', pagos: [{ codigo: '01', montoPago: 100, referencia: null }] };
    }
    return doc;
  }
  function eventContext(code) {
    const event = { id: 1, eventTypeCode: code, generationCode: uuid, issuedAt: invoice.issuedAt, status: 'GENERADO', sourceDocumentTypeCode: '01', sourceGenerationCode: uuid, sourceIssuedAt: invoice.issuedAt, total: 113, totalPagar: 113, subTotal: 113, totalGravada: 113, totalIva: 13, responsibleName: 'RESPONSABLE DE PRUEBA', responsibleDocumentType: '36', responsibleDocumentNumber: company.nit, contingencyStartedAt: '2026-10-13T15:00:00Z', contingencyEndedAt: invoice.issuedAt, tipoContingencia: code === '19' ? 5 : null, motivoContin: code === '19' ? 'Prueba de contingencia sin conexion' : null };
    return { event, company, customer, sourceInvoice: invoice, pointOfSale, establishment: pointOfSale.establishment, items: [{...invoice.items[0],codigoGeneracion:uuid,ventaGravada:113,ivaItem:13,tipoDocumento:code==='19'?'01':'97',numDocumento:'1',fechaEmision:invoice.issuedAt,docDel:'1',docAl:'1'}] };
  }
  return { dte, schema, builder, drafts, events, current, standard, additional, eventContext };
}
module.exports = { suite, load, company, customer, invoice, uuid, sign };
