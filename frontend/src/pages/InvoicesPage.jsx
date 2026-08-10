import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  Eye,
  FileText,
  Loader2,
  Mail,
  PencilLine,
  RefreshCcw,
  Search,
  Send,
  X
} from 'lucide-react';

import {
  createReturnEventRequest,
  getDteEventJsonRequest,
  transmitDteEventRequest
} from '../api/dteEvents.api';

import {
  downloadDteJsonRequest,
  downloadDtePdfRequest,
  getDteJsonRequest,
  getDtePdfRequest,
  getInvoiceByIdRequest,
  getInvoiceEmailLogsRequest,
  getInvoicesRequest,
  invalidateInvoiceRequest,
  sendInvoiceEmailRequest,
  transmitInvoiceRequest
} from '../api/invoices.api';

const statusStyles = {
  BORRADOR: 'bg-gray-50 text-gray-700 border-gray-200',
  GENERADO: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  FIRMADO: 'bg-blue-50 text-blue-800 border-blue-200',
  TRANSMITIDO: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  ACEPTADO: 'bg-green-50 text-green-800 border-green-200',
  RECHAZADO: 'bg-red-50 text-red-800 border-red-200',
  ANULADO: 'bg-slate-100 text-slate-700 border-slate-300'
};

const documentTypeNames = {
  '01': 'Consumidor Final',
  '03': 'Crédito Fiscal',
  '05': 'Nota de Crédito',
  '11': 'Exportación',
  '14': 'Sujeto Excluido'
};
const RETURN_EVENT_FEATURE_ENABLED = import.meta.env.VITE_RETURN_EVENT_FEATURE_ENABLED === 'true';

const ITEMS_PER_PAGE = 15;

const getCurrentMonthDateRange = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/El_Salvador',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(value);

  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const year = Number(dateParts.year);
  const month = Number(dateParts.month);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDate: `${dateParts.year}-${dateParts.month}-01`,
    endDate: `${dateParts.year}-${dateParts.month}-${String(lastDay).padStart(2, '0')}`
  };
};

const getFileNameFromDisposition = (contentDisposition, fallbackName) => {
  if (!contentDisposition) return fallbackName;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const normalMatch = contentDisposition.match(/filename="?([^"]+)"?/i);

  if (normalMatch?.[1]) {
    return normalMatch[1];
  }

  return fallbackName;
};

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  link.remove();
  window.URL.revokeObjectURL(url);
};

