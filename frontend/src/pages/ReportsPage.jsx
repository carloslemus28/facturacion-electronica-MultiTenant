import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Download,
  Eye,
  FileSpreadsheet,
  Loader2,
  Search
} from 'lucide-react';

import {
  downloadBlobFile,
  downloadDteExcelReportRequest,
  previewDteExcelReportRequest
} from '../api/reports.api';

const documentTypes = [
  {
    code: '01',
    name: 'Factura Consumidor Final',
    shortName: 'FAC'
  },
  {
    code: '03',
    name: 'Comprobante de Crédito Fiscal',
    shortName: 'CCF'
  },
  {
    code: '11',
    name: 'Factura de Exportación',
    shortName: 'FEx'
  },
  {
    code: '05',
    name: 'Nota de Crédito',
    shortName: 'NC'
  },
  {
    code: '14',
    name: 'Factura de Sujeto Excluido',
    shortName: 'FSE'
  }
];

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'GENERADO', label: 'Generado' },
  { value: 'FIRMADO', label: 'Firmado' },
  { value: 'TRANSMITIDO', label: 'Transmitido' },
  { value: 'ACEPTADO', label: 'Aceptado' },
  { value: 'RECHAZADO', label: 'Rechazado' },
  { value: 'ANULADO', label: 'Anulado' }
];

