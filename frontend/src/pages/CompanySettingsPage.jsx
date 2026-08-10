import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Building2, ImagePlus, Loader2, Plus, Save, Trash2 } from 'lucide-react';

import {
  createCompanyRequest,
  getActiveCompanyRequest,
  updateCompanyRequest
} from '../api/companies.api';

import SearchableSelect from '../components/SearchableSelect';
import { economicActivities } from '../data/economicActivities';
import { elSalvadorDepartments } from '../data/elSalvadorDepartments';
import { elSalvadorLocations } from '../data/elSalvadorLocations';
import { useAuth } from '../context/AuthContext';

const documentTypeOptions = [
  { code: '01', name: 'Factura de Consumidor Final' },
  { code: '03', name: 'Comprobante de Crédito Fiscal' },
  { code: '05', name: 'Nota de Crédito' },
  { code: '11', name: 'Factura de Exportación' },
  { code: '14', name: 'Factura de Sujeto Excluido' }
];

const initialForm = {
  nit: '',
  nrc: '',
  legalName: '',
  commercialName: '',
  logoDataUrl: '',
  useLogoInPdf: true,

  economicActivityCode: '',
  economicActivityName: '',
  economicActivityCode2: '',
  economicActivityName2: '',
  economicActivityCode3: '',
  economicActivityName3: '',

  establishmentType: 'CASA_MATRIZ',
  establishmentCode: 'M001',
  pointOfSaleCode: 'P001',
  environment: 'TEST',
  mhUser: '',
  mhPassword: '',
  signerPrivateKeyPassword: '',
  certificateFileName: '',
  email: '',
  phone: '',
  departmentCode: '',
  departmentName: '',
  districtName: '',
  municipalityCode: '',
  municipalityName: '',
  addressComplement: '',
  allowedDocumentTypes: ['01', '03'],
  usesFuelTaxes: false,
  isActive: true
};

const getEconomicActivityKeys = (activityNumber) => {
  if (activityNumber === 1) {
    return {
      codeKey: 'economicActivityCode',
      nameKey: 'economicActivityName'
    };
  }

  return {
    codeKey: `economicActivityCode${activityNumber}`,
    nameKey: `economicActivityName${activityNumber}`
  };
};

