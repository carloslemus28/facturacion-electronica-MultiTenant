import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { loginRequest, logoutRequest, refreshRequest, meRequest } from '../api/auth.api';
import { tokenStore } from '../api/tokenStore';
import { tenantStore } from '../api/tenantStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessTokenState] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const authVersionRef = useRef(0);
  const isAuthenticated = Boolean(user && accessToken);

  const setAccessToken = (token) => {
    setAccessTokenState(token);
    tokenStore.setAccessToken(token);
  };

  const syncTenant = (nextUser) => {
    if (nextUser?.company?.id) tenantStore.setCompanyId(nextUser.company.id);
  };

  const clearSession = () => {
    setUser(null);
    setAccessTokenState(null);
    tokenStore.clearAccessToken();
    tenantStore.clearCompanyId();
  };

  const login = async ({ username, password }) => {
    authVersionRef.current += 1;
    const data = await loginRequest({ username, password });
    syncTenant(data.user);
    setUser(data.user);
    setAccessToken(data.accessToken);
    setLoadingAuth(false);
    toast.success('Inicio de sesión correcto');
    return data;
  };

  const logout = async () => {
    try {
      await logoutRequest();
    } catch (error) {
      console.error('Error cerrando sesión:', error);
    } finally {
      clearSession();
      toast.success('Sesión cerrada correctamente');
    }
  };

  const refreshSession = async () => {
    try {
      const data = await refreshRequest();
      syncTenant(data.user);
      setUser(data.user);
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch (error) {
      clearSession();
      return null;
    }
  };

  const selectCompany = (companyId) => {
    if (!user?.roles?.includes('ADMIN')) return;
    tenantStore.setCompanyId(companyId);
    window.location.reload();
  };

  const validateSession = async () => {
    const validationVersion = authVersionRef.current;
    try {
      const data = await refreshRequest();
      if (validationVersion !== authVersionRef.current) return;
      syncTenant(data.user);
      setUser(data.user);
      setAccessToken(data.accessToken);
      await meRequest();
    } catch (error) {
      if (validationVersion !== authVersionRef.current) return;
      clearSession();
    } finally {
      if (validationVersion === authVersionRef.current) setLoadingAuth(false);
    }
  };

  useEffect(() => { validateSession(); }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
      toast.error('Su sesión expiró. Inicie sesión nuevamente.');
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const value = useMemo(() => ({
    user,
    accessToken,
    loadingAuth,
    isAuthenticated,
    login,
    logout,
    refreshSession,
    selectCompany
  }), [user, accessToken, loadingAuth, isAuthenticated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