function ReportsPage() {
  const [form, setForm] = useState({
    documentTypeCode: '01',
    startDate: '',
    endDate: '',
    status: ''
  });

  const [previewInvoices, setPreviewInvoices] = useState([]);
  const [hasPreview, setHasPreview] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const selectedDocumentType = documentTypes.find(
    (type) => type.code === form.documentTypeCode
  );

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value
    }));

    setHasPreview(false);
    setPreviewInvoices([]);
  };

  const validateForm = () => {
    if (!form.documentTypeCode) {
      return 'Seleccione el tipo de DTE';
    }

    if (!form.startDate) {
      return 'Seleccione la fecha inicial';
    }

    if (!form.endDate) {
      return 'Seleccione la fecha final';
    }

    if (form.startDate > form.endDate) {
      return 'La fecha inicial no puede ser mayor que la fecha final';
    }

    return null;
  };

  const formatMoney = (value) => {
    const number = Number(value || 0);

    return number.toLocaleString('es-SV', {
      style: 'currency',
      currency: 'USD'
    });
  };

  const formatDate = (value) => {
    if (!value) return 'Sin fecha';

    return new Date(value).toLocaleString('es-SV', {
      timeZone: 'America/El_Salvador',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };

  const previewReport = async () => {
    const validationError = validateForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setLoadingPreview(true);

      const data = await previewDteExcelReportRequest({
        documentTypeCode: form.documentTypeCode,
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status
      });

      setPreviewInvoices(data.invoices || []);
      setHasPreview(true);

      toast.success('Vista previa del reporte cargada');
    } catch (error) {
      console.error('Error cargando vista previa del reporte:', error);

      const message = error.response?.data?.message || 'No se pudo cargar la vista previa del reporte';
      toast.error(message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const getFileNameFromHeaders = (response) => {
    const disposition = response.headers?.['content-disposition'];

    if (!disposition) {
      return null;
    }

    const fileNameMatch = disposition.match(/filename="?([^"]+)"?/);

    if (!fileNameMatch) {
      return null;
    }

    return fileNameMatch[1];
  };

  const buildFallbackFileName = () => {
    const shortName = selectedDocumentType?.shortName || 'DTE';

    return `Lista_${shortName}_${form.startDate}_al_${form.endDate}.xlsx`;
  };

  const downloadReport = async () => {
    const validationError = validateForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setDownloading(true);

      const response = await downloadDteExcelReportRequest({
        documentTypeCode: form.documentTypeCode,
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status
      });

      const fileName = getFileNameFromHeaders(response) || buildFallbackFileName();

      downloadBlobFile(response.data, fileName);

      toast.success('Reporte Excel descargado correctamente');
    } catch (error) {
      console.error('Error descargando reporte:', error);

      const message = error.response?.data?.message || 'No se pudo descargar el reporte';
      toast.error(message);
    } finally {
      setDownloading(false);
    }
  };

  const totalPreviewAmount = previewInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total || 0),
    0
  );

  return (
    <div>
      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Reportes Excel
            </h2>
            <p className="text-gray-600 mt-1">
              Consulte los DTE que serán exportados y descargue el reporte fiscal en Excel.
            </p>
          </div>
        </div>
      </section>

      <section className="grid xl:grid-cols-[420px_1fr] gap-6">
        <div className="bg-white rounded-2xl border shadow-sm p-5 h-fit">
          <h3 className="font-bold text-lg text-gray-900 mb-4">
            Parámetros del reporte
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Tipo de DTE
              </label>
              <select
                name="documentTypeCode"
                value={form.documentTypeCode}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                {documentTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.code} - {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Fecha inicial
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Fecha final
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={form.endDate}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Estado
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={previewReport}
              disabled={loadingPreview}
              className="w-full inline-flex items-center justify-center gap-2 bg-white border border-blue-900 text-blue-900 rounded-xl px-5 py-3 font-semibold hover:bg-blue-50 disabled:opacity-70"
            >
              {loadingPreview ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Eye size={20} />
              )}
              {loadingPreview ? 'Consultando...' : 'Ver documentos'}
            </button>

            <button
              type="button"
              onClick={downloadReport}
              disabled={downloading}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
            >
              {downloading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Download size={20} />
              )}
              {downloading ? 'Descargando...' : 'Descargar Excel'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Documentos que se exportarán
              </h3>

              <p className="text-gray-600 mt-1 text-sm">
                Esta lista muestra los DTE encontrados según los filtros aplicados.
              </p>
            </div>

            {hasPreview && (
              <div className="text-left md:text-right">
                <p className="text-sm text-gray-500">
                  Documentos encontrados
                </p>
                <p className="text-2xl font-bold text-blue-900">
                  {previewInvoices.length}
                </p>
              </div>
            )}
          </div>

          {!hasPreview && (
            <div className="bg-gray-50 border rounded-xl p-6 text-center">
              <Search className="mx-auto text-gray-400" size={34} />
              <p className="text-gray-600 mt-3">
                Seleccione los filtros y presione <strong>Ver documentos</strong>.
              </p>
            </div>
          )}

          {hasPreview && previewInvoices.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-yellow-900 text-sm">
              No se encontraron documentos con los filtros seleccionados.
            </div>
          )}

          {hasPreview && previewInvoices.length > 0 && (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-sm text-blue-800">Tipo</p>
                  <p className="font-bold text-blue-900">
                    {selectedDocumentType?.shortName}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Desde</p>
                  <p className="font-bold text-gray-900">
                    {form.startDate}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Hasta</p>
                  <p className="font-bold text-gray-900">
                    {form.endDate}
                  </p>
                </div>

                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-sm text-green-800">Total</p>
                  <p className="font-bold text-green-900">
                    {formatMoney(totalPreviewAmount)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-900 text-white">
                      <th className="border px-3 py-2 text-left">Fecha</th>
                      <th className="border px-3 py-2 text-left">Número control</th>
                      <th className="border px-3 py-2 text-left">Receptor</th>
                      <th className="border px-3 py-2 text-right">Subtotal</th>
                      <th className="border px-3 py-2 text-right">IVA</th>
                      <th className="border px-3 py-2 text-right">Total</th>
                      <th className="border px-3 py-2 text-left">Estado</th>
                    </tr>
                  </thead>

                  <tbody>
                    {previewInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="border px-3 py-2">
                          {formatDate(invoice.issuedAt)}
                        </td>

                        <td className="border px-3 py-2">
                          {invoice.controlNumber}
                        </td>

                        <td className="border px-3 py-2">
                          {invoice.customerName}
                        </td>

                        <td className="border px-3 py-2 text-right">
                          {formatMoney(invoice.subtotal)}
                        </td>

                        <td className="border px-3 py-2 text-right">
                          {formatMoney(invoice.iva)}
                        </td>

                        <td className="border px-3 py-2 text-right font-semibold">
                          {formatMoney(invoice.total)}
                        </td>

                        <td className="border px-3 py-2">
                          {invoice.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default ReportsPage;