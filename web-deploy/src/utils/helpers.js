// Funciones auxiliares puras de Proyector Cloud — sin JSX, sin hooks, sin cerrar sobre estado de
// React. Paso 2 del refactor a módulos: se mueven tal cual desde src/App.jsx, sin cambiar ningún
// comportamiento (incluida la duplicación existente entre p4/f4/normalizarClave — no se unifica
// aquí para no alterar nada, solo se relocaliza).
import { BOOTH_LIMIT, MARGEN_CORTE_750 } from '../data/constantes.js';

export const p4 = (v) => String(v ?? '').trim().padStart(4, '0');

// --- FUNCIÓN AUXILIAR PARA DESCARGAS ---
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const estaCercaDelCorte750 = (valor) => {
  const v = Number(valor) || 0;
  if (v <= 0) return false;
  const resto = v % BOOTH_LIMIT;
  const cercaPorArriba = (BOOTH_LIMIT - resto) <= MARGEN_CORTE_750; // a punto de sumar una casilla más (ej. 740, 748...)
  const cercaPorAbajo = v >= BOOTH_LIMIT && resto <= MARGEN_CORTE_750; // recién cruzó un múltiplo real (ej. 751, 755...); no aplica cerca de 0
  return cercaPorArriba || cercaPorAbajo;
};
// Electores que faltan (o sobran) para cruzar el múltiplo de 750 más cercano; null si no aplica (v<=0).
export const distanciaAlCorte750 = (valor) => {
  const v = Number(valor) || 0;
  if (v <= 0) return null;
  const resto = v % BOOTH_LIMIT;
  if (resto === 0) return 0;
  const distArriba = BOOTH_LIMIT - resto;
  const distAbajo = v >= BOOTH_LIMIT ? resto : Infinity;
  return Math.min(distArriba, distAbajo);
};
export const nivelRiesgoCorte750 = (distancia) => {
  if (distancia === null || distancia === undefined) return '';
  if (distancia <= 5) return 'ALTO';
  if (distancia <= 10) return 'MEDIO';
  return 'BAJO';
};

// --- FUNCIONES LOGISTICA (AISLADAS - MÓDULO EQUIPAMIENTO) ---
export const calcularEquipamientoCasilla = (totalElecciones, usarMamparas = false, configOpcional = {}) => {
    const totalEleccionesNum = parseInt(totalElecciones) || 1;

    // --- Parámetros configurables (valores por defecto: Estado de México, PEC 2026-2027) ---
    const numPartidosNacionales = (configOpcional.numPartidosNacionales !== undefined && configOpcional.numPartidosNacionales !== '') ? parseInt(configOpcional.numPartidosNacionales) : 8;
    const numPartidosLocales = (configOpcional.numPartidosLocales !== undefined && configOpcional.numPartidosLocales !== '') ? parseInt(configOpcional.numPartidosLocales) : 0;
    const sillasPorPartidoLocal = (configOpcional.sillasPorPartidoLocal !== undefined && configOpcional.sillasPorPartidoLocal !== '') ? parseInt(configOpcional.sillasPorPartidoLocal) : 1;
    const numEleccionesLocales = (configOpcional.numEleccionesLocales !== undefined && configOpcional.numEleccionesLocales !== '') ? parseInt(configOpcional.numEleccionesLocales) : Math.max(totalEleccionesNum - 1, 0);

    // --- 1) MOBILIARIO: "Tablones/Mesas grandes" (categoría única, ya no se separan mesas de tablones) ---
    let mobiliarioBase = (totalEleccionesNum >= 5) ? 3 : 2; // mesas/tablones grandes según # de elecciones
    if (!configOpcional.sillasParaUrna) {
        mobiliarioBase += 1; // mesa pequeña para colocación de urna(s) o mamparas (solo si NO se usa silla)
    }

    const mobiliarioCalculado = (configOpcional.mobiliarioPorCasilla !== '' && configOpcional.mobiliarioPorCasilla !== undefined)
        ? parseInt(configOpcional.mobiliarioPorCasilla)
        : mobiliarioBase;

    // --- 2) SILLAS (no depende del # de elecciones; depende de representaciones acreditadas) ---
    const sillasFMDCU = 6; // Presidencia, 2 Secretarías, 3 Escrutadores
    const sillasNacionales = numPartidosNacionales * 2;
    const sillasLocales = numPartidosLocales * sillasPorPartidoLocal;
    const sillasUrna = configOpcional.sillasParaUrna ? 1 : 0; // sustituye la mesa pequeña de urna por una silla
    const sillasMamparas = usarMamparas ? 2 : 0; // 1 silla por cada una de las 2 mamparas; si es cancel, no se proyectan
    let sillasTotal = sillasFMDCU + sillasNacionales + sillasLocales + sillasUrna + sillasMamparas;

    // --- 3) MATERIAL ELECTORAL - APORTACIÓN INE (constante, no depende del # de elecciones) ---
    const canceles = usarMamparas ? 0 : 1;
    const mamparas = usarMamparas ? 2 : 0;
    const marcadorasCredenciales = 1;
    const liquidosIndelebles = 2;
    const marcadoresBoletas = 4;
    const urnasFederales = 1;

    // --- 4) MATERIAL ELECTORAL - APORTACIÓN OPL/IEEM (separado del INE) ---
    const urnasLocalesOpl = numEleccionesLocales;
    const basesPortaUrnaOpl = numEleccionesLocales;
    const cancelPorCasillaOpl = 1; // El IEEM/OPL provee un cancel electoral por cada casilla (fijo, independiente del cancel/mampara del INE)

    return {
        mobiliario: { tablonesMesas: mobiliarioCalculado },
        sillas: { total: sillasTotal, fmdcu: sillasFMDCU, nacionales: sillasNacionales, locales: sillasLocales, urna: sillasUrna, mamparas: sillasMamparas },
        materialIne: { canceles, mamparas, marcadorasCredenciales, liquidosIndelebles, marcadoresBoletas, urnasFederales },
        materialOpl: { urnasLocales: urnasLocalesOpl, basesPortaUrna: basesPortaUrnaOpl, cancelPorCasilla: cancelPorCasillaOpl }
    };
};

