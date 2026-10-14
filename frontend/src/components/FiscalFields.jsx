import { useId } from 'react';
export const initialValue = schema => {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length === 1) return schema.enum[0];
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('null')) return null;
  if (types.includes('object')) return Object.fromEntries(Object.entries(schema.properties || {}).filter(([key]) => (schema.required || []).includes(key)).map(([key,child]) => [key,initialValue(child)]));
  if (types.includes('array')) return Array.from({length:schema.minItems || 0},()=>initialValue(schema.items));
  if (types.includes('number') || types.includes('integer')) return schema.minimum > 0 ? schema.minimum : 0;
  if (types.includes('boolean')) return false;
  return '';
};
const labelFor = (key,schema) => schema.title || schema.description || key.replace(/([a-z])([A-Z])/g,'$1 $2');
const lockedFields = new Set(['identificacion.version','identificacion.ambiente','identificacion.tipoDte','identificacion.numeroControl','identificacion.codigoGeneracion']);
export default function FiscalFields({schema,value,onChange,name='',path='',readOnly=false}) {
  const id=useId(); const types=Array.isArray(schema.type)?schema.type:[schema.type];
  const label=labelFor(name,schema); const nullable=types.includes('null');
  const locked=readOnly || lockedFields.has(path) || schema.const!==undefined;
  const effectiveType=types.find(t=>t!=='null');
  if (value===null && nullable) return <div className="rounded border p-3 text-sm"><span>{label}: No aplica</span>{!locked && <button type="button" className="ml-3 text-blue-800 underline" onClick={()=>onChange(initialValue({...schema,type:effectiveType,enum:schema.enum?.filter(v=>v!==null)}))}>Completar</button>}</div>;
  const clear=nullable&&!locked?<button type="button" className="ml-3 text-xs text-slate-600 underline" onClick={()=>onChange(null)}>No aplica</button>:null;
  if (effectiveType==='object') return <fieldset className="rounded-xl border p-4 space-y-3"><legend className="px-2 font-semibold">{label}{clear}</legend><div className="grid gap-4 md:grid-cols-2">{Object.entries(schema.properties || {}).map(([key,child])=><FiscalFields key={key} name={key} path={path?`${path}.${key}`:key} schema={child} value={value?.[key]===undefined?initialValue(child):value[key]} onChange={next=>onChange({...value,[key]:next})} readOnly={locked || (path==='' && key==='emisor')} />)}</div></fieldset>;
  if (effectiveType==='array') { const items=Array.isArray(value)?value:[]; return <fieldset className="rounded-xl border p-4 space-y-3 col-span-full"><legend className="px-2 font-semibold">{label}{clear}</legend>{items.map((item,index)=><div key={index} className="rounded bg-slate-50 p-3"><FiscalFields name={`${name} ${index+1}`} path={`${path}.${index}`} schema={schema.items} value={item} readOnly={locked} onChange={next=>onChange(items.map((x,i)=>i===index?next:x))} />{!locked && <button type="button" className="mt-2 text-red-700 underline" onClick={()=>onChange(items.filter((_,i)=>i!==index).map((item,i)=>item && typeof item==='object' && 'numItem' in item ? {...item,numItem:i+1}:item))}>Quitar fila</button>}</div>)}{!locked&&items.length<(schema.maxItems || 1000)&&<button type="button" className="rounded border px-3 py-2 text-blue-800" onClick={()=>{const next=initialValue(schema.items);if(next&&typeof next==='object'&&'numItem' in next)next.numItem=items.length+1;onChange([...items,next]);}}>Agregar fila</button>}</fieldset>; }
  if (schema.enum) return <div><label className="block text-sm" htmlFor={id}>{label}{clear}</label><select id={id} className="mt-1 w-full rounded border p-2" disabled={locked} value={schema.enum.findIndex(v=>v===value)} onChange={e=>onChange(schema.enum[Number(e.target.value)])}><option value={-1}>Seleccione</option>{schema.enum.map((v,i)=><option key={i} value={i}>{v===null?'No aplica':String(v)}</option>)}</select></div>;
  const numeric=effectiveType==='number'||effectiveType==='integer';
  const kind=numeric?'number':schema.format==='date'?'date':schema.format==='time'?'time':schema.format==='email'?'email':'text';
  return <div><label className="block text-sm" htmlFor={id}>{label}{clear}</label><input id={id} className="mt-1 w-full rounded border p-2 disabled:bg-slate-100" type={kind} step={kind==='time'?1:numeric?'any':undefined} min={schema.minimum} max={schema.maximum} maxLength={schema.maxLength} disabled={locked} value={value??''} onChange={e=>onChange(numeric?(e.target.value===''?'':Number(e.target.value)):e.target.value)} /></div>;
}
