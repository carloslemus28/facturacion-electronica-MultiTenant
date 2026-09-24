import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Warehouse,
  X
} from 'lucide-react';

import {
  createProductRequest,
  getProductsRequest,
  updateProductRequest
} from '../api/products.api';
import { getEstablishmentsRequest } from '../api/companies.api';
import {
  downloadKardexRequest,
  registerProductInventoryEntriesRequest
} from '../api/inventory.api';
import { useAuth } from '../context/AuthContext';

const PRODUCTS_PAGE_SIZE = 20;

const initialForm = {
  code: '',
  itemType: 'PRODUCTO',
  name: '',
  description: '',
  unitOfMeasure: '59',
  unitOfMeasureName: 'Unidad',
  purchasePrice: '',
  salePrice: '',
  stock: '',
  isActive: true
};

const initialInventoryForm = {
  productId: '',
  quantity: '',
  unitCost: '',
  salePrice: '',
  reference: '',
  supplierName: '',
  supplierNationality: '',
  description: ''
};

let inventoryRowSequence = 0;
const createInventoryRow = () => ({
  rowId: `inventory-row-${++inventoryRowSequence}`,
  ...initialInventoryForm
});

const unitOptions = [
  { code: '59', name: 'Unidad' },
  { code: '99', name: 'Otra' },
  { code: '36', name: 'Libra' },
  { code: '34', name: 'Kilogramo' },
  { code: '23', name: 'Litro' },
  { code: '01', name: 'Metro' },
  { code: '02', name: 'Yarda' },
  { code: '58', name: 'Docena' },
  { code: '22', name: 'Galón' },
  { code: '24', name: 'Botella' },
  { code: '26', name: 'Mililitro' }
];