function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState(getCurrentMonthDateRange);
  const [appliedDateRange, setAppliedDateRange] = useState(getCurrentMonthDateRange);
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonModalTitle, setJsonModalTitle] = useState('');
  const [jsonModalContent, setJsonModalContent] = useState('');
  const [jsonProcessingId, setJsonProcessingId] = useState(null);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfModalTitle, setPdfModalTitle] = useState('');
  const [pdfModalUrl, setPdfModalUrl] = useState('');
  const [pdfProcessingId, setPdfProcessingId] = useState(null);

  const [emailLogs, setEmailLogs] = useState([]);
  const [loadingEmailLogs, setLoadingEmailLogs] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTargetInvoice, setEmailTargetInvoice] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    message: ''
  });
  const [transmitModalOpen, setTransmitModalOpen] = useState(false);
  const [transmitTargetInvoice, setTransmitTargetInvoice] = useState(null);

  const [invalidateModalOpen, setInvalidateModalOpen] = useState(false);
  const [invalidateTargetInvoice, setInvalidateTargetInvoice] = useState(null);
  const [invalidationReason, setInvalidationReason] = useState(
    'Anulación solicitada por error en los datos del documento'
  );

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnTargetInvoice, setReturnTargetInvoice] = useState(null);
  const [returnReason, setReturnReason] = useState('Retorno de bienes o servicios según operación relacionada');
  const [returnTransmitNow, setReturnTransmitNow] = useState(true);
  const navigate = useNavigate();

  const loadInvoices = async (range = appliedDateRange) => {
    try {
      setLoading(true);
      setCurrentPage(1);

      const data = await getInvoicesRequest({
        startDate: range.startDate,
        endDate: range.endDate
      });

      setInvoices(data.invoices || []);
    } catch (error) {
      console.error('Error cargando DTE:', error);

      const message = error.response?.data?.message || 'No se pudieron cargar los documentos';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const applyDateRange = async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      toast.error('Debe seleccionar la fecha inicial y la fecha final');
      return;
    }

    if (dateRange.startDate > dateRange.endDate) {
      toast.error('La fecha inicial no puede ser mayor que la fecha final');
      return;
    }

    const nextRange = {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    };

    setAppliedDateRange(nextRange);
    await loadInvoices(nextRange);
  };

  const resetToCurrentMonth = async () => {
    const currentMonthRange = getCurrentMonthDateRange();

    setDateRange(currentMonthRange);
    setAppliedDateRange(currentMonthRange);
    await loadInvoices(currentMonthRange);
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    const hasGeneratedDocuments = invoices.some(
      (invoice) => invoice.status === 'GENERADO'
    );

    const handleBeforeUnload = (event) => {
      if (!hasGeneratedDocuments) return;

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [invoices]);

  useEffect(() => {
    setCurrentPage(1);
  }, [q, statusFilter, documentTypeFilter]);

  useEffect(() => {
    return () => {
      if (pdfModalUrl) {
        window.URL.revokeObjectURL(pdfModalUrl);
      }
    };
  }, [pdfModalUrl]);

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

  const getStatusBadgeClass = (status) => {
    return statusStyles[status] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getDocumentShortName = (documentTypeCode, documentTypeName) => {
    return documentTypeNames[documentTypeCode] || documentTypeName || 'DTE';
  };

 const canCreateReturnEvent = (invoice) => {
  return RETURN_EVENT_FEATURE_ENABLED
    && invoice.status === 'ACEPTADO'
    && ['01', '11', '14'].includes(String(invoice.documentTypeCode))
    && Boolean(invoice.receptionSeal)
    && !invoice.returnEvent;
};

  const getInvoiceSequence = (invoice) => {
  const controlNumber = String(invoice.controlNumber || '');
  const sequence = Number(controlNumber.split('-').pop());

  return Number.isFinite(sequence) ? sequence : Number(invoice.id || 0);
};

const getDocumentTypeOrder = (documentTypeCode) => {
  const order = {
    '01': 1,
    '03': 2,
    '05': 3,
    '11': 4,
    '14': 5
  };

  return order[String(documentTypeCode)] || 99;
};

  const filteredInvoices = invoices
  .filter((invoice) => {
    const text = `
      ${invoice.controlNumber || ''}
      ${invoice.generationCode || ''}
      ${invoice.relatedControlNumber || ''}
      ${invoice.customer?.name || ''}
      ${invoice.documentTypeName || ''}
      ${invoice.status || ''}
      ${invoice.receptionSeal || ''}
      ${invoice.rejectionReason || ''}
      ${invoice.invalidationReason || ''}
      ${invoice.invalidationReceptionSeal || ''}
      ${invoice.invalidationGenerationCode || ''}
    `.toLowerCase();

    const matchesText = !q || text.includes(q.toLowerCase());
    const matchesStatus = !statusFilter || invoice.status === statusFilter;
    const matchesDocumentType = !documentTypeFilter || invoice.documentTypeCode === documentTypeFilter;

    return matchesText && matchesStatus && matchesDocumentType;
  })
  .sort((a, b) => {
    const typeA = getDocumentTypeOrder(a.documentTypeCode);
    const typeB = getDocumentTypeOrder(b.documentTypeCode);

    if (typeA !== typeB) {
      return typeA - typeB;
    }

    return getInvoiceSequence(b) - getInvoiceSequence(a);
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE)
  );
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (visiblePage - 1) * ITEMS_PER_PAGE;
  const paginatedInvoices = filteredInvoices.slice(
    pageStartIndex,
    pageStartIndex + ITEMS_PER_PAGE
  );
  const showingFrom = filteredInvoices.length === 0 ? 0 : pageStartIndex + 1;
  const showingTo = Math.min(
    pageStartIndex + ITEMS_PER_PAGE,
    filteredInvoices.length
  );

  const generatedCount = invoices.filter((invoice) => invoice.status === 'GENERADO').length;
  const acceptedCount = invoices.filter((invoice) => invoice.status === 'ACEPTADO').length;

  const refreshSelectedInvoice = async (invoiceId) => {
    if (!selectedInvoice || Number(selectedInvoice.id) !== Number(invoiceId)) {
      return;
    }

    const data = await getInvoiceByIdRequest(invoiceId);
    setSelectedInvoice(data.invoice);
  };

  const loadEmailLogs = async (invoiceId) => {
  if (!invoiceId) {
    setEmailLogs([]);
    return;
  }

  try {
    setLoadingEmailLogs(true);

    const data = await getInvoiceEmailLogsRequest(invoiceId);

    setEmailLogs(data.logs || []);
  } catch (error) {
    console.error('Error cargando historial de correos:', error);
    setEmailLogs([]);
    toast.error('No se pudo cargar el historial de correos');
  } finally {
    setLoadingEmailLogs(false);
  }
};

  const viewDetail = async (invoiceId) => {
  try {
    setLoadingDetail(true);

    const data = await getInvoiceByIdRequest(invoiceId);

    setSelectedInvoice(data.invoice);
    await loadEmailLogs(invoiceId);
  } catch (error) {
    console.error('Error cargando detalle:', error);
    toast.error('No se pudo cargar el detalle del DTE');
  } finally {
    setLoadingDetail(false);
  }
};

  const closeDetail = () => {
    setSelectedInvoice(null);
    setEmailLogs([]);
  };

  const openJsonModal = async (invoice, type = 'document') => {
    try {
      setJsonProcessingId(`${type}-${invoice.id}`);

      if (type === 'return-event' && invoice.returnEvent?.id) {
        const data = await getDteEventJsonRequest(invoice.returnEvent?.id, true);

        setJsonModalTitle(`JSON Evento de Retorno - ${invoice.controlNumber}`);
        setJsonModalContent(JSON.stringify(data.eventJson, null, 2));
        setJsonModalOpen(true);
        return;
      }

      const data = await getDteJsonRequest(invoice.id, type);

      const title = type === 'invalidation'
        ? `JSON de anulación - ${invoice.controlNumber}`
        : `JSON del DTE - ${invoice.controlNumber}`;

      setJsonModalTitle(title);
      setJsonModalContent(JSON.stringify(data.json, null, 2));
      setJsonModalOpen(true);
    } catch (error) {
      console.error('Error cargando JSON:', error);

      const message = error.response?.data?.message || 'No se pudo cargar el JSON del DTE';
      toast.error(message);
    } finally {
      setJsonProcessingId(null);
    }
  };

  const closeJsonModal = () => {
    setJsonModalOpen(false);
    setJsonModalTitle('');
    setJsonModalContent('');
  };

  const copyJsonToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(jsonModalContent);
      toast.success('JSON copiado al portapapeles');
    } catch (error) {
      console.error('Error copiando JSON:', error);
      toast.error('No se pudo copiar el JSON');
    }
  };

  const downloadJson = async (invoice, type = 'document') => {
    try {
      setJsonProcessingId(`${type}-${invoice.id}`);

      const response = await downloadDteJsonRequest(invoice.id, type);

      const fallbackName = type === 'invalidation'
        ? `ANULACION-${invoice.controlNumber}.json`
        : `${invoice.controlNumber}.json`;

      const fileName = getFileNameFromDisposition(
        response.headers?.['content-disposition'],
        fallbackName
      );

      downloadBlob(response.data, fileName);

      toast.success('JSON descargado correctamente');
    } catch (error) {
      console.error('Error descargando JSON:', error);

      const message = error.response?.data?.message || 'No se pudo descargar el JSON';
      toast.error(message);
    } finally {
      setJsonProcessingId(null);
    }
  };

  const openPdfModal = async (invoice, type = 'document') => {
    try {
      setPdfProcessingId(`${type}-${invoice.id}`);

      const response = await getDtePdfRequest(invoice.id, type);
      const blobUrl = window.URL.createObjectURL(response.data);

      const title = type === 'invalidation'
        ? `PDF de anulación - ${invoice.controlNumber}`
        : `PDF del DTE - ${invoice.controlNumber}`;

      if (pdfModalUrl) {
        window.URL.revokeObjectURL(pdfModalUrl);
      }

      setPdfModalTitle(title);
      setPdfModalUrl(blobUrl);
      setPdfModalOpen(true);
    } catch (error) {
      console.error('Error cargando PDF:', error);

      const message = error.response?.data?.message || 'No se pudo cargar el PDF del DTE';
      toast.error(message);
    } finally {
      setPdfProcessingId(null);
    }
  };

  const closePdfModal = () => {
    if (pdfModalUrl) {
      window.URL.revokeObjectURL(pdfModalUrl);
    }

    setPdfModalOpen(false);
    setPdfModalTitle('');
    setPdfModalUrl('');
  };

  const downloadPdf = async (invoice, type = 'document') => {
    try {
      setPdfProcessingId(`${type}-${invoice.id}`);

      const response = await downloadDtePdfRequest(invoice.id, type);

      const fallbackName = type === 'invalidation'
        ? `ANULACION-${invoice.controlNumber}.pdf`
        : `${invoice.controlNumber}.pdf`;

      const fileName = getFileNameFromDisposition(
        response.headers?.['content-disposition'],
        fallbackName
      );

      downloadBlob(response.data, fileName);

      toast.success('PDF descargado correctamente');
    } catch (error) {
      console.error('Error descargando PDF:', error);

      const message = error.response?.data?.message || 'No se pudo descargar el PDF';
      toast.error(message);
    } finally {
      setPdfProcessingId(null);
    }
  };

  const handleTransmit = (invoice) => {
    if (invoice.status !== 'GENERADO') {
      toast.error('Solo se pueden transmitir documentos en estado GENERADO');
      return;
    }

    setTransmitTargetInvoice(invoice);
    setTransmitModalOpen(true);
  };

  const closeTransmitModal = () => {
    if (processingId) return;

    setTransmitModalOpen(false);
    setTransmitTargetInvoice(null);
  };

  const submitTransmit = async () => {
    if (!transmitTargetInvoice) return;

    try {
      setProcessingId(transmitTargetInvoice.id);

      const data = await transmitInvoiceRequest(transmitTargetInvoice.id);

      toast.success(data.message || 'DTE transmitido correctamente');

      if (data.automaticEmail?.sent) {
        toast.success(
          `Correo enviado automáticamente a ${data.automaticEmail.recipient}`
        );
      } else if (data.automaticEmail?.skipped) {
        toast.error(
          'El DTE fue aceptado, pero el cliente no tiene correo registrado. Puede usar Re-Enviar correo.'
        );
      } else if (data.automaticEmail && !data.automaticEmail.sent) {
        toast.error(
          'El DTE fue aceptado, pero no se pudo enviar el correo automático. Puede usar Re-Enviar correo.'
        );
      }

      const invoiceId = transmitTargetInvoice.id;

      setTransmitModalOpen(false);
      setTransmitTargetInvoice(null);

      await loadInvoices();
      await refreshSelectedInvoice(invoiceId);
    } catch (error) {
      console.error('Error transmitiendo DTE:', error);

      const message = error.response?.data?.message || 'No se pudo transmitir el DTE';
      toast.error(message);

      // El backend conserva el resultado para mostrar la corrección requerida.
      await loadInvoices();
      await refreshSelectedInvoice(transmitTargetInvoice.id);
    } finally {
      setProcessingId(null);
    }
  };


  const handleInvalidate = (invoice) => {
  if (invoice.status !== 'ACEPTADO') {
    toast.error('Solo se pueden anular documentos aceptados por Hacienda');
    return;
  }

  setInvalidateTargetInvoice(invoice);
  setInvalidationReason('Anulación solicitada por error en los datos del documento');
  setInvalidateModalOpen(true);
};

