'use strict';
const fail=message=>{const e=new Error(message);e.statusCode=400;throw e;};
const validateSpecialItems=items=>{
 if(!Array.isArray(items)||!items.length||items.length>500)fail('Agregue entre 1 y 500 detalles.');
 const modes=new Set(),types=new Set(),seen=new Set();
 for(const item of items){
  const type=String(item.tipoDocumento);types.add(type);
  if(!['97','22'].includes(type))fail('Seleccione Comprobante de Control Interno (97) o Factura Simplificada (22).');
  const range=Boolean(item.docDel||item.docAl);modes.add(range?'rango':'individual');
  const quantity=Number(item.cantidad??item.quantity??1);
  if(!Number.isInteger(quantity)||quantity<=0)fail('La cantidad de documentos debe ser un entero positivo.');
  if(range){
   if(!item.docDel||!item.docAl||item.numDocumento||item.fechaEmision)fail('Por rango indique Desde y Hasta y deje documento y fecha de origen vacíos.');
   if(/^\d+$/.test(item.docDel)&&/^\d+$/.test(item.docAl)){
    const expected=BigInt(item.docAl)-BigInt(item.docDel)+1n;
    if(expected!==BigInt(quantity))fail('La cantidad debe coincidir con el rango de correlativos.');
   }
  }else if(type==='22'||quantity!==1||!item.numDocumento||!item.fechaEmision){fail('El documento individual requiere número, fecha y cantidad 1. La factura simplificada se informa por rango.');}
  const key=JSON.stringify([type,item.numDocumento||null,item.docDel||null,item.docAl||null]);
  if(seen.has(key))fail('No repita el mismo documento o rango dentro del evento.');seen.add(key);
  const values=['ventaNoSuj','ventaExenta','ventaGravada'].map(k=>Number(item[k]||0));
  const price=Number(item.precioUni??item.unitPrice??0);
  if([...values,price].some(v=>!Number.isFinite(v)||v<0))fail('Los importes deben ser números no negativos.');
  if(Math.abs(values.reduce((a,b)=>a+b,0)-price*quantity)>0.00000002)fail('Los importes deben coincidir con cantidad por precio sin IVA.');
 }
 if(modes.size>1||types.size>1)fail('Use un mismo tipo de documento y una misma modalidad por evento.');
};
module.exports={validateSpecialItems};
