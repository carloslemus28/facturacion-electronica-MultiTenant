const modules = {
  additional: ['additionalDocumentsEnabled', 'INVOICES_CREATE'],
  events: ['electronicEventsEnabled', 'INVOICES_VIEW']
};
export function canAccessFiscalModule(user, module) {
  const settings = modules[module];
  return Boolean(settings && user?.company?.[settings[0]] === true && user?.permissions?.includes(settings[1]));
}
