import { Navigate, Route, Routes } from 'react-router-dom';

import LoginPage from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
import CompanySettingsPage from '../pages/CompanySettingsPage';
import TechnicalUsersPage from '../pages/TechnicalUsersPage';
import ControlNumbersPage from '../pages/ControlNumbersPage';
import CustomersPage from '../pages/CustomersPage';
import ProductsPage from '../pages/ProductsPage';
import GenerateInvoicePage from '../pages/GenerateInvoicePage';
import InvoicesPage from '../pages/InvoicesPage';
import ReportsPage from '../pages/ReportsPage';
import DataMigrationPage from '../pages/DataMigrationPage';

import ProtectedRoute from './ProtectedRoute';
import PermissionRoute from './PermissionRoute';
import AppLayout from '../layouts/AppLayout';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/invoices/generate" element={<GenerateInvoicePage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          <Route element={<PermissionRoute permission="COMPANIES_MANAGE" />}>
            <Route path="/company" element={<CompanySettingsPage />} />
            <Route path="/control-numbers" element={<ControlNumbersPage />} />
            <Route path="/data-migration" element={<DataMigrationPage />} />
          </Route>

          <Route element={<PermissionRoute permission="USERS_MANAGE" />}>
            <Route path="/technical-users" element={<TechnicalUsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default AppRoutes;