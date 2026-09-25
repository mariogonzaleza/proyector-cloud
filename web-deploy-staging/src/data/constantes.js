// Catálogos y valores fijos de Proyector Cloud — sin lógica, sin JSX. Paso 1 del refactor a
// módulos (ver conversación): se extraen tal cual de src/App.jsx, sin cambiar ningún valor.

export const BOOTH_LIMIT = 750;
export const MARGEN_CORTE_750 = 15; // Electores de margen para alertar cercanía al corte de 750 (posible cambio en el número de casillas)

// Catálogo oficial INE (Catálogo de Distritos Electorales Federales con Cabeceras Distritales - CDEFCD,
// corte ene 2026): distrito federal del Estado de México -> cabecera distrital (columna NOMBRE LOCALIDAD).
export const CABECERAS_DISTRITALES_MEXICO = {
  '1': 'JILOTEPEC DE MOLINA ENRIQUEZ',
  '2': 'SANTA MARIA TULTEPEC',
  '3': 'ATLACOMULCO DE FABELA',
  '4': 'CIUDAD NICOLAS ROMERO Y/O CENTRO HISTORICO SAN PEDRO AZCAPOTZALTONGO',
  '5': 'TEOTIHUACAN DE ARISTA',
  '6': 'COACALCO DE BERRIOZABAL',
  '7': 'CUAUTITLAN IZCALLI',
  '8': 'TULTITLAN DE MARIANO ESCOBEDO',
  '9': 'SAN FELIPE DEL PROGRESO',
  '10': 'ECATEPEC DE MORELOS',
  '11': 'ECATEPEC DE MORELOS',
  '12': 'IXTAPALUCA',
  '13': 'ECATEPEC DE MORELOS',
  '14': 'TEPEXPAN',
  '15': 'CIUDAD ADOLFO LOPEZ MATEOS',
  '16': 'ECATEPEC DE MORELOS',
  '17': 'ECATEPEC DE MORELOS',
  '18': 'HUIXQUILUCAN DE DEGOLLADO',
  '19': 'TLALNEPANTLA DE BAZ',
  '20': 'OJO DE AGUA',
  '21': 'AMECAMECA DE JUAREZ',
  '22': 'NAUCALPAN DE JUAREZ',
  '23': 'LERMA DE VILLADA',
  '24': 'NAUCALPAN DE JUAREZ',
  '25': 'CHIMALHUACAN',
  '26': 'TOLUCA DE LERDO',
  '27': 'METEPEC',
  '28': 'ZUMPANGO DE OCAMPO',
  '29': 'CD. NEZAHUALCOYOTL',
  '30': 'CHIMALHUACAN',
  '31': 'CD. NEZAHUALCOYOTL',
  '32': 'VALLE DE CHALCO SOLIDARIDAD',
  '33': 'CHALCO DE DIAZ COVARRUBIAS',
  '34': 'TOLUCA DE LERDO',
  '35': 'TENANCINGO DE DEGOLLADO',
  '36': 'TEJUPILCO DE HIDALGO',
  '37': 'TEOLOYUCAN',
  '38': 'TEXCOCO DE MORA',
  '39': 'LOS REYES ACAQUILPAN',
  '40': 'SAN MIGUEL ZINACANTEPEC',
};

