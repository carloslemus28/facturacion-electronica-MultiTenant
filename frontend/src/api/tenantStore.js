const TENANT_KEY = 'fesv.activeCompanyId';

export const tenantStore = {
  getCompanyId() {
    const value = window.localStorage.getItem(TENANT_KEY);
    return value && /^\d+$/.test(value) ? value : null;
  },

  setCompanyId(companyId) {
    if (!companyId) {
      window.localStorage.removeItem(TENANT_KEY);
      return;
    }
    window.localStorage.setItem(TENANT_KEY, String(companyId));
  },

  clearCompanyId() {
    window.localStorage.removeItem(TENANT_KEY);
  }
};
