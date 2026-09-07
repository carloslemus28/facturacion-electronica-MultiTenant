// Catálogo territorial vigente utilizado por Hacienda (07/2026).
// El DTE V2 exige que direccion.distrito se transmita con el código de distrito
// de 6 dígitos, no con el nombre visible del distrito.

const normalizeKey = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

const DISTRICTS = Object.freeze([
  ["01", "Ahuachapán", "010101", "0101", "14", "Ahuachapán Centro"],
  ["01", "Apaneca", "010102", "0102", "14", "Ahuachapán Centro"],
  ["01", "Concepción de Ataco", "010104", "0104", "14", "Ahuachapán Centro"],
  ["01", "Tacuba", "010111", "0111", "14", "Ahuachapán Centro"],
  ["01", "Atiquizaya", "010203", "0103", "13", "Ahuachapán Norte"],
  ["01", "El Refugio", "010205", "0105", "13", "Ahuachapán Norte"],
  ["01", "San Lorenzo", "010209", "0109", "13", "Ahuachapán Norte"],
  ["01", "Turín", "010212", "0112", "13", "Ahuachapán Norte"],
  ["01", "Guaymango", "010306", "0106", "15", "Ahuachapán Sur"],
  ["01", "Jujutla", "010307", "0107", "15", "Ahuachapán Sur"],
  ["01", "San Francisco Menéndez", "010308", "0108", "15", "Ahuachapán Sur"],
  ["01", "San Pedro Puxtla", "010310", "0110", "15", "Ahuachapán Sur"],
  ["02", "Santa Ana", "020110", "0210", "15", "Santa Ana Centro"],
  ["02", "Coatepeque", "020202", "0202", "16", "Santa Ana Este"],
  ["02", "El Congo", "020204", "0204", "16", "Santa Ana Este"],
  ["02", "Masahuat", "020306", "0206", "14", "Santa Ana Norte"],
  ["02", "Metapán", "020307", "0207", "14", "Santa Ana Norte"],
  ["02", "Santa Rosa Guachipilín", "020311", "0211", "14", "Santa Ana Norte"],
  ["02", "Texistepeque", "020313", "0213", "14", "Santa Ana Norte"],
  ["02", "Candelaria de la Frontera", "020401", "0201", "17", "Santa Ana Oeste"],
  ["02", "Chalchuapa", "020403", "0203", "17", "Santa Ana Oeste"],
  ["02", "El Porvenir", "020405", "0205", "17", "Santa Ana Oeste"],
  ["02", "San Antonio Pajonal", "020408", "0208", "17", "Santa Ana Oeste"],
  ["02", "San Sebastián Salitrillo", "020409", "0209", "17", "Santa Ana Oeste"],
  ["02", "Santiago de la Frontera", "020412", "0212", "17", "Santa Ana Oeste"],
  ["03", "Nahulingo", "030109", "0309", "18", "Sonsonate Centro"],
  ["03", "San Antonio del Monte", "030111", "0311", "18", "Sonsonate Centro"],
  ["03", "Santo Domingo de Guzmán", "030114", "0314", "18", "Sonsonate Centro"],
  ["03", "Sonsonate", "030115", "0315", "18", "Sonsonate Centro"],
  ["03", "Sonzacate", "030116", "0316", "18", "Sonsonate Centro"],
  ["03", "Armenia", "030202", "0302", "19", "Sonsonate Este"],
  ["03", "Caluco", "030203", "0303", "19", "Sonsonate Este"],
  ["03", "Cuisnahuat", "030204", "0304", "19", "Sonsonate Este"],
  ["03", "Santa Isabel Ishuatán", "030205", "0305", "19", "Sonsonate Este"],
  ["03", "Izalco", "030206", "0306", "19", "Sonsonate Este"],
  ["03", "San Julián", "030212", "0312", "19", "Sonsonate Este"],
  ["03", "Juayúa", "030307", "0307", "17", "Sonsonate Norte"],
  ["03", "Nahuizalco", "030308", "0308", "17", "Sonsonate Norte"],
  ["03", "Salcoatitán", "030310", "0310", "17", "Sonsonate Norte"],
  ["03", "Santa Catarina Masahuat", "030313", "0313", "17", "Sonsonate Norte"],
  ["03", "Acajutla", "030401", "0301", "20", "Sonsonate Oeste"],
  ["04", "Agua Caliente", "040101", "0401", "35", "Chalatenango Centro"],
  ["04", "Dulce Nombre de María", "040108", "0408", "35", "Chalatenango Centro"],
  ["04", "El Paraíso", "040110", "0410", "35", "Chalatenango Centro"],
  ["04", "La Reina", "040113", "0413", "35", "Chalatenango Centro"],
  ["04", "Nueva Concepción", "040116", "0416", "35", "Chalatenango Centro"],
  ["04", "San Fernando", "040122", "0422", "35", "Chalatenango Centro"],
  ["04", "San Francisco Morazán", "040124", "0424", "35", "Chalatenango Centro"],
  ["04", "San Rafael", "040131", "0431", "35", "Chalatenango Centro"],
  ["04", "Santa Rita", "040132", "0432", "35", "Chalatenango Centro"],
  ["04", "Tejutla", "040133", "0433", "35", "Chalatenango Centro"],
  ["04", "Citalá", "040204", "0404", "34", "Chalatenango Norte"],
  ["04", "San Ignacio", "040225", "0425", "34", "Chalatenango Norte"],
  ["04", "La Palma", "040212", "0412", "34", "Chalatenango Norte"],
  ["04", "Arcatao", "040302", "0402", "36", "Chalatenango Sur"],
  ["04", "Azacualpa", "040303", "0403", "36", "Chalatenango Sur"],
  ["04", "Comalapa", "040305", "0405", "36", "Chalatenango Sur"],
  ["04", "Concepción Quezaltepeque", "040306", "0406", "36", "Chalatenango Sur"],
  ["04", "Chalatenango", "040307", "0407", "36", "Chalatenango Sur"],
  ["04", "El Carrizal", "040309", "0409", "36", "Chalatenango Sur"],
  ["04", "La Laguna", "040311", "0411", "36", "Chalatenango Sur"],
  ["04", "Las Vueltas", "040314", "0414", "36", "Chalatenango Sur"],
  ["04", "Nombre de Jesús", "040315", "0415", "36", "Chalatenango Sur"],
  ["04", "Nueva Trinidad", "040317", "0417", "36", "Chalatenango Sur"],
  ["04", "Ojos de Agua", "040318", "0418", "36", "Chalatenango Sur"],
  ["04", "Potonico", "040319", "0419", "36", "Chalatenango Sur"],
  ["04", "San Antonio de la Cruz", "040320", "0420", "36", "Chalatenango Sur"],
  ["04", "San Antonio Los Ranchos", "040321", "0421", "36", "Chalatenango Sur"],
  ["04", "San Isidro Labrador", "040326", "0426", "36", "Chalatenango Sur"],
  ["04", "San Francisco Lempa", "040323", "0423", "36", "Chalatenango Sur"],
  ["04", "San José Cancasque / Cancasque", "040327", "0427", "36", "Chalatenango Sur"],
  ["04", "San José Las Flores / Las Flores", "040328", "0428", "36", "Chalatenango Sur"],
  ["04", "San Luis del Carmen", "040329", "0429", "36", "Chalatenango Sur"],
  ["04", "San Miguel de Mercedes", "040330", "0430", "36", "Chalatenango Sur"],
  ["05", "Ciudad Arce", "050102", "0502", "24", "La Libertad Centro"],
  ["05", "San Juan Opico", "050115", "0515", "24", "La Libertad Centro"],
  ["05", "Chiltiupán", "050205", "0505", "27", "La Libertad Costa"],
  ["05", "Jicalapa", "050208", "0508", "27", "La Libertad Costa"],
  ["05", "La Libertad", "050209", "0509", "27", "La Libertad Costa"],
  ["05", "Tamanique", "050218", "0518", "27", "La Libertad Costa"],
  ["05", "Teotepeque", "050220", "0520", "27", "La Libertad Costa"],
  ["05", "Antiguo Cuscatlán", "050301", "0501", "26", "La Libertad Este"],
  ["05", "Huizúcar", "050306", "0506", "26", "La Libertad Este"],
  ["05", "Nuevo Cuscatlán", "050310", "0510", "26", "La Libertad Este"],
  ["05", "San José Villanueva", "050314", "0514", "26", "La Libertad Este"],
  ["05", "Zaragoza", "050322", "0522", "26", "La Libertad Este"],
  ["05", "Quezaltepeque", "050412", "0512", "23", "La Libertad Norte"],
  ["05", "San Matías", "050416", "0516", "23", "La Libertad Norte"],
  ["05", "San Pablo Tacachico", "050417", "0517", "23", "La Libertad Norte"],
  ["05", "Colón", "050503", "0503", "25", "La Libertad Oeste"],
  ["05", "Jayaque", "050507", "0507", "25", "La Libertad Oeste"],
  ["05", "Sacacoyo", "050513", "0513", "25", "La Libertad Oeste"],
  ["05", "Talnique", "050519", "0519", "25", "La Libertad Oeste"],
  ["05", "Tepecoyo", "050521", "0521", "25", "La Libertad Oeste"],
  ["05", "Comasagua", "050604", "0504", "28", "La Libertad Sur"],
  ["05", "Santa Tecla antes: Nueva San Salvador", "050611", "0511", "28", "La Libertad Sur"],
  ["06", "Ayutuxtepeque", "060103", "0603", "23", "San Salvador Centro"],
  ["06", "Cuscatancingo", "060104", "0604", "23", "San Salvador Centro"],
  ["06", "Mejicanos", "060108", "0608", "23", "San Salvador Centro"],
  ["06", "San Salvador", "060114", "0614", "23", "San Salvador Centro"],
  ["06", "Delgado", "060119", "0619", "23", "San Salvador Centro"],
  ["06", "Ilopango", "060207", "0607", "22", "San Salvador Este"],
  ["06", "San Martín", "060213", "0613", "22", "San Salvador Este"],
  ["06", "Soyapango", "060217", "0617", "22", "San Salvador Este"],
  ["06", "Tonacatepeque", "060218", "0618", "22", "San Salvador Este"],
  ["06", "Aguilares", "060301", "0601", "20", "San Salvador Norte"],
  ["06", "El Paisnal", "060305", "0605", "20", "San Salvador Norte"],
  ["06", "Guazapa", "060306", "0606", "20", "San Salvador Norte"],
  ["06", "Apopa", "060402", "0602", "21", "San Salvador Oeste"],
  ["06", "Nejapa", "060409", "0609", "21", "San Salvador Oeste"],
  ["06", "Panchimalco", "060510", "0610", "24", "San Salvador Sur"],
  ["06", "Rosario de Mora", "060511", "0611", "24", "San Salvador Sur"],
  ["06", "San Marcos", "060512", "0612", "24", "San Salvador Sur"],
  ["06", "Santiago Texacuangos", "060515", "0615", "24", "San Salvador Sur"],
  ["06", "Santo Tomás", "060516", "0616", "24", "San Salvador Sur"],
  ["07", "Oratorio de Concepción", "070106", "0706", "17", "Cuscatlán Norte"],
  ["07", "San Bartolomé Perulapía", "070107", "0707", "17", "Cuscatlán Norte"],
  ["07", "San José Guayabal", "070109", "0709", "17", "Cuscatlán Norte"],
  ["07", "San Pedro Perulapán", "070110", "0710", "17", "Cuscatlán Norte"],
  ["07", "Suchitoto", "070115", "0715", "17", "Cuscatlán Norte"],
  ["07", "Candelaria", "070201", "0701", "18", "Cuscatlán Sur"],
  ["07", "Cojutepeque", "070202", "0702", "18", "Cuscatlán Sur"],
  ["07", "El Carmen", "070203", "0703", "18", "Cuscatlán Sur"],
  ["07", "El Rosario", "070204", "0704", "18", "Cuscatlán Sur"],
  ["07", "Monte San Juan", "070205", "0705", "18", "Cuscatlán Sur"],
  ["07", "San Cristóbal", "070208", "0708", "18", "Cuscatlán Sur"],
  ["07", "San Rafael Cedros", "070211", "0711", "18", "Cuscatlán Sur"],
  ["07", "San Ramón", "070212", "0712", "18", "Cuscatlán Sur"],
  ["07", "Santa Cruz Analquito", "070213", "0713", "18", "Cuscatlán Sur"],
  ["07", "Santa Cruz Michapa", "070214", "0714", "18", "Cuscatlán Sur"],
  ["07", "Tenancingo", "070216", "0716", "18", "Cuscatlán Sur"],
  ["08", "El Rosario / Rosario de La Paz", "080102", "0802", "24", "La Paz Centro"],
  ["08", "Jerusalén", "080103", "0803", "24", "La Paz Centro"],
  ["08", "Mercedes La Ceiba", "080104", "0804", "24", "La Paz Centro"],
  ["08", "Paraíso de Osorio", "080106", "0806", "24", "La Paz Centro"],
  ["08", "San Antonio Masahuat", "080107", "0807", "24", "La Paz Centro"],
  ["08", "San Emigdio", "080108", "0808", "24", "La Paz Centro"],
  ["08", "San Juan Tepezontes", "080112", "0812", "24", "La Paz Centro"],
  ["08", "San Miguel Tepezontes", "080114", "0814", "24", "La Paz Centro"],
  ["08", "San Pedro Nonualco", "080116", "0816", "24", "La Paz Centro"],
  ["08", "Santa María Ostuma", "080118", "0818", "24", "La Paz Centro"],
  ["08", "Santiago Nonualco", "080119", "0819", "24", "La Paz Centro"],
  ["08", "San Luis La Herradura", "080122", "0822", "24", "La Paz Centro"],
  ["08", "San Juan Nonualco", "080210", "0810", "25", "La Paz Este"],
  ["08", "San Rafael Obrajuelo", "080217", "0817", "25", "La Paz Este"],
  ["08", "Zacatecoluca", "080221", "0821", "25", "La Paz Este"],
  ["08", "Cuyultitán", "080301", "0801", "23", "La Paz Oeste"],
  ["08", "Olocuilta", "080305", "0805", "23", "La Paz Oeste"],
  ["08", "San Francisco Chinameca", "080309", "0809", "23", "La Paz Oeste"],
  ["08", "San Juan Talpa", "080311", "0811", "23", "La Paz Oeste"],
  ["08", "San Luis Talpa", "080313", "0813", "23", "La Paz Oeste"],
  ["08", "San Pedro Masahuat", "080315", "0815", "23", "La Paz Oeste"],
  ["08", "Tapalhuaca", "080320", "0820", "23", "La Paz Oeste"],
  ["09", "Dolores / Villa Dolores", "090109", "0909", "10", "Cabañas Este"],
  ["09", "Guacotecti", "090102", "0902", "10", "Cabañas Este"],
  ["09", "San Isidro", "090105", "0905", "10", "Cabañas Este"],
  ["09", "Sensuntepeque", "090106", "0906", "10", "Cabañas Este"],
  ["09", "Victoria", "090108", "0908", "10", "Cabañas Este"],
  ["09", "Cinquera", "090201", "0901", "11", "Cabañas Oeste"],
  ["09", "Ilobasco", "090203", "0903", "11", "Cabañas Oeste"],
  ["09", "Jutiapa", "090204", "0904", "11", "Cabañas Oeste"],
  ["09", "Tejutepeque", "090207", "0907", "11", "Cabañas Oeste"],
  ["10", "Apastepeque", "100101", "1001", "14", "San Vicente Norte"],
  ["10", "San Esteban Catarina", "100106", "1006", "14", "San Vicente Norte"],
  ["10", "San Ildefonso", "100107", "1007", "14", "San Vicente Norte"],
  ["10", "San Lorenzo", "100108", "1008", "14", "San Vicente Norte"],
  ["10", "San Sebastián", "100109", "1009", "14", "San Vicente Norte"],
  ["10", "Santa Clara", "100104", "1004", "14", "San Vicente Norte"],
  ["10", "Santo Domingo", "100105", "1005", "14", "San Vicente Norte"],
  ["10", "Guadalupe", "100202", "1002", "15", "San Vicente Sur"],
  ["10", "San Cayetano Istepeque", "100203", "1003", "15", "San Vicente Sur"],
  ["10", "San Vicente", "100210", "1010", "15", "San Vicente Sur"],
  ["10", "Tecoluca", "100211", "1011", "15", "San Vicente Sur"],
  ["10", "Tepetitán", "100212", "1012", "15", "San Vicente Sur"],
  ["10", "Verapaz", "100213", "1013", "15", "San Vicente Sur"],
  ["11", "California", "110103", "1103", "25", "Usulután Este"],
  ["11", "Concepción Batres", "110104", "1104", "25", "Usulután Este"],
  ["11", "Ereguayquín", "110106", "1106", "25", "Usulután Este"],
  ["11", "Jucuarán", "110110", "1110", "25", "Usulután Este"],
  ["11", "Ozatlán", "110113", "1113", "25", "Usulután Este"],
  ["11", "Usulután", "110123", "1123", "25", "Usulután Este"],
  ["11", "San Dionisio", "110117", "1117", "25", "Usulután Este"],
  ["11", "Santa Elena", "110118", "1118", "25", "Usulután Este"],
  ["11", "Santa María", "110120", "1120", "25", "Usulután Este"],
  ["11", "Tecapán", "110122", "1122", "25", "Usulután Este"],
  ["11", "Alegría", "110201", "1101", "24", "Usulután Norte"],
  ["11", "Berlín", "110202", "1102", "24", "Usulután Norte"],
  ["11", "El Triunfo", "110205", "1105", "24", "Usulután Norte"],
  ["11", "Estanzuelas", "110207", "1107", "24", "Usulután Norte"],
  ["11", "Jucuapa", "110209", "1109", "24", "Usulután Norte"],
  ["11", "Mercedes Umaña", "110211", "1111", "24", "Usulután Norte"],
  ["11", "Nueva Granada", "110212", "1112", "24", "Usulután Norte"],
  ["11", "San Buenaventura", "110216", "1116", "24", "Usulután Norte"],
  ["11", "Santiago de María", "110221", "1121", "24", "Usulután Norte"],
  ["11", "Jiquilisco", "110308", "1108", "26", "Usulután Oeste"],
  ["11", "Puerto El Triunfo", "110314", "1114", "26", "Usulután Oeste"],
  ["11", "San Agustín", "110315", "1115", "26", "Usulután Oeste"],
  ["11", "San Francisco Javier", "110319", "1119", "26", "Usulután Oeste"],
  ["12", "Comacarán", "120103", "1203", "22", "San Miguel Centro"],
  ["12", "Moncagua", "120109", "1209", "22", "San Miguel Centro"],
  ["12", "Chirilagua", "120106", "1206", "22", "San Miguel Centro"],
  ["12", "Quelepa", "120112", "1212", "22", "San Miguel Centro"],
  ["12", "San Miguel", "120117", "1217", "22", "San Miguel Centro"],
  ["12", "Uluazapa", "120120", "1220", "22", "San Miguel Centro"],
  ["12", "Carolina", "120201", "1201", "21", "San Miguel Norte"],
  ["12", "Ciudad Barrios", "120202", "1202", "21", "San Miguel Norte"],
  ["12", "Chapeltique", "120204", "1204", "21", "San Miguel Norte"],
  ["12", "Nuevo Edén de San Juan", "120211", "1211", "21", "San Miguel Norte"],
  ["12", "San Antonio del Mosco", "120213", "1213", "21", "San Miguel Norte"],
  ["12", "San Gerardo", "120214", "1214", "21", "San Miguel Norte"],
  ["12", "San Luis de La Reina", "120216", "1216", "21", "San Miguel Norte"],
  ["12", "Sesori", "120219", "1219", "21", "San Miguel Norte"],
  ["12", "Chinameca", "120305", "1205", "23", "San Miguel Oeste"],
  ["12", "El Tránsito", "120307", "1207", "23", "San Miguel Oeste"],
  ["12", "Lolotique", "120308", "1208", "23", "San Miguel Oeste"],
  ["12", "Nueva Guadalupe", "120310", "1210", "23", "San Miguel Oeste"],
  ["12", "San Jorge", "120315", "1215", "23", "San Miguel Oeste"],
  ["12", "San Rafael Oriente", "120318", "1218", "23", "San Miguel Oeste"],
  ["13", "Arambala", "130101", "1301", "27", "Morazán Norte"],
  ["13", "Cacaopera", "130102", "1302", "27", "Morazán Norte"],
  ["13", "Corinto", "130103", "1303", "27", "Morazán Norte"],
  ["13", "El Rosario", "130107", "1307", "27", "Morazán Norte"],
  ["13", "Joateca", "130110", "1310", "27", "Morazán Norte"],
  ["13", "Jocoaitique", "130111", "1311", "27", "Morazán Norte"],
  ["13", "Meanguera", "130114", "1314", "27", "Morazán Norte"],
  ["13", "Perquín", "130116", "1316", "27", "Morazán Norte"],
  ["13", "San Fernando", "130118", "1318", "27", "Morazán Norte"],
  ["13", "San Isidro", "130120", "1320", "27", "Morazán Norte"],
  ["13", "Torola", "130124", "1324", "27", "Morazán Norte"],
  ["13", "Chilanga", "130204", "1304", "28", "Morazán Sur"],
  ["13", "Delicias de Concepción", "130205", "1305", "28", "Morazán Sur"],
  ["13", "El Divisadero", "130206", "1306", "28", "Morazán Sur"],
  ["13", "Gualococti", "130208", "1308", "28", "Morazán Sur"],
  ["13", "Guatajiagua", "130209", "1309", "28", "Morazán Sur"],
  ["13", "Jocoro", "130212", "1312", "28", "Morazán Sur"],
  ["13", "Lolotiquillo", "130213", "1313", "28", "Morazán Sur"],
  ["13", "Osicala", "130215", "1315", "28", "Morazán Sur"],
  ["13", "San Carlos", "130217", "1317", "28", "Morazán Sur"],
  ["13", "San Francisco Gotera", "130219", "1319", "28", "Morazán Sur"],
  ["13", "San Simón", "130221", "1321", "28", "Morazán Sur"],
  ["13", "Sensembra", "130222", "1322", "28", "Morazán Sur"],
  ["13", "Sociedad", "130223", "1323", "28", "Morazán Sur"],
  ["13", "Yamabal", "130225", "1325", "28", "Morazán Sur"],
  ["13", "Yoloaiquín", "130226", "1326", "28", "Morazán Sur"],
  ["14", "Anamorós", "140101", "1401", "19", "La Unión Norte"],
  ["14", "Bolívar", "140102", "1402", "19", "La Unión Norte"],
  ["14", "Concepción de Oriente", "140103", "1403", "19", "La Unión Norte"],
  ["14", "El Sauce", "140106", "1406", "19", "La Unión Norte"],
  ["14", "Lislique", "140109", "1409", "19", "La Unión Norte"],
  ["14", "Nueva Esparta", "140111", "1411", "19", "La Unión Norte"],
  ["14", "Pasaquina", "140112", "1412", "19", "La Unión Norte"],
  ["14", "Polorós", "140113", "1413", "19", "La Unión Norte"],
  ["14", "San José La Fuente", "140115", "1415", "19", "La Unión Norte"],
  ["14", "Santa Rosa de Lima", "140116", "1416", "19", "La Unión Norte"],
  ["14", "Conchagua", "140204", "1404", "20", "La Unión Sur"],
  ["14", "El Carmen", "140205", "1405", "20", "La Unión Sur"],
  ["14", "Intipucá", "140207", "1407", "20", "La Unión Sur"],
  ["14", "La Unión", "140208", "1408", "20", "La Unión Sur"],
  ["14", "Meanguera del Golfo", "140210", "1410", "20", "La Unión Sur"],
  ["14", "San Alejo", "140214", "1414", "20", "La Unión Sur"],
  ["14", "Yayantique", "140217", "1417", "20", "La Unión Sur"],
  ["14", "Yucuaiquín", "140218", "1418", "20", "La Unión Sur"],
]);

