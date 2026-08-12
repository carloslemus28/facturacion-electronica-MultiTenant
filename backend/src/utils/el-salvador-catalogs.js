const DEPARTMENT_CODES = new Set([
  '00', '01', '02', '03', '04', '05', '06', '07',
  '08', '09', '10', '11', '12', '13', '14'
]);

// CAT-013 Municipio - Catálogos Sistema de Transmisión, versión 1.2 (10/2025).
// El catálogo asigna códigos de 2 dígitos por departamento; por eso el mismo
// código puede existir en departamentos distintos.
const MUNICIPALITY_CODE_BY_NAME = Object.freeze({
  'AHUACHAPAN NORTE': '13',
  'AHUACHAPAN CENTRO': '14',
  'AHUACHAPAN SUR': '15',
  'SANTA ANA NORTE': '14',
  'SANTA ANA CENTRO': '15',
  'SANTA ANA ESTE': '16',
  'SANTA ANA OESTE': '17',
  'SONSONATE NORTE': '17',
  'SONSONATE CENTRO': '18',
  'SONSONATE ESTE': '19',
  'SONSONATE OESTE': '20',
  'CHALATENANGO NORTE': '34',
  'CHALATENANGO CENTRO': '35',
  'CHALATENANGO SUR': '36',
  'LA LIBERTAD NORTE': '23',
  'LA LIBERTAD CENTRO': '24',
  'LA LIBERTAD OESTE': '25',
  'LA LIBERTAD ESTE': '26',
  'LA LIBERTAD COSTA': '27',
  'LA LIBERTAD SUR': '28',
  'SAN SALVADOR NORTE': '20',
  'SAN SALVADOR OESTE': '21',
  'SAN SALVADOR ESTE': '22',
  'SAN SALVADOR CENTRO': '23',
  'SAN SALVADOR SUR': '24',
  'CUSCATLAN NORTE': '17',
  'CUSCATLAN SUR': '18',
  'LA PAZ OESTE': '23',
  'LA PAZ CENTRO': '24',
  'LA PAZ ESTE': '25',
  'CABANAS OESTE': '10',
  'CABANAS ESTE': '11',
  'SAN VICENTE NORTE': '14',
  'SAN VICENTE SUR': '15',
  'USULUTAN NORTE': '24',
  'USULUTAN ESTE': '25',
  'USULUTAN OESTE': '26',
  'SAN MIGUEL NORTE': '21',
  'SAN MIGUEL CENTRO': '22',
  'SAN MIGUEL OESTE': '23',
  'MORAZAN NORTE': '27',
  'MORAZAN SUR': '28',
  'LA UNION NORTE': '19',
  'LA UNION SUR': '20'
});

// Compatibilidad con los códigos de 4 dígitos que utilizaba el catálogo
// territorial del frontend antes de adoptar CAT-013 para los DTE.
const LEGACY_MUNICIPALITY_CODE_MAP = Object.freeze({
  '0101': '14', '0102': '13', '0103': '15',
  '0201': '15', '0202': '16', '0203': '14', '0204': '17',
  '0301': '18', '0302': '19', '0303': '17', '0304': '20',
  '0401': '35', '0402': '34', '0403': '36',
  '0501': '24', '0502': '27', '0503': '26', '0504': '23', '0505': '25', '0506': '28',
  '0601': '23', '0602': '22', '0603': '20', '0604': '21', '0605': '24',
  '0701': '17', '0702': '18',
  '0801': '24', '0802': '25', '0803': '23',
  '0901': '11', '0902': '10',
  '1001': '14', '1002': '15',
  '1101': '25', '1102': '24', '1103': '26',
  '1201': '22', '1202': '21', '1203': '23',
  '1301': '27', '1302': '28',
  '1401': '19', '1402': '20'
});

const normalizeCatalogName = (value) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const normalizeDepartmentCatalogCode = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;

  const code = digits.padStart(2, '0').slice(-2);
  return DEPARTMENT_CODES.has(code) ? code : null;
};

const normalizeMunicipalityCatalogCode = ({ municipalityCode, municipalityName } = {}) => {
  const byName = MUNICIPALITY_CODE_BY_NAME[normalizeCatalogName(municipalityName)];
  if (byName) return byName;

  const digits = String(municipalityCode ?? '').replace(/\D/g, '');
  if (!digits) return null;

  if (LEGACY_MUNICIPALITY_CODE_MAP[digits]) {
    return LEGACY_MUNICIPALITY_CODE_MAP[digits];
  }

  // Los códigos vigentes de CAT-013 tienen dos dígitos. Si el registro ya
  // está actualizado, se conserva sin transformaciones adicionales.
  if (digits.length <= 2) {
    return digits.padStart(2, '0');
  }

  return digits.slice(-2);
};

module.exports = {
  MUNICIPALITY_CODE_BY_NAME,
  LEGACY_MUNICIPALITY_CODE_MAP,
  normalizeCatalogName,
  normalizeDepartmentCatalogCode,
  normalizeMunicipalityCatalogCode
};
