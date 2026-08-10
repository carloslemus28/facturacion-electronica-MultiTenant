import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PermissionRoute({ permission }) {
  const { user, loadingAuth } = useAuth();

  if (loadingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-2xl shadow-lg px-8 py-6 text-center">
          <p className="text-gray-700 font-medium">Verificando permisos...</p>
        </div>
      </main>
    );
  }

  const permissions = user?.permissions || [];

  if (!permissions.includes(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default PermissionRoute;