function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('ADMIN');
  const canManageInventory = isAdmin || Boolean(user?.canManageInventory);

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [q, setQ] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PRODUCTS_PAGE_SIZE,
    total: 0,
    totalPages: 1
  });

  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [inventoryRows, setInventoryRows] = useState([createInventoryRow()]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [loadingInventoryProducts, setLoadingInventoryProducts] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [establishments, setEstablishments] = useState([]);
  const [kardexDateRange, setKardexDateRange] = useState({ startDate: '', endDate: '' });
  const [kardexEstablishmentId, setKardexEstablishmentId] = useState('');
  const [downloadingKardex, setDownloadingKardex] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(editingId);
  const isService = form.itemType === 'SERVICIO';

  const loadProducts = async (requestedPage = page) => {
    try {
      setLoading(true);

      const data = await getProductsRequest({
        q,
        itemType: itemTypeFilter,
        page: requestedPage,
        limit: PRODUCTS_PAGE_SIZE
      });

      setProducts(data.products || []);
      setPagination(data.pagination || {
        page: requestedPage,
        limit: PRODUCTS_PAGE_SIZE,
        total: data.products?.length || 0,
        totalPages: 1
      });
    } catch (error) {
      console.error('Error cargando productos:', error);
      toast.error('No se pudieron cargar los productos o servicios');
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryProducts = async (search = '', { replace = false } = {}) => {
    if (!canManageInventory) return [];

    try {
      setLoadingInventoryProducts(true);
      const data = await getProductsRequest({
        q: search,
        itemType: 'PRODUCTO',
        isActive: 'true',
        page: 1,
        limit: 200
      });
      const loadedProducts = data.products || [];

      setInventoryProducts((previous) => {
        if (replace) return loadedProducts;

        const merged = new Map(previous.map((product) => [String(product.id), product]));
        loadedProducts.forEach((product) => merged.set(String(product.id), product));
        return Array.from(merged.values()).sort((a, b) =>
          `${a.name || ''}-${a.code || ''}`.localeCompare(`${b.name || ''}-${b.code || ''}`, 'es')
        );
      });

      return loadedProducts;
    } catch (error) {
      console.error('Error cargando productos de inventario:', error);
      toast.error('No se pudieron cargar los productos para inventario');
      return [];
    } finally {
      setLoadingInventoryProducts(false);
    }
  };

  const loadEstablishments = async () => {
    if (!isAdmin) return;
    try {
      const data = await getEstablishmentsRequest({ isActive: true });
      setEstablishments(data.establishments || []);
    } catch (error) {
      console.error('Error cargando sucursales para Kardex:', error);
    }
  };

  useEffect(() => {
    loadProducts(page);
  }, [page]);

  useEffect(() => {
    if (canManageInventory) loadEstablishments();
  }, [user?.company?.id, canManageInventory]);

  const filteredDescription = useMemo(() => {
    if (!q && !itemTypeFilter) {
      return 'Mostrando todos los productos y servicios registrados.';
    }

    return 'Mostrando productos y servicios según los filtros aplicados.';
  }, [q, itemTypeFilter]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((prev) => {
      const nextForm = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      };

      if (name === 'itemType' && value === 'SERVICIO') {
        nextForm.description = '';
        nextForm.purchasePrice = '';
        nextForm.salePrice = '';
        nextForm.stock = '';
        nextForm.unitOfMeasure = '99';
        nextForm.unitOfMeasureName = 'Servicio';
      }

      if (name === 'itemType' && value === 'PRODUCTO') {
        nextForm.unitOfMeasure = '59';
        nextForm.unitOfMeasureName = 'Unidad';
      }

      if (name === 'unitOfMeasure') {
        const selectedUnit = unitOptions.find((unit) => unit.code === value);
        nextForm.unitOfMeasureName = selectedUnit?.name || 'Unidad';
      }

      return nextForm;
    });
  };

  const validateForm = () => {
    if (!form.code.trim()) {
      return 'Ingrese el código del producto o servicio';
    }

    if (!form.name.trim()) {
      return 'Ingrese el nombre del producto o servicio';
    }

    if (form.itemType === 'PRODUCTO') {
      if (!form.description.trim()) {
        return 'Ingrese la descripción del producto';
      }

      if (form.description.trim().length > 500) {
        return 'La descripción no puede superar los 500 caracteres';
      }

      if (form.purchasePrice === '' || Number(form.purchasePrice) < 0) {
        return 'Ingrese un precio de compra válido';
      }

      if (form.salePrice === '' || Number(form.salePrice) < 0) {
        return 'Ingrese un precio de venta válido';
      }

      if (form.stock !== '' && Number(form.stock) < 0) {
        return 'El stock no puede ser negativo';
      }
    }

    if (!form.unitOfMeasure.trim()) {
      return 'Seleccione la unidad de medida';
    }

    return null;
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.itemType === 'PRODUCTO' ? form.description.trim() : '',
      purchasePrice: form.itemType === 'SERVICIO' ? null : Number(form.purchasePrice),
      salePrice: form.itemType === 'SERVICIO' ? null : Number(form.salePrice),
      unitPrice: form.itemType === 'SERVICIO' ? null : Number(form.salePrice),
      stock: form.itemType === 'SERVICIO'
        ? null
        : form.stock === ''
          ? null
          : Number(form.stock)
    };

    try {
      setSaving(true);

      if (isEditing) {
        await updateProductRequest(editingId, payload);
        toast.success('Producto o servicio actualizado correctamente');
      } else {
        await createProductRequest(payload);
        toast.success('Producto o servicio registrado correctamente');
      }

      resetForm();
      if (page !== 1) setPage(1);
      await loadProducts(1);
    } catch (error) {
      console.error('Error guardando producto:', error);

      const message = error.response?.data?.message || 'No se pudo guardar el producto o servicio';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);

    setForm({
      code: product.code || '',
      itemType: product.itemType || 'PRODUCTO',
      name: product.name || '',
      description: product.itemType === 'PRODUCTO' ? product.description || '' : '',
      unitOfMeasure: product.unitOfMeasure || (product.itemType === 'SERVICIO' ? '99' : '59'),
      unitOfMeasureName: product.unitOfMeasureName || (product.itemType === 'SERVICIO' ? 'Servicio' : 'Unidad'),
      purchasePrice: product.purchasePrice ? Number(product.purchasePrice).toString() : '',
      salePrice: product.salePrice ? Number(product.salePrice).toString() : '',
      stock: product.stock ? Number(product.stock).toString() : '',
      isActive: product.isActive ?? true
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (page === 1) {
      await loadProducts(1);
    } else {
      setPage(1);
    }
  };

  const openInventoryModal = async () => {
    setInventoryRows([createInventoryRow()]);
    setInventorySearch('');
    setInventoryProducts([]);
    setInventoryModalOpen(true);
    await loadInventoryProducts('', { replace: true });
  };

  const closeInventoryModal = () => {
    if (savingInventory) return;
    setInventoryModalOpen(false);
  };

  const addInventoryRow = () => {
    setInventoryRows((previous) => [...previous, createInventoryRow()]);
  };

  const removeInventoryRow = (rowId) => {
    setInventoryRows((previous) => {
      if (previous.length === 1) return [createInventoryRow()];
      return previous.filter((row) => row.rowId !== rowId);
    });
  };

  const updateInventoryRow = (rowId, field, value) => {
    setInventoryRows((previous) => previous.map((row) => {
      if (row.rowId !== rowId) return row;

      const next = { ...row, [field]: value };
      if (field === 'productId') {
        const selectedProduct = inventoryProducts.find(
          (product) => String(product.id) === String(value)
        );
        next.unitCost = selectedProduct?.purchasePrice !== null && selectedProduct?.purchasePrice !== undefined
          ? Number(selectedProduct.purchasePrice).toString()
          : '';
        next.salePrice = selectedProduct?.salePrice !== null && selectedProduct?.salePrice !== undefined
          ? Number(selectedProduct.salePrice).toString()
          : '';
      }

      return next;
    }));
  };

  const searchInventoryProducts = async (event) => {
    event.preventDefault();
    await loadInventoryProducts(inventorySearch);
  };

  const validateInventoryRows = () => {
    if (!inventoryRows.length) return 'Agregue al menos una entrada de producto';

    for (let index = 0; index < inventoryRows.length; index += 1) {
      const row = inventoryRows[index];
      const rowNumber = index + 1;

      if (!row.productId) return `Seleccione el producto en la fila ${rowNumber}`;
      if (!row.quantity || Number(row.quantity) <= 0) {
        return `Ingrese una cantidad mayor que cero en la fila ${rowNumber}`;
      }
      if (row.unitCost === '' || Number(row.unitCost) < 0) {
        return `Ingrese un costo unitario válido en la fila ${rowNumber}`;
      }
      if (row.salePrice !== '' && Number(row.salePrice) < 0) {
        return `Ingrese un precio de venta válido en la fila ${rowNumber}`;
      }
    }

    return null;
  };

  const handleInventoryEntries = async (event) => {
    event.preventDefault();

    const validationError = validateInventoryRows();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const entries = inventoryRows.map(({ rowId, ...row }) => ({
      ...row,
      productId: Number(row.productId),
      quantity: Number(row.quantity),
      unitCost: Number(row.unitCost),
      salePrice: row.salePrice === '' ? null : Number(row.salePrice),
      supplierName: row.supplierName.trim(),
      supplierNationality: row.supplierNationality.trim(),
      reference: row.reference.trim(),
      description: row.description.trim()
    }));

    try {
      setSavingInventory(true);
      const response = await registerProductInventoryEntriesRequest(entries);
      toast.success(`${response.count || entries.length} entrada(s) de inventario registrada(s) correctamente`);
      setInventoryModalOpen(false);
      setInventoryRows([createInventoryRow()]);
      await loadProducts(page);
    } catch (error) {
      console.error('Error registrando entradas de inventario:', error);
      toast.error(error.response?.data?.message || 'No se pudieron registrar las entradas de inventario');
    } finally {
      setSavingInventory(false);
    }
  };

  const downloadKardex = async () => {
    if (!kardexDateRange.startDate || !kardexDateRange.endDate) {
      toast.error('Seleccione la fecha inicial y final para descargar el Kardex');
      return;
    }
    if (kardexDateRange.startDate > kardexDateRange.endDate) {
      toast.error('La fecha inicial no puede ser mayor que la fecha final');
      return;
    }

    try {
      setDownloadingKardex(true);
      const blob = await downloadKardexRequest({
        ...kardexDateRange,
        ...(kardexEstablishmentId ? { establishmentId: kardexEstablishmentId } : {})
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kardex-tienda-${kardexDateRange.startDate}-${kardexDateRange.endDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Kardex descargado correctamente');
    } catch (error) {
      console.error('Error descargando Kardex:', error);
      toast.error(error.response?.data?.message || 'No se pudo descargar el Kardex');
    } finally {
      setDownloadingKardex(false);
    }
  };

  const formatMoney = (value) => {
    const number = Number(value || 0);

    return number.toLocaleString('es-SV', {
      style: 'currency',
      currency: 'USD'
    });
  };

  return (
    <div>
      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
            <PackagePlus className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Productos / Servicios
            </h2>
            <p className="text-gray-600 mt-1">
              Los productos requieren descripción registrada. Los servicios se describen directamente al generar el DTE.
            </p>
          </div>
        </div>

        <button
          onClick={() => loadProducts(page)}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

      {canManageInventory && (
        <section className="bg-white rounded-2xl border shadow-sm p-5 mb-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <Warehouse className="text-blue-900" size={23} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">Inventario</h3>
                <p className="text-sm text-gray-500">
                  Registre entradas en lote y descargue el Kardex de la empresa o sucursal autorizada.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openInventoryModal}
                className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-2.5 font-semibold hover:bg-blue-800"
              >
                <Plus size={18} />
                Registrar entradas
              </button>

              {isAdmin && (
                <select
                  value={kardexEstablishmentId}
                  onChange={(event) => setKardexEstablishmentId(event.target.value)}
                  className="border border-gray-300 rounded-xl px-3 py-2.5 bg-white"
                  title="Sucursal para Kardex"
                >
                  <option value="">Todas las sucursales</option>
                  {establishments.map((establishment) => (
                    <option key={establishment.id} value={establishment.id}>
                      {establishment.establishmentCode} - {establishment.name}
                    </option>
                  ))}
                </select>
              )}

              <input
                type="date"
                value={kardexDateRange.startDate}
                onChange={(event) => setKardexDateRange((previous) => ({ ...previous, startDate: event.target.value }))}
                className="border border-gray-300 rounded-xl px-3 py-2.5"
                title="Fecha inicial para Kardex"
              />
              <input
                type="date"
                value={kardexDateRange.endDate}
                onChange={(event) => setKardexDateRange((previous) => ({ ...previous, endDate: event.target.value }))}
                className="border border-gray-300 rounded-xl px-3 py-2.5"
                title="Fecha final para Kardex"
              />
              <button
                type="button"
                onClick={downloadKardex}
                disabled={downloadingKardex}
                className="inline-flex items-center justify-center gap-2 border border-blue-900 text-blue-900 rounded-xl px-4 py-2.5 font-semibold hover:bg-blue-50 disabled:opacity-70"
              >
                {downloadingKardex ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                Descargar Kardex
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid xl:grid-cols-[430px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border shadow-sm p-5 h-fit">
          <div className="flex items-center gap-2 mb-5">
            {isEditing ? (
              <Edit className="text-blue-900" size={22} />
            ) : (
              <Plus className="text-blue-900" size={22} />
            )}

            <h3 className="font-bold text-lg text-gray-900">
              {isEditing ? 'Editar producto o servicio' : 'Nuevo producto o servicio'}
            </h3>
          </div>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Código <span className="text-red-600">*</span>
                </label>
                <input
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="PROD-001"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Tipo <span className="text-red-600">*</span>
                </label>
                <select
                  name="itemType"
                  value={form.itemType}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  <option value="PRODUCTO">Producto</option>
                  <option value="SERVICIO">Servicio</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Nombre <span className="text-red-600">*</span>
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Nombre del producto o servicio"
              />
            </div>

            {!isService && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Descripción del producto <span className="text-red-600">*</span>
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  maxLength={500}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {form.description.length}/500 caracteres.
                </p>
              </div>
            )}



            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Unidad de medida
              </label>
              <select
                name="unitOfMeasure"
                value={form.unitOfMeasure}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
              >
                {unitOptions.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </div>

            {form.itemType === 'PRODUCTO' && (
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Precio de Compra
                  </label>
                  <input
                    name="purchasePrice"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.purchasePrice}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Precio de Venta
                  </label>
                  <input
                    name="salePrice"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.salePrice}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">
                    Existencia
                  </label>
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.stock}
                    onChange={handleChange}
                    disabled={!canManageInventory}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-gray-100 disabled:text-gray-500"
                    placeholder="0"
                  />
                  {!canManageInventory && (
                    <p className="text-xs text-gray-500 mt-1">
                      La existencia se gestiona únicamente con acceso a Inventario / Kardex.
                    </p>
                  )}
                </div>
              </div>
            )}

<label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={handleChange}
                className="w-4 h-4"
              />
              Activo
            </label>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
            >
              {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {isEditing ? 'Actualizar' : 'Guardar'}
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
            <Box className="text-blue-900" size={22} />
            <div>
              <h3 className="font-bold text-lg text-gray-900">
                Productos y servicios registrados
              </h3>
              <p className="text-sm text-gray-500">{filteredDescription}</p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="grid md:grid-cols-[1fr_180px_auto] gap-3 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Buscar por código, nombre o descripción"
              />
            </div>

            <select
              value={itemTypeFilter}
              onChange={(event) => setItemTypeFilter(event.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
            >
              <option value="">Todos</option>
              <option value="PRODUCTO">Productos</option>
              <option value="SERVICIO">Servicios</option>
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
              <p className="text-gray-500 mt-3">Cargando productos...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {products.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No hay productos o servicios registrados.
                </p>
              )}

              {products.map((product) => (
                <article
                  key={product.id}
                  className="border rounded-xl p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-gray-900">
                          {product.code} - {product.name}
                        </h4>

                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                          {product.itemType === 'SERVICIO' ? 'Servicio' : 'Producto'}
                        </span>

                        <span className={`text-xs px-2 py-1 rounded-full ${
                          product.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {product.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      {product.itemType === 'PRODUCTO' ? (
                        <p className="text-sm text-gray-500 mt-1">
                          {product.description || 'Sin descripción'}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-gray-600">
                        {product.itemType === 'PRODUCTO' ? (
                          <>
                            <span>Compra: {formatMoney(product.purchasePrice)}</span>
                            <span>Venta: {formatMoney(product.salePrice)}</span>
                            <span>Unidad: {product.unitOfMeasureName}</span>
                            <span>
                              Existencia: {product.stock === null ? 'Sin definir' : Number(product.stock)}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>Unidad: {product.unitOfMeasureName}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEdit(product)}
                      className="inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-2 text-gray-700 hover:bg-white"
                    >
                      <Edit size={17} />
                      Editar
                    </button>
                  </div>
                </article>
              ))}

              {pagination.total > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t">
                  <p className="text-sm text-gray-500">
                    Mostrando {products.length} de {pagination.total} registros. Página {pagination.page} de {pagination.totalPages}.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
                      disabled={page <= 1 || loading}
                      className="inline-flex items-center gap-1 border rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((previous) => Math.min(previous + 1, pagination.totalPages))}
                      disabled={page >= pagination.totalPages || loading}
                      className="inline-flex items-center gap-1 border rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                    >
                      Siguiente
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </section>

      {inventoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 p-3 md:p-6 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-[96vw] max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 p-5 border-b">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Registrar entradas de productos</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Agregue varias filas y guarde todas las entradas en una sola operación.
                </p>
              </div>
              <button
                type="button"
                onClick={closeInventoryModal}
                disabled={savingInventory}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              <form onSubmit={searchInventoryProducts} className="grid md:grid-cols-[1fr_auto] gap-2 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <input
                    value={inventorySearch}
                    onChange={(event) => setInventorySearch(event.target.value)}
                    className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="Buscar por código o nombre para cargar más productos"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingInventoryProducts}
                  className="inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-2.5 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingInventoryProducts ? <Loader2 className="animate-spin" size={17} /> : <Search size={17} />}
                  Buscar producto
                </button>
              </form>

              <form id="inventory-batch-form" onSubmit={handleInventoryEntries}>
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full min-w-[1580px] text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                      <tr>
                        <th className="text-left px-3 py-3 min-w-[280px]">Producto</th>
                        <th className="text-left px-3 py-3 w-[120px]">Cantidad</th>
                        <th className="text-left px-3 py-3 w-[135px]">Costo unitario</th>
                        <th className="text-left px-3 py-3 w-[135px]">Precio venta</th>
                        <th className="text-left px-3 py-3 min-w-[180px]">Proveedor</th>
                        <th className="text-left px-3 py-3 min-w-[160px]">Nacionalidad</th>
                        <th className="text-left px-3 py-3 min-w-[180px]">Factura / referencia</th>
                        <th className="text-left px-3 py-3 min-w-[220px]">Descripción</th>
                        <th className="w-[60px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {inventoryRows.map((row, rowIndex) => (
                        <tr key={row.rowId} className="align-top">
                          <td className="p-2">
                            <select
                              value={row.productId}
                              onChange={(event) => updateInventoryRow(row.rowId, 'productId', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                            >
                              <option value="">Seleccione producto</option>
                              {inventoryProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.code} - {product.name} · Existencia: {Number(product.stock || 0)}
                                  {product.establishment?.name ? ` · ${product.establishment.name}` : ''}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-gray-400 mt-1">Fila {rowIndex + 1}</p>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0.0001"
                              step="0.0001"
                              value={row.quantity}
                              onChange={(event) => updateInventoryRow(row.rowId, 'quantity', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="0"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={row.unitCost}
                              onChange={(event) => updateInventoryRow(row.rowId, 'unitCost', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="0.0000"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={row.salePrice}
                              onChange={(event) => updateInventoryRow(row.rowId, 'salePrice', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={row.supplierName}
                              onChange={(event) => updateInventoryRow(row.rowId, 'supplierName', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={row.supplierNationality}
                              onChange={(event) => updateInventoryRow(row.rowId, 'supplierNationality', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={row.reference}
                              onChange={(event) => updateInventoryRow(row.rowId, 'reference', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={row.description}
                              onChange={(event) => updateInventoryRow(row.rowId, 'description', event.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2"
                              placeholder="Opcional"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeInventoryRow(row.rowId)}
                              className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 hover:bg-red-50"
                              title="Quitar fila"
                            >
                              <Trash2 size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={addInventoryRow}
                  className="mt-3 inline-flex items-center gap-2 border rounded-xl px-4 py-2.5 text-gray-700 hover:bg-gray-50"
                >
                  <Plus size={17} />
                  Agregar otra fila
                </button>
              </form>
            </div>

            <div className="p-5 border-t flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={closeInventoryModal}
                disabled={savingInventory}
                className="border rounded-xl px-5 py-2.5 text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="inventory-batch-form"
                disabled={savingInventory}
                className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-2.5 font-semibold hover:bg-blue-800 disabled:opacity-70"
              >
                {savingInventory ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Registrar {inventoryRows.length} entrada{inventoryRows.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductsPage;