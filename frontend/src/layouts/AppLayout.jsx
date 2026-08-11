import {
  ArchiveRestore, Building2, Hash, FilePlus2, Files, FileSpreadsheet, FileText, LayoutDashboard,
  LogOut, Menu, PackagePlus, UserCircle, Users, UsersRound
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCompaniesRequest } from '../api/companies.api';
import { APP_NAME, APP_TAGLINE } from '../config/brand';

function AppLayout() {
  const { user, logout, selectCompany } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const userPermissions = user?.permissions || [];
  const hasPermission = (permission) => userPermissions.includes(permission);
  const canManageCompanies = hasPermission('COMPANIES_MANAGE');
  const canManageUsers = hasPermission('USERS_MANAGE');
  const isAdmin = user?.roles?.includes('ADMIN');

  useEffect(() => {
    if (!isAdmin) return;
    getCompaniesRequest()
      .then((data) => setCompanies(data.companies || []))
      .catch((error) => console.error('No se pudieron cargar contribuyentes:', error));
  }, [isAdmin]);

  const linkClass = ({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition ${isActive ? 'bg-blue-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="h-16 bg-white border-b flex items-center justify-between px-4 md:px-6 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-2 rounded-lg hover:bg-gray-100" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={22} /></button>
          <div className="w-10 h-10 bg-blue-900 rounded-xl flex items-center justify-center shrink-0"><FileText className="text-white" size={22} /></div>
          <div><h1 className="font-bold text-gray-900 leading-tight">{APP_NAME}</h1><p className="text-xs text-gray-500 hidden sm:block">{APP_TAGLINE}</p></div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && companies.length > 0 && (
            <select
              value={user?.company?.id || ''}
              onChange={(event) => selectCompany(event.target.value)}
              className="max-w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              title="Contribuyente activo"
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.commercialName || company.legalName} · {company.nit}
                </option>
              ))}
            </select>
          )}
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-700"><UserCircle size={20} /><span>{user?.firstName} {user?.lastName}</span></div>
          <button onClick={logout} className="inline-flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm hover:bg-red-100"><LogOut size={18} /><span className="hidden sm:inline">Salir</span></button>
        </div>
      </header>

      <aside className={`fixed top-16 left-0 z-30 w-72 h-[calc(100vh-4rem)] bg-white border-r p-4 overflow-y-auto transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <nav className="space-y-2 pb-8">
          <NavLink to="/dashboard" className={linkClass} onClick={() => setSidebarOpen(false)}><LayoutDashboard size={20} />Página Principal</NavLink>
          <NavLink to="/invoices/generate" className={linkClass} onClick={() => setSidebarOpen(false)}><FilePlus2 size={20} />Generar DTE</NavLink>
          <NavLink to="/invoices" end className={linkClass} onClick={() => setSidebarOpen(false)}><Files size={20} />Documentos emitidos</NavLink>
          <NavLink to="/reports" className={linkClass} onClick={() => setSidebarOpen(false)}><FileSpreadsheet size={20} />Reportes Excel</NavLink>
          <NavLink to="/customers" className={linkClass} onClick={() => setSidebarOpen(false)}><UsersRound size={20} />Clientes / Receptores</NavLink>
          <NavLink to="/products" className={linkClass} onClick={() => setSidebarOpen(false)}><PackagePlus size={20} />Productos / Servicios</NavLink>

          {(canManageCompanies || canManageUsers) && (
            <div className="pt-4 mt-4 border-t">
              <p className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Configuración técnica</p>
              {canManageCompanies && (
                <>
                  <NavLink to="/company" className={linkClass} onClick={() => setSidebarOpen(false)}><Building2 size={20} />Contribuyentes</NavLink>
                  <NavLink to="/control-numbers" className={linkClass} onClick={() => setSidebarOpen(false)}><Hash size={20} />Correlativos DTE</NavLink>
                  <NavLink to="/data-migration" className={linkClass} onClick={() => setSidebarOpen(false)}><ArchiveRestore size={20} />Migración de datos</NavLink>
                </>
              )}
              {canManageUsers && <NavLink to="/technical-users" className={linkClass} onClick={() => setSidebarOpen(false)}><Users size={20} />Usuarios y puntos de venta</NavLink>}
            </div>
          )}
        </nav>
      </aside>

      {sidebarOpen && <button className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <main className="md:ml-72 pt-24 px-4 pb-8 md:px-8 md:pb-10 min-h-screen"><Outlet /></main>
    </div>
  );
}

export default AppLayout;
