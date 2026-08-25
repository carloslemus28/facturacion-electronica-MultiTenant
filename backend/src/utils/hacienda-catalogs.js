// Catálogos - Facturación Electrónica v1.1 (07/2026), Ministerio de Hacienda.
// Esta utilidad centraliza únicamente normalizaciones que afectan el JSON DTE.

const CAT014_UNIT_OF_MEASURE = Object.freeze({
  '1': 'metro',
  '2': 'Yarda',
  '6': 'milímetro',
  '9': 'kilómetro cuadrado',
  '10': 'Hectárea',
  '13': 'metro cuadrado',
  '15': 'Vara cuadrada',
  '18': 'metro cúbico',
  '20': 'Barril',
  '22': 'Galón',
  '23': 'Litro',
  '24': 'Botella',
  '26': 'Mililitro',
  '30': 'Tonelada',
  '32': 'Quintal',
  '33': 'Arroba',
  '34': 'Kilogramo',
  '36': 'Libra',
  '37': 'Onza troy',
  '38': 'Onza',
  '39': 'Gramo',
  '40': 'Miligramo',
  '42': 'Megawatt',
  '43': 'Kilowatt',
  '44': 'Watt',
  '45': 'Megavoltio-amperio',
  '46': 'Kilovoltio-amperio',
  '47': 'Voltio-amperio',
  '49': 'Gigawatt-hora',
  '50': 'Megawatt-hora',
  '51': 'Kilowatt-hora',
  '52': 'Watt-hora',
  '53': 'Kilovoltio',
  '54': 'Voltio',
  '55': 'Millar',
  '56': 'Medio millar',
  '57': 'Ciento',
  '58': 'Docena',
  '59': 'Unidad',
  '99': 'Otra'
});

const CAT014_UNIT_CODE_BY_NAME = Object.freeze({
  'METRO': '1',
  'YARDA': '2',
  'MILIMETRO': '6',
  'KILOMETRO CUADRADO': '9',
  'HECTAREA': '10',
  'METRO CUADRADO': '13',
  'VARA CUADRADA': '15',
  'METRO CUBICO': '18',
  'BARRIL': '20',
  'GALON': '22',
  'LITRO': '23',
  'BOTELLA': '24',
  'MILILITRO': '26',
  'TONELADA': '30',
  'QUINTAL': '32',
  'ARROBA': '33',
  'KILOGRAMO': '34',
  'LIBRA': '36',
  'ONZA TROY': '37',
  'ONZA': '38',
  'GRAMO': '39',
  'MILIGRAMO': '40',
  'MEGAWATT': '42',
  'KILOWATT': '43',
  'WATT': '44',
  'MEGAVOLTIO-AMPERIO': '45',
  'KILOVOLTIO-AMPERIO': '46',
  'VOLTIO-AMPERIO': '47',
  'GIGAWATT-HORA': '49',
  'MEGAWATT-HORA': '50',
  'KILOWATT-HORA': '51',
  'WATT-HORA': '52',
  'KILOVOLTIO': '53',
  'VOLTIO': '54',
  'MILLAR': '55',
  'MEDIO MILLAR': '56',
  'CIENTO': '57',
  'DOCENA': '58',
  'UNIDAD': '59',
  'OTRA': '99',
  'OTRO': '99',
  'SERVICIO': '99',
  'HORA': '99'
});

const CAT027_FISCAL_PRECINCTS = Object.freeze({
  '01': 'Terrestre San Bartolo',
  '02': 'Marítima de Acajutla',
  '03': 'Aérea De Comalapa',
  '04': 'Terrestre Las Chinamas',
  '05': 'Terrestre La Hachadura',
  '06': 'Terrestre Santa Ana',
  '07': 'Terrestre San Cristóbal',
  '08': 'Terrestre Anguiatú',
  '09': 'Terrestre El Amatillo',
  '10': 'Marítima La Unión',
  '11': 'Terrestre El Poy',
  '12': 'Terrestre Metalío',
  '15': 'Fardos Postales',
  '16': 'Z.F. San Marcos',
  '17': 'Z.F. El Pedregal',
  '18': 'Z.F. San Bartolo',
  '20': 'Z.F. Exportsalva',
  '21': 'Z.F. American Park',
  '23': 'Z.F. Internacional',
  '24': 'Z.F. Diez',
  '26': 'Z.F. Miramar',
  '27': 'Z.F. Santo Tomas',
  '28': 'Z.F. Santa Tecla',
  '29': 'Z.F. Santa Ana',
  '30': 'Z.F. La Concordia',
  '31': 'Aérea Ilopango',
  '32': 'Z.F. Pipil',
  '33': 'Puerto Barillas',
  '34': 'Z.F. Calvo Conservas',
  '35': 'Feria Internacional',
  '36': 'Aduana El Papalón',
  '37': 'Z.F. Sam-Li',
  '38': 'Z.F. San José',
  '39': 'Z.F. Las Mercedes',
  '40': 'Z.F. EMCO',
  '41': 'Z.F. Gigante',
  '42': 'Z.F. NOVABES',
  '43': 'Z.F. INHDELVA',
  '71': 'Aldesa',
  '72': 'Agdosa Merliot',
  '73': 'Bodesa',
  '76': 'Delegacion DHL',
  '77': 'Transauto',
  '80': 'Nejapa',
  '81': 'Almaconsa',
  '83': 'Agdosa Apopa',
  '85': 'Gutiérrez Courier Y Cargo',
  '99': 'San Bartolo Envío Hn/Gt'
});

const normalizeCatalogText = (value) => String(value || '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();

const normalizeUnitOfMeasureCode = ({ code, name } = {}) => {
  const normalizedName = normalizeCatalogText(name);
  const byName = CAT014_UNIT_CODE_BY_NAME[normalizedName];

  if (byName) return Number(byName);

  const digits = String(code ?? '').replace(/\D/g, '');
  if (!digits) return 59;

  // Compatibilidad con el catálogo legado usado por el sistema: 08 se
  // almacenó históricamente como Galón. CAT-014 v1.1 define Galón = 22.
  if (digits === '8' || digits === '08') return 22;

  const normalizedCode = String(Number(digits));
  if (Object.prototype.hasOwnProperty.call(CAT014_UNIT_OF_MEASURE, normalizedCode)) {
    return Number(normalizedCode);
  }

  // Un código no catalogado no debe llegar a Hacienda; 99 = Otra.
  return 99;
};

const normalizeFiscalPrecinctCode = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const digits = text.replace(/\D/g, '');
  if (!digits) return null;

  const code = digits.padStart(2, '0');
  return Object.prototype.hasOwnProperty.call(CAT027_FISCAL_PRECINCTS, code)
    ? code
    : null;
};

module.exports = {
  CAT014_UNIT_OF_MEASURE,
  CAT027_FISCAL_PRECINCTS,
  normalizeUnitOfMeasureCode,
  normalizeFiscalPrecinctCode
};
