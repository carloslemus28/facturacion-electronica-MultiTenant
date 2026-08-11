import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, FileJson2, FileSpreadsheet, Loader2, PackageCheck, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { getEstablishmentsRequest } from '../api/companies.api';
import {
  getImportSummaryRequest,
  importCustomersRequest,
  importDocumentsRequest,
  importProductsRequest
} from '../api/imports.api';
import { useAuth } from '../context/AuthContext';

const ResultBox = ({ result }) => {
  if (!result) return null;

  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p className="font-semibold mb-1">Importación terminada</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(result)
          .filter(([, value]) => ['number', 'string'].includes(typeof value))
          .map(([key, value]) => (
            <span key={key}><strong>{key}:</strong> {value}</span>
          ))}
      </div>
      {Array.isArray(result.errors) && result.errors.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">Ver observaciones</summary>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {result.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
};

function DataMigrationPage() {
  const { user } = useAuth();
  const company = user?.company;

  const [establishments, setEstablishments] = useState([]);
  const [establishmentId, setEstablishmentId] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const [customersFile, setCustomersFile] = useState(null);
  const [productsFile, setProductsFile] = useState(null);
  const [documentsFile, setDocumentsFile] = useState(null);

  const [customersResult, setCustomersResult] = useState(null);
  const [productsResult, setProductsResult] = useState(null);
  const [documentsResult, setDocumentsResult] = useState(null);

  const selectedEstablishment = useMemo(
    () => establishments.find((item) => String(item.id) === String(establishmentId)),
    [establishments, establishmentId]
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [establishmentsData, summaryData] = await Promise.all([
        getEstablishmentsRequest({ isActive: true }),
        getImportSummaryRequest()
      ]);

      const items = establishmentsData.establishments || [];
      setEstablishments(items);
      setSummary(summaryData.summary || null);

      setEstablishmentId((current) => {
        if (items.some((item) => String(item.id) === String(current))) return current;
        const matrix = items.find((item) => item.establishmentCode === 'M001');
        return String(matrix?.id || items[0]?.id || '');
      });
    } catch (error) {
      console.error('Error cargando migración:', error);
      toast.error(error.response?.data?.message || 'No se pudo cargar la configuración de migración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [company?.id]);

  const runImport = async ({ kind, file, request, setResult }) => {
    if (!file) {
      toast.error('Seleccione el archivo que desea importar');
      return;
    }

    if ((kind === 'customers' || kind === 'products') && !establishmentId) {
      toast.error('Seleccione el establecimiento de destino');
      return;
    }

    try {
      setBusy(kind);
      setResult(null);
      const response = await request();
      setResult(response.result || null);
      toast.success(response.message || 'Importación completada');
      const summaryResponse = await getImportSummaryRequest();
      setSummary(summaryResponse.summary || null);
    } catch (error) {
      console.error('Error importando datos:', error);
      toast.error(error.response?.data?.message || 'No se pudo completar la importación');
    } finally {
      setBusy('');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border p-8 flex items-center gap-3 text-gray-600">
        <Loader2 className="animate-spin" size={22} /> Preparando migración de datos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-900 mb-2">
              <ArchiveRestore size={24} />
              <h2 className="text-2xl font-bold">Migración de contribuyente</h2>
            </div>
            <p className="text-gray-600 max-w-3xl">
              Importe la información del sistema anterior al contribuyente actualmente seleccionado. Esta herramienta está disponible únicamente para el ADMIN.
            </p>
          </div>
          <button onClick={loadData} className="inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
            <RefreshCw size={17} /> Actualizar
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Contribuyente de destino</p>
          <p className="mt-1 text-lg font-bold text-blue-950">{company?.commercialName || company?.legalName}</p>
          <p className="text-sm text-blue-800">NIT: {company?.nit || 'Sin NIT'}</p>
        </div>

        {summary && !summary.storageReady && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong>Almacenamiento de PDF no disponible.</strong> En Railway debe existir un volumen persistente montado en <code>/data</code> antes de importar documentos históricos.
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-gray-50 border p-3"><p className="text-xs text-gray-500">Clientes</p><p className="text-xl font-bold">{summary?.customers ?? 0}</p></div>
          <div className="rounded-xl bg-gray-50 border p-3"><p className="text-xs text-gray-500">Productos/servicios</p><p className="text-xl font-bold">{summary?.products ?? 0}</p></div>
          <div className="rounded-xl bg-gray-50 border p-3"><p className="text-xs text-gray-500">DTE registrados</p><p className="text-xl font-bold">{summary?.invoices ?? 0}</p></div>
          <div className="rounded-xl bg-gray-50 border p-3"><p className="text-xs text-gray-500">DTE históricos importados</p><p className="text-xl font-bold">{summary?.importedDocuments ?? 0}</p></div>
        </div>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-950">
        <div className="flex gap-3">
          <ShieldCheck className="shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-bold">Orden recomendado: clientes → productos/servicios → documentos emitidos.</p>
            <p className="mt-1">Los DTE históricos no se retransmiten a Hacienda y la importación no descuenta inventario. El JSON y PDF originales quedan asociados al documento importado.</p>
          </div>
        </div>
      </section>

      <section className="bg-white border rounded-2xl p-6">
        <label className="block text-sm font-semibold text-gray-800 mb-2">Establecimiento de destino para los CSV</label>
        <select value={establishmentId} onChange={(event) => setEstablishmentId(event.target.value)} className="w-full md:max-w-xl border border-gray-300 rounded-xl px-4 py-3 bg-white">
          <option value="">Seleccione establecimiento</option>
          {establishments.map((item) => (
            <option key={item.id} value={item.id}>{item.establishmentCode} · {item.name}</option>
          ))}
        </select>
        {selectedEstablishment && <p className="text-xs text-gray-500 mt-2">Los IDs antiguos del CSV no se reutilizan; los registros se asignarán a {selectedEstablishment.establishmentCode}.</p>}
      </section>

      <div className="grid xl:grid-cols-2 gap-6">
        <section className="bg-white border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2"><UsersRound className="text-blue-900" size={22} /><h3 className="text-lg font-bold">1. Clientes / receptores</h3></div>
          <p className="text-sm text-gray-600 mb-4">Use el CSV exportado desde Clientes / Receptores del sistema anterior.</p>
          <input type="file" accept=".csv,text/csv" onChange={(event) => setCustomersFile(event.target.files?.[0] || null)} className="block w-full text-sm border rounded-xl p-3" />
          <button disabled={busy || !customersFile} onClick={() => runImport({
            kind: 'customers',
            file: customersFile,
            request: () => importCustomersRequest({ file: customersFile, establishmentId }),
            setResult: setCustomersResult
          })} className="mt-4 inline-flex items-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-3 font-semibold disabled:opacity-50">
            {busy === 'customers' ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />} Importar clientes
          </button>
          <ResultBox result={customersResult} />
        </section>

        <section className="bg-white border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-2"><PackageCheck className="text-blue-900" size={22} /><h3 className="text-lg font-bold">2. Productos / servicios</h3></div>
          <p className="text-sm text-gray-600 mb-4">Respeta precios, existencia actual, tipo de ítem, unidad de medida y estado activo del CSV.</p>
          <input type="file" accept=".csv,text/csv" onChange={(event) => setProductsFile(event.target.files?.[0] || null)} className="block w-full text-sm border rounded-xl p-3" />
          <button disabled={busy || !productsFile} onClick={() => runImport({
            kind: 'products',
            file: productsFile,
            request: () => importProductsRequest({ file: productsFile, establishmentId }),
            setResult: setProductsResult
          })} className="mt-4 inline-flex items-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-3 font-semibold disabled:opacity-50">
            {busy === 'products' ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />} Importar productos/servicios
          </button>
          <ResultBox result={productsResult} />
        </section>
      </div>

      <section className="bg-white border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2"><FileJson2 className="text-blue-900" size={22} /><h3 className="text-lg font-bold">3. Documentos emitidos históricos (JSON + PDF)</h3></div>
        <p className="text-sm text-gray-600 mb-2">Seleccione el ZIP exportado desde Documentos emitidos. El sistema valida que el NIT de todos los JSON coincida con el contribuyente activo antes de guardar cualquier DTE.</p>
        <p className="text-sm text-gray-600 mb-4">Las carpetas esperadas dentro del ZIP son <strong>json/</strong> y <strong>pdf/</strong>. Los DTE ya existentes se omiten para que pueda repetir una migración sin duplicarlos.</p>
        <input type="file" accept=".zip,application/zip" onChange={(event) => setDocumentsFile(event.target.files?.[0] || null)} className="block w-full text-sm border rounded-xl p-3" />
        <button disabled={busy || !documentsFile || summary?.storageReady === false} onClick={() => runImport({
          kind: 'documents',
          file: documentsFile,
          request: () => importDocumentsRequest({ file: documentsFile }),
          setResult: setDocumentsResult
        })} className="mt-4 inline-flex items-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-3 font-semibold disabled:opacity-50">
          {busy === 'documents' ? <Loader2 className="animate-spin" size={18} /> : <ArchiveRestore size={18} />} Importar ZIP de documentos
        </button>
        {busy === 'documents' && <p className="text-sm text-gray-500 mt-3">El ZIP puede tardar varios minutos si contiene muchos PDF. No cierre esta página mientras se procesa.</p>}
        <ResultBox result={documentsResult} />
      </section>
    </div>
  );
}

export default DataMigrationPage;
