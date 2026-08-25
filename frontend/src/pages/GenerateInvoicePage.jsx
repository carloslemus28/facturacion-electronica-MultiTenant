import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  FilePlus2,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Trash2
} from 'lucide-react';

import { getCustomersRequest } from '../api/customers.api';
import { getProductsRequest } from '../api/products.api';
import {
  generateInvoiceRequest,
  getAvailableDocumentsForCreditNoteRequest,
  getInvoiceByIdRequest,
  transmitInvoiceRequest
} from '../api/invoices.api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

import SearchableSelect from '../components/SearchableSelect';

const updateGeneratedInvoiceRequest = async (id, invoiceData) => {
  const response = await api.put(`/invoices/${id}`, invoiceData);
  return response.data;
};

const documentTypes = [
  { code: '01', name: 'Factura de Consumidor Final', shortName: 'Consumidor Final' },
  { code: '03', name: 'Comprobante de Crédito Fiscal Electrónico', shortName: 'CCF' },
  { code: '11', name: 'Factura de Exportación Electrónica', shortName: 'Exportación' },
  { code: '14', name: 'Factura de Sujeto Excluido Electrónica', shortName: 'Sujeto Excluido' },
  { code: '05', name: 'Nota de Crédito Electrónica', shortName: 'Nota de Crédito' }
];

const operationConditionOptions = [
  { value: 'CONTADO', label: 'Contado' },
  { value: 'CREDITO', label: 'Crédito' },
  { value: 'OTRO', label: 'Otro' }
];

const paymentMethodOptions = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TARJETA', label: 'Tarjeta de débito' },
  { value: 'TARJETA_CREDITO', label: 'Tarjeta de crédito' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTRO', label: 'Otro' }
];

const saleTypeOptions = [
  { value: 'GRAVADA', label: 'Gravada' },
  { value: 'EXENTA', label: 'Exenta' },
  { value: 'NO_SUJETA', label: 'No sujeta' }
];

const initialItemForm = {
  productId: '',
  description: '',
  quantity: 1,
  unitPrice: '',
  saleType: 'GRAVADA',
  fovial: '',
  cotrans: ''
};

const DEFAULT_ALLOWED_DOCUMENT_TYPES = ['01', '03'];
const IVA_RETENTION_RATE = 0.01;
const IVA_RETENTION_THRESHOLD = 100;
const IVA_RETENTION_DOCUMENT_TYPES = ['01', '03', '05'];

const round4Number = (value) => Number(Number(value || 0).toFixed(4));

const getTodayInputDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const getDateInputFromValue = (value) => {
  if (!value) return getTodayInputDate();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return getTodayInputDate();
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const parseAllowedDocumentTypes = (value) => {
  if (!value) return DEFAULT_ALLOWED_DOCUMENT_TYPES;

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch (error) {
      return DEFAULT_ALLOWED_DOCUMENT_TYPES;
    }
  }

  return DEFAULT_ALLOWED_DOCUMENT_TYPES;
};

const hasDocument = (customer) => {
  return Boolean(
    customer?.documentNumber &&
    customer?.documentType &&
    customer.documentType !== 'SIN_DOCUMENTO'
  );
};

const hasCcfData = (customer) => {
  return Boolean(
    ['NIT', 'DUI'].includes(customer?.documentType) &&
    customer?.documentNumber &&
    customer?.nrc &&
    customer?.economicActivityCode &&
    customer?.economicActivityName
  );
};

const getCustomerLabel = (customer) => {
  if (!customer) return '';

  const document = customer.documentNumber
    ? `${customer.documentType}: ${customer.documentNumber}`
    : 'Sin documento';

  return `${customer.name} - ${document}`;
};

const getCustomerDescription = (customer) => {
  if (!customer) return '';

  const parts = [];

  if (customer.email) parts.push(customer.email);
  if (customer.phone) parts.push(customer.phone);
  if (customer.nrc) parts.push(`NRC: ${customer.nrc}`);
  if (customer.economicActivityName) {
    parts.push(`${customer.economicActivityCode} - ${customer.economicActivityName}`);
  }

  return parts.join(' | ');
};

const getProductLabel = (product) => {
  if (!product) return '';

  const type = product.itemType === 'PRODUCTO' ? 'Producto' : 'Servicio';
  return `${product.code} - ${product.name} (${type})`;
};

const getProductDescription = (product) => {
  if (!product) return '';

  const parts = [];

  if (product.itemType === 'PRODUCTO') {
    if (product.description) parts.push(product.description);
    parts.push(`Precio: ${Number(product.salePrice || product.unitPrice || 0).toFixed(2)}`);
    parts.push(`Stock: ${Number(product.stock || 0)}`);
  } else {
    parts.push('Servicio: escriba la descripción directamente en el detalle del DTE');
    parts.push('Precio variable');
  }

  return parts.join(' | ');
};