const DISTRICT_BY_NAME = new Map();
const DISTRICT_BY_OLD_CODE = new Map();
const DISTRICT_BY_CODE = new Map();

const addAlias = (departmentCode, alias, row) => {
  const key = normalizeKey(alias);
  if (departmentCode && key) DISTRICT_BY_NAME.set(`${departmentCode}|${key}`, row);
};

for (const [departmentCode, districtName, districtCode, oldDistrictCode, municipalityCode, municipalityName] of DISTRICTS) {
  const row = { departmentCode, districtName, districtCode, oldDistrictCode, municipalityCode, municipalityName };
  DISTRICT_BY_CODE.set(districtCode, row);
  if (oldDistrictCode) DISTRICT_BY_OLD_CODE.set(oldDistrictCode, row);

  addAlias(departmentCode, districtName, row);

  const normalized = normalizeKey(districtName);
  for (const part of normalized.split('/')) addAlias(departmentCode, part.trim(), row);

  if (normalized.includes(' ANTES: ')) {
    const [currentName, previousName] = normalized.split(' ANTES: ');
    addAlias(departmentCode, currentName, row);
    addAlias(departmentCode, previousName, row);
  }

  if (normalized.startsWith('VILLA ')) addAlias(departmentCode, normalized.slice(6), row);
}

