import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Building2,
  Hash,
  Loader2,
  RefreshCcw,
  Save,
  Store
} from 'lucide-react';

import { getActiveCompanyRequest } from '../api/companies.api';
import { getPointsOfSaleRequest } from '../api/pointsOfSale.api';
import {
  getControlNumbersRequest,
  setLastControlSequenceRequest
} from '../api/controlNumbers.api';

const currentYear = new Date().getFullYear();

const documentTypeOptions = [
  { code: '01', name: 'Factura de Consumidor Final' },
  { code: '03', name: 'Comprobante de Crédito Fiscal' },
  { code: '05', name: 'Nota de Crédito' },
  { code: '11', name: 'Factura de Exportación' },
  { code: '14', name: 'Factura de Sujeto Excluido' }
];

const documentTypeLabels = documentTypeOptions.reduce((labels, option) => ({
  ...labels,
  [option.code]: option.name
}), {});

const initialForm = {
  pointOfSaleId: '',
  documentTypeCode: '01',
  year: String(currentYear),
  lastSequence: ''
};

const padSequence = (sequence) => {
  return String(sequence).padStart(15, '0');
};

const onlyDigits = (value) => {
  return String(value || '').replace(/\D/g, '');
};

const getPointFullName = (point) => {
  if (!point) return '';

  const establishmentCode = point.establishment?.establishmentCode || '----';
  const establishmentName = point.establishment?.name || point.establishment?.establishmentType || 'Establecimiento';

  return `${establishmentCode}${point.code} · ${establishmentName} / ${point.name}`;
};

