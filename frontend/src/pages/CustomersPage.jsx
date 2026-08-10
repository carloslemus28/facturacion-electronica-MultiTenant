import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Edit,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Search,
  UserRound,
  UsersRound
} from 'lucide-react';

import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString
} from 'libphonenumber-js';

import examples from 'libphonenumber-js/examples.mobile.json';

import {
  createCustomerRequest,
  getCustomersRequest,
  updateCustomerRequest
} from '../api/customers.api';

import SearchableSelect from '../components/SearchableSelect';
import { economicActivities } from '../data/economicActivities';
import { elSalvadorDepartments } from '../data/elSalvadorDepartments';
import { elSalvadorLocations } from '../data/elSalvadorLocations';

const getCountryName = (countryCode) => {
  try {
    const displayNames = new Intl.DisplayNames(['es'], {
      type: 'region'
    });

    return displayNames.of(countryCode) || countryCode;
  } catch (error) {
    return countryCode;
  }
};

const phoneCountryOptions = getCountries()
  .map((countryCode) => {
    const dialCode = getCountryCallingCode(countryCode);
    const countryName = getCountryName(countryCode);

    return {
      value: countryCode,
      label: `${countryName} (+${dialCode})`,
      description: countryCode,
      countryCode,
      dialCode,
      countryName
    };
  })
  .sort((a, b) => a.countryName.localeCompare(b.countryName, 'es'));

const initialForm = {
  documentType: 'SIN_DOCUMENTO',
  documentNumber: '',
  nrc: '',
  name: '',
  commercialName: '',
  economicActivityCode: '',
  economicActivityName: '',
  secondaryEconomicActivityCode: '',
  secondaryEconomicActivityName: '',
  tertiaryEconomicActivityCode: '',
  tertiaryEconomicActivityName: '',
  email: '',
  secondaryEmail: '',
  phoneCountryCode: 'SV',
  phoneDialCode: '503',
  phoneNationalNumber: '',
  phone: '',
  departmentCode: '',
  departmentName: '',
  districtName: '',
  municipalityCode: '',
  municipalityName: '',
  addressComplement: '',
  countryCode: '',
  isActive: true
};

const documentTypeOptions = [
  { value: 'SIN_DOCUMENTO', label: 'Sin documento' },
  { value: 'NIT', label: 'NIT' },
  { value: 'DUI', label: 'DUI' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'CARNET_RESIDENTE', label: 'Carnet de residente' },
  { value: 'OTRO', label: 'Otro' }
];

const documentTypeLabels = {
  SIN_DOCUMENTO: 'Sin documento',
  DUI: 'DUI',
  NIT: 'NIT',
  PASAPORTE: 'Pasaporte',
  CARNET_RESIDENTE: 'Carnet de residente',
  OTRO: 'Otro'
};

const onlyDigits = (value) => {
  return String(value || '').replace(/\D/g, '');
};

const getMaxNationalPhoneLength = (countryCode) => {
  try {
    const normalizedCountryCode = countryCode || 'SV';

    const exampleNumber = getExampleNumber(normalizedCountryCode, examples);

    if (exampleNumber?.nationalNumber) {
      return String(exampleNumber.nationalNumber).length;
    }

    const dialCode = getCountryCallingCode(normalizedCountryCode);

    return Math.max(4, 15 - String(dialCode).length);
  } catch (error) {
    return 8;
  }
};

