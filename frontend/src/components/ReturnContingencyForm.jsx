import { useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './SearchableSelect';

export default function ReturnContingencyForm({ events, onSaved }) {
  const { user } = useAuth();
  const [id, setId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('13');
  const [document, setDocument] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const candidates = events.filter(event => String(event.eventTypeCode) === '18' && event.status === 'GENERADO' && !event.signedAt && !event.transmittedAt && !event.receptionSeal && Number(event.tipoOperacion) !== 2 && Number(event.pointOfSaleId) === Number(user?.pointOfSale?.id));
  const field = 'mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
  const generate = async e => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await api.post('/dte-events/contingency', {
        returnEventIds: [Number(id)], startDate: start, endDate: end,
        tipoContingencia: 5, reason: reason.trim(), responsibleName: name.trim(),
        responsibleDocumentType: documentType, responsibleDocumentNumber: document.trim()
      });
      setId('');
      setMessage(`Contingencia ${data.event.generationCode} generada. Envíela desde el listado; después de obtener su sello, envíe el retorno.`);
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo confirmar la creación. Actualice el listado antes de reintentar.');
      try { await onSaved(); } catch { /* Preserve the original error. */ }
    } finally { submitting.current = false; setBusy(false); }
  };
  return <details className="bg-white rounded-2xl border shadow-sm p-5">
    <summary className="cursor-pointer font-bold text-lg text-gray-900">Contingencia de retornos</summary>
    <p className="mt-3 text-sm text-gray-500">Use esta opción únicamente para un retorno generado durante una interrupción real y todavía sin firmar ni enviar. Registre las horas de El Salvador. Primero se envía la contingencia y luego el retorno.</p>
    <form className="mt-4 space-y-4" onSubmit={generate}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
      <label className="block text-sm text-gray-600">Retorno pendiente
        <SearchableSelect options={candidates.map(event => ({value: String(event.id), label: event.generationCode}))} value={id} onChange={setId} placeholder="Seleccione un retorno" />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-600">Inicio de la interrupción<input required type="datetime-local" step="1" className={field} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="text-sm text-gray-600">Fin de la interrupción<input required type="datetime-local" step="1" className={field} value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <label className="block text-sm text-gray-600">Motivo de la interrupción<textarea required maxLength={500} className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="block text-sm text-gray-600">Nombre del responsable<input required className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-600">Documento del responsable<select className={field} value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="13">DUI</option><option value="36">NIT</option><option value="03">Pasaporte</option><option value="02">Carné de residente</option><option value="37">Otro</option></select></label>
        <label className="text-sm text-gray-600">Número de documento<input required className={field} value={document} onChange={e => setDocument(e.target.value)} /></label>
      </div>
      <button disabled={busy || !id} className="rounded-2xl bg-blue-900 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Generando…' : 'Generar contingencia'}</button>
    </form>
  </details>;
}
