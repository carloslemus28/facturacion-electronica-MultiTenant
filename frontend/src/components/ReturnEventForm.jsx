import SearchableSelect from './SearchableSelect';
import { FilePlus2, Send, RefreshCcw, Loader2, PackagePlus, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function ReturnEventForm({ initialInvoiceId = '', onSaved }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState(String(initialInvoiceId));
  const [detail, setDetail] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const canTransmit = user?.permissions?.includes('INVOICES_TRANSMIT');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api.get('/dte-events/return-sources', { params: { search } })
        .then(({ data }) => { if (active) setSources(data.invoices || []); })
        .catch(e => { if (active) setError(e.response?.data?.message || 'No se pudieron cargar las facturas'); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, user?.company?.id]);

  useEffect(() => {
    let active = true;
    setDetail(null); setQuantities({}); setCreated(null); setError('');
    if (!sourceId) { setLoading(false); return; }
    setLoading(true);
    api.get(`/dte-events/return-options/${sourceId}`)
      .then(({ data }) => { if (active) setDetail(data); })
      .catch(e => { if (active) setError(e.response?.data?.message || 'No se pudo cargar la factura'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceId, user?.company?.id]);

  const selected = (detail?.items || []).filter(item => Object.hasOwn(quantities, item.id));
  const valid = selected.length > 0 && selected.every(item => Number(quantities[item.id]) > 0 && Number(quantities[item.id]) <= item.availableQuantity);
  const money = value => Number(value || 0).toLocaleString('es-SV', { style: 'currency', currency: 'USD' });
  const generate = async event => {
    event.preventDefault();
    if (submitting.current || created || !valid || !reason.trim()) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const { data } = await api.post('/dte-events/return', {
        sourceInvoiceId: Number(sourceId), reason: reason.trim(),
        items: selected.map(item => ({ sourceInvoiceItemId: item.id, quantity: Number(quantities[item.id]) }))
      });
      setCreated(data.event);
      await onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo confirmar la creación. Revise el listado antes de volver a generar.');
    } finally { submitting.current = false; setBusy(false); }
  };
  const transmit = async () => {
    if (submitting.current || !created) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/dte-events/${created.id}/transmit`);
      setCreated(data.event); await onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo confirmar el envío. Consulte el estado del evento antes de reintentar.');
      try { const {data} = await api.get(`/dte-events/${created.id}`); setCreated(data.event); await onSaved(); } catch {}
    } finally { submitting.current = false; setBusy(false); }
  };
  return <section className="bg-white rounded-2xl border shadow-sm p-5 space-y-5">
    <header><h2 className="font-bold text-lg text-gray-900 flex items-center gap-2"><FilePlus2 size={22} className="text-blue-900" />Nuevo retorno</h2><p className="text-sm text-gray-500 mt-1">Seleccione una factura, indique qué cantidades se devuelven y revise el evento antes de enviarlo.</p></header>
    {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <form onSubmit={generate} className="space-y-5">
      <fieldset disabled={busy || Boolean(created)} className="space-y-4 disabled:opacity-75">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-gray-700">Buscar factura por número de control o código<input className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white disabled:bg-gray-100" value={search} onChange={e => setSearch(e.target.value)} placeholder="Escriba parte del número para buscar" /></label>
          <SearchableSelect label="Factura de origen" value={sourceId}
            options={sourceId && !sources.some(row => String(row.id) === sourceId) ? [{id:sourceId,controlNumber:detail?.invoice?.controlNumber || 'Factura seleccionada',customer:{name:detail?.invoice?.customerName},total:detail?.invoice?.total},...sources] : sources}
            onChange={row => setSourceId(row ? String(row.id) : '')} disabled={busy || Boolean(created)}
            placeholder="Seleccione una factura aceptada" searchPlaceholder="Buscar entre las facturas cargadas"
            getOptionValue={row => row.id} getOptionLabel={row => row.controlNumber}
            getOptionDescription={row => `${row.customer?.name || 'Cliente'} · ${money(row.total)}`}
            emptyText="No hay facturas que coincidan" />
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">Se muestran hasta 100 facturas aceptadas. Use la búsqueda para localizar una anterior.</p>
        {loading && <p>Cargando productos y cantidades disponibles…</p>}
        {detail && <>
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900 break-words"><strong>{detail.invoice.customerName}</strong><p>{detail.invoice.controlNumber}</p></div>
          <div className="overflow-x-auto border border-gray-200 rounded-2xl"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-3 font-semibold whitespace-nowrap">Seleccionar</th><th className="px-4 py-3 font-semibold whitespace-nowrap">Producto / servicio</th><th className="px-4 py-3 font-semibold whitespace-nowrap">Original</th><th className="px-4 py-3 font-semibold whitespace-nowrap">Retornado o reservado</th><th className="px-4 py-3 font-semibold whitespace-nowrap">Disponible</th><th className="px-4 py-3 font-semibold whitespace-nowrap">Cantidad a retornar</th></tr></thead>
            <tbody>{detail.items.map(item => <tr key={item.id} className="border-t border-gray-100 hover:bg-blue-50/40">
              <td className="px-4 py-3"><input type="checkbox" className="w-4 h-4 accent-blue-900 cursor-pointer" aria-label={`Retornar ${item.description}`} disabled={item.availableQuantity <= 0} checked={Object.hasOwn(quantities, item.id)} onChange={e => setQuantities(prev => { const next = {...prev}; if(e.target.checked) next[item.id] = item.availableQuantity; else delete next[item.id]; return next; })} /></td>
              <td className="px-4 py-3">{item.description}</td><td className="px-4 py-3">{item.quantity}</td><td className="px-4 py-3">{item.reservedQuantity}</td><td className="px-4 py-3">{item.availableQuantity}</td>
              <td className="px-4 py-3"><input aria-label={`Cantidad de ${item.description}`} className="w-28 border border-gray-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-gray-100" type="number" min="0.00000001" max={item.availableQuantity} step="0.00000001" disabled={!Object.hasOwn(quantities, item.id)} value={quantities[item.id] ?? ''} onChange={e => setQuantities(prev => ({...prev,[item.id]:e.target.value}))} /></td>
            </tr>)}</tbody></table></div>
          <p className="text-xs text-gray-500 leading-relaxed">Los eventos pendientes y rechazados reservan cantidades porque pueden reenviarse. Los importes se calculan proporcionalmente desde la factura original. El retorno fiscal no repone automáticamente inventario.</p>
          {!detail.items.some(item => item.availableQuantity > 0) && <p role="status">Esta factura no tiene cantidades disponibles para otro retorno.</p>}
          <label className="block text-sm text-gray-700">Motivo del retorno<textarea required className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white disabled:bg-gray-100" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explique por qué se devuelven estos productos" /></label>
        </>}
      </fieldset>
      {!created && <button className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy || loading || !valid || !reason.trim()}>{busy ? <Loader2 size={18} className="animate-spin" /> : <FilePlus2 size={18} />}{busy ? 'Generando…' : 'Generar evento'}</button>}
    </form>
    {created && <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 space-y-3 text-gray-800 break-words" role="status">
      <p><strong>Evento generado:</strong> {created.generationCode}</p><p>Estado: <strong>{created.status}</strong> · Total: {money(created.total)}</p>
      {created.receptionSeal && <p className="break-all">Sello de recepción: {created.receptionSeal}</p>}
      {canTransmit && ['GENERADO','FIRMADO','RECHAZADO'].includes(created.status) && <button type="button" disabled={busy} onClick={transmit} className="inline-flex items-center justify-center gap-2 bg-green-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-green-800 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}{busy ? 'Enviando…' : 'Enviar a Hacienda'}</button>}
      <button type="button" disabled={busy} className="ml-3 inline-flex items-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50" onClick={() => {setSourceId('');setDetail(null);setQuantities({});setReason('');setCreated(null);setError('');}}><RefreshCcw size={18} />Nuevo retorno</button>
      <p className="text-sm">El evento también está disponible en el listado inferior. Desde allí puede descargar JSON y PDF.</p>
    </div>}
  </section>;
}