const normalizeDepartmentCode = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const code = digits.padStart(2, '0').slice(-2);
  return Number(code) >= 1 && Number(code) <= 14 ? code : null;
};

const resolveDistrictCatalog = ({
  departmentCode,
  districtCode,
  districtName,
  oldDistrictCode,
  municipalityCode,
  municipalityName
} = {}) => {
  const explicitCode = String(districtCode || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(explicitCode) && DISTRICT_BY_CODE.has(explicitCode)) {
    return DISTRICT_BY_CODE.get(explicitCode);
  }

  const explicitOldCode = String(oldDistrictCode || '').replace(/\D/g, '');
  if (/^\d{4}$/.test(explicitOldCode) && DISTRICT_BY_OLD_CODE.has(explicitOldCode)) {
    return DISTRICT_BY_OLD_CODE.get(explicitOldCode);
  }

  // Compatibilidad: algunos registros históricos pudieron guardar el código en districtName.
  const districtNameDigits = String(districtName || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(districtNameDigits) && DISTRICT_BY_CODE.has(districtNameDigits)) {
    return DISTRICT_BY_CODE.get(districtNameDigits);
  }
  if (/^\d{4}$/.test(districtNameDigits) && DISTRICT_BY_OLD_CODE.has(districtNameDigits)) {
    return DISTRICT_BY_OLD_CODE.get(districtNameDigits);
  }

  const department = normalizeDepartmentCode(departmentCode);
  if (!department) return null;

  const byName = DISTRICT_BY_NAME.get(`${department}|${normalizeKey(districtName)}`);
  if (byName) return byName;

  // Si el nombre fue guardado accidentalmente en municipalityName, solo se acepta
  // una coincidencia exacta dentro del departamento.
  const byMunicipalityName = DISTRICT_BY_NAME.get(`${department}|${normalizeKey(municipalityName)}`);
  if (byMunicipalityName) return byMunicipalityName;

  // Último respaldo seguro: si municipio CAT-013 identifica una sola fila dentro
  // del departamento, puede resolverse sin inventar un distrito. Normalmente hay
  // varios distritos por municipio, por lo que en ese caso se devuelve null.
  const municipality = String(municipalityCode || '').replace(/\D/g, '').padStart(2, '0');
  if (municipality) {
    const matches = DISTRICTS.filter(([dep, , , , mun]) => dep === department && mun === municipality);
    if (matches.length === 1) {
      const [dep, name, code, oldCode, mun, munName] = matches[0];
      return { departmentCode: dep, districtName: name, districtCode: code, oldDistrictCode: oldCode, municipalityCode: mun, municipalityName: munName };
    }
  }

  return null;
};

const normalizeDistrictCatalogCode = (location = {}) => resolveDistrictCatalog(location)?.districtCode || null;

module.exports = {
  DISTRICTS,
  resolveDistrictCatalog,
  normalizeDistrictCatalogCode
};
