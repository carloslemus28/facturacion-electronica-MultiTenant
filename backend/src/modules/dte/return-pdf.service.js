const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { schemas } = require('./dte-schema.service');
const money = v => `$${Number(v || 0).toFixed(2)}`;
const text = v => v == null ? '' : String(v);
async function buildReturnPdf(data) {
  const id = data.identificacion || {}, schema = schemas['18'];
  const qr = await QRCode.toBuffer(`https://admin.factura.gob.sv/consultaPublica?ambiente=${encodeURIComponent(id.ambiente || '')}&codGen=${encodeURIComponent(id.codigoGeneracion || '')}&fechaEmi=${encodeURIComponent(id.fecEmi || '')}`);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size:'LETTER', margin:28, bufferPages:true, info:{Title:'Evento de Retorno'} });
    const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('error',reject);
    doc.on('end',()=>resolve({buffer:Buffer.concat(chunks),fileName:`${id.codigoGeneracion || 'retorno'}.pdf`}));
    const left=28, width=556, bottom=735;let y=28;
    const font=(size=9,bold=false)=>doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor('#111827');
    const write=(value,x,top,w,size=9,bold=false)=>{font(size,bold);doc.text(text(value),x,top,{width:w,lineGap:2});};
    const height=(value,w,size=9,bold=false)=>{font(size,bold);return doc.heightOfString(text(value),{width:w,lineGap:2});};
    const newPage=()=>{doc.addPage();write('EVENTO DE RETORNO - CONTINUACIÓN',left,28,width,10,true);write(id.codigoGeneracion,left,44,width,8);y=66;};
    const room=h=>{if(y+h>bottom)newPage();};
    const heading=title=>{room(85);doc.roundedRect(left,y,width,20,5).fill('#f1f5f9');write(title,left+9,y+6,width-18,9,true);y+=26;};
    const pairs=(entries,columns=2)=>{
      const cell=width/columns;
      for(let i=0;i<entries.length;i+=columns){const row=entries.slice(i,i+columns);const h=Math.max(...row.map(([label,value])=>height(label,cell-18,7,true)+height(value,cell-18,9)+11));room(h);
        row.forEach(([label,value],col)=>{const x=left+col*cell;write(label,x+8,y+3,cell-18,7,true);write(value,x+8,y+3+height(label,cell-18,7,true)+4,cell-18,9);});y+=h;
      }
      y+=5;
    };
    write('DOCUMENTO TRIBUTARIO ELECTRÓNICO',left,y,width-100,9,true);
    write('EVENTO DE RETORNO',left,y+20,width-100,19,true);
    write(data.selloRecibido?'CON SELLO DE RECEPCIÓN':'BORRADOR / SIN SELLO DE RECEPCIÓN',left,y+49,width-100,9,true);
    write(id.ambiente==='00'?'AMBIENTE DE PRUEBAS':'AMBIENTE PRODUCTIVO',left,y+66,width-100,8);
    doc.image(qr,left+width-84,y,{width:84});y+=88;
    pairs([['CÓDIGO DE GENERACIÓN',id.codigoGeneracion],['FECHA Y HORA',`${id.fecEmi || ''} ${id.horEmi || ''}`],['SELLO DE RECEPCIÓN',data.selloRecibido || 'Pendiente'],['MONEDA / VERSIÓN',`${id.tipoMoneda || 'USD'} / ${id.version || 1}`]]);
    heading('EMISOR Y RECEPTOR');
    const e=data.emisor||{},r=data.documento||{};
    pairs([['EMISOR',e.nombre],['RECEPTOR',r.nombre],['NIT DEL EMISOR',e.nit],['DOCUMENTO DEL RECEPTOR',r.numDocumento || 'No aplica'],['ESTABLECIMIENTO / PUNTO DE VENTA',`${e.codEstableMH || e.codEstable || ''} / ${e.codPuntoVentaMH || e.codPuntoVenta || ''}`],['CONTACTO DEL RECEPTOR',[r.telefono,r.correo].filter(Boolean).join(' / ')]]);
    heading('DOCUMENTOS RELACIONADOS');
    for(const reference of data.documentoRelacionado || []) pairs([['TIPO / FECHA',`${reference.tipoDocumento} / ${reference.fechaEmision}`],['CÓDIGO DE GENERACIÓN',reference.codigoGeneracion]]);
    heading('DETALLE DE PRODUCTOS Y SERVICIOS RETORNADOS');
    const widths=[28,62,218,76,76,96],names=['N°','Cantidad','Descripción','Precio unit.','Descuento','Importe'];
    const tableHead=()=>{room(27);doc.rect(left,y,width,25).fill('#111827');let x=left;names.forEach((n,i)=>{doc.font('Helvetica-Bold').fontSize(8).fillColor('white').text(n,x+5,y+8,{width:widths[i]-10});x+=widths[i];});y+=25;};tableHead();
    const extras=[];
    (data.cuerpoDocumento||[]).forEach((item,index)=>{
      const description=[item.codigo,item.descripcion].filter(Boolean).join(' - ');
      const amount=Number(item.ventaNoSuj||0)+Number(item.ventaExenta||0)+Number(item.ventaGravada||0)+Number(item.compra||0);
      const values=[item.numItem,item.cantidad,description,`$${Number(item.precioUni||0).toFixed(4)}`,money(item.montoDescu),money(amount)];
      const h=Math.max(30,...values.map((v,i)=>height(v,widths[i]-10,8)+14));
      if(y+h>bottom){newPage();tableHead();}
      if(index%2===0)doc.rect(left,y,width,h).fill('#f8fafc');
      let x=left;values.forEach((v,i)=>{write(v,x+5,y+7,widths[i]-10,8);x+=widths[i];});
      doc.moveTo(left,y+h).lineTo(left+width,y+h).strokeColor('#cbd5e1').lineWidth(.5).stroke();y+=h;
      const skip=['numItem','cantidad','descripcion','codigo','precioUni','montoDescu','codigoGeneracion'];
      const fields=Object.entries(item).filter(([k,v])=>!skip.includes(k)&&v!==null&&v!==undefined&&v!==0&&v!=='');
      if(fields.length)extras.push([`Ítem ${item.numItem}`,fields.map(([k,v])=>`${schema.properties.cuerpoDocumento.items.properties[k]?.description||k}: ${Array.isArray(v)?v.join(', '):v}`).join(' | ')]);
    });y+=12;
    heading('RESUMEN DE LA OPERACIÓN');
    const summary=data.resumen||{};
    const summaries=Object.entries(summary).filter(([k,v])=>k!=='totalLetras'&&k!=='tributos'&&v!=null&&(v!==0||k==='totalPagar')).map(([k,v])=>[schema.properties.resumen.properties[k]?.description||k,money(v)]);
    pairs(summaries);
    if(summary.totalLetras)pairs([['TOTAL EN LETRAS',summary.totalLetras]],1);
    if(summary.tributos?.length)pairs(summary.tributos.map(t=>[t.descripcion||`Tributo ${t.codigo}`,money(t.valor)]));
    // Preserve the relevant supplementary fiscal information without pages of null fields.
    const append=[];
    const addObject=(name,value,shape,skip=[])=>{for(const [k,v] of Object.entries(value||{})){if(skip.includes(k)||v==null||v==='')continue;append.push([`${name}: ${shape?.properties?.[k]?.description||k}`,typeof v==='object'?JSON.stringify(v):text(v)]);}};
    addObject('Identificación',id,schema.properties.identificacion,['codigoGeneracion','fecEmi','horEmi','tipoMoneda','version','ambiente','tipoEvento']);
    addObject('Emisor',e,schema.properties.emisor,['nombre','nit','codEstableMH','codPuntoVentaMH']);
    addObject('Receptor',r,schema.properties.documento,['nombre','numDocumento','telefono','correo']);
    addObject('Venta por cuenta de terceros',data.ventaTercero,schema.properties.ventaTercero);
    addObject('Compra por cuenta de terceros',data.compraTercero,schema.properties.compraTercero);
    for(const a of data.apendice||[])append.push([a.etiqueta||a.campo,a.valor]);
    if(extras.length||append.length){heading('INFORMACIÓN COMPLEMENTARIA');pairs(extras,1);pairs(append);}
    const range=doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.moveTo(left,752).lineTo(left+width,752).strokeColor('#cbd5e1').stroke();font(7);doc.text(`Representación gráfica del Evento de Retorno | Página ${i+1} de ${range.count}`,left,760,{width,lineBreak:false});}
    doc.end();
  });
}
module.exports={buildReturnPdf};