// Catálogo oficial INE (Catálogo de Municipios - CM): código de municipio -> nombre, Estado de México (125 municipios).
export const MUNICIPIOS_MEXICO = {
  '1': 'ACAMBAY DE RUIZ CASTAÑEDA', '2': 'ACOLMAN', '3': 'ACULCO', '4': 'ALMOLOYA DE ALQUISIRAS',
  '5': 'ALMOLOYA DE JUAREZ', '6': 'ALMOLOYA DEL RIO', '7': 'AMANALCO', '8': 'AMATEPEC',
  '9': 'AMECAMECA', '10': 'APAXCO', '11': 'ATENCO', '12': 'ATIZAPAN',
  '13': 'ATIZAPAN DE ZARAGOZA', '14': 'ATLACOMULCO', '15': 'ATLAUTLA', '16': 'AXAPUSCO',
  '17': 'AYAPANGO', '18': 'CALIMAYA', '19': 'CAPULHUAC', '20': 'COACALCO DE BERRIOZABAL',
  '21': 'COATEPEC HARINAS', '22': 'COCOTITLAN', '23': 'COYOTEPEC', '24': 'CUAUTITLAN',
  '25': 'CUAUTITLAN IZCALLI', '26': 'CHALCO', '27': 'CHAPA DE MOTA', '28': 'CHAPULTEPEC',
  '29': 'CHIAUTLA', '30': 'CHICOLOAPAN', '31': 'CHICONCUAC', '32': 'CHIMALHUACAN',
  '33': 'DONATO GUERRA', '34': 'ECATEPEC DE MORELOS', '35': 'ECATZINGO', '36': 'HUEHUETOCA',
  '37': 'HUEYPOXTLA', '38': 'HUIXQUILUCAN', '39': 'ISIDRO FABELA', '40': 'IXTAPALUCA',
  '41': 'IXTAPAN DE LA SAL', '42': 'IXTAPAN DEL ORO', '43': 'IXTLAHUACA', '44': 'XALATLACO',
  '45': 'JALTENCO', '46': 'JILOTEPEC', '47': 'JILOTZINGO', '48': 'JIQUIPILCO',
  '49': 'JOCOTITLAN', '50': 'JOQUICINGO', '51': 'JUCHITEPEC', '52': 'LERMA',
  '53': 'MALINALCO', '54': 'MELCHOR OCAMPO', '55': 'METEPEC', '56': 'MEXICALTZINGO',
  '57': 'MORELOS', '58': 'NAUCALPAN DE JUAREZ', '59': 'NEXTLALPAN', '60': 'NEZAHUALCOYOTL',
  '61': 'NICOLAS ROMERO', '62': 'NOPALTEPEC', '63': 'OCOYOACAC', '64': 'OCUILAN',
  '65': 'EL ORO', '66': 'OTUMBA', '67': 'OTZOLOAPAN', '68': 'OTZOLOTEPEC',
  '69': 'OZUMBA', '70': 'PAPALOTLA', '71': 'LA PAZ', '72': 'POLOTITLAN',
  '73': 'RAYON', '74': 'SAN ANTONIO LA ISLA', '75': 'SAN FELIPE DEL PROGRESO', '76': 'SAN MARTIN DE LAS PIRAMIDES',
  '77': 'SAN MATEO ATENCO', '78': 'SAN SIMON DE GUERRERO', '79': 'SANTO TOMAS', '80': 'SOYANIQUILPAN DE JUAREZ',
  '81': 'SULTEPEC', '82': 'TECAMAC', '83': 'TEJUPILCO', '84': 'TEMAMATLA',
  '85': 'TEMASCALAPA', '86': 'TEMASCALCINGO', '87': 'TEMASCALTEPEC', '88': 'TEMOAYA',
  '89': 'TENANCINGO', '90': 'TENANGO DEL AIRE', '91': 'TENANGO DEL VALLE', '92': 'TEOLOYUCAN',
  '93': 'TEOTIHUACAN', '94': 'TEPETLAOXTOC', '95': 'TEPETLIXPA', '96': 'TEPOTZOTLAN',
  '97': 'TEQUIXQUIAC', '98': 'TEXCALTITLAN', '99': 'TEXCALYACAC', '100': 'TEXCOCO',
  '101': 'TEZOYUCA', '102': 'TIANGUISTENCO', '103': 'TIMILPAN', '104': 'TLALMANALCO',
  '105': 'TLALNEPANTLA DE BAZ', '106': 'TLATLAYA', '107': 'TOLUCA', '108': 'TONATICO',
  '109': 'TULTEPEC', '110': 'TULTITLAN', '111': 'VALLE DE BRAVO', '112': 'VILLA DE ALLENDE',
  '113': 'VILLA DEL CARBON', '114': 'VILLA GUERRERO', '115': 'VILLA VICTORIA', '116': 'XONACATLAN',
  '117': 'ZACAZONAPAN', '118': 'ZACUALPAN', '119': 'ZINACANTEPEC', '120': 'ZUMPAHUACAN',
  '121': 'ZUMPANGO', '122': 'VALLE DE CHALCO SOLIDARIDAD', '123': 'LUVIANOS', '124': 'SAN JOSE DEL RINCON',
  '125': 'TONANITLA',
};

export const DEFAULT_EQUIP_CONFIG = {
  modoProyeccion: 'padron',
  totalElecciones: 3,
  mobiliarioPorCasilla: '',
  sillasParaUrna: false,
  numPartidosNacionales: 8,
  numPartidosLocales: 2,
  sillasPorPartidoLocal: 1,
  numEleccionesLocales: 2,
  precioMesa: '',
  precioSilla: '',
};

export const DEFAULT_FOLIO_CONFIG = {
  folioInicial: 1,
  boletasRppNacionales: 16, // Default: 2 boletas x 8 partidos nacionales vigentes (Acuerdos INE/CG344/2026, INE/CG347/2026) — sin lineamiento exacto confirmado, ajustable
  boletasRppLocales: 2,     // Default: 1 boleta x 2 partidos locales vigentes en Edomex (PRD, Podemos) — ajustable
  boletasCandidaturaIndependiente: 0, // Sin candidaturas independientes registradas al corte actual — ajustable
};