function GenerateInvoicePage() {
  const { user: userContext } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [documentTypeCode, setDocumentTypeCode] = useState('01');
  const [customerId, setCustomerId] = useState('');
  const [relatedInvoiceId, setRelatedInvoiceId] = useState('');
  const [issuedAtDate, setIssuedAtDate] = useState(getTodayInputDate());

  const [operationCondition, setOperationCondition] = useState('CONTADO');
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [notes, setNotes] = useState('');

  const [itemForm, setItemForm] = useState(initialItemForm);
  const [items, setItems] = useState([]);
  const [applyRetention1, setApplyRetention1] = useState(false);

  const [creditNoteDocuments, setCreditNoteDocuments] = useState([]);
  const [relatedInvoiceDetail, setRelatedInvoiceDetail] = useState(null);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState(null);
  const [transmittingGeneratedInvoice, setTransmittingGeneratedInvoice] = useState(false);
  const [loadingCreditNoteDocuments, setLoadingCreditNoteDocuments] = useState(false);
  const [loadingRelatedInvoiceDetail, setLoadingRelatedInvoiceDetail] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const editInvoiceId = searchParams.get('edit');
  const isEditMode = Boolean(editInvoiceId);

  const editLoadedRef = useRef(false);
  const ignoreDocumentTypeResetRef = useRef(false);
  const originalEditProductQuantitiesRef = useRef({});

  const usesFuelTaxes = Boolean(userContext?.company?.usesFuelTaxes);
  const isAdmin = Boolean(userContext?.roles?.includes('ADMIN'));
  const allowFutureInvoiceDates = Boolean(userContext?.company?.allowFutureInvoiceDates);
  const canUseIvaRetention = IVA_RETENTION_DOCUMENT_TYPES.includes(String(documentTypeCode));

  const allowedDocumentTypes = parseAllowedDocumentTypes(
    userContext?.company?.allowedDocumentTypes
  );

  const availableDocumentTypes = documentTypes.filter((doc) =>
    allowedDocumentTypes.includes(doc.code)
  );

  const selectedDocumentType = documentTypes.find((doc) => doc.code === documentTypeCode);

  const selectedProduct = products.find(
    (product) => String(product.id) === String(itemForm.productId)
  );

  const selectedRelatedInvoice = creditNoteDocuments.find(
    (invoice) => String(invoice.id) === String(relatedInvoiceId)
  );

  const selectedCustomer = customers.find(
    (customer) => String(customer.id) === String(customerId)
  );

  const hasUnsavedData = customerId || relatedInvoiceId || items.length > 0 || notes.trim() || issuedAtDate !== getTodayInputDate();

  const formatMoney = (value) => {
    const number = Number(value || 0);

    return number.toLocaleString('es-SV', {
      style: 'currency',
      currency: 'USD'
    });
  };

  const loadCreditNoteDocuments = async () => {
    try {
      setLoadingCreditNoteDocuments(true);

      const data = await getAvailableDocumentsForCreditNoteRequest();

      setCreditNoteDocuments(data.invoices || []);
    } catch (error) {
      console.error('Error cargando CCF disponibles para nota de crédito:', error);
      toast.error('No se pudieron cargar los CCF disponibles para Nota de Crédito');
    } finally {
      setLoadingCreditNoteDocuments(false);
    }
  };

  const loadRelatedInvoiceDetail = async (invoiceId) => {
    if (!invoiceId) {
      setRelatedInvoiceDetail(null);
      return;
    }

    try {
      setLoadingRelatedInvoiceDetail(true);

      const data = await getInvoiceByIdRequest(invoiceId);

      setRelatedInvoiceDetail(data.invoice || null);
    } catch (error) {
      console.error('Error cargando detalle del CCF relacionado:', error);
      toast.error('No se pudo cargar el detalle del CCF relacionado');
      setRelatedInvoiceDetail(null);
    } finally {
      setLoadingRelatedInvoiceDetail(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [customersData, productsData] = await Promise.all([
        getCustomersRequest({ isActive: 'true' }),
        getProductsRequest({ isActive: 'true' })
      ]);

      setCustomers(customersData.customers || []);
      setProducts(productsData.products || []);
    } catch (error) {
      console.error('Error cargando datos para DTE:', error);
      toast.error('No se pudieron cargar los datos para generar el DTE');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceForEdit = async (invoiceId) => {
    try {
      const data = await getInvoiceByIdRequest(invoiceId);
      const invoice = data.invoice;

      if (!invoice) {
        toast.error('No se encontró el DTE para editar');
        navigate('/invoices');
        return;
      }

      if (!['GENERADO', 'RECHAZADO'].includes(invoice.status)) {
        toast.error('Solo se pueden editar DTE en estado GENERADO o RECHAZADO');
        navigate('/invoices');
        return;
      }

      ignoreDocumentTypeResetRef.current = true;

      const productQuantityMap = {};

      (invoice.items || []).forEach((item) => {
        if (item.productId && item.itemType === 'PRODUCTO') {
          productQuantityMap[item.productId] =
            Number(productQuantityMap[item.productId] || 0) + Number(item.quantity || 0);
        }
      });

      originalEditProductQuantitiesRef.current = productQuantityMap;

      const mappedItems = (invoice.items || []).map((item) => {
        const originalProductQuantity = item.productId
          ? Number(productQuantityMap[item.productId] || 0)
          : 0;

        return {
          localId: `${Date.now()}-${Math.random()}-${item.id || ''}`,
          productId: item.productId,
          itemType: item.itemType,
          code: item.code,
          description: item.description || '',
          unitOfMeasure: item.unitOfMeasure,
          unitOfMeasureName: item.unitOfMeasureName,
          saleType: item.saleType || 'GRAVADA',
          quantity: Number(item.quantity || 1),
          unitPrice: Number(item.unitPrice || 0),
          noSuj: Number(item.noSuj || 0),
          exenta: Number(item.exenta || 0),
          gravada: Number(item.gravada || 0),
          subtotal: Number(item.subtotal || 0),
          iva: Number(item.iva || 0),
          retention1: Number(item.retention1 || 0),
          fovial: Number(item.fovial || 0),
          cotrans: Number(item.cotrans || 0),
          total: Number(item.total || 0),
          stockBefore: item.product?.stock === null || item.product?.stock === undefined
            ? null
            : Number(item.product.stock || 0) + originalProductQuantity
        };
      });

      setDocumentTypeCode(invoice.documentTypeCode || '01');
      setCustomerId(invoice.customerId ? String(invoice.customerId) : '');
      setRelatedInvoiceId(invoice.relatedInvoiceId ? String(invoice.relatedInvoiceId) : '');
      setIssuedAtDate(getDateInputFromValue(invoice.issuedAt));
      setOperationCondition(invoice.operationCondition || 'CONTADO');
      setPaymentMethod(invoice.paymentMethod || 'EFECTIVO');
      setNotes(invoice.notes || '');
      setItems(mappedItems);
      setApplyRetention1(Number(invoice.retention1 || 0) > 0);
      setGeneratedInvoice(invoice);
      setItemForm(initialItemForm);

      if (invoice.documentTypeCode === '05') {
        await loadCreditNoteDocuments();

        if (invoice.relatedInvoiceId) {
          await loadRelatedInvoiceDetail(invoice.relatedInvoiceId);
        }
      } else {
        setRelatedInvoiceDetail(null);
      }

      editLoadedRef.current = true;

      setTimeout(() => {
        ignoreDocumentTypeResetRef.current = false;
      }, 0);

      toast.success(`Editando DTE ${invoice.controlNumber || ''}`.trim());
    } catch (error) {
      console.error('Error cargando DTE para edición:', error);

      const message = error.response?.data?.message || 'No se pudo cargar el DTE para edición';
      toast.error(message);
      navigate('/invoices');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!editInvoiceId) return;
    if (loading) return;
    if (editLoadedRef.current) return;

    loadInvoiceForEdit(editInvoiceId);
  }, [editInvoiceId, loading]);

  useEffect(() => {
    if (!userContext?.company?.allowedDocumentTypes) return;

    if (isEditMode && !editLoadedRef.current) return;

    const allowed = parseAllowedDocumentTypes(userContext.company.allowedDocumentTypes);

    if (!allowed.includes(documentTypeCode)) {
      setDocumentTypeCode(allowed[0] || '01');
      setCustomerId('');
      setRelatedInvoiceId('');
      setRelatedInvoiceDetail(null);
      setItems([]);
    }
  }, [userContext, documentTypeCode, isEditMode]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedData) return;

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedData]);

  useEffect(() => {
  if (isEditMode) {
    if (documentTypeCode === '05') {
      loadCreditNoteDocuments();
    }

    return;
  }

  setCustomerId('');
  setItems([]);
  setApplyRetention1(false);
  setGeneratedInvoice(null);
  setItemForm(initialItemForm);

  if (documentTypeCode === '05') {
    loadCreditNoteDocuments();
    setRelatedInvoiceId('');
    setRelatedInvoiceDetail(null);
    return;
  }

  setRelatedInvoiceId('');
  setRelatedInvoiceDetail(null);
  setCreditNoteDocuments([]);
}, [documentTypeCode, isEditMode]);

  useEffect(() => {
    if (documentTypeCode !== '05') return;

    if (selectedRelatedInvoice?.customerId) {
      setCustomerId(String(selectedRelatedInvoice.customerId));
    }
  }, [documentTypeCode, selectedRelatedInvoice]);

  const availableCustomers = useMemo(() => {
    if (documentTypeCode === '05') {
      if (selectedRelatedInvoice?.customerId) {
        return customers.filter(
          (customer) => Number(customer.id) === Number(selectedRelatedInvoice.customerId)
        );
      }

      return [];
    }

    return customers;
  }, [customers, documentTypeCode, selectedRelatedInvoice]);

  const customerHelperText = useMemo(() => {
    if (documentTypeCode === '01') {
      return 'Para Factura de Consumidor Final puede seleccionar cualquier cliente activo.';
    }

    if (documentTypeCode === '03') {
      return 'Para CCF, el cliente debe tener NIT o DUI, NRC y actividad económica registrada.';
    }

    if (documentTypeCode === '05') {
      return 'El cliente se toma automáticamente del CCF relacionado.';
    }

    if (documentTypeCode === '11') {
      return 'Para Exportación, el receptor debe tener NIT, DUI, pasaporte u otro documento.';
    }

    if (documentTypeCode === '14') {
      return 'Para Sujeto Excluido, el receptor debe tener un documento registrado.';
    }

    return '';
  }, [documentTypeCode]);

  const customerWarning = useMemo(() => {
    if (!selectedCustomer) return '';

    if ((documentTypeCode === '03' || documentTypeCode === '05') && !hasCcfData(selectedCustomer)) {
      return 'Este cliente no tiene completos los datos para CCF: NIT o DUI, NRC y actividad económica.';
    }

    if ((documentTypeCode === '11' || documentTypeCode === '14') && !hasDocument(selectedCustomer)) {
      return 'Este cliente no tiene documento válido registrado.';
    }

    return '';
  }, [documentTypeCode, selectedCustomer]);

  const calculateItemTotals = ({
    quantity,
    unitPrice,
    saleType = 'GRAVADA',
    retention1 = 0,
    fovial = 0,
    cotrans = 0
  }) => {
    const qty = Number(quantity || 0);
    const price = Number(unitPrice || 0);

    const baseAmount = Number((qty * price).toFixed(4));

    const extraFovial = usesFuelTaxes ? Number(Number(fovial || 0).toFixed(4)) : 0;
    const extraCotrans = usesFuelTaxes ? Number(Number(cotrans || 0).toFixed(4)) : 0;
    const retention = Number(Number(retention1 || 0).toFixed(4));

    let noSuj = 0;
    let exenta = 0;
    let gravada = 0;
    let iva = 0;

    if (saleType === 'NO_SUJETA') {
      noSuj = baseAmount;
    } else if (saleType === 'EXENTA') {
      exenta = baseAmount;
    } else {
      gravada = baseAmount;

      if (documentTypeCode === '03' || documentTypeCode === '05') {
        iva = Number((gravada * 0.13).toFixed(4));
      }
    }

    const subtotal = Number((noSuj + exenta + gravada).toFixed(4));
    const total = Number((subtotal + iva + extraFovial + extraCotrans - retention).toFixed(4));

    return {
      saleType,
      noSuj,
      exenta,
      gravada,
      subtotal,
      iva,
      retention1: retention,
      fovial: extraFovial,
      cotrans: extraCotrans,
      total
    };
  };

  const calculateRetentionBase = (sourceItems) => {
    return round4Number(
      sourceItems.reduce((sum, item) => {
        const totals = calculateItemTotals({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          saleType: item.saleType,
          retention1: 0,
          fovial: usesFuelTaxes ? item.fovial : 0,
          cotrans: usesFuelTaxes ? item.cotrans : 0
        });

        return sum + Number(totals.gravada || 0);
      }, 0)
    );
  };

  const automaticRetentionBase = useMemo(() => {
    return calculateRetentionBase(items);
  }, [items, documentTypeCode, usesFuelTaxes]);

  const itemsWithAutomaticRetention = useMemo(() => {
    if (!applyRetention1 || !canUseIvaRetention || automaticRetentionBase <= IVA_RETENTION_THRESHOLD) {
      return items.map((item) => ({
        ...item,
        ...calculateItemTotals({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          saleType: item.saleType,
          retention1: 0,
          fovial: usesFuelTaxes ? item.fovial : 0,
          cotrans: usesFuelTaxes ? item.cotrans : 0
        }),
        retention1: 0
      }));
    }

    const totalRetention = round4Number(automaticRetentionBase * IVA_RETENTION_RATE);
    let assignedRetention = 0;
    const taxableIndexes = [];

    const preliminaryItems = items.map((item, index) => {
      const totals = calculateItemTotals({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saleType: item.saleType,
        retention1: 0,
        fovial: usesFuelTaxes ? item.fovial : 0,
        cotrans: usesFuelTaxes ? item.cotrans : 0
      });

      if (totals.gravada > 0) {
        taxableIndexes.push(index);
      }

      return {
        item,
        totals
      };
    });

    return preliminaryItems.map(({ item, totals }, index) => {
      let retention = 0;

      if (totals.gravada > 0) {
        const isLastTaxableItem = taxableIndexes[taxableIndexes.length - 1] === index;

        retention = isLastTaxableItem
          ? round4Number(totalRetention - assignedRetention)
          : round4Number((Number(totals.gravada || 0) / automaticRetentionBase) * totalRetention);

        assignedRetention = round4Number(assignedRetention + retention);
      }

      const totalsWithRetention = calculateItemTotals({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        saleType: item.saleType,
        retention1: retention,
        fovial: usesFuelTaxes ? item.fovial : 0,
        cotrans: usesFuelTaxes ? item.cotrans : 0
      });

      return {
        ...item,
        ...totalsWithRetention,
        retention1: retention
      };
    });
  }, [items, applyRetention1, canUseIvaRetention, automaticRetentionBase, documentTypeCode, usesFuelTaxes]);

  const handleApplyRetention = () => {
    if (!canUseIvaRetention) {
      toast.error('La retención 1% solo está disponible para Factura, CCF y Nota de Crédito');
      return;
    }

    if (automaticRetentionBase <= IVA_RETENTION_THRESHOLD) {
      toast.error('La venta gravada debe superar $100.00 para aplicar retención 1%');
      return;
    }

    setApplyRetention1(true);
    toast.success('Retención 1% aplicada automáticamente');
  };

  const handleRemoveRetention = () => {
    setApplyRetention1(false);
    toast.success('Retención 1% quitada');
  };

  const invoiceTotals = useMemo(() => {
    let noSuj = 0;
    let exenta = 0;
    let gravada = 0;
    let subtotal = 0;
    let iva = 0;
    let retention1 = 0;
    let fovial = 0;
    let cotrans = 0;
    let total = 0;

    for (const item of itemsWithAutomaticRetention) {
      noSuj += Number(item.noSuj || 0);
      exenta += Number(item.exenta || 0);
      gravada += Number(item.gravada || 0);
      subtotal += Number(item.subtotal || 0);
      iva += Number(item.iva || 0);
      retention1 += Number(item.retention1 || 0);
      fovial += Number(item.fovial || 0);
      cotrans += Number(item.cotrans || 0);
      total += Number(item.total || 0);
    }

    return {
      noSuj,
      exenta,
      gravada,
      subtotal,
      iva,
      retention1,
      fovial,
      cotrans,
      total
    };
  }, [itemsWithAutomaticRetention]);

  const handleProductChange = (product) => {
    if (!product) {
      setItemForm((prev) => ({
        ...prev,
        productId: '',
        description: '',
        unitPrice: ''
      }));

      return;
    }

    setItemForm((prev) => ({
      ...prev,
      productId: String(product.id),
      description: product.itemType === 'PRODUCTO'
        ? product.description || product.name || ''
        : '',
      unitPrice: product.itemType === 'PRODUCTO'
        ? Number(product.salePrice || product.unitPrice || 0).toString()
        : ''
    }));
  };

  const handleItemChange = (event) => {
    const { name, value } = event.target;

    setItemForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const useRelatedInvoiceItem = (relatedItem) => {
    if (!relatedItem) return;

    const productId = relatedItem.productId ? String(relatedItem.productId) : '';

    setItemForm({
      productId,
      description: relatedItem.description || '',
      quantity: Number(relatedItem.quantity || 1),
      unitPrice: Number(relatedItem.unitPrice || 0).toString(),
      saleType: relatedItem.saleType || 'GRAVADA',
      fovial: usesFuelTaxes && Number(relatedItem.fovial || 0) > 0
        ? Number(relatedItem.fovial).toString()
        : '',
      cotrans: usesFuelTaxes && Number(relatedItem.cotrans || 0) > 0
        ? Number(relatedItem.cotrans).toString()
        : ''
    });

    toast.success('Detalle cargado desde el CCF relacionado. Revise cantidad y precio antes de agregarlo.');
  };

  const addItem = () => {
    if (documentTypeCode === '05' && !relatedInvoiceId) {
      toast.error('Seleccione primero el CCF relacionado');
      return;
    }

    if (!selectedProduct) {
      toast.error('Seleccione un producto o servicio');
      return;
    }

    if (!itemForm.description.trim()) {
      toast.error('La descripción del detalle es obligatoria');
      return;
    }

    if (!itemForm.quantity || Number(itemForm.quantity) <= 0) {
      toast.error('Ingrese una cantidad válida');
      return;
    }

    if (itemForm.unitPrice === '' || Number(itemForm.unitPrice) < 0) {
      toast.error('Ingrese un precio válido');
      return;
    }

    if (!['GRAVADA', 'EXENTA', 'NO_SUJETA'].includes(itemForm.saleType)) {
      toast.error('Seleccione un tipo de venta válido');
      return;
    }

    if (usesFuelTaxes && itemForm.fovial !== '' && Number(itemForm.fovial) < 0) {
      toast.error('FOVIAL no puede ser negativo');
      return;
    }

    if (usesFuelTaxes && itemForm.cotrans !== '' && Number(itemForm.cotrans) < 0) {
      toast.error('COTRANS no puede ser negativo');
      return;
    }

    let availableStockForSelectedProduct = selectedProduct.stock === null
      ? null
      : Number(selectedProduct.stock || 0);

    if (selectedProduct.itemType === 'PRODUCTO') {
      const originalEditQuantity = isEditMode
        ? Number(originalEditProductQuantitiesRef.current[selectedProduct.id] || 0)
        : 0;

      const currentStock = Number(selectedProduct.stock || 0) + originalEditQuantity;
      availableStockForSelectedProduct = currentStock;

      const alreadyAddedQuantity = items
        .filter((item) => Number(item.productId) === Number(selectedProduct.id))
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      const requestedQuantity = Number(itemForm.quantity);
      const totalRequested = alreadyAddedQuantity + requestedQuantity;

      if (currentStock < totalRequested) {
        toast.error(`Stock insuficiente para ${selectedProduct.name}. Disponible: ${currentStock}`);
        return;
      }
    }

    const itemTotals = calculateItemTotals({
      quantity: itemForm.quantity,
      unitPrice: itemForm.unitPrice,
      saleType: itemForm.saleType,
      retention1: 0,
      fovial: usesFuelTaxes ? itemForm.fovial || 0 : 0,
      cotrans: usesFuelTaxes ? itemForm.cotrans || 0 : 0
    });

    const item = {
      localId: `${Date.now()}-${Math.random()}`,
      productId: selectedProduct.id,
      itemType: selectedProduct.itemType,
      code: selectedProduct.code,
      description: itemForm.description.trim(),
      unitOfMeasure: selectedProduct.unitOfMeasure,
      unitOfMeasureName: selectedProduct.unitOfMeasureName,
      quantity: Number(itemForm.quantity),
      unitPrice: Number(itemForm.unitPrice),
      retention1: 0,
      fovial: usesFuelTaxes ? Number(itemForm.fovial || 0) : 0,
      cotrans: usesFuelTaxes ? Number(itemForm.cotrans || 0) : 0,
      stockBefore: availableStockForSelectedProduct,
      ...itemTotals
    };

    setItems((prev) => [...prev, item]);
    setItemForm(initialItemForm);
  };

  const removeItem = (localId) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const validateInvoice = () => {
    if (!documentTypeCode) {
      return 'Seleccione el tipo de DTE';
    }

    if (!issuedAtDate) {
      return 'Seleccione la fecha de emisión del DTE';
    }

    if (!allowFutureInvoiceDates && issuedAtDate > getTodayInputDate()) {
      return 'La fecha de emisión no puede ser futura para este contribuyente';
    }

    if (documentTypeCode === '05' && !relatedInvoiceId) {
      return 'Seleccione el CCF relacionado para emitir la Nota de Crédito';
    }

    if (!customerId) {
      return 'Seleccione el cliente receptor';
    }

    if ((documentTypeCode === '03' || documentTypeCode === '05') && !hasCcfData(selectedCustomer)) {
      return 'El cliente no tiene completos los datos para CCF: NIT o DUI, NRC y actividad económica';
    }

    if ((documentTypeCode === '11' || documentTypeCode === '14') && !hasDocument(selectedCustomer)) {
      return 'El cliente debe tener documento registrado para este tipo de DTE';
    }

    if (items.length === 0) {
      return 'Agregue al menos un producto o servicio al DTE';
    }

    return null;
  };

  const resetForm = () => {
    setCustomerId('');
    setRelatedInvoiceId('');
    setRelatedInvoiceDetail(null);
    setIssuedAtDate(getTodayInputDate());
    setNotes('');
    setItemForm(initialItemForm);
    setItems([]);
    setApplyRetention1(false);
    setGeneratedInvoice(null);
  };

  const generateDte = async () => {
    const validationError = validateInvoice();

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const invoiceIdToUpdate = editInvoiceId || generatedInvoice?.id || null;
    const shouldUpdateExistingInvoice = Boolean(invoiceIdToUpdate);

    const payload = {
      documentTypeCode,
      customerId: Number(customerId),
      relatedInvoiceId: relatedInvoiceId ? Number(relatedInvoiceId) : null,
      issuedAtDate,
      operationCondition,
      paymentMethod,
      notes: notes.trim(),
      applyRetention1: Boolean(applyRetention1),
      items: itemsWithAutomaticRetention.map((item) => ({
        productId: item.productId,
        itemType: item.itemType,
        code: item.code,
        description: item.description,
        unitOfMeasure: item.unitOfMeasure,
        unitOfMeasureName: item.unitOfMeasureName,
        saleType: item.saleType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        retention1: item.retention1,
        fovial: usesFuelTaxes ? item.fovial : 0,
        cotrans: usesFuelTaxes ? item.cotrans : 0
      }))
    };

    try {
      setGenerating(true);

      const data = shouldUpdateExistingInvoice
        ? await updateGeneratedInvoiceRequest(invoiceIdToUpdate, payload)
        : await generateInvoiceRequest(payload);

      toast.success(
        data.message || (shouldUpdateExistingInvoice ? 'DTE actualizado correctamente' : 'DTE generado correctamente')
      );

      const invoice = data.invoice || null;

      if (invoice?.id) {
        setGeneratedInvoice(invoice);
      }

      await loadData();
    } catch (error) {
      console.error('Error generando DTE:', error);

      const message = error.response?.data?.message || 'No se pudo generar el DTE';
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleTransmitGeneratedInvoice = async () => {
    const invoiceId = generatedInvoice?.id || editInvoiceId;

    if (!invoiceId) {
      toast.error('Primero debe generar y guardar el DTE');
      return;
    }

    try {
      setTransmittingGeneratedInvoice(true);

      const data = await transmitInvoiceRequest(invoiceId);

      toast.success(data.message || 'DTE transmitido correctamente a Hacienda');

      if (data.automaticEmail?.sent) {
        toast.success(`Correo enviado a ${data.automaticEmail.recipient}`);
      } else if (data.automaticEmail?.message) {
        toast.error(data.automaticEmail.message);
      }

      resetForm();
      editLoadedRef.current = false;
      originalEditProductQuantitiesRef.current = {};
      navigate('/invoices/generate', { replace: true });
      await loadData();
    } catch (error) {
      console.error('Error transmitiendo DTE desde Generar DTE:', error);

      const message = error.response?.data?.message || 'No se pudo transmitir el DTE a Hacienda';
      toast.error(message);

      if (invoiceId) {
        try {
          const data = await getInvoiceByIdRequest(invoiceId);
          setGeneratedInvoice(data.invoice || {
            id: invoiceId,
            validationStatus: 'ERROR',
            rejectionReason: message
          });
        } catch (loadError) {
          setGeneratedInvoice((prev) => ({
            ...(prev || { id: invoiceId }),
            validationStatus: 'ERROR',
            rejectionReason: message
          }));
        }
      }
    } finally {
      setTransmittingGeneratedInvoice(false);
    }
  };

  const correctionRequiredMessage = generatedInvoice?.validationStatus === 'ERROR'
    ? generatedInvoice.rejectionReason || 'Hacienda reportó una observación. Corrija el DTE y vuelva a transmitirlo.'
    : '';

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-blue-900" size={34} />
        <p className="text-gray-600 mt-3">{isEditMode ? 'Cargando DTE para edición...' : 'Cargando datos para generar DTE...'}</p>
      </div>
    );
  }

  return (
    <div>
      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
            <FilePlus2 className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              {isEditMode ? 'Editar DTE' : 'Generar DTE'}
            </h2>
            <p className="text-gray-600 mt-1">
              {isEditMode
                ? 'Modifique la información del DTE antes de transmitirlo a Hacienda.'
                : 'Cree documentos tributarios electrónicos por sucursal, cliente y productos/servicios registrados.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar datos
        </button>
      </section>

      <section className="grid xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <section className="bg-white rounded-2xl border shadow-sm p-5">
            <h3 className="font-bold text-lg text-gray-900 mb-4">
              Datos del documento
            </h3>

            <div className="grid lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Tipo de DTE
                </label>
                <select
                  value={documentTypeCode}
                  onChange={(event) => setDocumentTypeCode(event.target.value)}
                  disabled={isEditMode}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white disabled:bg-gray-100 disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  {availableDocumentTypes.map((doc) => (
                    <option key={doc.code} value={doc.code}>
                      {doc.code} - {doc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Fecha de emisión
                </label>
                <input
                  type="date"
                  value={issuedAtDate}
                  max={allowFutureInvoiceDates ? undefined : getTodayInputDate()}
                  onChange={(event) => setIssuedAtDate(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                />
                {(!allowFutureInvoiceDates || isAdmin) && (
                  <p className={`text-xs mt-1 ${allowFutureInvoiceDates ? 'text-amber-700' : 'text-gray-500'}`}>
                    {allowFutureInvoiceDates
                      ? 'Este contribuyente tiene habilitada la facturación con fechas futuras por el Administrador.'
                      : 'Puede seleccionar una fecha anterior; no se permiten fechas futuras para este contribuyente.'}
                  </p>
                )}
              </div>

              <SearchableSelect
                label="Cliente receptor"
                value={customerId}
                options={availableCustomers}
                onChange={(customer) => setCustomerId(customer ? String(customer.id) : '')}
                placeholder="Seleccione cliente"
                searchPlaceholder="Buscar cliente por nombre, documento o correo"
                emptyText="No se encontraron clientes"
                getOptionValue={(customer) => customer.id}
                getOptionLabel={getCustomerLabel}
                getOptionDescription={getCustomerDescription}
                disabled={documentTypeCode === '05' && !selectedRelatedInvoice && !isEditMode}
              />
            </div>

            {customerWarning && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800 flex gap-3">
                <AlertTriangle size={20} className="shrink-0" />
                <p>{customerWarning}</p>
              </div>
            )}

            {documentTypeCode === '05' && (
              <div className="mt-4">
                <SearchableSelect
                  label="CCF relacionado"
                  value={relatedInvoiceId}
                  options={creditNoteDocuments}
                  onChange={(invoice) => {
                    const nextId = invoice ? String(invoice.id) : '';
                    setRelatedInvoiceId(nextId);
                    loadRelatedInvoiceDetail(nextId);
                  }}
                  placeholder={loadingCreditNoteDocuments ? 'Cargando documentos...' : 'Seleccione CCF aceptado'}
                  searchPlaceholder="Buscar por número de control o cliente"
                  emptyText="No hay CCF aceptados disponibles"
                  getOptionValue={(invoice) => invoice.id}
                  getOptionLabel={(invoice) => `${invoice.controlNumber} - ${invoice.customer?.name || 'Sin cliente'}`}
                  getOptionDescription={(invoice) => `Total: ${formatMoney(invoice.total)} | Fecha: ${new Date(invoice.issuedAt).toLocaleDateString('es-SV', { timeZone: 'America/El_Salvador' })}`}
                />

                {loadingRelatedInvoiceDetail && (
                  <p className="text-sm text-gray-500 mt-2">Cargando detalle del CCF...</p>
                )}

                {relatedInvoiceDetail?.items?.length > 0 && (
                  <div className="mt-3 border rounded-xl p-3">
                    <p className="font-semibold text-gray-900 mb-2">
                      Detalles disponibles del CCF relacionado
                    </p>

                    <div className="space-y-2">
                      {relatedInvoiceDetail.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-gray-50 rounded-xl p-3"
                        >
                          <div>
                            <p className="font-medium text-gray-900">
                              {item.code} - {item.description}
                            </p>
                            <p className="text-sm text-gray-500">
                              Cantidad: {Number(item.quantity)} | Precio: {formatMoney(item.unitPrice)} | Total: {formatMoney(item.total)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => useRelatedInvoiceItem(item)}
                            className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-2 hover:bg-blue-800"
                          >
                            Usar detalle
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Condición de operación
                </label>
                <select
                  value={operationCondition}
                  onChange={(event) => setOperationCondition(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  {operationConditionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Forma de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  {paymentMethodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-700 mb-1">
                Observaciones internas
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={500}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
                placeholder="Observaciones internas o adicionales"
              />
            </div>
          </section>

          <section className="bg-white rounded-2xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <PackagePlus className="text-blue-900" size={22} />
              <h3 className="font-bold text-lg text-gray-900">
                Detalle de productos o servicios
              </h3>
            </div>



            <div className="grid lg:grid-cols-[1fr_130px_150px_160px] gap-3">
              <SearchableSelect
                label="Producto o servicio"
                value={itemForm.productId}
                options={products}
                onChange={handleProductChange}
                placeholder="Seleccione producto o servicio"
                searchPlaceholder="Buscar por código, nombre o descripción"
                emptyText="No se encontraron productos o servicios"
                getOptionValue={(product) => product.id}
                getOptionLabel={getProductLabel}
                getOptionDescription={getProductDescription}
              />

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Cantidad
                </label>
                <input
                  name="quantity"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={itemForm.quantity}
                  onChange={handleItemChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Precio
                </label>
                <input
                  name="unitPrice"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={itemForm.unitPrice}
                  onChange={handleItemChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Tipo de venta
                </label>
                <select
                  name="saleType"
                  value={itemForm.saleType}
                  onChange={handleItemChange}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
                >
                  {saleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedProduct?.itemType === 'PRODUCTO' && (
              <p className="text-xs text-green-700 mt-2">
                Stock disponible: {Number(selectedProduct.stock || 0)} {selectedProduct.unitOfMeasureName}
              </p>
            )}

            <div className="mt-4">
              <label className="block text-sm text-gray-700 mb-1">
                Descripción del detalle <span className="text-red-600">*</span>
              </label>
              <textarea
                name="description"
                value={itemForm.description}
                onChange={handleItemChange}
                rows={3}
                maxLength={500}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
              />
            </div>

            <div className={`grid ${usesFuelTaxes ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-3 mt-4`}>
              {usesFuelTaxes && (
                <>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      FOVIAL
                    </label>
                    <input
                      name="fovial"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={itemForm.fovial}
                      onChange={handleItemChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      COTRANS
                    </label>
                    <input
                      name="cotrans"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={itemForm.cotrans}
                      onChange={handleItemChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                      placeholder="0.00"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800"
              >
                <Plus size={20} />
                Agregar detalle
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {items.length === 0 && (
                <p className="text-sm text-gray-500">
                  No se han agregado productos o servicios.
                </p>
              )}

              {itemsWithAutomaticRetention.map((item) => (
                <article key={item.localId} className="border rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {item.code} - {item.description}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Cantidad: {Number(item.quantity)} | Precio: {formatMoney(item.unitPrice)} | Tipo: {item.saleType}
                      </p>
                      <p className="text-sm text-gray-500">
                        Subtotal: {formatMoney(item.subtotal)} | IVA: {formatMoney(item.iva)} | Retención: {formatMoney(item.retention1)} | Total: {formatMoney(item.total)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.localId)}
                      className="inline-flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-2 hover:bg-red-100"
                    >
                      <Trash2 size={17} />
                      Quitar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="bg-white rounded-2xl border shadow-sm p-5 h-fit sticky top-24">
          <h3 className="font-bold text-lg text-gray-900">
            Resumen del DTE
          </h3>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Tipo</span>
              <span className="font-semibold text-gray-900">
                {selectedDocumentType?.shortName || documentTypeCode}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Cliente</span>
              <span className="font-semibold text-gray-900 text-right">
                {selectedCustomer?.name || 'Sin seleccionar'}
              </span>
            </div>

            <div className="border-t pt-3 flex justify-between gap-4">
              <span className="text-gray-500">No sujeta</span>
              <span className="font-semibold">{formatMoney(invoiceTotals.noSuj)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Exenta</span>
              <span className="font-semibold">{formatMoney(invoiceTotals.exenta)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Gravada</span>
              <span className="font-semibold">{formatMoney(invoiceTotals.gravada)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold">{formatMoney(invoiceTotals.subtotal)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">IVA</span>
              <span className="font-semibold">{formatMoney(invoiceTotals.iva)}</span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Retención</span>
              <span className="font-semibold text-red-700">
                -{formatMoney(invoiceTotals.retention1)}
              </span>
            </div>

            {canUseIvaRetention && (
              <div className="rounded-xl border bg-gray-50 p-3 text-xs text-gray-600 space-y-2">
                <p>
                  Base gravada para retención: <strong>{formatMoney(automaticRetentionBase)}</strong>. La retención 1% solo aplica si supera $100.00.
                </p>
                {applyRetention1 ? (
                  <button
                    type="button"
                    onClick={handleRemoveRetention}
                    className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700 hover:bg-red-100"
                  >
                    Quitar retención 1%
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyRetention}
                    disabled={automaticRetentionBase <= IVA_RETENTION_THRESHOLD}
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Aplicar retención 1%
                  </button>
                )}
              </div>
            )}

            {usesFuelTaxes && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">FOVIAL</span>
                  <span className="font-semibold">{formatMoney(invoiceTotals.fovial)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">COTRANS</span>
                  <span className="font-semibold">{formatMoney(invoiceTotals.cotrans)}</span>
                </div>
              </>
            )}

            <div className="border-t pt-3 flex justify-between gap-4 text-lg">
              <span className="font-bold text-gray-900">Total</span>
              <span className="font-bold text-blue-900">
                {formatMoney(invoiceTotals.total)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={generateDte}
            disabled={generating}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-green-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-green-800 disabled:opacity-70"
          >
            {generating ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {generating
              ? isEditMode ? 'Guardando...' : 'Generando...'
              : isEditMode ? 'Guardar cambios' : 'Generar DTE'}
          </button>

          {correctionRequiredMessage && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 flex gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              <div>
                <p className="font-semibold">Corrección requerida</p>
                <p>{correctionRequiredMessage}</p>
              </div>
            </div>
          )}

          {(generatedInvoice?.id || editInvoiceId) && ['GENERADO', 'RECHAZADO', undefined].includes(generatedInvoice?.status) && (
            <button
              type="button"
              onClick={handleTransmitGeneratedInvoice}
              disabled={transmittingGeneratedInvoice || generating}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
            >
              {transmittingGeneratedInvoice ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
              {transmittingGeneratedInvoice ? 'Enviando a Hacienda...' : 'Enviar a Hacienda'}
            </button>
          )}

          {hasUnsavedData && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-900 flex gap-2">
              <AlertTriangle size={18} className="shrink-0" />
              <p>
                {isEditMode
                  ? 'Hay cambios sin guardar. Si sale de esta pantalla, se perderán los cambios no guardados.'
                  : 'Hay datos sin generar. Si sale de esta pantalla, se perderán los cambios no guardados.'}
              </p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

export default GenerateInvoicePage;
