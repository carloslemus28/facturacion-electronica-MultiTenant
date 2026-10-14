import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessFiscalModule } from '../utils/fiscal-navigation.mjs';
export default function FiscalModuleRoute({ module, children }) {
  const { user, loadingAuth } = useAuth();
  if (loadingAuth) return null;
  return canAccessFiscalModule(user, module) ? children : <Navigate to="/dashboard" replace />;
}