const closeInvalidateModal = () => {
  if (processingId) return;

  setInvalidateModalOpen(false);
  setInvalidateTargetInvoice(null);
  setInvalidationReason('Anulación solicitada por error en los datos del documento');
};

const submitInvalidate = async () => {
  if (!invalidateTargetInvoice) return;

  const reason = invalidationReason.trim();

  if (!reason) {
    toast.error('Debe ingresar el motivo de anulación');
    return;
  }

  try {
    setProcessingId(invalidateTargetInvoice.id);

    const data = await invalidateInvoiceRequest(invalidateTargetInvoice.id, reason);

    toast.success(data.message || 'DTE anulado correctamente');

if (data.automaticEmail?.sent) {
  toast.success(
    `Correo de anulación enviado automáticamente a ${data.automaticEmail.recipient}`
  );
} else if (data.automaticEmail?.skipped) {
  toast.error(
    'El DTE fue anulado, pero el cliente no tiene correo registrado. Puede usar Reenviar correo.'
  );
} else if (data.automaticEmail && !data.automaticEmail.sent) {
  toast.error(
    'El DTE fue anulado, pero no se pudo enviar el correo automático. Puede usar Reenviar correo.'
  );
}

const invoiceId = invalidateTargetInvoice.id;

    setInvalidateModalOpen(false);
    setInvalidateTargetInvoice(null);
    setInvalidationReason('Anulación solicitada por error en los datos del documento');

    await loadInvoices();
    await refreshSelectedInvoice(invoiceId);
  } catch (error) {
    console.error('Error anulando DTE:', error);

    const message = error.response?.data?.message || 'No se pudo anular el DTE';
    toast.error(message);
  } finally {
    setProcessingId(null);
  }
};


  const handleReturnEvent = (invoice) => {
  if (!canCreateReturnEvent(invoice)) {
    toast.error('El Evento de Retorno solo aplica a FE, FEXE o FSEE aceptados y con sello de recepción');
    return;
  }

  setReturnTargetInvoice(invoice);
  setReturnReason('Retorno de bienes o servicios según operación relacionada');
  setReturnTransmitNow(true);
  setReturnModalOpen(true);
};

const closeReturnModal = () => {
  if (processingId) return;

  setReturnModalOpen(false);
  setReturnTargetInvoice(null);
  setReturnReason('Retorno de bienes o servicios según operación relacionada');
  setReturnTransmitNow(true);
};

const submitReturnEvent = async () => {
  if (!returnTargetInvoice) return;

  const reason = returnReason.trim();

  if (!reason) {
    toast.error('Debe ingresar el motivo del Evento de Retorno');
    return;
  }

  try {
    setProcessingId(returnTargetInvoice.id);

    const created = await createReturnEventRequest({
      sourceInvoiceId: returnTargetInvoice.id,
      notes: reason,
      reason
    });

    let finalMessage = created.message || 'Evento de Retorno generado correctamente';
    let createdEvent = created.event;

    if (returnTransmitNow && createdEvent?.id) {
      const transmitted = await transmitDteEventRequest(createdEvent.id);
      createdEvent = transmitted.event || createdEvent;
      finalMessage = transmitted.message || 'Evento de Retorno transmitido correctamente a Hacienda';
    }

    toast.success(finalMessage);

    if (createdEvent?.status === 'ACEPTADO' && createdEvent?.receptionSeal) {
      toast.success('Hacienda aceptó el Evento de Retorno y devolvió sello de recepción');
    }

    setReturnModalOpen(false);
    setReturnTargetInvoice(null);
    setReturnReason('Retorno de bienes o servicios según operación relacionada');
    setReturnTransmitNow(true);

    await loadInvoices();
    await refreshSelectedInvoice(returnTargetInvoice.id);
  } catch (error) {
    console.error('Error generando Evento de Retorno:', error);

    const message = error.response?.data?.message || 'No se pudo generar o transmitir el Evento de Retorno';
    toast.error(message);
  } finally {
    setProcessingId(null);
  }
};

  const getDefaultEmailSubject = (invoice) => {
  if (invoice.status === 'ANULADO') {
    return `Anulación de DTE ${invoice.controlNumber}`;
  }

  return `Documento Tributario Electrónico ${invoice.controlNumber}`;
};

const getDefaultEmailMessage = (invoice) => {
  const companyName = invoice.company?.commercialName || invoice.company?.legalName || 'la empresa emisora';

  if (invoice.status === 'ANULADO') {
    return `Estimado(a), se remite la documentación correspondiente a la anulación del DTE ${invoice.controlNumber}, emitido por ${companyName}.`;
  }

  return `Estimado(a), se remite el Documento Tributario Electrónico ${invoice.controlNumber}, emitido por ${companyName}.`;
};

const getEmailAttachmentNames = (invoice) => {
  if (!invoice) return [];

  const attachments = [
    `${invoice.controlNumber}.pdf`,
    `${invoice.controlNumber}.json`
  ];

  if (invoice.status === 'ANULADO') {
    attachments.push(`ANULACION-${invoice.controlNumber}.pdf`);
    attachments.push(`ANULACION-${invoice.controlNumber}.json`);
  }

  return attachments;
};

const closeEmailModal = () => {
  setEmailModalOpen(false);
  setEmailTargetInvoice(null);
  setEmailForm({
    to: '',
    subject: '',
    message: ''
  });
};

  const handleSendEmail = (invoice) => {
  if (!['ACEPTADO', 'ANULADO'].includes(invoice.status)) {
    toast.error('Solo se pueden enviar por correo documentos ACEPTADOS o ANULADOS');
    return;
  }

  setEmailTargetInvoice(invoice);
  setEmailForm({
    to: invoice.customer?.email || '',
    subject: getDefaultEmailSubject(invoice),
    message: getDefaultEmailMessage(invoice)
  });
  setEmailModalOpen(true);
};

const handleEmailFormChange = (event) => {
  const { name, value } = event.target;

  setEmailForm((prev) => ({
    ...prev,
    [name]: value
  }));
};

const submitEmail = async () => {
  if (!emailTargetInvoice) return;

  if (!emailForm.to.trim()) {
    toast.error('Debe ingresar el correo destinatario');
    return;
  }

  if (!emailForm.subject.trim()) {
    toast.error('Debe ingresar el asunto del correo');
    return;
  }

  if (!emailForm.message.trim()) {
    toast.error('Debe ingresar el mensaje del correo');
    return;
  }

  try {
    setSendingEmail(true);

    const data = await sendInvoiceEmailRequest(emailTargetInvoice.id, {
      to: emailForm.to.trim(),
      subject: emailForm.subject.trim(),
      message: emailForm.message.trim()
    });

    toast.success(data.message || 'Correo enviado correctamente');
    if (selectedInvoice && Number(selectedInvoice.id) === Number(emailTargetInvoice.id)) {
    await loadEmailLogs(emailTargetInvoice.id);
  }
    closeEmailModal();
  } catch (error) {
    console.error('Error enviando correo:', error);

    const message = error.response?.data?.message || 'No se pudo enviar el correo';
    toast.error(message);
  } finally {
    setSendingEmail(false);
  }
};

