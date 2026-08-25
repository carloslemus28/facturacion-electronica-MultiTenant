const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'src', 'data');
const catalogsDir = path.join(__dirname, 'catalogs');

const economicActivitiesPath = path.join(catalogsDir, 'PMHDC9247_.xlsx');
const locationsPath = path.join(catalogsDir, 'catalogo-de-municipios-y-distritos.xlsx');

const locationsUrl = 'https://ssf.gob.sv/wp-content/uploads/2024/05/catalogo-de-municipios-y-distritos.xlsx';

const municipalityCodesCat013 = {
  'Ahuachapán Norte': '13',
  'Ahuachapán Centro': '14',
  'Ahuachapán Sur': '15',
  'Santa Ana Norte': '14',
  'Santa Ana Centro': '15',
  'Santa Ana Este': '16',
  'Santa Ana Oeste': '17',
  'Sonsonate Norte': '17',
  'Sonsonate Centro': '18',
  'Sonsonate Este': '19',
  'Sonsonate Oeste': '20',
  'Chalatenango Norte': '34',
  'Chalatenango Centro': '35',
  'Chalatenango Sur': '36',
  'La Libertad Norte': '23',
  'La Libertad Centro': '24',
  'La Libertad Oeste': '25',
  'La Libertad Este': '26',
  'La Libertad Costa': '27',
  'La Libertad Sur': '28',
  'San Salvador Norte': '20',
  'San Salvador Oeste': '21',
  'San Salvador Este': '22',
  'San Salvador Centro': '23',
  'San Salvador Sur': '24',
  'Cuscatlán Norte': '17',
  'Cuscatlán Sur': '18',
  'La Paz Oeste': '23',
  'La Paz Centro': '24',
  'La Paz Este': '25',
  'Cabañas Este': '10',
  'Cabañas Oeste': '11',
  'San Vicente Norte': '14',
  'San Vicente Sur': '15',
  'Usulután Norte': '24',
  'Usulután Este': '25',
  'Usulután Oeste': '26',
  'San Miguel Norte': '21',
  'San Miguel Centro': '22',
  'San Miguel Oeste': '23',
  'Morazán Norte': '27',
  'Morazán Sur': '28',
  'La Unión Norte': '19',
  'La Unión Sur': '20'
};

const departmentNames = {
  '01': 'Ahuachapán',
  '02': 'Santa Ana',
  '03': 'Sonsonate',
  '04': 'Chalatenango',
  '05': 'La Libertad',
  '06': 'San Salvador',
  '07': 'Cuscatlán',
  '08': 'La Paz',
  '09': 'Cabañas',
  '10': 'San Vicente',
  '11': 'Usulután',
  '12': 'San Miguel',
  '13': 'Morazán',
  '14': 'La Unión'
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {
      recursive: true
    });
  }
};

const downloadFile = (url, destination) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`No se pudo descargar el archivo. Código HTTP: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (error) => {
      fs.unlink(destination, () => {});
      reject(error);
    });
  });
};

const readWorksheetRows = (filePath, sheetName = null) => {
  const workbook = XLSX.readFile(filePath);
  const selectedSheetName = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[selectedSheetName];

  if (!sheet) {
    throw new Error(`No se encontró la hoja: ${selectedSheetName}`);
  }

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ''
  });
};

const normalizeHeader = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const writeJsFile = (fileName, exportName, data) => {
  const outputPath = path.join(dataDir, fileName);

  const content = `export const ${exportName} = ${JSON.stringify(data, null, 2)};\n`;

  fs.writeFileSync(outputPath, content, 'utf8');

  console.log(`Archivo generado: ${outputPath}`);
};

const generateEconomicActivities = () => {
  if (!fs.existsSync(economicActivitiesPath)) {
    throw new Error(`No se encontró el Excel de actividades económicas en: ${economicActivitiesPath}`);
  }

  const rows = readWorksheetRows(economicActivitiesPath, 'ACTECONOM');

  const activities = [];

  for (const row of rows) {
    const code = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();

    if (!code || !name) continue;

    const normalizedCode = normalizeHeader(code);

    if (normalizedCode === 'codigo') continue;

    if (!/^\d+$/.test(code)) continue;

    activities.push({
      code,
      name,
      label: `${code} - ${name}`
    });
  }

  writeJsFile('economicActivities.js', 'economicActivities', activities);

  console.log(`Actividades económicas generadas: ${activities.length}`);
};

const generateLocations = async () => {
  if (!fs.existsSync(locationsPath)) {
    console.log('Descargando catálogo de municipios y distritos...');
    await downloadFile(locationsUrl, locationsPath);
  }

  const rows = readWorksheetRows(locationsPath);

  const locations = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];

    const oldDistrictCode = String(row[0] || '').trim();
    const districtCode = String(row[1] || '').trim();
    const districtName = String(row[2] || '').trim();
    const territorialMunicipalityCode = String(row[3] || '').trim();
    const municipalityName = String(row[4] || '').trim();
    const municipalityCode = municipalityCodesCat013[municipalityName] || '';

    if (!districtCode || !districtName || !territorialMunicipalityCode || !municipalityName || !municipalityCode) {
      continue;
    }

    const departmentCode = districtCode.substring(0, 2);
    const departmentName = departmentNames[departmentCode] || 'Sin departamento';

    locations.push({
      departmentCode,
      departmentName,
      districtCode,
      oldDistrictCode,
      districtName,
      municipalityCode,
      municipalityName,
      label: `${departmentName} / ${districtName} / ${municipalityName}`
    });
  }

  const departmentsMap = new Map();

  for (const item of locations) {
    if (!departmentsMap.has(item.departmentCode)) {
      departmentsMap.set(item.departmentCode, {
        code: item.departmentCode,
        name: item.departmentName,
        label: `${item.departmentCode} - ${item.departmentName}`
      });
    }
  }

  const departments = Array.from(departmentsMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  writeJsFile('elSalvadorLocations.js', 'elSalvadorLocations', locations);
  writeJsFile('elSalvadorDepartments.js', 'elSalvadorDepartments', departments);

  console.log(`Distritos generados: ${locations.length}`);
  console.log(`Departamentos generados: ${departments.length}`);
};

const main = async () => {
  ensureDir(dataDir);
  ensureDir(catalogsDir);

  generateEconomicActivities();
  await generateLocations();

  console.log('Catálogos generados correctamente.');
};

main().catch((error) => {
  console.error('Error generando catálogos:', error.message);
  process.exit(1);
});