export const formatearNombreFolio = (categoria, nombreCorto) => {
    if (categoria === 'ESPECIAL') return 'ESPECIAL';
    if (categoria === 'BASICA') {
        return nombreCorto === 'B' ? 'BÁSICA' : `CONTIGUA ${nombreCorto.replace('C', '')}`;
    }
    if (categoria === 'EXTRAORDINARIA') {
        const match = String(nombreCorto).match(/^E(\d+)(?:C(\d+))?$/i);
        if (!match) return nombreCorto;
        const numExtra = match[1];
        const numContigua = match[2];
        return numContigua ? `EXTRAORDINARIA ${numExtra} CONTIGUA ${numContigua}` : `EXTRAORDINARIA ${numExtra}`;
    }
    return nombreCorto;
};

export const f4 = (val) => {
  if (val === undefined || val === null || val === "") return "";
  return String(val).padStart(4, '0');
};

// Forma canónica del número de distrito (siempre 2 dígitos, "01".."40"), para que "1", "01"
// y "0001" nunca generen documentos/llaves distintas en Firestore o localStorage. Devuelve
// null si no es un distrito válido (fuera de 1-40, vacío, no numérico).
export const normalizarDistrito = (val) => {
  const n = parseInt(String(val ?? '').replace(/\D/g, ''), 10);
  if (!n || n < 1 || n > 40) return null;
  return String(n).padStart(2, '0');
};

export const obtenerFechaHoraArchivo = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

export const obtenerDistribucionArray = (total, nombresCasillas) => {
  const n = nombresCasillas.length;
  if (n === 0) return [];
  const base = Math.floor(total / n);
  const rem = total % n;
  return nombresCasillas.map((nombre, i) => ({
    nombre: String(nombre),
    valor: i < rem ? base + 1 : base
  }));
};

export const normalizarClave = (v) => String(v ?? '').trim().padStart(4, '0');
export const claveManzana = (m) => `${normalizarClave(m.seccion)}|${normalizarClave(m.localidad)}|${normalizarClave(m.manzana)}`;
export const claveLocalidad = (m) => `${normalizarClave(m.seccion)}|${normalizarClave(m.localidad)}`;

// ===================== MÓDULO: UBICACIÓN DE CASILLAS =====================
export const claveCasillaUbicacion = (seccion, nombreCasilla) => `${normalizarClave(seccion)}-${String(nombreCasilla).toUpperCase().trim()}`;

// El SUC del INE nombra a la básica "B1"; en este sistema la básica se llama simplemente "B".
export const normalizarCodigoCasillaINE = (codigo) => {
    const c = String(codigo || '').toUpperCase().trim().replace(/\s+/g, '');
    return c === 'B1' ? 'B' : c;
};
