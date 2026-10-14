'use strict';
const { schemas } = require('./dte-schema.service');
const project = (value, properties) => Object.fromEntries(Object.keys(properties).filter(key => value[key] !== undefined).map(key => [key, value[key]]));
const adaptDocument = (invoice, data) => {
  const type=String(invoice.documentTypeCode);
  if (type==='06') data.resumen.numPagoElectronico=null;
  if (type==='04') {
    const schema=schemas['04'];
    data.receptor.nombreComercial=invoice.customer?.commercialName || null;
    data.receptor.bienTitulo=String(invoice.bienTitulo || '01').padStart(2, '0');
    data.cuerpoDocumento=data.cuerpoDocumento.map(item=>project(item,schema.properties.cuerpoDocumento.items.properties));
    data.resumen=project(data.resumen,schema.properties.resumen.properties);
    data=project(data,schema.properties);
  }
  return data;
};
module.exports={adaptDocument};