function ControlNumbersPage() {
  const [company, setCompany] = useState(null);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [controlNumbers, setControlNumbers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activePointsOfSale = useMemo(() => {
    return pointsOfSale.filter((point) => point.isActive);
  }, [pointsOfSale]);

  const selectedPoint = useMemo(() => {
    return pointsOfSale.find((point) => String(point.id) === String(form.pointOfSaleId)) || null;
  }, [pointsOfSale, form.pointOfSaleId]);

  const currentControl = useMemo(() => {
    if (!selectedPoint) return null;

    const establishmentCode = selectedPoint.establishment?.establishmentCode;

    return controlNumbers.find((control) =>
      String(control.year) === String(form.year) &&
      control.documentTypeCode === form.documentTypeCode &&
      control.establishmentCode === establishmentCode &&
      control.pointOfSaleCode === selectedPoint.code
    ) || null;
  }, [controlNumbers, form.documentTypeCode, form.year, selectedPoint]);

  const nextPreview = useMemo(() => {
    if (!selectedPoint) return '';

    const rawLastSequence = form.lastSequence.trim();

    if (!/^\d+$/.test(rawLastSequence)) return '';

    const lastSequence = Number(rawLastSequence);

    if (!Number.isSafeInteger(lastSequence) || lastSequence < 0) return '';

    const establishmentCode = selectedPoint.establishment?.establishmentCode || 'M001';
    const nextSequence = lastSequence + 1;

    return `DTE-${form.documentTypeCode}-${establishmentCode}${selectedPoint.code}-${padSequence(nextSequence)}`;
  }, [form.documentTypeCode, form.lastSequence, selectedPoint]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [companyData, pointsData] = await Promise.all([
        getActiveCompanyRequest(),
        getPointsOfSaleRequest({ isActive: 'true' })
      ]);

      const activeCompany = companyData.company || null;
      const loadedPoints = pointsData.pointsOfSale || [];

      setCompany(activeCompany);
      setPointsOfSale(loadedPoints);

      const defaultPointId = form.pointOfSaleId || loadedPoints[0]?.id || '';

      setForm((prev) => ({
        ...prev,
        pointOfSaleId: defaultPointId ? String(defaultPointId) : prev.pointOfSaleId
      }));

      if (activeCompany) {
        const controlsData = await getControlNumbersRequest({
          companyId: activeCompany.id,
          year: form.year || String(currentYear)
        });

        setControlNumbers(controlsData.controlNumbers || []);
      } else {
        setControlNumbers([]);
      }
    } catch (error) {
      console.error('Error cargando correlativos:', error);
      toast.error('No se pudo cargar la configuración de correlativos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const reloadControls = async (year = form.year) => {
    if (!company) return;

    const controlsData = await getControlNumbersRequest({
      companyId: company.id,
      year
    });

    setControlNumbers(controlsData.controlNumbers || []);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: name === 'lastSequence' || name === 'year' ? onlyDigits(value) : value
    }));
  };

  const handleYearBlur = async () => {
    if (!form.year) return;
    await reloadControls(form.year);
  };

  const handleUseCurrent = () => {
    setForm((prev) => ({
      ...prev,
      lastSequence: String(currentControl?.currentSequence ?? 0)
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!company) {
      toast.error('Primero debe registrar la empresa emisora');
      return;
    }

    if (!form.pointOfSaleId) {
      toast.error('Debe seleccionar el punto de venta');
      return;
    }

    if (!form.documentTypeCode) {
      toast.error('Debe seleccionar el tipo de DTE');
      return;
    }

    if (!/^\d{4}$/.test(form.year)) {
      toast.error('Debe ingresar un año válido');
      return;
    }

    if (!/^\d+$/.test(form.lastSequence)) {
      toast.error('Debe ingresar el último correlativo usado');
      return;
    }

    const confirmed = window.confirm(
      `Confirme que el último correlativo usado para ${documentTypeLabels[form.documentTypeCode]} es ${form.lastSequence}. El siguiente DTE se generará como ${nextPreview}.`
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const data = await setLastControlSequenceRequest({
        companyId: company.id,
        pointOfSaleId: form.pointOfSaleId,
        documentTypeCode: form.documentTypeCode,
        year: form.year,
        lastSequence: form.lastSequence
      });

      toast.success(data.message || 'Correlativo actualizado correctamente');
      await reloadControls(form.year);
    } catch (error) {
      console.error('Error actualizando correlativo:', error);
      toast.error(error.response?.data?.message || 'No se pudo actualizar el correlativo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-600">
        <Loader2 className="animate-spin mr-2" size={22} />
        Cargando correlativos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">
            Configuración técnica
          </p>
          <h2 className="text-2xl font-bold text-gray-900">
            Correlativos DTE
          </h2>
          <p className="text-gray-600 mt-1">
            Defina el último correlativo utilizado para que el sistema continúe desde el siguiente número.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-sm text-amber-900">
        <AlertTriangle className="shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-semibold">Use esta opción antes de emitir documentos en producción.</p>
          <p>
            Ingrese el último correlativo ya utilizado fuera del sistema. Por ejemplo, si el cliente terminó en 125,
            escriba 125 y el próximo DTE será 126. El sistema no permitirá colocar un valor menor al mayor DTE ya
            creado para ese tipo, año y punto de venta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border p-5 space-y-5">
          <div className="flex items-center gap-2 text-gray-900">
            <Hash size={20} className="text-blue-700" />
            <h3 className="font-semibold text-lg">Establecer último correlativo</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Empresa emisora
              </label>
              <div className="flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2 text-gray-700">
                <Building2 size={18} />
                <span>{company?.commercialName || company?.legalName || 'Sin empresa emisora'}</span>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Punto de venta
              </label>
              <select
                name="pointOfSaleId"
                value={form.pointOfSaleId}
                onChange={handleChange}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Seleccione punto de venta</option>
                {activePointsOfSale.map((point) => (
                  <option key={point.id} value={point.id}>
                    {getPointFullName(point)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de DTE
              </label>
              <select
                name="documentTypeCode"
                value={form.documentTypeCode}
                onChange={handleChange}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {documentTypeOptions.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.code} · {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Año
              </label>
              <input
                type="text"
                name="year"
                value={form.year}
                onChange={handleChange}
                onBlur={handleYearBlur}
                maxLength={4}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Último correlativo utilizado
              </label>
              <input
                type="text"
                name="lastSequence"
                value={form.lastSequence}
                onChange={handleChange}
                placeholder="Ej. 125"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-500 mt-1">
                Escriba solo el número final, sin ceros a la izquierda y sin el prefijo DTE.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 space-y-2">
            <p className="text-sm text-blue-900 font-semibold">Vista previa</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Actual configurado:</span>
                <p className="font-mono text-gray-900 break-all">
                  {currentControl?.currentControlNumber || 'Sin correlativo configurado'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Siguiente al guardar:</span>
                <p className="font-mono text-blue-900 break-all">
                  {nextPreview || 'Ingrese el último correlativo'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <button
              type="button"
              onClick={handleUseCurrent}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Usar actual
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900 text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Guardar correlativo
            </button>
          </div>
        </form>

        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
          <div className="flex items-center gap-2 text-gray-900">
            <Store size={20} className="text-blue-700" />
            <h3 className="font-semibold text-lg">Correlativos configurados</h3>
          </div>

          {controlNumbers.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-dashed p-5 text-sm text-gray-500">
              Aún no hay correlativos registrados para el año seleccionado.
            </div>
          ) : (
            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {controlNumbers.map((control) => (
                <div key={control.id} className="rounded-xl border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {control.documentTypeCode} · {documentTypeLabels[control.documentTypeCode] || 'DTE'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {control.establishmentCode}{control.pointOfSaleCode} · Año {control.year}
                      </p>
                    </div>
                    <span className="text-xs bg-blue-50 text-blue-800 rounded-full px-2 py-1">
                      Último: {control.currentSequence}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500">
                    Próximo número de control
                  </div>
                  <p className="font-mono text-sm text-gray-900 break-all">
                    {control.nextControlNumber}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ControlNumbersPage;
