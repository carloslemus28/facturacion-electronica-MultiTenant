import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  MonitorCog,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Store,
  UserPlus,
  Users
} from 'lucide-react';

import {
  getActiveCompanyRequest,
  getEstablishmentsRequest,
  getNextEstablishmentCodeRequest,
  createEstablishmentRequest
} from '../api/companies.api';

import {
  getPointsOfSaleRequest,
  createPointOfSaleRequest
} from '../api/pointsOfSale.api';

import {
  getUsersRequest,
  createUserRequest
} from '../api/users.api';

import SearchableSelect from '../components/SearchableSelect';
import { elSalvadorDepartments } from '../data/elSalvadorDepartments';
import { elSalvadorLocations } from '../data/elSalvadorLocations';

const establishmentTypeOptions = [
  { value: 'CASA_MATRIZ', label: 'Casa matriz' },
  { value: 'SUCURSAL', label: 'Sucursal' },
  { value: 'BODEGA', label: 'Bodega' },
  { value: 'PREDIO', label: 'Predio' }
];

const initialEstablishmentForm = {
  establishmentType: 'SUCURSAL',
  establishmentCode: '',
  name: '',
  departmentCode: '',
  departmentName: '',
  districtName: '',
  municipalityCode: '',
  municipalityName: '',
  addressComplement: '',
  isActive: true
};

const initialPointForm = {
  establishmentId: '',
  code: '',
  name: '',
  description: '',
  isActive: true
};

const initialUserForm = {
  username: '',
  firstName: '',
  lastName: '',
  password: '',
  roleCode: 'FACTURADOR',
  pointOfSaleId: '',
  isActive: true
};

const roleOptions = [
  {
    value: 'FACTURADOR',
    label: 'Facturador / Caja',
    description: 'Usuario operativo del contribuyente activo que emite DTE desde un punto de venta asignado.'
  }
];

const establishmentTypeLabels = {
  CASA_MATRIZ: 'Casa matriz',
  SUCURSAL: 'Sucursal',
  BODEGA: 'Bodega',
  PREDIO: 'Predio'
};

