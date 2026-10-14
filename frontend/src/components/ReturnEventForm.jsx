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
  return <section className="rounded-2xl border bg-white p-5 space-y-5">
    <header><h2 className="text-xl font-bold">Nuevo retorno</h2><p className="text-slate-600">Seleccione una factura, indique qué cantidades se devuelven y revise el evento antes de enviarlo.</p></header>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    <form onSubmit={generate} className="space-y-5">
      <fieldset disabled={busy || Boolean(created)} className="space-y-4 disabled:opacity-75">
        <div className="grid gap-4 md:grid-cols-2">
          <label>Buscar factura por número de control o código<input className="mt-1 w-full rounded border p-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="Escriba parte del número para buscar" /></label>
          <label>Factura de origen<select className="mt-1 w-full rounded border p-2" value={sourceId} onChange={e => setSourceId(e.target.value)} required><option value="">Seleccione una factura</option>
            {sourceId && !sources.some(row => String(row.id) === sourceId) && <option value={sourceId}>{detail?.invoice?.controlNumber || 'Factura seleccionada'}</option>}
            {sources.map(row => <option key={row.id} value={row.id}>{row.controlNumber} · {row.customer?.name || 'Cliente'} · {money(row.total)}</option>)}
          </select></label>
        </div>
        <p className="text-sm text-slate-600">Se muestran hasta 100 facturas aceptadas. Use la búsqueda para localizar una anterior.</p>
        {loading && <p>Cargando productos y cantidades disponibles…</p>}
        {detail && <>
          <div className="rounded bg-blue-50 p-3"><strong>{detail.invoice.customerName}</strong><p>{detail.invoice.controlNumber}</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Seleccionar</th><th>Producto / servicio</th><th>Original</th><th>Retornado o reservado</th><th>Disponible</th><th>Cantidad a retornar</th></tr></thead>
            <tbody>{detail.items.map(item => <tr key={item.id} className="border-t">
              <td className="p-3"><input type="checkbox" aria-label={`Retornar ${item.description}`} disabled={item.availableQuantity <= 0} checked={Object.hasOwn(quantities, item.id)} onChange={e => setQuantities(prev => { const next = {...prev}; if(e.target.checked) next[item.id] = item.availableQuantity; else delete next[item.id]; return next; })} /></td>
              <td className="p-3">{item.description}</td><td>{item.quantity}</td><td>{item.reservedQuantity}</td><td>{item.availableQuantity}</td>
              <td><input aria-label={`Cantidad de ${item.description}`} className="w-28 rounded border p-2" type="number" min="0.00000001" max={item.availableQuantity} step="0.00000001" disabled={!Object.hasOwn(quantities, item.id)} value={quantities[item.id] ?? ''} onChange={e => setQuantities(prev => ({...prev,[item.id]:e.target.value}))} /></td>
            </tr>)}</tbody></table></div>
          <p className="text-sm text-slate-600">Los eventos pendientes y rechazados reservan cantidades porque pueden reenviarse. Los importes se calculan proporcionalmente desde la factura original. El retorno fiscal no repone automáticamente inventario.</p>
          {!detail.items.some(item => item.availableQuantity > 0) && <p role="status">Esta factura no tiene cantidades disponibles para otro retorno.</p>}
          <label className="block">Motivo del retorno<textarea required className="mt-1 w-full rounded border p-2" value={reason} onChange={e => setReason(e.target.value)} placeholder="Explique por qué se devuelven estos productos" /></label>
        </>}
      </fieldset>
      {!created && <button className="rounded bg-blue-900 px-5 py-3 text-white disabled:opacity-50" disabled={busy || loading || !valid || !reason.trim()}>{busy ? 'Generando…' : 'Generar evento'}</button>}
    </form>
    {created && <div className="rounded border bg-slate-50 p-4 space-y-3" role="status">
      <p><strong>Evento generado:</strong> {created.generationCode}</p><p>Estado: <strong>{created.status}</strong> · Total: {money(created.total)}</p>
      {created.receptionSeal && <p className="break-all">Sello de recepción: {created.receptionSeal}</p>}
      {canTransmit && ['GENERADO','FIRMADO','RECHAZADO'].includes(created.status) && <button type="button" disabled={busy} onClick={transmit} className="rounded bg-green-800 px-5 py-3 text-white disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar a Hacienda'}</button>}
      <button type="button" disabled={busy} className="ml-3 rounded border px-4 py-3" onClick={() => {setSourceId('');setDetail(null);setQuantities({});setReason('');setCreated(null);setError('');}}>Nuevo retorno</button>
      <p className="text-sm">El evento también está disponible en el listado inferior. Desde allí puede descargar JSON y PDF.</p>
    </div>}
  </section>;
}
