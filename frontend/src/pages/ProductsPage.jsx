import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Box,
  Edit,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search
} from 'lucide-react';

import {
  createProductRequest,
  getProductsRequest,
  updateProductRequest
} from '../api/products.api';

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

const unitOptions = [
  { code: '59', name: 'Unidad' },
  { code: '99', name: 'Servicio' },
  { code: '36', name: 'Libra' },
  { code: '34', name: 'Kilogramo' },
  { code: '22', name: 'Litro' },
  { code: '23', name: 'Metro' },
  { code: '24', name: 'Yarda' },
  { code: '26', name: 'Docena' },
  { code: '08', name: 'Galón' },
  { code: '57', name: 'Hora' }
];

function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [q, setQ] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(editingId);
  const isService = form.itemType === 'SERVICIO';

  const loadProducts = async () => {
    try {
      setLoading(true);

      const data = await getProductsRequest({
        q,
        itemType: itemTypeFilter
      });

      setProducts(data.products || []);
    } catch (error) {
      console.error('Error cargando productos:', error);
      toast.error('No se pudieron cargar los productos o servicios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

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
      await loadProducts();
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
    await loadProducts();
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
          onClick={loadProducts}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

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
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                    placeholder="0"
                  />
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
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

export default ProductsPage;