function CompanySettingsPage() {
  const { selectCompany } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [credentialStatus, setCredentialStatus] = useState({ hasMhPassword: false, hasSignerPrivateKeyPassword: false });
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(companyId);

  const selectedDepartment = useMemo(() => {
    return elSalvadorDepartments.find(
      (department) => department.code === form.departmentCode
    ) || null;
  }, [form.departmentCode]);

  const availableDistricts = useMemo(() => {
    if (!form.departmentCode) return [];

    return elSalvadorLocations
      .filter((location) => location.departmentCode === form.departmentCode)
      .sort((a, b) => a.districtName.localeCompare(b.districtName, 'es'));
  }, [form.departmentCode]);

  const selectedDistrict = useMemo(() => {
    return availableDistricts.find((location) =>
      location.districtName === form.districtName &&
      location.municipalityCode === form.municipalityCode
    ) || null;
  }, [availableDistricts, form.districtName, form.municipalityCode]);

  const loadCompany = async () => {
    try {
      setLoading(true);

      const data = await getActiveCompanyRequest();

      if (data.company) {
        const company = data.company;

        setCompanyId(company.id);

        setForm({
          nit: company.nit || '',
          nrc: company.nrc || '',
          legalName: company.legalName || '',
          commercialName: company.commercialName || '',
          logoDataUrl: company.logoDataUrl || '',
          useLogoInPdf: company.useLogoInPdf ?? true,

          economicActivityCode: company.economicActivityCode || '',
          economicActivityName: company.economicActivityName || '',
          economicActivityCode2: company.economicActivityCode2 || '',
          economicActivityName2: company.economicActivityName2 || '',
          economicActivityCode3: company.economicActivityCode3 || '',
          economicActivityName3: company.economicActivityName3 || '',

          establishmentType: company.establishmentType || 'CASA_MATRIZ',
          establishmentCode: company.establishmentCode || 'M001',
          pointOfSaleCode: company.pointOfSaleCode || 'P001',
          environment: company.environment || 'TEST',
          mhUser: company.credentials?.mhUser || company.nit || '',
          mhPassword: '',
          signerPrivateKeyPassword: '',
          certificateFileName: company.credentials?.certificateFileName || '',
          email: company.email || '',
          phone: company.phone || '',
          departmentCode: company.departmentCode || '',
          departmentName: company.departmentName || '',
          districtName: company.districtName || '',
          municipalityCode: company.municipalityCode || '',
          municipalityName: company.municipalityName || '',
          addressComplement: company.addressComplement || '',
          allowedDocumentTypes: company.allowedDocumentTypes || ['01', '03'],
          usesFuelTaxes: Boolean(company.usesFuelTaxes),
          isActive: company.isActive ?? true
        });

        setCredentialStatus({
          hasMhPassword: Boolean(company.credentials?.hasMhPassword),
          hasSignerPrivateKeyPassword: Boolean(company.credentials?.hasSignerPrivateKeyPassword)
        });
      } else {
        setCompanyId(null);
        setCredentialStatus({ hasMhPassword: false, hasSignerPrivateKeyPassword: false });
        setForm(initialForm);
      }
    } catch (error) {
      console.error('Error cargando empresa emisora:', error);
      toast.error('No se pudo cargar la empresa emisora');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompany();
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

    if (!validTypes.includes(file.type)) {
      toast.error('El logo debe ser PNG, JPG, JPEG o WEBP');
      return;
    }

    const LOGO_MAX_SIZE_MB = Number(import.meta.env.VITE_LOGO_MAX_SIZE_MB || 2);
    const LOGO_MAX_SIZE_BYTES = LOGO_MAX_SIZE_MB * 1024 * 1024;

    if (file.size > LOGO_MAX_SIZE_BYTES) {
      toast.error(`El logo debe pesar menos de ${LOGO_MAX_SIZE_MB} MB`);
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        logoDataUrl: reader.result
      }));

      toast.success('Logo cargado correctamente');
    };

    reader.onerror = () => {
      toast.error('No se pudo leer el archivo del logo');
    };

    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setForm((prev) => ({
      ...prev,
      logoDataUrl: ''
    }));
  };

  const handleEconomicActivityChange = (activity, activityNumber = 1) => {
    const { codeKey, nameKey } = getEconomicActivityKeys(activityNumber);

    if (!activity) {
      setForm((prev) => ({
        ...prev,
        [codeKey]: '',
        [nameKey]: ''
      }));

      return;
    }

    setForm((prev) => ({
      ...prev,
      [codeKey]: activity.code,
      [nameKey]: activity.name
    }));
  };

  const handleDepartmentChange = (department) => {
    if (!department) {
      setForm((prev) => ({
        ...prev,
        departmentCode: '',
        departmentName: '',
        districtName: '',
        municipalityCode: '',
        municipalityName: ''
      }));

      return;
    }

    setForm((prev) => ({
      ...prev,
      departmentCode: department.code,
      departmentName: department.name,
      districtName: '',
      municipalityCode: '',
      municipalityName: ''
    }));
  };

  const handleDistrictChange = (location) => {
    if (!location) {
      setForm((prev) => ({
        ...prev,
        districtName: '',
        municipalityCode: '',
        municipalityName: ''
      }));

      return;
    }

    setForm((prev) => ({
      ...prev,
      departmentCode: location.departmentCode,
      departmentName: location.departmentName,
      districtName: location.districtName,
      municipalityCode: location.municipalityCode,
      municipalityName: location.municipalityName
    }));
  };

  const handleDocumentTypeChange = (code) => {
    setForm((prev) => {
      const currentTypes = prev.allowedDocumentTypes || [];
      const exists = currentTypes.includes(code);

      return {
        ...prev,
        allowedDocumentTypes: exists
          ? currentTypes.filter((type) => type !== code)
          : [...currentTypes, code]
      };
    });
  };

  const validateOptionalEconomicActivity = (code, name, label) => {
    const hasCode = Boolean(code?.trim());
    const hasName = Boolean(name?.trim());

    if (hasCode && !hasName) {
      return `Debe seleccionar la descripción de la ${label}`;
    }

    if (!hasCode && hasName) {
      return `Debe seleccionar el código de la ${label}`;
    }

    return null;
  };

  const validateDuplicatedEconomicActivities = () => {
    const selectedCodes = [
      form.economicActivityCode,
      form.economicActivityCode2,
      form.economicActivityCode3
    ].filter(Boolean);

    const uniqueCodes = new Set(selectedCodes);

    if (selectedCodes.length !== uniqueCodes.size) {
      return 'No debe repetir la misma actividad económica';
    }

    return null;
  };

  const validateForm = () => {
    if (!form.nit.trim()) return 'El NIT es obligatorio';
    if (!form.legalName.trim()) return 'El nombre o razón social es obligatorio';
    if (!form.economicActivityCode.trim()) return 'Seleccione la actividad económica principal';
    if (!form.economicActivityName.trim()) return 'Seleccione la actividad económica principal';

    const activity2Error = validateOptionalEconomicActivity(
      form.economicActivityCode2,
      form.economicActivityName2,
      'actividad económica 2'
    );

    if (activity2Error) return activity2Error;

    const activity3Error = validateOptionalEconomicActivity(
      form.economicActivityCode3,
      form.economicActivityName3,
      'actividad económica 3'
    );

    if (activity3Error) return activity3Error;

    const duplicatedActivityError = validateDuplicatedEconomicActivities();

    if (duplicatedActivityError) return duplicatedActivityError;

    if (!form.departmentCode.trim()) return 'Seleccione el departamento';
    if (!form.districtName.trim()) return 'Seleccione el distrito';
    if (!form.municipalityCode.trim()) return 'Seleccione el municipio';
    if (!form.addressComplement.trim()) return 'La dirección es obligatoria';

    if (!form.allowedDocumentTypes || form.allowedDocumentTypes.length === 0) {
      return 'Seleccione al menos un tipo de documento que la empresa podrá emitir';
    }

    return null;
  };

  const buildPayload = () => {
    return {
      ...form,
      nit: form.nit.trim(),
      nrc: form.nrc.trim(),
      legalName: form.legalName.trim(),
      commercialName: form.commercialName.trim(),
      logoDataUrl: form.logoDataUrl || null,
      useLogoInPdf: Boolean(form.useLogoInPdf),

      economicActivityCode: form.economicActivityCode.trim(),
      economicActivityName: form.economicActivityName.trim(),
      economicActivityCode2: form.economicActivityCode2.trim() || null,
      economicActivityName2: form.economicActivityName2.trim() || null,
      economicActivityCode3: form.economicActivityCode3.trim() || null,
      economicActivityName3: form.economicActivityName3.trim() || null,

      establishmentType: 'CASA_MATRIZ',
      establishmentCode: 'M001',
      pointOfSaleCode: 'P001',

      mhUser: form.mhUser.trim() || form.nit.replace(/\D/g, ''),
      mhPassword: form.mhPassword,
      signerPrivateKeyPassword: form.signerPrivateKeyPassword,
      certificateFileName: form.certificateFileName || `${form.nit.replace(/\D/g, '')}.crt`,

      email: form.email.trim(),
      phone: form.phone.trim(),
      addressComplement: form.addressComplement.trim(),
      allowedDocumentTypes: form.allowedDocumentTypes || ['01', '03'],
      usesFuelTaxes: Boolean(form.usesFuelTaxes)
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = buildPayload();

    try {
      setSaving(true);

      if (isEditing) {
        await updateCompanyRequest(companyId, payload);
        toast.success('Empresa emisora actualizada correctamente');
      } else {
        const data = await createCompanyRequest(payload);
        toast.success('Contribuyente registrado correctamente');
        selectCompany(data.company.id);
        return;
      }

      await loadCompany();
    } catch (error) {
      console.error('Error guardando empresa:', error);

      const message = error.response?.data?.message || 'No se pudo guardar la empresa emisora';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const startNewCompany = () => {
    setCompanyId(null);
    setCredentialStatus({ hasMhPassword: false, hasSignerPrivateKeyPassword: false });
    setForm({ ...initialForm });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderSelectedEconomicActivity = (code, name) => {
    if (!code || !name) return null;

    return (
      <p className="text-xs text-gray-500 mt-1">
        {code} - {name}
      </p>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-blue-900" size={34} />
        <p className="text-gray-600 mt-3">Cargando empresa emisora...</p>
      </div>
    );
  }

  return (
    <div>
      <section className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center">
            <Building2 className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Contribuyentes
            </h2>
            <p className="text-gray-600 mt-1">
              Administre múltiples contribuyentes aislados dentro del mismo sistema.
            </p>
          </div>
          </div>
          {isEditing && (
            <button
              type="button"
              onClick={startNewCompany}
              className="inline-flex items-center gap-2 border border-blue-900 text-blue-900 rounded-xl px-4 py-2.5 font-semibold hover:bg-blue-50"
            >
              <Plus size={18} />
              Nuevo contribuyente
            </button>
          )}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border shadow-sm p-5">
        <section className="grid lg:grid-cols-[280px_1fr] gap-6">
          <div className="border rounded-2xl p-4 h-fit">
            <h3 className="font-bold text-gray-900 mb-3">
              Logo de la empresa
            </h3>

            <div className={`w-full h-36 rounded-xl flex items-center justify-center overflow-hidden ${
              form.logoDataUrl ? 'bg-transparent border-0' : 'border bg-gray-50'
            }`}
            >
              {form.logoDataUrl ? (
                <img
                  src={form.logoDataUrl}
                  alt="Logo empresa"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-500">
                  <ImagePlus className="mx-auto mb-2" size={30} />
                  <p className="text-sm">Sin logo</p>
                </div>
              )}
            </div>

            <label className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-3 font-semibold hover:bg-blue-800 cursor-pointer">
              <ImagePlus size={18} />
              Subir logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleLogoChange}
                className="hidden"
              />
            </label>

            {form.logoDataUrl && (
              <button
                type="button"
                onClick={removeLogo}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 font-semibold hover:bg-red-100"
              >
                <Trash2 size={18} />
                Quitar logo
              </button>
            )}

            <label className="mt-4 flex items-start gap-3 rounded-xl border bg-gray-50 p-3 text-sm text-gray-700">
              <input
                type="checkbox"
                name="useLogoInPdf"
                checked={Boolean(form.useLogoInPdf)}
                onChange={handleChange}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-800"
              />
              <span>
                <span className="font-semibold text-gray-900 block">Usar logo en PDF</span>
                Si desactiva esta opción, la representación gráfica se generará sin logo aunque haya uno cargado.
              </span>
            </label>

            <p className="text-xs text-gray-500 mt-3">
              Use PNG, JPG o WEBP menor a {Number(import.meta.env.VITE_LOGO_MAX_SIZE_MB || 2)} MB. El logo solo aparecerá en PDF si la opción anterior está activa.
            </p>
          </div>

          <div className="space-y-6">
            <section className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
              <p className="font-semibold">Casa matriz principal</p>
              <p>
                Esta configuración representa la empresa emisora principal. El sistema manejará internamente la Casa Matriz como M001.
                Las sucursales, puntos de venta y usuarios se administran desde el apartado técnico.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                Datos fiscales
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    NIT <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="nit"
                    value={form.nit}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="06142810231012"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    NRC
                  </label>
                  <input
                    name="nrc"
                    value={form.nrc}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="Ej. 1234567"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Razón social <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="legalName"
                    value={form.legalName}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="EMPRESA, S.A. DE C.V."
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Nombre comercial
                  </label>
                  <input
                    name="commercialName"
                    value={form.commercialName}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="Nombre comercial"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <SearchableSelect
                  label="Actividad económica principal"
                  value={form.economicActivityCode}
                  options={economicActivities}
                  onChange={(activity) => handleEconomicActivityChange(activity, 1)}
                  placeholder="Seleccione actividad económica principal"
                  searchPlaceholder="Buscar actividad económica"
                  getOptionValue={(option) => option.code}
                  getOptionLabel={(option) => option.label}
                  getOptionDescription={(option) => option.name}
                />

                {renderSelectedEconomicActivity(
                  form.economicActivityCode,
                  form.economicActivityName
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <SearchableSelect
                      label="Actividad económica 2"
                      value={form.economicActivityCode2}
                      options={economicActivities}
                      onChange={(activity) => handleEconomicActivityChange(activity, 2)}
                      placeholder="Opcional: seleccione segunda actividad"
                      searchPlaceholder="Buscar actividad económica"
                      getOptionValue={(option) => option.code}
                      getOptionLabel={(option) => option.label}
                      getOptionDescription={(option) => option.name}
                    />

                    {renderSelectedEconomicActivity(
                      form.economicActivityCode2,
                      form.economicActivityName2
                    )}
                  </div>

                  <div>
                    <SearchableSelect
                      label="Actividad económica 3"
                      value={form.economicActivityCode3}
                      options={economicActivities}
                      onChange={(activity) => handleEconomicActivityChange(activity, 3)}
                      placeholder="Opcional: seleccione tercera actividad"
                      searchPlaceholder="Buscar actividad económica"
                      getOptionValue={(option) => option.code}
                      getOptionLabel={(option) => option.label}
                      getOptionDescription={(option) => option.name}
                    />

                    {renderSelectedEconomicActivity(
                      form.economicActivityCode3,
                      form.economicActivityName3
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 border rounded-xl px-4 py-3 text-xs text-gray-600">
                  La actividad económica principal será la utilizada en el JSON oficial del DTE.
                  Las actividades 2 y 3 son opcionales y quedan registradas como información adicional de la empresa emisora.
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                Contacto y ambiente
              </h3>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Ambiente
                  </label>
                  <select
                    name="environment"
                    value={form.environment}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                  >
                    <option value="TEST">Pruebas</option>
                    <option value="PRODUCTION">Producción</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Correo
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="facturacion@empresa.com"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="2222-2222"
                  />
                </div>
              </div>
            </section>

            <section className="border border-blue-100 bg-blue-50/40 rounded-2xl p-4">
              <h3 className="font-bold text-lg text-gray-900 mb-1">
                Credenciales del contribuyente
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Las contraseñas se guardan cifradas por contribuyente. Si está editando y no desea cambiarlas, deje los campos de contraseña vacíos.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Usuario de Hacienda</label>
                  <input name="mhUser" value={form.mhUser} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white" placeholder="NIT/usuario autorizado" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Certificado en volumen</label>
                  <input value={form.certificateFileName || `${form.nit.replace(/\D/g, '') || 'NIT'}.crt`} readOnly className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-gray-100 text-gray-700" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Contraseña de Hacienda</label>
                  <input name="mhPassword" type="password" value={form.mhPassword} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white" placeholder={credentialStatus.hasMhPassword ? 'Configurada · deje vacío para conservar' : 'Ingrese la contraseña'} autoComplete="new-password" />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Contraseña privada del certificado</label>
                  <input name="signerPrivateKeyPassword" type="password" value={form.signerPrivateKeyPassword} onChange={handleChange} className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white" placeholder={credentialStatus.hasSignerPrivateKeyPassword ? 'Configurada · deje vacío para conservar' : 'Ingrese la contraseña privada'} autoComplete="new-password" />
                </div>
              </div>
            </section>

            <section>
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                Dirección de Casa Matriz
              </h3>

              <div className="grid md:grid-cols-2 gap-4">
                <SearchableSelect
                  label="Departamento"
                  value={form.departmentCode}
                  options={elSalvadorDepartments}
                  onChange={handleDepartmentChange}
                  placeholder="Seleccione departamento"
                  searchPlaceholder="Buscar departamento"
                  getOptionValue={(option) => option.code}
                  getOptionLabel={(option) => option.label}
                  getOptionDescription={(option) => option.name}
                />

                <SearchableSelect
                  label="Distrito"
                  value={selectedDistrict ? `${selectedDistrict.districtName}-${selectedDistrict.municipalityCode}` : ''}
                  options={availableDistricts}
                  onChange={handleDistrictChange}
                  placeholder={selectedDepartment ? 'Seleccione distrito' : 'Primero seleccione departamento'}
                  searchPlaceholder="Buscar distrito"
                  disabled={!selectedDepartment}
                  getOptionValue={(option) => `${option.districtName}-${option.municipalityCode}`}
                  getOptionLabel={(option) => option.districtName}
                  getOptionDescription={(option) => `Municipio: ${option.municipalityName}`}
                />

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Municipio
                  </label>
                  <input
                    value={form.municipalityName}
                    readOnly
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none bg-gray-100 text-gray-700"
                    placeholder="Se asigna automáticamente"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Códigos internos
                  </label>
                  <input
                    value="Casa Matriz M001 / Punto Venta P001"
                    readOnly
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none bg-gray-100 text-gray-700"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-700 mb-1">
                  Dirección complementaria <span className="text-red-600">*</span>
                </label>
                <textarea
                  name="addressComplement"
                  value={form.addressComplement}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
                  placeholder="Dirección completa de la casa matriz"
                />
              </div>
            </section>

            <section>
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                Tipos de DTE habilitados
              </h3>

              <div className="grid md:grid-cols-2 gap-3">
                {documentTypeOptions.map((doc) => (
                  <label
                    key={doc.code}
                    className="flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedDocumentTypes.includes(doc.code)}
                      onChange={() => handleDocumentTypeChange(doc.code)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">
                      {doc.code} - {doc.name}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="font-bold text-lg text-gray-900 mb-4">
                Configuración de ventas
              </h3>

              <label className="flex items-start gap-3 border rounded-xl px-4 py-4 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  name="usesFuelTaxes"
                  checked={form.usesFuelTaxes}
                  onChange={handleChange}
                  className="w-4 h-4 mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">
                    Utilizar FOVIAL y COTRANS en las ventas
                  </span>
                  <span className="block text-xs text-gray-500 mt-1">
                    Active esta opción solo si la empresa venderá productos que requieren estos cargos. Si está desactivado, esos campos no aparecerán al generar DTE.
                  </span>
                </span>
              </label>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={form.isActive}
                  onChange={handleChange}
                  className="w-4 h-4"
                />
                Empresa activa
              </label>
            </section>

            <div className="pt-4 border-t">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
              >
                {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                {isEditing ? 'Actualizar contribuyente' : 'Guardar nuevo contribuyente'}
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  );
}

export default CompanySettingsPage;