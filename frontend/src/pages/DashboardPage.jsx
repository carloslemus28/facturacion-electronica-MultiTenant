import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCcw,
  Send
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { getDashboardSummaryRequest } from '../api/invoices.api';

function DashboardPage() {
  const { user } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    try {
      setLoading(true);

      const data = await getDashboardSummaryRequest();

      setSummary(data.summary);
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      toast.error('No se pudo cargar el resumen del dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

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

  const cards = [
    {
      title: 'DTE generados',
      value: summary?.generated || 0,
      description: 'Pendientes de firmar o transmitir',
      icon: Clock
    },
    {
      title: 'DTE aceptados',
      value: summary?.accepted || 0,
      description: 'Con sello de recepción',
      icon: CheckCircle2
    },
    {
      title: 'DTE anulados',
      value: summary?.annulled || 0,
      description: 'Documentos invalidados',
      icon: AlertTriangle
    },
    {
      title: 'Total facturado',
      value: formatMoney(summary?.totalAmount || 0),
      description: 'Monto total de documentos del mes',
      icon: FileText
    }
  ];

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
        <Loader2 className="animate-spin mx-auto text-blue-900" size={34} />
        <p className="text-gray-600 mt-3">Cargando dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <section className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
            Bienvenido, {user?.firstName}
          </h2>
          <p className="text-gray-600 mt-2">
            Panel inicial para controlar la emisión, transmisión y seguimiento de Documentos Tributarios Electrónicos.
          </p>
        </div>

        <button
          onClick={loadSummary}
          className="inline-flex items-center justify-center gap-2 bg-white border rounded-xl px-4 py-3 text-gray-700 hover:bg-gray-50"
        >
          <RefreshCcw size={18} />
          Actualizar
        </button>
      </section>

      <section className="flex flex-wrap justify-center gap-5">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.title}
              className="w-full sm:w-[calc(50%-0.625rem)] xl:w-[calc(33.333%-0.875rem)] max-w-sm bg-white rounded-2xl shadow-sm border p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-500">{card.title}</p>
                  <h3 className="text-3xl font-bold text-gray-900 mt-2">
                    {card.value}
                  </h3>
                  <p className="text-sm text-gray-500 mt-2">
                    {card.description}
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon className="text-blue-900" size={24} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid xl:grid-cols-[1fr_360px] gap-6 mt-8">
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="text-lg font-bold text-gray-900">
            Últimos documentos emitidos del mes
          </h3>

          <div className="mt-4 space-y-3">
            {summary?.recentInvoices?.length === 0 && (
              <p className="text-gray-500 text-sm">
                Todavía no hay documentos emitidos.
              </p>
            )}

            {summary?.recentInvoices?.map((invoice) => (
              <article
                key={invoice.id}
                className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {invoice.controlNumber}
                  </p>

                  <p className="text-sm text-gray-600">
                    {invoice.documentTypeName}
                  </p>

                  <p className="text-sm text-gray-500">
                    Cliente: {invoice.customer?.name || 'Sin cliente'}
                  </p>

                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(invoice.issuedAt)}
                  </p>
                </div>

                <div className="md:text-right">
                  <span className="inline-block text-xs bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full">
                    {invoice.status}
                  </span>

                  <p className="text-lg font-bold text-blue-900 mt-2">
                    {formatMoney(invoice.total)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="bg-white rounded-2xl border shadow-sm p-5 h-fit">
          <h3 className="text-lg font-bold text-gray-900">
            Resumen financiero del mes
          </h3>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Total documentos</span>
              <span className="font-semibold text-gray-900">
                {summary?.totalDocuments || 0}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Monto generado</span>
              <span className="font-semibold text-gray-900">
                {formatMoney(summary?.generatedAmount || 0)}
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Monto aceptado</span>
              <span className="font-semibold text-gray-900">
                {formatMoney(summary?.acceptedAmount || 0)}
              </span>
            </div>

            <div className="border-t pt-3 flex justify-between gap-4 text-lg">
              <span className="font-bold text-gray-900">Total general</span>
              <span className="font-bold text-blue-900">
                {formatMoney(summary?.totalAmount || 0)}
              </span>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default DashboardPage;