function TechnicalUsersPage() {
  const [company, setCompany] = useState(null);
  const [establishments, setEstablishments] = useState([]);
  const [pointsOfSale, setPointsOfSale] = useState([]);
  const [users, setUsers] = useState([]);

  const [establishmentForm, setEstablishmentForm] = useState(initialEstablishmentForm);
  const [pointForm, setPointForm] = useState(initialPointForm);
  const [userForm, setUserForm] = useState(initialUserForm);

  const [loading, setLoading] = useState(true);
  const [savingEstablishment, setSavingEstablishment] = useState(false);
  const [savingPoint, setSavingPoint] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [loadingNextCode, setLoadingNextCode] = useState(false);

  const activeEstablishments = useMemo(() => {
    return establishments.filter((establishment) => establishment.isActive);
  }, [establishments]);

  const selectedEstablishmentForPoint = useMemo(() => {
    return establishments.find(
      (establishment) => String(establishment.id) === String(pointForm.establishmentId)
    ) || null;
  }, [establishments, pointForm.establishmentId]);

  const availableDistricts = useMemo(() => {
    if (!establishmentForm.departmentCode) return [];

    return elSalvadorLocations
      .filter((location) => location.departmentCode === establishmentForm.departmentCode)
      .sort((a, b) => a.districtName.localeCompare(b.districtName, 'es'));
  }, [establishmentForm.departmentCode]);

  const selectedDepartment = useMemo(() => {
    return elSalvadorDepartments.find(
      (department) => department.code === establishmentForm.departmentCode
    ) || null;
  }, [establishmentForm.departmentCode]);

  const selectedDistrict = useMemo(() => {
    return availableDistricts.find((location) =>
      location.districtName === establishmentForm.districtName &&
      location.municipalityCode === establishmentForm.municipalityCode
    ) || null;
  }, [availableDistricts, establishmentForm.districtName, establishmentForm.municipalityCode]);

  const nextPointCode = useMemo(() => {
    if (!pointForm.establishmentId) return 'P001';

    const usedNumbers = pointsOfSale
      .filter((point) => String(point.establishmentId) === String(pointForm.establishmentId))
      .map((point) => {
        const match = String(point.code || '').match(/^P(\d{3})$/);
        return match ? Number(match[1]) : 0;
      })
      .filter((number) => number > 0);

    const nextNumber = usedNumbers.length > 0
      ? Math.max(...usedNumbers) + 1
      : 1;

    return `P${String(nextNumber).padStart(3, '0')}`;
  }, [pointsOfSale, pointForm.establishmentId]);

  const activePointsOfSale = useMemo(() => {
    return pointsOfSale.filter((point) => point.isActive);
  }, [pointsOfSale]);

  const facturadores = useMemo(() => {
    return users.filter((user) =>
      user.roles?.some((role) => role.code === 'FACTURADOR')
    );
  }, [users]);

  const administradores = useMemo(() => {
    return users.filter((user) =>
      user.roles?.some((role) => role.code === 'ADMIN')
    );
  }, [users]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [companyData, establishmentsData, pointsData, usersData] = await Promise.all([
        getActiveCompanyRequest(),
        getEstablishmentsRequest(),
        getPointsOfSaleRequest(),
        getUsersRequest()
      ]);

      const activeCompany = companyData.company || null;

      setCompany(activeCompany);
      setEstablishments(establishmentsData.establishments || []);
      setPointsOfSale(pointsData.pointsOfSale || []);
      setUsers(usersData.users || []);

      if (activeCompany && !pointForm.establishmentId) {
        const firstEstablishment = (establishmentsData.establishments || [])[0];

        if (firstEstablishment) {
          setPointForm((prev) => ({
            ...prev,
            establishmentId: String(firstEstablishment.id)
          }));
        }
      }
    } catch (error) {
      console.error('Error cargando configuración técnica:', error);
      toast.error('No se pudo cargar la información técnica');
    } finally {
      setLoading(false);
    }
  };

  const loadNextEstablishmentCode = async (type, companyId) => {
    if (!companyId || !type) return;

    try {
      setLoadingNextCode(true);

      const data = await getNextEstablishmentCodeRequest({
        companyId,
        establishmentType: type
      });

      setEstablishmentForm((prev) => ({
        ...prev,
        establishmentCode: data.code || ''
      }));
    } catch (error) {
      console.error('Error obteniendo siguiente código de establecimiento:', error);
      toast.error('No se pudo sugerir el código del establecimiento');
    } finally {
      setLoadingNextCode(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (company?.id && !establishmentForm.establishmentCode) {
      loadNextEstablishmentCode(establishmentForm.establishmentType, company.id);
    }
  }, [company]);

  useEffect(() => {
    if (!pointForm.code && pointForm.establishmentId) {
      setPointForm((prev) => ({
        ...prev,
        code: nextPointCode
      }));
    }
  }, [nextPointCode, pointForm.code, pointForm.establishmentId]);

  const handleEstablishmentChange = (event) => {
    const { name, value, type, checked } = event.target;

    setEstablishmentForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleEstablishmentTypeChange = async (event) => {
    const value = event.target.value;

    setEstablishmentForm((prev) => ({
      ...prev,
      establishmentType: value,
      establishmentCode: ''
    }));

    await loadNextEstablishmentCode(value, company?.id);
  };

  const handleDepartmentChange = (department) => {
    if (!department) {
      setEstablishmentForm((prev) => ({
        ...prev,
        departmentCode: '',
        departmentName: '',
        districtName: '',
        municipalityCode: '',
        municipalityName: ''
      }));

      return;
    }

    setEstablishmentForm((prev) => ({
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
      setEstablishmentForm((prev) => ({
        ...prev,
        districtName: '',
        municipalityCode: '',
        municipalityName: ''
      }));

      return;
    }

    setEstablishmentForm((prev) => ({
      ...prev,
      departmentCode: location.departmentCode,
      departmentName: location.departmentName,
      districtName: location.districtName,
      municipalityCode: location.municipalityCode,
      municipalityName: location.municipalityName
    }));
  };

  const handlePointChange = (event) => {
    const { name, value, type, checked } = event.target;

    setPointForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value.toUpperCase()
      };

      if (name === 'establishmentId') {
        nextForm.code = '';
      }

      return nextForm;
    });
  };

  const handleUserChange = (event) => {
    const { name, value, type, checked } = event.target;

    setUserForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };

      if (name === 'roleCode' && value === 'ADMIN') {
        nextForm.pointOfSaleId = '';
      }

      return nextForm;
    });
  };

  const validateEstablishmentForm = () => {
    if (!company?.id) return 'Primero debe existir una empresa emisora activa';
    if (!establishmentForm.establishmentType) return 'Seleccione el tipo de establecimiento';
    if (!establishmentForm.establishmentCode.trim()) return 'Ingrese el código de establecimiento';

    if (establishmentForm.establishmentCode.trim().length !== 4) {
      return 'El código de establecimiento debe tener 4 caracteres. Ejemplo: M001 o S001';
    }

    if (!establishmentForm.name.trim()) return 'Ingrese el nombre del establecimiento';
    if (!establishmentForm.departmentCode) return 'Seleccione el departamento';
    if (!establishmentForm.districtName) return 'Seleccione el distrito';
    if (!establishmentForm.municipalityCode) return 'Seleccione el municipio';
    if (!establishmentForm.addressComplement.trim()) return 'Ingrese la dirección complementaria';

    const duplicated = establishments.find(
      (item) =>
        Number(item.companyId) === Number(company.id) &&
        item.establishmentCode === establishmentForm.establishmentCode.trim().toUpperCase()
    );

    if (duplicated) {
      return 'Ya existe un establecimiento con ese código';
    }

    return null;
  };

  const validatePointForm = () => {
    if (!company?.id) return 'Primero debe existir una empresa emisora activa';
    if (!pointForm.establishmentId) return 'Seleccione el establecimiento o sucursal';

    if (!/^P\d{3}$/.test(pointForm.code)) {
      return 'El código debe tener formato P001, P002, P003...';
    }

    if (!pointForm.name.trim()) {
      return 'Ingrese el nombre del punto de venta';
    }

    const duplicatedPoint = pointsOfSale.find(
      (point) =>
        String(point.establishmentId) === String(pointForm.establishmentId) &&
        point.code === pointForm.code
    );

    if (duplicatedPoint) {
      return 'Ya existe un punto de venta con ese código en este establecimiento';
    }

    return null;
  };

  const validateUserForm = () => {
    if (!userForm.username.trim()) {
      return 'Ingrese el nombre de usuario';
    }

    if (!/^[A-Za-z0-9._-]{4,80}$/.test(userForm.username.trim())) {
      return 'El nombre de usuario debe tener entre 4 y 80 caracteres y solo puede usar letras, números, punto, guion o guion bajo';
    }

    if (!userForm.firstName.trim()) return 'Ingrese el nombre del usuario';
    if (!userForm.lastName.trim()) return 'Ingrese el apellido del usuario';

    if (!userForm.password || userForm.password.length < 8) {
      return 'La contraseña debe tener al menos 8 caracteres';
    }

    if (userForm.roleCode === 'FACTURADOR' && !userForm.pointOfSaleId) {
      return 'Seleccione un punto de venta para el usuario facturador';
    }

    const duplicatedUsername = users.find(
      (user) => user.username?.toLowerCase() === userForm.username.trim().toLowerCase()
    );

    if (duplicatedUsername) {
      return 'Ya existe un usuario registrado con ese nombre de usuario';
    }

    return null;
  };

  const createEstablishment = async (event) => {
    event.preventDefault();

    const validationError = validateEstablishmentForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSavingEstablishment(true);

      await createEstablishmentRequest({
        companyId: company.id,
        establishmentType: establishmentForm.establishmentType,
        establishmentCode: establishmentForm.establishmentCode.trim().toUpperCase(),
        name: establishmentForm.name.trim(),
        departmentCode: establishmentForm.departmentCode,
        departmentName: establishmentForm.departmentName,
        districtName: establishmentForm.districtName,
        municipalityCode: establishmentForm.municipalityCode,
        municipalityName: establishmentForm.municipalityName,
        addressComplement: establishmentForm.addressComplement.trim(),
        isActive: establishmentForm.isActive
      });

      toast.success('Establecimiento registrado correctamente');

      setEstablishmentForm({
        ...initialEstablishmentForm,
        establishmentCode: ''
      });

      await loadData();

      if (company?.id) {
        await loadNextEstablishmentCode('SUCURSAL', company.id);
      }
    } catch (error) {
      console.error('Error creando establecimiento:', error);

      const message = error.response?.data?.message || 'No se pudo crear el establecimiento';
      toast.error(message);
    } finally {
      setSavingEstablishment(false);
    }
  };

  const createPoint = async (event) => {
    event.preventDefault();

    const validationError = validatePointForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSavingPoint(true);

      await createPointOfSaleRequest({
        companyId: company.id,
        establishmentId: Number(pointForm.establishmentId),
        code: pointForm.code.trim().toUpperCase(),
        name: pointForm.name.trim(),
        description: pointForm.description.trim(),
        isActive: pointForm.isActive
      });

      toast.success('Punto de venta creado correctamente');

      setPointForm((prev) => ({
        ...initialPointForm,
        establishmentId: prev.establishmentId,
        code: ''
      }));

      await loadData();
    } catch (error) {
      console.error('Error creando punto de venta:', error);

      const message = error.response?.data?.message || 'No se pudo crear el punto de venta';
      toast.error(message);
    } finally {
      setSavingPoint(false);
    }
  };

  const createUser = async (event) => {
    event.preventDefault();

    const validationError = validateUserForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setSavingUser(true);

      await createUserRequest({
      username: userForm.username.trim(),
      firstName: userForm.firstName.trim(),
      lastName: userForm.lastName.trim(),
      password: userForm.password,
      roleCode: userForm.roleCode,
      pointOfSaleId:
        userForm.roleCode === 'FACTURADOR'
          ? Number(userForm.pointOfSaleId)
          : null,
      isActive: userForm.isActive
    });

      toast.success('Usuario creado correctamente');

      setUserForm(initialUserForm);
      await loadData();
    } catch (error) {
      console.error('Error creando usuario:', error);

      const message = error.response?.data?.message || 'No se pudo crear el usuario';
      toast.error(message);
    } finally {
      setSavingUser(false);
    }
  };

  const getRoleText = (user) => {
    return user.roles?.map((role) => role.code).join(', ') || 'Sin rol';
  };

  const isAdminUser = (user) => {
    return user.roles?.some((role) => role.code === 'ADMIN');
  };

  const isFacturadorUser = (user) => {
    return user.roles?.some((role) => role.code === 'FACTURADOR');
  };

  const getPointFullName = (point) => {
    const establishment = point.establishment;

    if (!establishment) {
      return `${point.code} - ${point.name}`;
    }

    return `${establishment.establishmentCode} / ${point.code} - ${point.name}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-blue-900" size={34} />
        <p className="text-gray-600 mt-3">
          Cargando usuarios, establecimientos y puntos de venta...
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center">
            <MonitorCog className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Usuarios, sucursales y puntos de venta
            </h2>
            <p className="text-gray-600 mt-1">
              Configure establecimientos, cajas y usuarios autorizados para operar el sistema.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

      {!company && (
        <section className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900 flex gap-3">
          <AlertTriangle size={20} className="shrink-0" />
          <div>
            <p className="font-semibold">No hay empresa emisora activa.</p>
            <p>
              Antes de crear establecimientos, puntos de venta y usuarios facturadores, debe configurar una empresa emisora activa.
            </p>
          </div>
        </section>
      )}

      {company && (
        <section className="mb-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
          <p><strong>Empresa activa:</strong> {company.legalName}</p>
          <p><strong>NIT:</strong> {company.nit} {company.nrc ? `/ NRC: ${company.nrc}` : ''}</p>
          <p className="mt-1">
            Los puntos de venta se crean dentro de cada casa matriz, sucursal, bodega o predio. El usuario administrador puede existir sin punto de venta.
          </p>
        </section>
      )}

      <section className="grid xl:grid-cols-3 gap-6">
        <form onSubmit={createEstablishment} className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="text-blue-900" size={22} />
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Nuevo establecimiento
              </h3>
              <p className="text-sm text-gray-500">
                Agregue casa matriz, sucursal, bodega o predio.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Tipo de establecimiento
              </label>
              <select
                name="establishmentType"
                value={establishmentForm.establishmentType}
                onChange={handleEstablishmentTypeChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                {establishmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Código de establecimiento
              </label>
              <input
                name="establishmentCode"
                value={establishmentForm.establishmentCode}
                onChange={(event) => {
                  setEstablishmentForm((prev) => ({
                    ...prev,
                    establishmentCode: event.target.value.toUpperCase()
                  }));
                }}
                maxLength={4}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 uppercase"
                placeholder="S001"
              />

              <p className="text-xs text-gray-500 mt-1">
                {loadingNextCode
                  ? 'Generando sugerencia...'
                  : 'Ejemplo: M001 para casa matriz, S001 para sucursal.'}
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Nombre
              </label>
              <input
                name="name"
                value={establishmentForm.name}
                onChange={handleEstablishmentChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Sucursal Sonsonate"
              />
            </div>

            <SearchableSelect
              label="Departamento"
              value={establishmentForm.departmentCode}
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

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Municipio
              </label>
              <input
                value={establishmentForm.municipalityName}
                readOnly
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none bg-gray-100 text-gray-700"
                placeholder="Se asigna automáticamente"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Dirección complementaria
              </label>
              <textarea
                name="addressComplement"
                value={establishmentForm.addressComplement}
                onChange={handleEstablishmentChange}
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
                placeholder="Dirección del establecimiento"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                checked={establishmentForm.isActive}
                onChange={handleEstablishmentChange}
                className="w-4 h-4"
              />
              Establecimiento activo
            </label>
          </div>

          <button
            type="submit"
            disabled={savingEstablishment || !company}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
          >
            {savingEstablishment ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Guardar establecimiento
          </button>
        </form>

        <form onSubmit={createPoint} className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-5">
            <Plus className="text-blue-900" size={22} />
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Nuevo punto de venta
              </h3>
              <p className="text-sm text-gray-500">
                Cree una caja dentro de un establecimiento.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Establecimiento / sucursal
              </label>
              <select
                name="establishmentId"
                value={pointForm.establishmentId}
                onChange={handlePointChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                <option value="">Seleccione establecimiento</option>
                {activeEstablishments.map((establishment) => (
                  <option key={establishment.id} value={establishment.id}>
                    {establishment.establishmentCode} - {establishment.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 border rounded-xl p-3 text-sm text-gray-700">
              <p>
                <strong>Código sugerido:</strong> {nextPointCode}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Se calcula según el establecimiento seleccionado.
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Código
              </label>
              <input
                name="code"
                value={pointForm.code}
                onChange={handlePointChange}
                maxLength={4}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 uppercase"
                placeholder="P001"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Nombre
              </label>
              <input
                name="name"
                value={pointForm.name}
                onChange={handlePointChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Caja 1"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Descripción
              </label>
              <input
                name="description"
                value={pointForm.description}
                onChange={handlePointChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Caja principal, punto de atención, etc."
              />
            </div>

            {selectedEstablishmentForPoint && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-900">
                <p>
                  <strong>Se creará en:</strong> {selectedEstablishmentForPoint.establishmentCode} - {selectedEstablishmentForPoint.name}
                </p>
                <p className="text-xs mt-1">
                  Número de control ejemplo: DTE-01-{selectedEstablishmentForPoint.establishmentCode}{pointForm.code || nextPointCode}-000000000000001
                </p>
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                checked={pointForm.isActive}
                onChange={handlePointChange}
                className="w-4 h-4"
              />
              Punto de venta activo
            </label>
          </div>

          <button
            type="submit"
            disabled={savingPoint || !company}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
          >
            {savingPoint ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Guardar punto de venta
          </button>
        </form>

        <form onSubmit={createUser} className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-5">
            <UserPlus className="text-blue-900" size={22} />
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Nuevo usuario
              </h3>
              <p className="text-sm text-gray-500">
                Cree usuarios facturadores únicamente para el contribuyente activo.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Nombre
                </label>
                <input
                  name="firstName"
                  value={userForm.firstName}
                  onChange={handleUserChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="Caja"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Apellido
                </label>
                <input
                  name="lastName"
                  value={userForm.lastName}
                  onChange={handleUserChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="Uno"
                />
              </div>
            </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Nombre de usuario
                </label>
                <input
                  name="username"
                  type="text"
                  value={userForm.username}
                  onChange={handleUserChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="Caja1S1"
                  autoComplete="username"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ejemplos: Admin123, Caja_Matriz_01, Caja1S1, Caja1S2.
                </p>
              </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Contraseña
              </label>
              <input
                name="password"
                type="password"
                value={userForm.password}
                onChange={handleUserChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Rol del usuario
              </label>
              <select
                name="roleCode"
                value={userForm.roleCode}
                onChange={handleUserChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>

              <p className="text-xs text-gray-500 mt-1">
                {roleOptions.find((role) => role.value === userForm.roleCode)?.description}
              </p>
            </div>

            {userForm.roleCode === 'FACTURADOR' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Punto de venta asignado
                </label>
                <select
                  name="pointOfSaleId"
                  value={userForm.pointOfSaleId}
                  onChange={handleUserChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  <option value="">Seleccione un punto de venta</option>
                  {activePointsOfSale.map((point) => (
                    <option key={point.id} value={point.id}>
                      {getPointFullName(point)}
                    </option>
                  ))}
                </select>

                {activePointsOfSale.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    No hay puntos de venta activos. Cree uno antes de registrar usuarios facturadores.
                  </p>
                )}
              </div>
            )}

            {userForm.roleCode === 'ADMIN' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900 flex gap-2">
                <ShieldCheck size={18} className="shrink-0" />
                <p>
                  El administrador técnico no necesita punto de venta.
                </p>
              </div>
            )}

            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                checked={userForm.isActive}
                onChange={handleUserChange}
                className="w-4 h-4"
              />
              Usuario activo
            </label>
          </div>

          <button
            type="submit"
            disabled={savingUser}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
          >
            {savingUser ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Guardar usuario
          </button>
        </form>
      </section>

      <section className="grid md:grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-sm text-gray-500">Establecimientos</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">{establishments.length}</p>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-sm text-gray-500">Puntos de venta</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">{pointsOfSale.length}</p>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-sm text-gray-500">Facturadores</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">{facturadores.length}</p>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <p className="text-sm text-gray-500">Administradores globales</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">{administradores.length}</p>
        </div>
      </section>

      <section className="grid xl:grid-cols-3 gap-6 mt-6">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Store className="text-blue-900" size={22} />
            <h3 className="font-bold text-lg text-gray-900">
              Establecimientos
            </h3>
          </div>

          <div className="space-y-3">
            {establishments.length === 0 && (
              <p className="text-gray-500 text-sm">
                No hay establecimientos registrados.
              </p>
            )}

            {establishments.map((establishment) => (
              <article key={establishment.id} className="border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {establishment.establishmentCode} - {establishment.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {establishmentTypeLabels[establishment.establishmentType] || establishment.establishmentType}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {[establishment.departmentName, establishment.districtName, establishment.municipalityName]
                        .filter(Boolean)
                        .join(' / ')}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {establishment.addressComplement}
                    </p>
                  </div>

                  <span className={`text-xs px-3 py-1 rounded-full h-fit ${
                    establishment.isActive
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {establishment.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <MonitorCog className="text-blue-900" size={22} />
            <h3 className="font-bold text-lg text-gray-900">
              Puntos de venta
            </h3>
          </div>

          <div className="space-y-3">
            {pointsOfSale.length === 0 && (
              <p className="text-gray-500 text-sm">
                No hay puntos de venta registrados.
              </p>
            )}

            {pointsOfSale.map((point) => (
              <article key={point.id} className="border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {getPointFullName(point)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {point.description || 'Sin descripción'}
                    </p>
                    {point.establishment && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <MapPin size={13} />
                        {point.establishment.name}
                      </p>
                    )}
                  </div>

                  <span className={`text-xs px-3 py-1 rounded-full h-fit ${
                    point.isActive
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {point.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="text-blue-900" size={22} />
            <h3 className="font-bold text-lg text-gray-900">
              Usuarios registrados
            </h3>
          </div>

          <div className="space-y-3">
            {users.length === 0 && (
              <p className="text-gray-500 text-sm">
                No hay usuarios registrados.
              </p>
            )}

            {users.map((user) => (
              <article key={user.id} className="border rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {user.firstName} {user.lastName}
                      </p>

                      {isAdminUser(user) && (
                        <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                          Admin
                        </span>
                      )}

                      {isFacturadorUser(user) && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                          Facturador
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Usuario: {user.username}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Rol: {getRoleText(user)}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-sm font-medium text-blue-900">
                      {user.pointOfSale ? getPointFullName(user.pointOfSale) : 'Sin punto de venta'}
                    </p>

                    <span className={`inline-block mt-1 text-xs px-3 py-1 rounded-full ${
                      user.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'
                    }`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                </div>

                {isAdminUser(user) && !user.pointOfSale && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-900 flex gap-2">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <p>
                      Usuario administrador técnico. No requiere punto de venta.
                    </p>
                  </div>
                )}

                {isFacturadorUser(user) && !user.pointOfSale && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-900 flex gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <p>
                      Este usuario es facturador, pero no tiene punto de venta asignado.
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default TechnicalUsersPage;