const renderEmailLogAttachments = (attachmentsJson) => {
  if (!attachmentsJson) return null;

  let attachments = [];

  if (Array.isArray(attachmentsJson)) {
    attachments = attachmentsJson;
  } else if (typeof attachmentsJson === 'string') {
    try {
      attachments = JSON.parse(attachmentsJson);
    } catch {
      attachments = [];
    }
  }

  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1">
      {attachments.map((attachment, index) => (
        <div
          key={`${attachment.filename || 'adjunto'}-${index}`}
          className="flex items-center gap-2 text-xs bg-white border rounded-lg px-2 py-1"
        >
          <FileText size={13} className="text-blue-900 shrink-0" />
          <span className="break-all">
            {attachment.filename || 'Archivo adjunto'}
          </span>
        </div>
      ))}
    </div>
  );
};

  const renderFiscalAmounts = (source, usesFuelTaxes = false) => {
    return (
      <>
        {Number(source.noSuj || 0) > 0 && (
          <p>No sujeta: {formatMoney(source.noSuj)}</p>
        )}

        {Number(source.exenta || 0) > 0 && (
          <p>Exenta: {formatMoney(source.exenta)}</p>
        )}

        {Number(source.gravada || 0) > 0 && (
          <p>Gravada: {formatMoney(source.gravada)}</p>
        )}

        <p>Subtotal: {formatMoney(source.subtotal)}</p>

        {Number(source.iva || 0) > 0 && (
          <p>IVA: {formatMoney(source.iva)}</p>
        )}

        {Number(source.retention1 || 0) > 0 && (
          <p className="text-red-700">
            Ret. 1%: -{formatMoney(source.retention1)}
          </p>
        )}

        {usesFuelTaxes && Number(source.fovial || 0) > 0 && (
          <p>FOVIAL: {formatMoney(source.fovial)}</p>
        )}

        {usesFuelTaxes && Number(source.cotrans || 0) > 0 && (
          <p>COTRANS: {formatMoney(source.cotrans)}</p>
        )}
      </>
    );
  };

  const renderActionButtons = (invoice) => {
    const isProcessing = Number(processingId) === Number(invoice.id);
    const isDocumentJsonProcessing = jsonProcessingId === `document-${invoice.id}`;
    const isInvalidationJsonProcessing = jsonProcessingId === `invalidation-${invoice.id}`;
    const isDocumentPdfProcessing = pdfProcessingId === `document-${invoice.id}`;
    const isInvalidationPdfProcessing = pdfProcessingId === `invalidation-${invoice.id}`;

    const buttonBase = 'w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-70';

    const groupTitle = (text) => (
      <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-2">
        {text}
      </p>
    );

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-center">
        <div className="rounded-2xl border bg-white p-3 h-fit self-start">
          {groupTitle('JSON')}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => openJsonModal(invoice, 'document')}
              disabled={isDocumentJsonProcessing}
              className={`${buttonBase} bg-purple-700 text-white hover:bg-purple-800`}
            >
              {isDocumentJsonProcessing ? <Loader2 className="animate-spin" size={17} /> : <Code2 size={17} />}
              Ver JSON
            </button>

            <button
              type="button"
              onClick={() => downloadJson(invoice, 'document')}
              disabled={isDocumentJsonProcessing}
              className={`${buttonBase} bg-purple-50 border border-purple-200 text-purple-800 hover:bg-purple-100`}
            >
              {isDocumentJsonProcessing ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
              Descargar JSON
            </button>

            {RETURN_EVENT_FEATURE_ENABLED && invoice.returnEvent && (
              <button
                type="button"
                onClick={() => openJsonModal(invoice, 'return-event')}
                disabled={jsonProcessingId === `return-event-${invoice.id}`}
                className={`${buttonBase} bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100`}
              >
                {jsonProcessingId === `return-event-${invoice.id}` ? <Loader2 className="animate-spin" size={17} /> : <Code2 size={17} />}
                JSON retorno
              </button>
            )}

            {invoice.status === 'ANULADO' && (
              <>
                <button
                  type="button"
                  onClick={() => openJsonModal(invoice, 'invalidation')}
                  disabled={isInvalidationJsonProcessing}
                  className={`${buttonBase} bg-slate-700 text-white hover:bg-slate-800`}
                >
                  {isInvalidationJsonProcessing ? <Loader2 className="animate-spin" size={17} /> : <Code2 size={17} />}
                  JSON anulado
                </button>

                <button
                  type="button"
                  onClick={() => downloadJson(invoice, 'invalidation')}
                  disabled={isInvalidationJsonProcessing}
                  className={`${buttonBase} bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200`}
                >
                  {isInvalidationJsonProcessing ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
                  Descargar anulación
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3 h-fit self-start">
          {groupTitle('PDF')}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => openPdfModal(invoice, 'document')}
              disabled={isDocumentPdfProcessing}
              className={`${buttonBase} bg-cyan-700 text-white hover:bg-cyan-800`}
            >
              {isDocumentPdfProcessing ? <Loader2 className="animate-spin" size={17} /> : <FileText size={17} />}
              Ver PDF
            </button>

            <button
              type="button"
              onClick={() => downloadPdf(invoice, 'document')}
              disabled={isDocumentPdfProcessing}
              className={`${buttonBase} bg-cyan-50 border border-cyan-200 text-cyan-800 hover:bg-cyan-100`}
            >
              {isDocumentPdfProcessing ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
              Descargar PDF
            </button>

            {invoice.status === 'ANULADO' && (
              <>
                <button
                  type="button"
                  onClick={() => openPdfModal(invoice, 'invalidation')}
                  disabled={isInvalidationPdfProcessing}
                  className={`${buttonBase} bg-slate-700 text-white hover:bg-slate-800`}
                >
                  {isInvalidationPdfProcessing ? <Loader2 className="animate-spin" size={17} /> : <FileText size={17} />}
                  PDF anulado
                </button>

                <button
                  type="button"
                  onClick={() => downloadPdf(invoice, 'invalidation')}
                  disabled={isInvalidationPdfProcessing}
                  className={`${buttonBase} bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200`}
                >
                  {isInvalidationPdfProcessing ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
                  Descargar anulación
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-3 h-fit self-start">
          {groupTitle('Gestión')}

          <div className="space-y-2">
            {invoice.status === 'GENERADO' && (
              <button
                type="button"
                onClick={() => handleTransmit(invoice)}
                disabled={isProcessing}
                className={`${buttonBase} bg-green-700 text-white hover:bg-green-800`}
              >
                {isProcessing ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
                Enviar a Hacienda
              </button>
            )}

            {invoice.status === 'ACEPTADO' && (
              <>
                <button
                  type="button"
                  onClick={() => handleSendEmail(invoice)}
                  disabled={isProcessing}
                  className={`${buttonBase} bg-emerald-700 text-white hover:bg-emerald-800`}
                >
                  <Mail size={17} />
                  Reenviar correo
                </button>

                {canCreateReturnEvent(invoice) && (
                  <button
                    type="button"
                    onClick={() => handleReturnEvent(invoice)}
                    disabled={isProcessing}
                    className={`${buttonBase} bg-orange-700 text-white hover:bg-orange-800`}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCcw size={17} />}
                    Evento Retorno
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleInvalidate(invoice)}
                  disabled={isProcessing}
                  className={`${buttonBase} bg-slate-800 text-white hover:bg-slate-900`}
                >
                  {isProcessing ? <Loader2 className="animate-spin" size={17} /> : <Ban size={17} />}
                  Anular DTE
                </button>
              </>
            )}

            {invoice.status === 'ANULADO' && (
              <button
                type="button"
                onClick={() => handleSendEmail(invoice)}
                disabled={isProcessing}
                className={`${buttonBase} bg-emerald-700 text-white hover:bg-emerald-800`}
              >
                <Mail size={17} />
                Reenviar correo
              </button>
            )}

            {!['GENERADO', 'ACEPTADO', 'ANULADO'].includes(invoice.status) && (
              <div className="rounded-xl bg-gray-50 border px-3 py-3 text-sm text-gray-500 text-center">
                Sin acciones disponibles.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {transmitModalOpen && transmitTargetInvoice && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            Confirmar transmisión a Hacienda
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Revise la información antes de enviar oficialmente este DTE al Ministerio de Hacienda.
          </p>
        </div>

        <button
          type="button"
          onClick={closeTransmitModal}
          disabled={processingId}
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-70"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-900 flex gap-3">
          <AlertTriangle className="shrink-0" size={22} />
          <div>
            <p className="font-semibold">
              El documento será enviado oficialmente a Hacienda.
            </p>
            <p className="mt-1">
              Después de transmitirlo, Hacienda puede aceptarlo o rechazarlo según la validación del DTE.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border rounded-2xl p-4 text-sm space-y-2">
          <p>
            <strong>Número de control:</strong>{' '}
            <span className="break-all">{transmitTargetInvoice.controlNumber}</span>
          </p>

          <p>
            <strong>Código de generación:</strong>{' '}
            <span className="break-all">{transmitTargetInvoice.generationCode}</span>
          </p>

          <p>
            <strong>Tipo de documento:</strong>{' '}
            {getDocumentShortName(
              transmitTargetInvoice.documentTypeCode,
              transmitTargetInvoice.documentTypeName
            )}
          </p>

          <p>
            <strong>Cliente:</strong>{' '}
            {transmitTargetInvoice.customer?.name || 'Sin cliente'}
          </p>

          <p>
            <strong>Total:</strong>{' '}
            {formatMoney(transmitTargetInvoice.total)}
          </p>
        </div>
      </div>

      <div className="border-t p-5 flex flex-col sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={closeTransmitModal}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 border rounded-xl px-5 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={submitTransmit}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 bg-green-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-green-800 disabled:opacity-70"
        >
          {processingId ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          Enviar a Hacienda
        </button>
      </div>
    </div>
  </div>
)}

{invalidateModalOpen && invalidateTargetInvoice && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            Confirmar anulación del DTE
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Ingrese el motivo de anulación que será enviado oficialmente a Hacienda.
          </p>
        </div>

        <button
          type="button"
          onClick={closeInvalidateModal}
          disabled={processingId}
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-70"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900 flex gap-3">
          <AlertTriangle className="shrink-0" size={22} />
          <div>
            <p className="font-semibold">
              Esta acción enviará una invalidación oficial a Hacienda.
            </p>
            <p className="mt-1">
              Si Hacienda acepta la anulación, el documento quedará en estado ANULADO.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border rounded-2xl p-4 text-sm space-y-2">
          <p>
            <strong>Número de control:</strong>{' '}
            <span className="break-all">{invalidateTargetInvoice.controlNumber}</span>
          </p>

          <p>
            <strong>Código de generación:</strong>{' '}
            <span className="break-all">{invalidateTargetInvoice.generationCode}</span>
          </p>

          <p>
            <strong>Tipo de documento:</strong>{' '}
            {getDocumentShortName(
              invalidateTargetInvoice.documentTypeCode,
              invalidateTargetInvoice.documentTypeName
            )}
          </p>

          <p>
            <strong>Cliente:</strong>{' '}
            {invalidateTargetInvoice.customer?.name || 'Sin cliente'}
          </p>

          <p>
            <strong>Total:</strong>{' '}
            {formatMoney(invalidateTargetInvoice.total)}
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Motivo de anulación <span className="text-red-600">*</span>
          </label>

          <textarea
            value={invalidationReason}
            onChange={(event) => setInvalidationReason(event.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
            placeholder="Escriba el motivo de anulación"
            disabled={processingId}
          />
        </div>
      </div>

      <div className="border-t p-5 flex flex-col sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={closeInvalidateModal}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 border rounded-xl px-5 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={submitInvalidate}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 bg-slate-800 text-white rounded-xl px-5 py-3 font-semibold hover:bg-slate-900 disabled:opacity-70"
        >
          {processingId ? <Loader2 className="animate-spin" size={20} /> : <Ban size={20} />}
          Anular DTE
        </button>
      </div>
    </div>
  </div>
)}
{RETURN_EVENT_FEATURE_ENABLED && returnModalOpen && returnTargetInvoice && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            Generar Evento de Retorno
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            El evento se generará tomando como base los ítems del DTE aceptado relacionado.
          </p>
        </div>

        <button
          type="button"
          onClick={closeReturnModal}
          disabled={processingId}
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-70"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-sm text-orange-900 flex gap-3">
          <AlertTriangle className="shrink-0" size={22} />
          <div>
            <p className="font-semibold">
              Revise que el retorno corresponda al documento relacionado.
            </p>
            <p className="mt-1">
              Por defecto se retornan todos los ítems del DTE. En el backend también puede enviarse un arreglo items para retornos parciales.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 border rounded-2xl p-4 text-sm space-y-2">
          <p>
            <strong>Número de control:</strong>{' '}
            <span className="break-all">{returnTargetInvoice.controlNumber}</span>
          </p>

          <p>
            <strong>Código de generación:</strong>{' '}
            <span className="break-all">{returnTargetInvoice.generationCode}</span>
          </p>

          <p>
            <strong>Tipo de documento:</strong>{' '}
            {getDocumentShortName(returnTargetInvoice.documentTypeCode, returnTargetInvoice.documentTypeName)}
          </p>

          <p>
            <strong>Cliente:</strong>{' '}
            {returnTargetInvoice.customer?.name || 'Sin cliente'}
          </p>

          <p>
            <strong>Total base:</strong>{' '}
            {formatMoney(returnTargetInvoice.total)}
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Motivo del retorno <span className="text-red-600">*</span>
          </label>

          <textarea
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            rows={4}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
            placeholder="Escriba el motivo del Evento de Retorno"
            disabled={processingId}
          />
        </div>

        <label className="flex items-start gap-3 bg-gray-50 border rounded-xl p-3 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={returnTransmitNow}
            onChange={(event) => setReturnTransmitNow(event.target.checked)}
            disabled={processingId}
            className="mt-1"
          />
          <span>
            <strong>Transmitir inmediatamente a Hacienda.</strong>{' '}
            Si desmarca esta opción, el evento quedará en estado GENERADO para transmitirlo después desde backend.
          </span>
        </label>
      </div>

      <div className="border-t p-5 flex flex-col sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={closeReturnModal}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 border rounded-xl px-5 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={submitReturnEvent}
          disabled={processingId}
          className="inline-flex items-center justify-center gap-2 bg-orange-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-orange-800 disabled:opacity-70"
        >
          {processingId ? <Loader2 className="animate-spin" size={20} /> : <RefreshCcw size={20} />}
          {returnTransmitNow ? 'Generar y transmitir' : 'Generar evento'}
        </button>
      </div>
    </div>
  </div>
)}
            {jsonModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  {jsonModalTitle}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Vista previa del archivo JSON generado por el sistema.
                </p>
              </div>

              <button
                type="button"
                onClick={closeJsonModal}
                className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-auto">
              <pre className="bg-slate-950 text-slate-50 rounded-xl p-4 text-xs overflow-auto max-h-[60vh] whitespace-pre-wrap break-words">
                {jsonModalContent}
              </pre>
            </div>

            <div className="border-t p-5 flex flex-col sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={copyJsonToClipboard}
                className="inline-flex items-center justify-center gap-2 border rounded-xl px-5 py-3 text-gray-700 hover:bg-gray-50"
              >
                <Clipboard size={18} />
                Copiar JSON
              </button>

              <button
                type="button"
                onClick={closeJsonModal}
                className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-5 py-3 font-semibold hover:bg-blue-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  {pdfModalTitle}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Vista del PDF oficial generado por el sistema.
                </p>
              </div>

              <button
                type="button"
                onClick={closePdfModal}
                className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 bg-gray-100">
              {pdfModalUrl && (
                <iframe
                  title={pdfModalTitle}
                  src={pdfModalUrl}
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {emailModalOpen && emailTargetInvoice && (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h3 className="font-bold text-lg text-gray-900">
            Enviar DTE por correo
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Revise el destinatario, asunto, mensaje y archivos adjuntos antes de enviar.
          </p>
        </div>

        <button
          type="button"
          onClick={closeEmailModal}
          disabled={sendingEmail}
          className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-70"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-5 overflow-auto space-y-4">
        <div className="bg-gray-50 border rounded-2xl p-4 text-sm">
          <p className="font-semibold text-gray-900">
            {emailTargetInvoice.controlNumber}
          </p>
          <p className="text-gray-600">
            Cliente: {emailTargetInvoice.customer?.name || 'Sin cliente'}
          </p>
          <p className="text-gray-600">
            Estado: {emailTargetInvoice.status}
          </p>
          <p className="text-gray-600">
            Total: {formatMoney(emailTargetInvoice.total)}
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Destinatario <span className="text-red-600">*</span>
          </label>
          <input
            name="to"
            type="email"
            value={emailForm.to}
            onChange={handleEmailFormChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
            placeholder="cliente@correo.com"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Asunto <span className="text-red-600">*</span>
          </label>
          <input
            name="subject"
            value={emailForm.subject}
            onChange={handleEmailFormChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
            placeholder="Asunto del correo"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Mensaje <span className="text-red-600">*</span>
          </label>
          <textarea
            name="message"
            value={emailForm.message}
            onChange={handleEmailFormChange}
            rows={5}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 resize-none"
            placeholder="Mensaje para el cliente"
          />
        </div>

        <div className="border rounded-2xl p-4">
          <p className="font-semibold text-gray-900 mb-2">
            Archivos adjuntos
          </p>

          <ul className="space-y-2 text-sm text-gray-700">
            {getEmailAttachmentNames(emailTargetInvoice).map((attachment) => (
              <li
                key={attachment}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
              >
                <FileText size={16} className="text-blue-900" />
                {attachment}
              </li>
            ))}
          </ul>
        </div>

        {emailTargetInvoice.status === 'ANULADO' && (
          <div className="bg-slate-100 border border-slate-300 rounded-2xl p-4 text-sm text-slate-800">
            <p className="font-semibold">Documento anulado</p>
            <p>
              Se enviará el PDF/JSON original y el PDF/JSON de la anulación.
            </p>
          </div>
        )}
      </div>

      <div className="border-t p-5 flex flex-col sm:flex-row sm:justify-end gap-3">
        <button
          type="button"
          onClick={closeEmailModal}
          disabled={sendingEmail}
          className="inline-flex items-center justify-center gap-2 border rounded-xl px-5 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={submitEmail}
          disabled={sendingEmail}
          className="inline-flex items-center justify-center gap-2 bg-emerald-700 text-white rounded-xl px-5 py-3 font-semibold hover:bg-emerald-800 disabled:opacity-70"
        >
          {sendingEmail ? <Loader2 className="animate-spin" size={20} /> : <Mail size={20} />}
          Enviar correo
        </button>
      </div>
    </div>
  </div>
)}


      {(loadingDetail || selectedInvoice) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <h3 className="font-bold text-lg text-gray-900">
                  Detalle del DTE
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Información completa del documento, receptor, detalle, totales, estado e historial de correos.
                </p>
              </div>

              <button
                type="button"
                onClick={closeDetail}
                className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-auto">

          {loadingDetail && (
            <div className="text-center py-10">
              <Loader2 className="animate-spin mx-auto text-blue-900" size={30} />
              <p className="text-gray-500 mt-3">Cargando detalle...</p>
            </div>
          )}

          {selectedInvoice && !loadingDetail && (
            <div className="mt-4 space-y-5">
              <div>
                <p className="text-xs text-gray-500">Número de control</p>
                <p className="font-semibold text-gray-900 break-all">
                  {selectedInvoice.controlNumber}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500">Código de generación</p>
                <p className="font-semibold text-gray-900 break-all">
                  {selectedInvoice.generationCode}
                </p>
              </div>

              {selectedInvoice.receptionSeal && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-900">
                  <p className="font-semibold">Sello de recepción</p>
                  <p className="break-all">
                    {selectedInvoice.receptionSeal}
                  </p>
                </div>
              )}

              {RETURN_EVENT_FEATURE_ENABLED && selectedInvoice.returnEvent && (
              <div className={`border rounded-xl p-3 text-sm ${
                  selectedInvoice.returnEvent.status === 'ACEPTADO'
                    ? 'bg-orange-50 border-orange-200 text-orange-900'
                    : selectedInvoice.returnEvent.status === 'RECHAZADO'
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-gray-50 border-gray-200 text-gray-800'
                }`}>
                  <p className="font-semibold">Evento de Retorno</p>
                  <p><strong>Estado:</strong> {selectedInvoice.returnEvent.status}</p>
                  <p className="break-all"><strong>Código:</strong> {selectedInvoice.returnEvent.generationCode}</p>
                  {selectedInvoice.returnEvent.receptionSeal && (
                    <p className="break-all"><strong>Sello:</strong> {selectedInvoice.returnEvent.receptionSeal}</p>
                  )}
                  {selectedInvoice.returnEvent.rejectionReason && (
                    <p><strong>Motivo:</strong> {selectedInvoice.returnEvent.rejectionReason}</p>
                  )}
                </div>
              )}

              {(selectedInvoice.status === 'RECHAZADO' || (
                selectedInvoice.status === 'GENERADO' &&
                selectedInvoice.validationStatus === 'ERROR'
              )) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900">
                  <p className="font-semibold">
                    {selectedInvoice.status === 'RECHAZADO'
                      ? 'Motivo de rechazo'
                      : 'Corrección requerida antes de transmitir'}
                  </p>
                  <p>
                    {selectedInvoice.rejectionReason || 'Sin motivo registrado'}
                  </p>
                </div>
              )}

              {selectedInvoice.status === 'FIRMADO' && selectedInvoice.validationStatus === 'ERROR' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
                  <p className="font-semibold">Resultado pendiente de verificar</p>
                  <p>
                    {selectedInvoice.rejectionReason || 'No se pudo confirmar la respuesta de Hacienda.'}
                  </p>
                  <p className="mt-1">
                    No lo reenvíe hasta consultar su estado en Hacienda.
                  </p>
                </div>
              )}

              {selectedInvoice.status === 'ANULADO' && (
                <div className="bg-slate-100 border border-slate-300 rounded-xl p-3 text-sm text-slate-800">
                  <p className="font-semibold">Anulación del DTE</p>

                  {selectedInvoice.invalidatedAt && (
                    <p>
                      <strong>Fecha:</strong> {formatDate(selectedInvoice.invalidatedAt)}
                    </p>
                  )}

                  {selectedInvoice.invalidationReason && (
                    <p>
                      <strong>Motivo:</strong> {selectedInvoice.invalidationReason}
                    </p>
                  )}

                  {selectedInvoice.invalidationGenerationCode && (
                    <p className="break-all">
                      <strong>Código generación anulación:</strong> {selectedInvoice.invalidationGenerationCode}
                    </p>
                  )}

                  {selectedInvoice.invalidationReceptionSeal && (
                    <p className="break-all">
                      <strong>Sello anulación:</strong> {selectedInvoice.invalidationReceptionSeal}
                    </p>
                  )}
                </div>
              )}

              {selectedInvoice.documentTypeCode === '05' && selectedInvoice.relatedControlNumber && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-900">
                  <p className="font-semibold">Nota de Crédito relacionada</p>
                  <p className="break-all">
                    CCF relacionado: <strong>{selectedInvoice.relatedControlNumber}</strong>
                  </p>

                  {selectedInvoice.relatedGenerationCode && (
                    <p className="break-all mt-1">
                      Código relacionado: <strong>{selectedInvoice.relatedGenerationCode}</strong>
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Estado</p>
                  <span
                    className={`inline-flex items-center mt-1 rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(selectedInvoice.status)}`}
                  >
                    {selectedInvoice.status}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Fecha emisión</p>
                  <p className="font-medium text-gray-900">
                    {formatDate(selectedInvoice.issuedAt)}
                  </p>
                </div>

                {selectedInvoice.transmittedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Fecha transmisión</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedInvoice.transmittedAt)}
                    </p>
                  </div>
                )}

                {selectedInvoice.acceptedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Fecha aceptación</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedInvoice.acceptedAt)}
                    </p>
                  </div>
                )}

                {selectedInvoice.rejectedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Fecha rechazo</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedInvoice.rejectedAt)}
                    </p>
                  </div>
                )}

                {selectedInvoice.invalidatedAt && (
                  <div>
                    <p className="text-xs text-gray-500">Fecha anulación</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedInvoice.invalidatedAt)}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500">Tipo</p>
                  <p className="font-medium text-gray-900">
                    {getDocumentShortName(selectedInvoice.documentTypeCode, selectedInvoice.documentTypeName)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Punto venta</p>
                  <p className="font-medium text-gray-900">
                    {selectedInvoice.pointOfSale?.code}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500">Cliente</p>
                <p className="font-medium text-gray-900">
                  {selectedInvoice.customer?.name || 'Sin cliente'}
                </p>
                {selectedInvoice.customer?.nrc && (
                  <p className="text-sm text-gray-500">
                    NRC: {selectedInvoice.customer.nrc}
                  </p>
                )}
              </div>

              <div className="border-t pt-4">
                <p className="font-semibold text-gray-900 mb-3">
                  Detalle
                </p>

                <div className="space-y-3">
                  {selectedInvoice.items?.map((item) => (
                    <div key={item.id} className="border rounded-xl p-3">
                      <p className="font-medium text-gray-900">
                        {item.code} - {item.description}
                      </p>

                      <div className="mt-2 text-xs text-gray-600 space-y-1">
                        <p>Cantidad: {Number(item.quantity)}</p>
                        <p>Precio: {formatMoney(item.unitPrice)}</p>
                        {item.saleType && (
                          <p>Tipo venta: {item.saleType}</p>
                        )}

                        {renderFiscalAmounts(item, Boolean(selectedInvoice.company?.usesFuelTaxes))}

                        <p className="font-semibold text-gray-900">
                          Total: {formatMoney(item.total)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-2 text-sm">
                {Number(selectedInvoice.noSuj || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">No sujeta</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.noSuj)}</span>
                  </div>
                )}

                {Number(selectedInvoice.exenta || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Exenta</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.exenta)}</span>
                  </div>
                )}

                {Number(selectedInvoice.gravada || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Gravada</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.gravada)}</span>
                  </div>
                )}

                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">{formatMoney(selectedInvoice.subtotal)}</span>
                </div>

                {Number(selectedInvoice.iva || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">IVA</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.iva)}</span>
                  </div>
                )}

                {Number(selectedInvoice.retention1 || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Retención 1%</span>
                    <span className="font-semibold text-red-700">
                      -{formatMoney(selectedInvoice.retention1)}
                    </span>
                  </div>
                )}

                {Boolean(selectedInvoice.company?.usesFuelTaxes) && Number(selectedInvoice.fovial || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">FOVIAL</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.fovial)}</span>
                  </div>
                )}

                {Boolean(selectedInvoice.company?.usesFuelTaxes) && Number(selectedInvoice.cotrans || 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">COTRANS</span>
                    <span className="font-semibold">{formatMoney(selectedInvoice.cotrans)}</span>
                  </div>
                )}

                <div className="border-t pt-2 flex justify-between gap-4 text-lg">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-blue-900">
                    {formatMoney(selectedInvoice.total)}
                  </span>
                </div>
              </div>
<div className="border-t pt-4">
  <div className="flex items-center justify-between gap-3 mb-3">
    <p className="font-semibold text-gray-900">
      Historial de correos
    </p>

    <button
      type="button"
      onClick={() => loadEmailLogs(selectedInvoice.id)}
      disabled={loadingEmailLogs}
      className="inline-flex items-center justify-center gap-2 border rounded-xl px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-70"
    >
      {loadingEmailLogs ? (
        <Loader2 className="animate-spin" size={14} />
      ) : (
        <RefreshCcw size={14} />
      )}
      Actualizar
    </button>
  </div>

  {loadingEmailLogs && (
    <div className="text-center py-5">
      <Loader2 className="animate-spin mx-auto text-blue-900" size={24} />
      <p className="text-sm text-gray-500 mt-2">
        Cargando historial...
      </p>
    </div>
  )}

  {!loadingEmailLogs && emailLogs.length === 0 && (
    <div className="bg-gray-50 border rounded-xl p-3 text-sm text-gray-500">
      Aún no hay correos registrados para este DTE.
    </div>
  )}

  {!loadingEmailLogs && emailLogs.length > 0 && (
    <div className="space-y-3">
      {emailLogs.map((log) => (
        <article
          key={log.id}
          className={`border rounded-xl p-3 text-sm ${
            log.status === 'ENVIADO'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`font-semibold ${
                log.status === 'ENVIADO'
                  ? 'text-green-900'
                  : 'text-red-900'
              }`}>
                {log.status === 'ENVIADO' ? 'Correo enviado' : 'Error al enviar'}
              </p>

              <p className="text-gray-700 mt-1 break-all">
                Para: <strong>{log.toEmail}</strong>
              </p>

              <p className="text-gray-700 break-all">
                Asunto: {log.subject}
              </p>

              {log.senderUsername && (
                <p className="text-gray-600 text-xs mt-1">
                  Usuario: {log.senderUsername}
                </p>
              )}

              <p className="text-gray-600 text-xs mt-1">
                Fecha: {formatDate(log.sentAt || log.createdAt)}
              </p>
            </div>

            <span className={`text-xs rounded-full px-2 py-1 font-semibold ${
              log.status === 'ENVIADO'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {log.status}
            </span>
          </div>

          {log.providerMessageId && (
            <p className="text-xs text-gray-600 mt-2 break-all">
              ID proveedor: {log.providerMessageId}
            </p>
          )}

          {log.errorMessage && (
            <div className="mt-2 bg-white border border-red-200 rounded-xl p-2 text-xs text-red-800">
              {log.errorMessage}
            </div>
          )}

          {renderEmailLogAttachments(log.attachmentsJson)}
        </article>
      ))}
    </div>
  )}
</div>
              <button
                type="button"
                onClick={closeDetail}
                className="w-full bg-gray-100 text-gray-700 rounded-xl px-4 py-3 font-semibold hover:bg-gray-200"
              >
                Cerrar detalle
              </button>
            </div>
          )}
        
            </div>
          </div>
        </div>
      )}

      <section className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
            <FileText className="text-white" size={26} />
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Documentos emitidos
            </h2>
            <p className="text-gray-600 mt-1">
              Consulte DTE del mes actual o de períodos anteriores mediante el filtro de fechas.
            </p>
          </div>
        </div>

        <button
          onClick={() => loadInvoices()}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

      {generatedCount > 0 && (
        <section className="mb-6 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-900 flex gap-3">
          <AlertTriangle className="shrink-0" size={20} />
          <div>
            <p className="font-semibold">
              Hay {generatedCount} documento(s) generado(s) pendiente(s) de transmitir.
            </p>
            <p>
              Se mantendrán en estado GENERADO hasta que sean transmitidos o rechazados.
            </p>
          </div>
        </section>
      )}

      {acceptedCount > 0 && (
        <section className="mb-6 bg-green-50 border border-green-200 rounded-2xl p-4 text-sm text-green-900 flex gap-3">
          <CheckCircle2 className="shrink-0" size={20} />
          <div>
            <p className="font-semibold">
              Hay {acceptedCount} documento(s) aceptado(s) por Hacienda.
            </p>
            <p>
              Puede enviarlos por correo o anularlos cuando corresponda.
            </p>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <div className="grid lg:grid-cols-[1fr_180px_240px] gap-3 mb-5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="w-full border border-gray-300 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Buscar por cliente, control, generación, sello o motivo"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
            >
            <option value="">Todos los estados</option>
            <option value="GENERADO">Generado</option>
            <option value="ACEPTADO">Aceptado</option>
            <option value="ANULADO">Anulado</option>
            </select>

            <select
              value={documentTypeFilter}
              onChange={(event) => setDocumentTypeFilter(event.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800 bg-white"
            >
              <option value="">Todos los tipos</option>
              <option value="01">Factura de Consumidor Final</option>
              <option value="03">Comprobante Crédito Fiscal</option>
              <option value="05">Nota de Crédito</option>
              <option value="11">Factura de Exportación</option>
              <option value="14">Factura de Sujeto Excluido</option>
            </select>
          </div>

          <div className="grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 mb-5">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">
                Fecha inicial
              </span>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(event) => setDateRange((current) => ({
                  ...current,
                  startDate: event.target.value
                }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
              />
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">
                Fecha final
              </span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(event) => setDateRange((current) => ({
                  ...current,
                  endDate: event.target.value
                }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
              />
            </label>

            <button
              type="button"
              onClick={applyDateRange}
              disabled={loading}
              className="self-end inline-flex items-center justify-center gap-2 bg-blue-900 text-white rounded-xl px-4 py-3 font-semibold hover:bg-blue-800 disabled:opacity-70"
            >
              Buscar fechas
            </button>

            <button
              type="button"
              onClick={resetToCurrentMonth}
              disabled={loading}
              className="self-end inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50 disabled:opacity-70"
            >
              Mes actual
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-5">
            Período consultado: {appliedDateRange.startDate} al {appliedDateRange.endDate}
          </p>

          {loading ? (
            <div className="text-center py-10">
              <Loader2 className="animate-spin mx-auto text-blue-900" size={32} />
              <p className="text-gray-500 mt-3">Cargando documentos...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No hay documentos con los filtros aplicados.
                </p>
              )}

              {paginatedInvoices.map((invoice) => (
                <article
                  key={invoice.id}
                  className="border rounded-xl p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-gray-900 break-all">
                            {invoice.controlNumber}
                          </h3>

                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(invoice.status)}`}
                          >
                            {invoice.status}
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mt-1">
                          {getDocumentShortName(invoice.documentTypeCode, invoice.documentTypeName)}
                        </p>

                        <p className="text-sm text-gray-500 mt-1">
                          Cliente: {invoice.customer?.name || 'Sin cliente'}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          Fecha emisión: {formatDate(invoice.issuedAt)}
                        </p>

                        <p className="text-xs text-gray-500 mt-1 break-all">
                          Código generación: {invoice.generationCode}
                        </p>

                        {invoice.status === 'GENERADO' && invoice.validationStatus === 'ERROR' && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-900">
                            <p className="font-semibold">Corrección requerida</p>
                            <p>
                              Hacienda o el sistema reportó una observación. Edite el DTE, corrija los datos y vuelva a transmitirlo.
                            </p>
                            {invoice.rejectionReason && (
                              <p className="mt-1 break-words">
                                <strong>Detalle:</strong> {invoice.rejectionReason}
                              </p>
                            )}
                          </div>
                        )}

                        {invoice.status === 'GENERADO' && invoice.validationStatus !== 'ERROR' && (
                          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-900">
                            <p className="font-semibold">Pendiente de transmisión</p>
                            <p>
                              Este DTE está generado, pero aún no ha sido transmitido a Hacienda.
                            </p>
                          </div>
                        )}

                        {invoice.status === 'FIRMADO' && invoice.validationStatus === 'ERROR' && (
                          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900">
                            <p className="font-semibold">Pendiente de verificar</p>
                            <p>
                              No se pudo confirmar la respuesta de Hacienda. No reenvíe el DTE hasta verificar su estado.
                            </p>
                          </div>
                        )}

                        {invoice.status === 'ACEPTADO' && invoice.receptionSeal && (
                          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-900">
                            <p className="font-semibold flex items-center gap-1">
                              <CheckCircle2 size={14} />
                              Aceptado por Hacienda
                            </p>
                            <p className="break-all">
                              Sello: <strong>{invoice.receptionSeal}</strong>
                            </p>
                            {invoice.acceptedAt && (
                              <p>Fecha aceptación: {formatDate(invoice.acceptedAt)}</p>
                            )}
                          </div>
                        )}

                        {invoice.status === 'RECHAZADO' && (
                          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-900">
                            <p className="font-semibold">Rechazado por Hacienda</p>
                            <p>
                              {invoice.rejectionReason || 'Sin motivo de rechazo registrado'}
                            </p>
                          </div>
                        )}

                        {invoice.status === 'ANULADO' && (
                          <div className="mt-3 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800">
                            <p className="font-semibold flex items-center gap-1">
                              <Ban size={14} />
                              DTE anulado
                            </p>
                            <p>
                              {invoice.invalidationReason || 'Sin motivo de anulación registrado'}
                            </p>
                            {invoice.invalidationReceptionSeal && (
                              <p className="break-all">
                                Sello anulación: <strong>{invoice.invalidationReceptionSeal}</strong>
                              </p>
                            )}
                          </div>
                        )}

                        {invoice.documentTypeCode === '05' && invoice.relatedControlNumber && (
                          <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-900">
                            <p className="font-semibold">Nota de Crédito relacionada</p>
                            <p className="break-all">
                              CCF relacionado: <strong>{invoice.relatedControlNumber}</strong>
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="text-left xl:text-right shrink-0">
                        <p className="text-lg font-bold text-blue-900">
                          {formatMoney(invoice.total)}
                        </p>

                        <p className="text-xs text-gray-500">
                          {invoice.pointOfSale?.code} - {invoice.pointOfSale?.name}
                        </p>

                        <div className="mt-2 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => viewDetail(invoice.id)}
                            className="inline-flex items-center justify-center gap-2 border rounded-xl px-4 py-2 text-gray-700 hover:bg-white"
                          >
                            <Eye size={17} />
                            Ver detalle
                          </button>

                          {['GENERADO', 'RECHAZADO'].includes(invoice.status) && (
                            <button
                              type="button"
                              onClick={() => navigate(`/invoices/generate?edit=${invoice.id}`)}
                              className="inline-flex items-center justify-center gap-2 border border-blue-200 bg-blue-50 text-blue-800 rounded-xl px-4 py-2 hover:bg-blue-100"
                            >
                              <PencilLine size={17} />
                              Editar DTE
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-1">
                      {renderActionButtons(invoice)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && filteredInvoices.length > 0 && (
            <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t pt-4">
              <p className="text-sm text-gray-600">
                Mostrando {showingFrom}–{showingTo} de {filteredInvoices.length} documento(s)
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={visiblePage === 1}
                  className="border rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>

                <span className="text-sm text-gray-600 px-2">
                  Página {visiblePage} de {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={visiblePage === totalPages}
                  className="border rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>


      </section>
    </div>
  );
}

export default InvoicesPage;