function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showNoActivityModal, setShowNoActivityModal] = useState(false);
  const [confirmedWithoutActivity, setConfirmedWithoutActivity] = useState(false);

  const isEditing = Boolean(editingId);

  const selectedDepartment = useMemo(() => {
    return elSalvadorDepartments.find(
      (department) => department.code === form.departmentCode
    ) || null;
  }, [form.departmentCode]);

  const selectedPhoneCountry = useMemo(() => {
    return phoneCountryOptions.find(
      (country) => country.countryCode === form.phoneCountryCode
    ) || phoneCountryOptions.find((country) => country.countryCode === 'SV');
  }, [form.phoneCountryCode]);

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

  const filteredDescription = useMemo(() => {
    if (!q && !activeFilter) {
      return 'Mostrando todos los clientes registrados.';
    }

    return 'Mostrando clientes según los filtros aplicados.';
  }, [q, activeFilter]);

  const loadCustomers = async () => {
    try {
      setLoading(true);

      const params = {
        q
      };

      if (activeFilter !== '') {
        params.isActive = activeFilter;
      }

      const data = await getCustomersRequest(params);

      setCustomers(data.customers || []);
    } catch (error) {
      console.error('Error cargando clientes:', error);
      toast.error('No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setConfirmedWithoutActivity(false);

    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };

      if (name === 'documentType' && value === 'SIN_DOCUMENTO') {
        nextForm.documentNumber = '';
      }

      if (name === 'documentNumber' && ['NIT', 'DUI'].includes(prev.documentType)) {
        const maxLength = prev.documentType === 'NIT' ? 14 : 9;
        nextForm.documentNumber = onlyDigits(value).slice(0, maxLength);
      }

      if (name === 'nrc') {
        nextForm.nrc = onlyDigits(value).slice(0, 10);
      }

      if (name === 'phoneNationalNumber') {
        const maxLength = getMaxNationalPhoneLength(prev.phoneCountryCode);
        const digits = onlyDigits(value);

        nextForm.phoneNationalNumber = digits.slice(0, maxLength);
      }

      return nextForm;
    });
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

