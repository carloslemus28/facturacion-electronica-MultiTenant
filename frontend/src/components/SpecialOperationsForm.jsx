import { useRef, useState } from 'react';
import { FilePlus2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './SearchableSelect';
import api from '../api/axios';
const field='mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white disabled:bg-gray-100';
const blank=()=>({numDocumento:'',fechaEmision:new Date().toLocaleDateString('en-CA',{timeZone:'America/El_Salvador'}),docDel:'',docAl:'',cantidad:1,descripcion:'',precioUni:'',tax:'gravada'});
const types=[{code:'97',name:'Comprobante de Control Interno'},{code:'22',name:'Factura Simplificada'}];
export default function SpecialOperationsForm({onSaved}) {
 const {user}=useAuth();const [type,setType]=useState('97'),[mode,setMode]=useState('individual'),[items,setItems]=useState([blank()]),[created,setCreated]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guard=useRef(false);
 const update=(index,key,value)=>setItems(previous=>previous.map((row,i)=>i===index?{...row,[key]:value}:row));
 const total=items.reduce((sum,item)=>sum+Number(item.precioUni||0)*Number(item.cantidad||0)*(item.tax==='gravada'?1.13:1),0);
 const generate=async event=>{
  event.preventDefault();if(guard.current||created)return;guard.current=true;setBusy(true);setError('');
  try{
   const payload=items.map(row=>{
    const amount=Number((Number(row.precioUni)*Number(row.cantidad)).toFixed(8));
    return {tipoDocumento:type,cantidad:Number(row.cantidad),descripcion:row.descripcion,precioUni:Number(row.precioUni),
      numDocumento:mode==='individual'?row.numDocumento:null,fechaEmision:mode==='individual'?row.fechaEmision:null,
      docDel:mode==='rango'?row.docDel:null,docAl:mode==='rango'?row.docAl:null,
      ventaGravada:row.tax==='gravada'?amount:0,ventaExenta:row.tax==='exenta'?amount:0,ventaNoSuj:row.tax==='noSujeta'?amount:0};
   });
   const {data}=await api.post('/dte-events/special-operations',{items:payload});setCreated(data.event);await onSaved();
  }catch(e){setError(e.response?.data?.message||'No se pudo confirmar la creación. Revise el listado antes de volver a generar.');}
  finally{guard.current=false;setBusy(false);}
 };
 return <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-5">
  <header><h2 className="font-bold text-lg flex items-center gap-2"><FilePlus2 size={22} className="text-blue-900"/>Nueva operación especial</h2><p className="text-sm text-gray-500 mt-1">Informe comprobantes de control interno o facturas simplificadas. El precio se ingresa sin IVA; los importes se calculan automáticamente.</p></header>
  {error&&<p role="alert" className="bg-red-50 text-red-800 p-4 rounded-xl">{error}</p>}
  <form onSubmit={generate} className="space-y-5"><fieldset disabled={busy||Boolean(created)} className="space-y-4">
   <div className="grid md:grid-cols-2 gap-4"><SearchableSelect label="Documento de origen" value={type} options={types} getOptionValue={row=>row.code} getOptionLabel={row=>`${row.code} - ${row.name}`} onChange={row=>{if(!row)return;setType(row.code);setMode(row.code==='22'?'rango':'individual');setItems([blank()]);}} disabled={busy||Boolean(created)}/>
    <label className="text-sm text-gray-700">Forma de informar<select className={field} value={mode} onChange={e=>{setMode(e.target.value);setItems([blank()]);}}><option value="rango">Por rango de documentos</option>{type==='97'&&<option value="individual">Documento individual</option>}</select></label></div>
   {items.map((row,index)=><div className="border rounded-2xl p-4 space-y-3" key={index}><div className="flex justify-between"><strong>Detalle {index+1}</strong>{items.length>1&&<button type="button" aria-label={`Eliminar detalle ${index+1}`} onClick={()=>setItems(items.filter((_,i)=>i!==index))}><Trash2 size={18}/></button>}</div>
    <div className="grid md:grid-cols-2 gap-4">{mode==='individual'?<><label className="text-sm">Número del documento<input required maxLength={36} className={field} value={row.numDocumento} onChange={e=>update(index,'numDocumento',e.target.value)}/></label><label className="text-sm">Fecha del documento<input required type="date" className={field} value={row.fechaEmision} onChange={e=>update(index,'fechaEmision',e.target.value)}/></label></>:<><label className="text-sm">Documento desde<input required maxLength={36} className={field} value={row.docDel} onChange={e=>update(index,'docDel',e.target.value)}/></label><label className="text-sm">Documento hasta<input required maxLength={36} className={field} value={row.docAl} onChange={e=>update(index,'docAl',e.target.value)}/></label></>}</div>
    <label className="block text-sm">Descripción<input required maxLength={1500} className={field} value={row.descripcion} onChange={e=>update(index,'descripcion',e.target.value)}/></label>
    <div className="grid md:grid-cols-3 gap-4"><label className="text-sm">Cantidad de documentos<input required type="number" min="1" step="1" readOnly={mode==='individual'} className={field} value={row.cantidad} onChange={e=>update(index,'cantidad',e.target.value)}/></label><label className="text-sm">Precio por documento sin IVA<input required type="number" min="0" step="0.00000001" className={field} value={row.precioUni} onChange={e=>update(index,'precioUni',e.target.value)}/></label><label className="text-sm">Tratamiento de la venta<select className={field} value={row.tax} onChange={e=>update(index,'tax',e.target.value)}><option value="gravada">Gravada</option><option value="exenta">Exenta</option><option value="noSujeta">No sujeta</option></select></label></div>
   </div>)}
   <button type="button" disabled={items.length>=500} className="inline-flex items-center gap-2 border rounded-xl px-4 py-3" onClick={()=>setItems([...items,blank()])}><Plus size={18}/>Agregar detalle</button>
  </fieldset><p className="bg-blue-50 text-blue-900 rounded-xl p-4 font-semibold">Total con IVA: ${total.toFixed(2)}</p>
  {!created&&<button disabled={busy} className="bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-50">{busy?'Generando…':'Generar evento'}</button>}</form>
  {created&&<div className="rounded-xl bg-blue-50 p-4 space-y-3"><p>Evento generado: <strong className="break-all">{created.generationCode}</strong></p><p>Revíselo en el listado inferior y utilice «Enviar a Hacienda»{!user?.permissions?.includes('INVOICES_TRANSMIT')?' con un usuario autorizado':''}.</p><button type="button" className="border rounded-xl bg-white px-4 py-3" onClick={()=>{setCreated(null);setItems([blank()]);setError('');}}>Nueva operación especial</button></div>}
 </section>;
}
