import { useState } from 'react';
import { Eye, EyeOff, FileText, Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [form, setForm] = useState({
    username: '',
    password: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.username.trim() || !form.password.trim()) {
      toast.error('Ingrese usuario y contraseña');
      return;
    }

    try {
      setLoading(true);

      await login({
        username: form.username.trim(),
        password: form.password
      });

      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Error de login:', error);

      const message = error.response?.data?.message || 'No se pudo iniciar sesión';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 flex items-center justify-center px-4">
      <section className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 md:p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-blue-900 rounded-2xl flex items-center justify-center mb-4">
            <FileText className="text-white" size={34} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Facturación C&amp;M
          </h1>

          <p className="text-gray-500 mt-2 text-sm">
            Ingrese sus credenciales para acceder al sistema.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
          autoComplete="off"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de usuario
            </label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-800"
              placeholder="Ingrese su usuario"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 outline-none focus:ring-2 focus:ring-blue-800"
                placeholder="Ingrese su contraseña"
                autoComplete="new-password"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-900 text-white rounded-xl py-3 font-semibold hover:bg-blue-800 transition disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" size={20} />}
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default LoginPage;