const handlePhoneCountryChange = (country) => {
  if (!country) {
    setForm((prev) => {
      const maxLength = getMaxNationalPhoneLength('SV');

      return {
        ...prev,
        phoneCountryCode: 'SV',
        phoneDialCode: '503',
        phoneNationalNumber: onlyDigits(prev.phoneNationalNumber).slice(0, maxLength)
      };
    });

    return;
  }

  setForm((prev) => {
    const maxLength = getMaxNationalPhoneLength(country.countryCode);

    return {
      ...prev,
      phoneCountryCode: country.countryCode,
      phoneDialCode: country.dialCode,
      phoneNationalNumber: onlyDigits(prev.phoneNationalNumber).slice(0, maxLength)
    };
  });
};

  const setActivity = (prefix, activity) => {
    setConfirmedWithoutActivity(false);

    const codeKey = prefix ? `${prefix}EconomicActivityCode` : 'economicActivityCode';
    const nameKey = prefix ? `${prefix}EconomicActivityName` : 'economicActivityName';

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

  const validatePhone = () => {
    const phoneNumber = parsePhoneNumberFromString(
      form.phoneNationalNumber,
      form.phoneCountryCode
    );

    if (!phoneNumber || !phoneNumber.isValid()) {
      return 'El número de teléfono no corresponde al formato del país seleccionado';
    }

    return null;
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return 'Ingrese el nombre o razón social del cliente';
    }

    if (!form.email.trim()) {
      return 'Ingrese el correo electrónico del cliente';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Ingrese un correo electrónico válido';
    }

    if (form.secondaryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.secondaryEmail.trim())) {
      return 'Ingrese un correo electrónico secundario válido';
    }

    if (!form.phoneCountryCode) {
      return 'Seleccione el país del teléfono';
    }

    if (!form.phoneNationalNumber.trim()) {
      return 'Ingrese el teléfono del cliente';
    }

    const phoneError = validatePhone();

    if (phoneError) {
      return phoneError;
    }

    if (form.documentType !== 'SIN_DOCUMENTO' && !form.documentNumber.trim()) {
      return 'Ingrese el número de documento del cliente';
    }

    if (form.documentType === 'SIN_DOCUMENTO' && form.documentNumber.trim()) {
      return 'Seleccione un tipo de documento válido o deje vacío el número de documento';
    }

    if (form.documentType === 'NIT' && onlyDigits(form.documentNumber).length !== 14) {
      return 'El NIT debe contener exactamente 14 dígitos';
    }

    if (form.documentType === 'DUI' && onlyDigits(form.documentNumber).length !== 9) {
      return 'El DUI debe contener exactamente 9 dígitos';
    }

    if (form.nrc.trim() && onlyDigits(form.nrc).length > 8) {
      return 'El NRC debe contener exactamente 8 dígitos';
    }

    return null;
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setConfirmedWithoutActivity(false);
    setShowNoActivityModal(false);
  };

  const buildPayload = () => {
    const phoneNumber = parsePhoneNumberFromString(
      form.phoneNationalNumber,
      form.phoneCountryCode
    );

    return {
      documentType: form.documentType,
      documentNumber:
        form.documentType === 'SIN_DOCUMENTO'
          ? ''
          : ['NIT', 'DUI'].includes(form.documentType)
            ? onlyDigits(form.documentNumber)
            : form.documentNumber.trim(),
      nrc: onlyDigits(form.nrc),
      name: form.name.trim(),
      commercialName: form.commercialName.trim(),
      economicActivityCode: form.economicActivityCode,
      economicActivityName: form.economicActivityName,
      secondaryEconomicActivityCode: form.secondaryEconomicActivityCode,
      secondaryEconomicActivityName: form.secondaryEconomicActivityName,
      tertiaryEconomicActivityCode: form.tertiaryEconomicActivityCode,
      tertiaryEconomicActivityName: form.tertiaryEconomicActivityName,
      email: form.email.trim(),
      secondaryEmail: form.secondaryEmail.trim() || null,
      phoneCountryCode: form.phoneCountryCode,
      phoneDialCode: form.phoneDialCode,
      phoneNationalNumber: phoneNumber?.nationalNumber || form.phoneNationalNumber.trim(),
      phone: phoneNumber?.number || form.phoneNationalNumber.trim(),
      departmentCode: form.departmentCode,
      departmentName: form.departmentName,
      districtName: form.districtName,
      municipalityCode: form.municipalityCode,
      municipalityName: form.municipalityName,
      addressComplement: form.addressComplement.trim(),
      countryCode: form.countryCode.trim(),
      isActive: form.isActive
    };
  };

  const saveCustomer = async () => {
    try {
      setSaving(true);

      const payload = buildPayload();

      if (isEditing) {
        await updateCustomerRequest(editingId, payload);
        toast.success('Cliente actualizado correctamente');
      } else {
        await createCustomerRequest(payload);
        toast.success('Cliente registrado correctamente');
      }

      resetForm();
      await loadCustomers();
    } catch (error) {
      console.error('Error guardando cliente:', error);

      const message = error.response?.data?.message || 'No se pudo guardar el cliente';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!form.economicActivityCode && !confirmedWithoutActivity) {
      setShowNoActivityModal(true);
      return;
    }

    await saveCustomer();
  };

  const confirmSaveWithoutActivity = async () => {
    setConfirmedWithoutActivity(true);
    setShowNoActivityModal(false);
    await saveCustomer();
  };

  const handleEdit = (customer) => {
    setEditingId(customer.id);

    setForm({
      documentType: customer.documentType || 'SIN_DOCUMENTO',
      documentNumber: customer.documentNumber || '',
      nrc: customer.nrc || '',
      name: customer.name || '',
      commercialName: customer.commercialName || '',
      economicActivityCode: customer.economicActivityCode || '',
      economicActivityName: customer.economicActivityName || '',
      secondaryEconomicActivityCode: customer.secondaryEconomicActivityCode || '',
      secondaryEconomicActivityName: customer.secondaryEconomicActivityName || '',
      tertiaryEconomicActivityCode: customer.tertiaryEconomicActivityCode || '',
      tertiaryEconomicActivityName: customer.tertiaryEconomicActivityName || '',
      email: customer.email || '',
      secondaryEmail: customer.secondaryEmail || '',
      phoneCountryCode: customer.phoneCountryCode || 'SV',
      phoneDialCode: customer.phoneDialCode || '503',
      phoneNationalNumber: customer.phoneNationalNumber || customer.phone || '',
      phone: customer.phone || '',
      departmentCode: customer.departmentCode || '',
      departmentName: customer.departmentName || '',
      districtName: customer.districtName || '',
      municipalityCode: customer.municipalityCode || '',
      municipalityName: customer.municipalityName || '',
      addressComplement: customer.addressComplement || '',
      countryCode: customer.countryCode || '',
      isActive: customer.isActive ?? true
    });

    setConfirmedWithoutActivity(Boolean(customer.economicActivityCode));

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    await loadCustomers();
  };

  return (
    <div>
      {showNoActivityModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-yellow-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="text-yellow-700" size={24} />
              </div>

              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  Cliente sin actividad económica
                </h3>
                <p className="text-sm text-gray-600 mt-2">
                  No ha seleccionado una actividad económica primaria. Puede guardar el cliente, pero si luego intenta emitir CCF o Nota de Crédito, el sistema podría solicitar esta información.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowNoActivityModal(false)}
                className="px-5 py-3 rounded-xl border text-gray-700 hover:bg-gray-50 font-semibold"
              >
                Volver y revisar
              </button>

              <button
                type="button"
                onClick={confirmSaveWithoutActivity}
                disabled={saving}
                className="px-5 py-3 rounded-xl bg-blue-900 text-white hover:bg-blue-800 font-semibold disabled:opacity-70"
              >
                Continuar sin actividad
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
            <UsersRound className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Clientes / Receptores
            </h2>
            <p className="text-gray-600 mt-1">
              Registre clientes para emisión de DTE. Nombre, correo y teléfono son obligatorios.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadCustomers}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

      <section className="grid xl:grid-cols-[500px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border shadow-sm p-5 h-fit">
          <div className="flex items-center gap-2 mb-5">
            {isEditing ? (
              <Edit className="text-blue-900" size={22} />
            ) : (
              <Plus className="text-blue-900" size={22} />
            )}

            <h3 className="font-bold text-lg text-gray-900">
              {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Nombre o razón social <span className="text-red-600">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Nombre del cliente o razón social"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Correo <span className="text-red-600">*</span>
                </label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="cliente@correo.com"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Correo electrónico secundario
                </label>
                <input
                  name="secondaryEmail"
                  type="email"
                  value={form.secondaryEmail}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="opcional@correo.com"
                />
              </div>
            </div>

            <div>
              <SearchableSelect
                label="Extensión telefónica"
                value={form.phoneCountryCode}
                options={phoneCountryOptions}
                onChange={handlePhoneCountryChange}
                placeholder="Seleccione país"
                searchPlaceholder="Buscar país o extensión"
                getOptionValue={(option) => option.countryCode}
                getOptionLabel={(option) => option.label}
                getOptionDescription={(option) => option.description}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Teléfono <span className="text-red-600">*</span>
              </label>

              <div className="grid grid-cols-[96px_1fr] gap-3">
                <input
                  value={`+${selectedPhoneCountry?.dialCode || form.phoneDialCode || '503'}`}
                  readOnly
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none bg-gray-100 text-gray-700"
                />

                <input
                  name="phoneNationalNumber"
                  value={form.phoneNationalNumber}
                  onChange={handleChange}
                  maxLength={getMaxNationalPhoneLength(form.phoneCountryCode)}
                  inputMode="numeric"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

            </div>

            <div className="border-t pt-4">
              <p className="font-semibold text-gray-900 mb-3">
                Datos tributarios
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <SearchableSelect
                  label="Tipo documento"
                  value={form.documentType}
                  options={documentTypeOptions}
                  onChange={(option) => {
                    const nextDocumentType = option?.value || 'SIN_DOCUMENTO';

                    setForm((prev) => ({
                      ...prev,
                      documentType: nextDocumentType,
                      documentNumber: nextDocumentType === 'SIN_DOCUMENTO' ? '' : prev.documentNumber
                    }));
                  }}
                  placeholder="Seleccione tipo"
                  searchPlaceholder="Buscar tipo de documento"
                  getOptionValue={(option) => option.value}
                  getOptionLabel={(option) => option.label}
                />

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Número documento
                  </label>
                  <input
                    name="documentNumber"
                    value={form.documentNumber}
                    onChange={handleChange}
                    disabled={form.documentType === 'SIN_DOCUMENTO'}
                    maxLength={form.documentType === 'NIT' ? 14 : form.documentType === 'DUI' ? 9 : 30}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder={
                      form.documentType === 'SIN_DOCUMENTO'
                        ? 'No aplica'
                        : form.documentType === 'NIT'
                          ? '14 dígitos'
                          : 'Número de documento'
                    }
                  />

                  {form.documentType === 'NIT' && (
                    <p className="text-xs text-gray-500 mt-1">
                      NIT: {onlyDigits(form.documentNumber).length}/14 dígitos.
                    </p>
                  )}

                  {form.documentType === 'DUI' && (
                    <p className="text-xs text-gray-500 mt-1">
                      DUI: {onlyDigits(form.documentNumber).length}/9 dígitos.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    NRC
                  </label>
                  <input
                    name="nrc"
                    value={form.nrc}
                    onChange={handleChange}
                    maxLength={8}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="NRC del Cliente si aplica"
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
                    placeholder="Nombre comercial si aplica"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <SearchableSelect
                  label="Actividad económica primaria"
                  value={form.economicActivityCode}
                  options={economicActivities}
                  onChange={(activity) => setActivity('', activity)}
                  placeholder="Seleccione actividad económica primaria"
                  searchPlaceholder="Escriba para buscar, por ejemplo: servicio"
                  getOptionValue={(option) => option.code}
                  getOptionLabel={(option) => option.label}
                  getOptionDescription={(option) => option.name}
                />

                <SearchableSelect
                  label="Actividad económica secundaria"
                  value={form.secondaryEconomicActivityCode}
                  options={economicActivities}
                  onChange={(activity) => setActivity('secondary', activity)}
                  placeholder="Seleccione actividad económica secundaria"
                  searchPlaceholder="Escriba para buscar"
                  getOptionValue={(option) => option.code}
                  getOptionLabel={(option) => option.label}
                  getOptionDescription={(option) => option.name}
                />

                <SearchableSelect
                  label="Actividad económica terciaria"
                  value={form.tertiaryEconomicActivityCode}
                  options={economicActivities}
                  onChange={(activity) => setActivity('tertiary', activity)}
                  placeholder="Seleccione actividad económica terciaria"
                  searchPlaceholder="Escriba para buscar"
                  getOptionValue={(option) => option.code}
                  getOptionLabel={(option) => option.label}
                  getOptionDescription={(option) => option.name}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="font-semibold text-gray-900 mb-3">
                Ubicación
              </p>

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

              <div className="mt-4">
                <SearchableSelect
                  label="Distrito"
                  value={selectedDistrict ? `${selectedDistrict.districtName}-${selectedDistrict.municipalityCode}` : ''}
                  options={availableDistricts}
                  onChange={handleDistrictChange}
                  placeholder={
                    selectedDepartment
                      ? 'Seleccione distrito'
                      : 'Primero seleccione departamento'
                  }
                  searchPlaceholder="Buscar distrito"
                  disabled={!selectedDepartment}
                  getOptionValue={(option) => `${option.districtName}-${option.municipalityCode}`}
                  getOptionLabel={(option) => option.districtName}
                  getOptionDescription={(option) => `Municipio: ${option.municipalityName}`}
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-700 mb-1">
                  Municipio
                </label>
                <input
                  value={form.municipalityName}
                  readOnly
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none bg-gray-100 text-gray-700"
                  placeholder="Se asigna automáticamente según el distrito"
                />
              </div>

              <div className="mt-4">
                <label className="block text-sm text-gray-700 mb-1">
                  Dirección complementaria
                </label>
                <textarea
                  name="addressComplement"
                  value={form.addressComplement}
                  onChange={handleChange}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
                  placeholder="Dirección exacta, referencias, colonia, calle, número, etc."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Código país
              </label>
              <input
                name="countryCode"
                value={form.countryCode}
                onChange={handleChange}
                maxLength={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 uppercase"
                placeholder="SV, US, GT..."
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={handleChange}
                className="w-4 h-4"
              />
              Cliente activo
            </label>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {isEditing ? 'Actualizar cliente' : 'Guardar cliente'}
            </button>

            {isEditing && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-700 rounded-xl px-5 py-3 font-semibold hover:bg-gray-200"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <section className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-5">
            <UserRound className="text-blue-900" size={22} />
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Clientes registrados
              </h3>
              <p className="text-sm text-gray-500">{filteredDescription}</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="grid md:grid-cols-[1fr_190px_auto] gap-3 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Buscar por nombre, documento, NRC, correos, teléfono o actividad"
              />
            </div>

            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
            >
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800"
            >
              <Search size={18} />
              Buscar
            </button>
          </form>

          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="animate-spin mx-auto text-blue-900" size={32} />
              <p className="text-gray-500 mt-3">Cargando clientes...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customers.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No hay clientes registrados con esos filtros.
                </p>
              )}

              {customers.map((customer) => (
                <article
                  key={customer.id}
                  className="border rounded-xl p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-gray-900">
                          {customer.name}
                        </h4>

                        <span className={`text-xs px-2 py-1 rounded-full ${
                          customer.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {customer.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-500 mt-1">
                        Documento: {documentTypeLabels[customer.documentType] || customer.documentType}
                        {customer.documentNumber ? ` - ${customer.documentNumber}` : ''}
                      </p>

                      {customer.nrc && (
                        <p className="text-sm text-gray-500">
                          NRC: {customer.nrc}
                        </p>
                      )}

                      {customer.email && (
                        <p className="text-sm text-gray-500">
                          Correo: {customer.email}
                        </p>
                      )}

                      {customer.secondaryEmail && (
                        <p className="text-sm text-gray-500">
                          Correo secundario: {customer.secondaryEmail}
                        </p>
                      )}

                      {(customer.phone || customer.phoneNationalNumber) && (
                        <p className="text-sm text-gray-500">
                          Teléfono: {customer.phone || `+${customer.phoneDialCode || ''} ${customer.phoneNationalNumber || ''}`}
                        </p>
                      )}

                      {customer.economicActivityName && (
                        <p className="text-sm text-gray-500">
                          Actividad primaria: {customer.economicActivityCode} - {customer.economicActivityName}
                        </p>
                      )}

                      {customer.secondaryEconomicActivityName && (
                        <p className="text-sm text-gray-500">
                          Actividad secundaria: {customer.secondaryEconomicActivityCode} - {customer.secondaryEconomicActivityName}
                        </p>
                      )}

                      {customer.tertiaryEconomicActivityName && (
                        <p className="text-sm text-gray-500">
                          Actividad terciaria: {customer.tertiaryEconomicActivityCode} - {customer.tertiaryEconomicActivityName}
                        </p>
                      )}

                      {(customer.departmentName || customer.districtName || customer.municipalityName) && (
                        <p className="text-sm text-gray-500">
                          Ubicación: {[customer.departmentName, customer.districtName, customer.municipalityName]
                            .filter(Boolean)
                            .join(' / ')}
                        </p>
                      )}

                      {customer.addressComplement && (
                        <p className="text-sm text-gray-500">
                          Dirección: {customer.addressComplement}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEdit(customer)}
                      className="inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-2 text-gray-700 hover:bg-white"
                    >
                      <Edit size={17} />
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

export default CustomersPage;