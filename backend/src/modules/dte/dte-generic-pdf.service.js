const PDFDocument=require('pdfkit');
const QRCode=require('qrcode');
const {schemas,inferType}=require('./dte-schema.service');
const titleFor=(key,schema)=>schema?.title||schema?.description||key.replace(/([a-z])([A-Z])/g,'$1 $2');
const buildFiscalPdf=async(data,title='Documento Tributario Electrónico')=>{
  if (String(data.identificacion?.tipoEvento) === '18') return require('./return-pdf.service').buildReturnPdf(data);
  const type=inferType(data),schema=schemas[type];
  const identification=data.identificacion||{};
  const code=identification.codigoGeneracion;
  const date=identification.fecEmi||identification.fTransmision;
  const qr=await QRCode.toBuffer(`https://admin.factura.gob.sv/consultaPublica?ambiente=${encodeURIComponent(identification.ambiente||'')}&codGen=${encodeURIComponent(code||'')}&fechaEmi=${encodeURIComponent(date||'')}`);
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:44,bufferPages:true,info:{Title:title}}),chunks=[];
    doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve({buffer:Buffer.concat(chunks),fileName:`${identification.numeroControl||code||'documento'}.pdf`}));
    const line=(text,bold=false)=>{if(doc.y>745)doc.addPage();doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(bold?11:9).fillColor('#172554').text(text,{width:500,lineGap:3});};
    line(title,true);line(data.selloRecibido?'Documento recibido por Hacienda':'BORRADOR / SIN SELLO DE RECEPCIÓN',true);
    line(`Código de generación: ${code||''}`);line(`Número de control: ${identification.numeroControl||'No aplica'}`);line(`Fecha: ${date||''} ${identification.horEmi||''}`);line(`Sello de recepción: ${data.selloRecibido||'Pendiente'}`);
    doc.image(qr,44,doc.y+8,{width:85});doc.y+=102;
    const visit=(value,shape,label,depth=0)=>{
      if(value===null||value===undefined){line(`${label}: No aplica`);return;}
      if(Array.isArray(value)){line(label,true);value.forEach((item,i)=>visit(item,shape?.items,`${label} ${i+1}`,depth+1));return;}
      if(typeof value==='object'){line(label,true);for(const [key,item] of Object.entries(value)){if(['firmaElectronica','selloRecibido'].includes(key))continue;visit(item,shape?.properties?.[key],titleFor(key,shape?.properties?.[key]),depth+1);}doc.moveDown(.4);return;}
      line(`${label}: ${value}`);
    };
    for(const [key,value] of Object.entries(data)){if(['firmaElectronica','selloRecibido'].includes(key))continue;visit(value,schema?.properties?.[key],titleFor(key,schema?.properties?.[key]));}
    const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.fontSize(8).fillColor('#64748b').text(`Representación gráfica • ${i+1} / ${range.count}`,44,790,{lineBreak:false});}doc.end();
  });
};
module.exports={buildFiscalPdf};
