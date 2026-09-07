import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Upload, Plus, Trash2, Save, FileSpreadsheet, MapPin, Users, 
  Database, BarChart3, Settings2, Map as MapIcon, CheckCircle2, 
  AlertTriangle, X, Globe, Monitor, ArrowRightLeft, ChevronRight, 
  Target, RotateCcw, RefreshCw, Search, Download, 
  UploadCloud, Cloud, CloudOff, ArrowRight, History, FileUp,
  LayoutGrid, Calculator, ChevronLeft, Table as TableIcon,
  Layers, ListOrdered, ChevronDown, ChevronUp, Box, ShieldAlert,
  Hash, FileDown, MinusCircle, HardDrive, Star, Bookmark,
  FileText, Building2, Home, Pencil, Copy
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';

// --- CONFIGURACIÓN DE ENTORNO ---
let app, auth, db;
let isCloudEnabled = false;

try {
  if (typeof __firebase_config !== 'undefined') {
    const firebaseConfig = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isCloudEnabled = true;
  }
} catch (err) {
  console.warn("Modo Local Activo: Entorno de nube no detectado.");
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const BOOTH_LIMIT = 750; 

// --- FUNCIÓN AUXILIAR PARA DESCARGAS ---
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// --- FUNCIONES LOGISTICA (AISLADAS - MÓDULO EQUIPAMIENTO) ---
const calcularEquipamientoCasilla = (totalElecciones, usarMamparas = false, configOpcional = {}) => {
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
    let sillasTotal = sillasFMDCU + sillasNacionales + sillasLocales + sillasUrna;
    if (usarMamparas) sillasTotal += (totalEleccionesNum >= 5 ? 2 : 1); // silla de apoyo en la mesa de mamparas especiales

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
    let cancelOpcionalOpl = 0;
    let mamparaOpcionalOpl = 0;
    let marcadoresBoletasOpl = 0;
    if (totalEleccionesNum >= 5) {
        if (usarMamparas) { mamparaOpcionalOpl = 2; } else { cancelOpcionalOpl = 1; }
        marcadoresBoletasOpl = 4;
    }

    return {
        mobiliario: { tablonesMesas: mobiliarioCalculado },
        sillas: { total: sillasTotal, fmdcu: sillasFMDCU, nacionales: sillasNacionales, locales: sillasLocales, urna: sillasUrna },
        materialIne: { canceles, mamparas, marcadorasCredenciales, liquidosIndelebles, marcadoresBoletas, urnasFederales },
        materialOpl: { urnasLocales: urnasLocalesOpl, basesPortaUrna: basesPortaUrnaOpl, cancelPorCasilla: cancelPorCasillaOpl, cancelOpcional: cancelOpcionalOpl, mamparaOpcional: mamparaOpcionalOpl, marcadoresBoletas: marcadoresBoletasOpl }
    };
};

const p4 = (v) => String(v ?? '').trim().padStart(4, '0');

const AlertaConflictosDiseno = ({ conflictos, expandido, onToggle, onExportar }) => {
    if (!conflictos || conflictos.total === 0) return null;
    return (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl px-6 py-4 mb-6">
            <button onClick={onToggle} className="w-full flex items-start gap-4 text-left">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <p className="text-sm font-black text-red-700 uppercase tracking-wide">Diferencias entre tu diseño y el padrón cargado</p>
                    <p className="text-xs text-red-600 mt-1 font-bold">
                        {conflictos.desaparecidas.length > 0 && <>{conflictos.desaparecidas.length} manzana(s) de tu diseño ya no existen en el padrón actual. </>}
                        {conflictos.desactualizadas.length > 0 && <>{conflictos.desactualizadas.length} manzana(s) cambiaron su padrón/lista desde que las asignaste.</>}
                    </p>
                </div>
                {expandido ? <ChevronUp className="w-5 h-5 text-red-500 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-red-400 flex-shrink-0" />}
            </button>
            {expandido && (
                <div className="mt-4 pt-4 border-t border-red-200 space-y-3">
                    {conflictos.desaparecidas.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1.5">Manzanas desaparecidas (en uso en tu diseño)</p>
                            <div className="flex flex-wrap gap-1.5">
                                {conflictos.desaparecidas.map((m, i) => (
                                    <span key={i} className="text-[10px] font-bold bg-white border-2 border-red-200 text-red-700 px-2 py-1 rounded-lg">
                                        {String(m.tipo)} · Sec {p4(m.seccion)} · Loc {p4(m.localidad)} · Mz {p4(m.manzana)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {conflictos.desactualizadas.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1.5">Manzanas con padrón/lista desactualizado</p>
                            <div className="flex flex-wrap gap-1.5">
                                {conflictos.desactualizadas.map((m, i) => (
                                    <span key={i} className="text-[10px] font-bold bg-white border-2 border-amber-200 text-amber-700 px-2 py-1 rounded-lg">
                                        {String(m.tipo)} · Sec {p4(m.seccion)} · Loc {p4(m.localidad)} · Mz {p4(m.manzana)} · P: {m.padronAnterior}→{m.padronActual} · L: {m.listaAnterior}→{m.listaActual}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onExportar(); }} className="bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"><FileDown className="w-4 h-4" /> Descargar Excel de Conflictos</button>
                </div>
            )}
        </div>
    );
};

const AvisoImportacionJSON = ({ aviso, onClose, onExportar }) => {
    if (!aviso || aviso.noEncontradas.length === 0) return null;
    return (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-6 py-4 mb-6">
            <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                    <p className="text-sm font-black text-amber-700 uppercase tracking-wide">Tu respaldo traía manzanas que ya no están en el padrón</p>
                    <p className="text-xs text-amber-600 mt-1 font-bold">
                        Se cargaron {aviso.totalCargadas} de {aviso.totalOriginal} polígonos. {aviso.noEncontradas.length} manzana(s) referenciadas en el respaldo no se encontraron en el padrón cargado y se omitieron.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {aviso.noEncontradas.map((m, i) => (
                            <span key={i} className="text-[10px] font-bold bg-white border-2 border-amber-200 text-amber-700 px-2 py-1 rounded-lg">
                                {String(m.tipo)} · {m.rol} · Sec {p4(m.seccion)} · Loc {p4(m.localidad)} · Mz {p4(m.manzana)}
                            </span>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button onClick={onExportar} className="bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"><FileDown className="w-4 h-4" /> Descargar Excel</button>
                        <button onClick={onClose} className="bg-white border-2 border-amber-200 text-amber-700 font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SeccionColapsable = ({ title, icon, isOpen, onToggle, children }) => (
    <div className="bg-white rounded-3xl shadow-sm border-2 border-slate-300 overflow-hidden">
        <button onClick={onToggle} className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors">
            <span className="text-base font-black uppercase text-slate-800 flex items-center gap-2">{icon} {title}</span>
            {isOpen ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
        </button>
        {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
);

const formatearNombreFolio = (categoria, nombreCorto) => {
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

const DEFAULT_EQUIP_CONFIG = {
  modoProyeccion: 'padron',
  totalElecciones: 3,
  mobiliarioPorCasilla: '',
  sillasParaUrna: false,
  numPartidosNacionales: 8,
  numPartidosLocales: 2,
  sillasPorPartidoLocal: 1,
  numEleccionesLocales: 2,
};

const DEFAULT_FOLIO_CONFIG = {
  folioInicial: 1,
  boletasRppNacionales: 16, // Default: 2 boletas x 8 partidos nacionales vigentes (Acuerdos INE/CG344/2026, INE/CG347/2026) — sin lineamiento exacto confirmado, ajustable
  boletasRppLocales: 2,     // Default: 1 boleta x 2 partidos locales vigentes en Edomex (PRD, Podemos) — ajustable
  boletasCandidaturaIndependiente: 0, // Sin candidaturas independientes registradas al corte actual — ajustable
};

export default function App() {
  const [view, setView] = useState('welcome'); 
  const [user, setUser] = useState(null); 
  const [syncStatus, setSyncStatus] = useState('idle'); 
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  const [rawElectoralData, setRawElectoralData] = useState([]);
  const [isXlsxLibLoading, setIsXlsxLibLoading] = useState(true);
  
  // Antes era un useRef: al volverse true dentro del listener de Firestore no disparaba un
  // nuevo render, así que si el guardado a la nube corría ANTES de que el ref cambiara (carrera
  // muy común al recargar con datos ya en localStorage), se saltaba el guardado y nunca se
  // reintentaba hasta la siguiente edición manual del usuario. Con useState sí dispara el efecto.
  const [isInitialLoadFinished, setIsInitialLoadFinished] = useState(false);
  const lastSavedJson = useRef(""); 
  const isLocalActionActive = useRef(false); 
  const unlockTimerRef = useRef(null);

  const [distritoInfo, setDistritoInfo] = useState({ numero: "", estado: "MÉXICO" });
  const [casillasGlobales, setCasillasGlobales] = useState([]); 
  const [searchQuery, setSearchQuery] = useState("");
  const [dashboardData, setDashboardData] = useState({ loading: false, cloud: [], local: [] });
  const [isDistrictValidated, setIsDistrictValidated] = useState(false);

  const [form, setForm] = useState({
    seccionOrigen: "", rol: "alimentadora", localidad: "", manzanasSeleccionadas: [], tipoElegido: "E1", casillaUidDestino: "" 
  });
  
  const [modalConfig, setModalConfig] = useState({ isOpen: false, message: '', onConfirm: null });
  const [modalEspecialConfig, setModalEspecialConfig] = useState({ isOpen: false });
  const [especialForm, setEspecialForm] = useState({ seccion: "", tipo: "S1" });

  const [equipConfig, setEquipConfig] = useState(DEFAULT_EQUIP_CONFIG);
  const [mamparasPorCasilla, setMamparasPorCasilla] = useState({});

  const [equipExpandido, setEquipExpandido] = useState({ config: false, representaciones: false, mobiliario: false, paquetes: false, especiales: false, asignacion: false, volumen: false });
  const toggleEquipSeccion = (key) => setEquipExpandido(prev => ({ ...prev, [key]: !prev[key] }));

  const [seccionesExpandidas, setSeccionesExpandidas] = useState({});
  const toggleSeccion = (seccion) => setSeccionesExpandidas(prev => ({ ...prev, [seccion]: !prev[seccion] }));
  const [resumenExpandido, setResumenExpandido] = useState(false);
  const [busquedaProyeccion, setBusquedaProyeccion] = useState('');
  const [listadoExpandido, setListadoExpandido] = useState(false);
  const [filtroAlerta, setFiltroAlerta] = useState(null); // null | 'variacion' | 'menos100'
  const [foliosExpandido, setFoliosExpandido] = useState(false);
  const [fechaCorte, setFechaCorte] = useState("");
  const [cabeceraDistrital, setCabeceraDistrital] = useState("");
  const [comparacionAnterior, setComparacionAnterior] = useState(null);
  const [comparandoPadron, setComparandoPadron] = useState(false);
  const [detalleConflictosAbierto, setDetalleConflictosAbierto] = useState(false);
  const [importJsonAvisos, setImportJsonAvisos] = useState(null);

  const [domicilios, setDomicilios] = useState({});
  const [ubicacionCasillas, setUbicacionCasillas] = useState({});
  const [seccionesUbicacionExpandidas, setSeccionesUbicacionExpandidas] = useState({});
  const [seleccionUbicacion, setSeleccionUbicacion] = useState([]);
  const [modalUbicacionConfig, setModalUbicacionConfig] = useState({ isOpen: false });
  const [busquedaUbicacion, setBusquedaUbicacion] = useState('');
  const [importUbicacionAviso, setImportUbicacionAviso] = useState(null);
  const [filtroEstadoUbicacion, setFiltroEstadoUbicacion] = useState('todas'); // 'todas' | 'completo' | 'parcial' | 'sin_asignar'
  const [filtroTipoUbicacion, setFiltroTipoUbicacion] = useState('todos'); // 'todos' | <tipoDomicilio>
  const [formUbicacionDraft, setFormUbicacionDraft] = useState({
      tipoDomicilio: '', domicilio: '', ubicacion: '', referencia: '', nombrePropietario: '',
      anuencia: 'SÍ', notificacion: 'SÍ', reconocimiento: 'SÍ', domicilioAccesible: 'SÍ', casillaAccesible: 'SÍ', urnaElectronica: 'NO'
  });

  const CATALOGO_TIPO_DOMICILIO = ['ESCUELA', 'DOMICILIO PARTICULAR', 'LOCAL COMERCIAL', 'OFICINA PÚBLICA', 'EDIFICIO PÚBLICO', 'OTRO'];

  const NAV_SECCIONES = [
      { key: 'extraordinary', label: 'Diseño', icon: LayoutGrid },
      { key: 'final', label: 'Proyección', icon: Calculator },
      { key: 'ubicacion', label: 'Ubicación', icon: Building2 },
      { key: 'equipamiento', label: 'Equipamiento', icon: Box },
  ];

  useEffect(() => {
      if (modalUbicacionConfig.isOpen) {
          const p = modalUbicacionConfig.prefill;
          setFormUbicacionDraft({
              tipoDomicilio: p?.tipoDomicilio || '', domicilio: p?.domicilio || '', ubicacion: p?.ubicacion || '',
              referencia: p?.referencia || '', nombrePropietario: p?.nombrePropietario || '',
              anuencia: p?.anuencia || 'SÍ', notificacion: p?.notificacion || 'SÍ', reconocimiento: p?.reconocimiento || 'SÍ',
              domicilioAccesible: p?.domicilioAccesible || 'SÍ', casillaAccesible: 'SÍ', urnaElectronica: 'NO'
          });
      }
  }, [modalUbicacionConfig]);
  const [folioConfig, setFolioConfig] = useState(DEFAULT_FOLIO_CONFIG);

  const f4 = (val) => {
    if (val === undefined || val === null || val === "") return "";
    return String(val).padStart(4, '0');
  };

  const obtenerFechaHoraArchivo = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const obtenerDistribucionArray = (total, nombresCasillas) => {
    const n = nombresCasillas.length;
    if (n === 0) return [];
    const base = Math.floor(total / n);
    const rem = total % n;
    return nombresCasillas.map((nombre, i) => ({
      nombre: String(nombre),
      valor: i < rem ? base + 1 : base
    }));
  };

  const calcularProyeccion = (c) => {
    if (!c || (!c.sede && !String(c.tipo).startsWith('S'))) return { total: 0, totalLista: 0, totalMesasPadron: 0, totalMesasLista: 0, distPadron: [], distLista: [], localidadesInvolucradas: "", variacion: false };
    
    if (String(c.tipo).startsWith('S')) {
      return {
        total: 0, totalLista: 0, totalMesasPadron: 1, totalMesasLista: 1,
        mesasDetallePadron: [String(c.tipo)], mesasDetalleLista: [String(c.tipo)],
        distPadron: [{ nombre: String(c.tipo), valor: 0 }],
        distLista: [{ nombre: String(c.tipo), valor: 0 }],
        localidadesInvolucradas: "CASILLA ESPECIAL", variacion: false
      };
    }

    const totalPadron = (parseInt(c.sede?.padron) || 0) + (c.alimentadoras || []).reduce((s, a) => s + (parseInt(a.padron) || 0), 0);
    const totalLista = (parseInt(c.sede?.lista) || 0) + (c.alimentadoras || []).reduce((s, a) => s + (parseInt(a.lista) || 0), 0);
    
    const numCasillasPadron = Math.ceil(totalPadron / BOOTH_LIMIT) || 1;
    const numCasillasLista = Math.ceil(totalLista / BOOTH_LIMIT) || 1;
    
    const mesasDetallePadron = [];
    for(let i = 0; i < numCasillasPadron; i++) mesasDetallePadron.push(i === 0 ? String(c.tipo) : `${c.tipo}C${i}`);
    
    const mesasDetalleLista = [];
    for(let i = 0; i < numCasillasLista; i++) mesasDetalleLista.push(i === 0 ? String(c.tipo) : `${c.tipo}C${i}`);
    
    const distPadron = obtenerDistribucionArray(totalPadron, mesasDetallePadron);
    const distLista = obtenerDistribucionArray(totalLista, mesasDetalleLista);
    
    const todasMzs = [c.sede, ...(c.alimentadoras || [])].filter(Boolean);
    const localidadesMap = new Map();
    todasMzs.forEach(m => {
      const locId = String(m.localidad);
      if (!localidadesMap.has(locId)) localidadesMap.set(locId, m.nombreLocalidad ? `${locId} (${m.nombreLocalidad})` : locId);
    });
    
    return { 
      total: totalPadron, totalLista, totalMesasPadron: numCasillasPadron, totalMesasLista: numCasillasLista, 
      mesasDetallePadron, mesasDetalleLista, distPadron, distLista, 
      localidadesInvolucradas: Array.from(localidadesMap.values()).sort().join(', '),
      variacion: numCasillasPadron !== numCasillasLista
    };
  };

  const getMzAssignment = (mzId) => {
    for (const c of casillasGlobales) {
      if (c.sede?.id === mzId) return { type: 'sede', label: String(c.tipo) };
      if (c.alimentadoras?.some(a => a.id === mzId)) return { type: 'alimentadora', label: String(c.tipo) };
    }
    return null;
  };

  const loadDistrictFromDashboard = (distNum, targetView = 'extraordinary') => {
    const numStr = String(distNum);
    // Se resetea al cambiar de distrito sin pasar por "Salir": evita que el guardado a la nube
    // dispare con el estado "listo" del distrito anterior antes de confirmar el remoto del nuevo.
    lastSavedJson.current = "";
    setIsInitialLoadFinished(false);
    setDistritoInfo({ numero: numStr, estado: "MÉXICO" });
    localStorage.setItem('proyector_last_district', JSON.stringify({ numero: numStr, estado: "MÉXICO" }));
    setCabeceraDistrital(localStorage.getItem(`proyector_cabecera_D${numStr}`) || "");
    cargarUbicacionDeDistrito(numStr);

    const savedExcelStr = localStorage.getItem(`proyector_excel_D${numStr}`);
    if (savedExcelStr) {
        try {
            const parsedExcel = JSON.parse(savedExcelStr);
            if (parsedExcel && parsedExcel.length > 0) {
                setRawElectoralData(parsedExcel);
                setCasillasGlobales(cargarCasillasLocal(numStr, parsedExcel));
                setView(targetView);
                return;
            }
        } catch(e) {}
    }
    setView('upload');
  };

  const parsearManzanasDeArchivo = (arrayBuffer) => {
    const data = new Uint8Array(arrayBuffer);
    const workbook = window.XLSX.read(data, { type: 'array' });
    const json = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

    let headerRowIndex = -1;
    let isStrict = false;

    for (let i = 0; i < Math.min(15, json.length); i++) {
        const rowStr = json[i].map(c => String(c).trim().toUpperCase()).join('|');
        if (rowStr.includes("PIVOTE")) { headerRowIndex = i; isStrict = true; break; }
    }

    if (!isStrict) {
        for (let i = 0; i < Math.min(15, json.length); i++) {
            const rowStr = json[i].map(c => String(c).trim().toUpperCase()).join('|');
            if (rowStr.includes("PADRON") && rowStr.includes("LISTA")) { headerRowIndex = i; break; }
        }
    }

    if (headerRowIndex === -1) throw new Error("No se detectó el formato oficial.");

    const headers = json[headerRowIndex].map(h => String(h).trim().toUpperCase().replace(/\s+/g, ' ').replace(/\r?\n|\r/g, ' '));

    const idx = isStrict ? { df: 1, dl: 2, mun: 3, sec: 4, loc: 5, mnz: 6, pad: 7, lis: 8, nomLoc: 9 } : {
        df: headers.findIndex(h => h.includes("DISTRITO FEDERAL") || h === "DF" || h === "DTO FED"),
        dl: headers.findIndex(h => h.includes("DISTRITO LOCAL") || h === "DL" || h === "D.L." || h.includes("DTO LOCAL") || h === "DISTRITO ELEC" || (h.includes("DISTRITO") && !h.includes("FEDERAL"))),
        mun: headers.findIndex(h => h.includes("MUNICIPIO")),
        sec: headers.findIndex(h => h.includes("SECCION")),
        loc: headers.findIndex(h => h.includes("LOCALIDAD") && !h.includes("NOMBRE")),
        mnz: headers.findIndex(h => h.includes("MANZANA")),
        pad: headers.findIndex(h => h.includes("PADRON")),
        lis: headers.findIndex(h => h.includes("LISTA")),
        nomLoc: headers.findIndex(h => h.includes("NOMBRE DE LOCALIDAD") || h.includes("NOM LOC"))
    };

    return json.slice(headerRowIndex + 1).map((row, i) => ({
      id: `mz-${i}`, seccion: String(row[idx.sec] || ""), localidad: String(row[idx.loc] || ""),
      manzana: String(row[idx.mnz] || ""), padron: parseInt(row[idx.pad]) || 0, lista: parseInt(row[idx.lis]) || 0,
      nombreLocalidad: idx.nomLoc !== -1 ? String(row[idx.nomLoc] || "") : "",
      federal: idx.df !== -1 ? String(row[idx.df] || "") : "N/A", local: idx.dl !== -1 ? String(row[idx.dl] || "") : "N/A",
      municipio: idx.mun !== -1 ? String(row[idx.mun] || "") : "N/A"
    })).filter(item => item.seccion !== "");
  };

  const handleFileUpload = (e) => {
    const inputElement = e.target;
    const file = inputElement.files[0];
    if (!file) return;

    if (isXlsxLibLoading) {
      setErrorMessage("La librería de Excel aún está cargando. Intenta de nuevo.");
      inputElement.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parsearManzanasDeArchivo(event.target.result);
        setRawElectoralData(parsed);
        try {
            localStorage.setItem(`proyector_excel_D${distritoInfo.numero}`, JSON.stringify(parsed));
            localStorage.setItem('proyector_last_district', JSON.stringify(distritoInfo));
        } catch(err) { console.warn("Padrón muy grande para LocalStorage."); }

        setErrorMessage(null);
      } catch (err) { setErrorMessage("Error en el formato del Excel o archivo no válido."); }
      finally { inputElement.value = null; }
    };
    reader.readAsArrayBuffer(file);
  };

  const normalizarClave = (v) => String(v ?? '').trim().padStart(4, '0');
  const claveManzana = (m) => `${normalizarClave(m.seccion)}|${normalizarClave(m.localidad)}|${normalizarClave(m.manzana)}`;
  const claveLocalidad = (m) => `${normalizarClave(m.seccion)}|${normalizarClave(m.localidad)}`;

  // ===================== MÓDULO: UBICACIÓN DE CASILLAS =====================
  const claveCasillaUbicacion = (seccion, nombreCasilla) => `${normalizarClave(seccion)}-${String(nombreCasilla).toUpperCase().trim()}`;

  // El SUC del INE nombra a la básica "B1"; en este sistema la básica se llama simplemente "B".
  const normalizarCodigoCasillaINE = (codigo) => {
      const c = String(codigo || '').toUpperCase().trim().replace(/\s+/g, '');
      return c === 'B1' ? 'B' : c;
  };

  // Carga todo lo que se persiste por distrito EXCEPTO el padrón (rawElectoralData): Ubicación de
  // Casillas y la configuración de Equipamiento/Folios. Se usa tanto al entrar desde el
  // dashboard como en la recarga inicial de página.
  const cargarUbicacionDeDistrito = (numStr) => {
      try {
          const d = localStorage.getItem(`proyector_domicilios_D${numStr}`);
          setDomicilios(d ? JSON.parse(d) : {});
      } catch (e) { setDomicilios({}); }
      try {
          const u = localStorage.getItem(`proyector_ubicacionCasillas_D${numStr}`);
          setUbicacionCasillas(u ? JSON.parse(u) : {});
      } catch (e) { setUbicacionCasillas({}); }
      try {
          const e = localStorage.getItem(`proyector_equipConfig_D${numStr}`);
          setEquipConfig(e ? { ...DEFAULT_EQUIP_CONFIG, ...JSON.parse(e) } : DEFAULT_EQUIP_CONFIG);
      } catch (e) { setEquipConfig(DEFAULT_EQUIP_CONFIG); }
      try {
          const m = localStorage.getItem(`proyector_mamparasPorCasilla_D${numStr}`);
          setMamparasPorCasilla(m ? JSON.parse(m) : {});
      } catch (e) { setMamparasPorCasilla({}); }
      try {
          const f = localStorage.getItem(`proyector_folioConfig_D${numStr}`);
          setFolioConfig(f ? { ...DEFAULT_FOLIO_CONFIG, ...JSON.parse(f) } : DEFAULT_FOLIO_CONFIG);
      } catch (e) { setFolioConfig(DEFAULT_FOLIO_CONFIG); }
      setFechaCorte(localStorage.getItem(`proyector_fechaCorte_D${numStr}`) || "");
  };

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_domicilios_D${distritoInfo.numero}`, JSON.stringify(domicilios)); } catch (e) {}
  }, [domicilios, distritoInfo.numero]);

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_ubicacionCasillas_D${distritoInfo.numero}`, JSON.stringify(ubicacionCasillas)); } catch (e) {}
  }, [ubicacionCasillas, distritoInfo.numero]);

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_equipConfig_D${distritoInfo.numero}`, JSON.stringify(equipConfig)); } catch (e) {}
  }, [equipConfig, distritoInfo.numero]);

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_mamparasPorCasilla_D${distritoInfo.numero}`, JSON.stringify(mamparasPorCasilla)); } catch (e) {}
  }, [mamparasPorCasilla, distritoInfo.numero]);

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_folioConfig_D${distritoInfo.numero}`, JSON.stringify(folioConfig)); } catch (e) {}
  }, [folioConfig, distritoInfo.numero]);

  useEffect(() => {
      if (!distritoInfo.numero) return;
      try { localStorage.setItem(`proyector_fechaCorte_D${distritoInfo.numero}`, fechaCorte); } catch (e) {}
  }, [fechaCorte, distritoInfo.numero]);

  // ===================== PERSISTENCIA LOCAL DEL DISEÑO (EXTRAORDINARIAS) =====================
  // Antes esta configuración sólo se guardaba en Firestore (nube); en Modo Local nunca se
  // persistía y se perdía en cada recarga. Se guarda por refs (sección/localidad/manzana) y se
  // reconstruye contra el padrón vigente, igual que ya se hace con la sincronización en la nube.
  const guardarCasillasLocal = (numero, casillas) => {
      try {
          const refs = casillas.map(c => {
              if (String(c.tipo).startsWith('S')) return { tipo: c.tipo, uid: c.uid, sedeRef: { s: c.sede.seccion } };
              return { tipo: c.tipo, uid: c.uid, sedeRef: { s: c.sede.seccion, l: c.sede.localidad, m: c.sede.manzana }, alimentadorasRefs: (c.alimentadoras || []).map(a => ({ s: a.seccion, l: a.localidad, m: a.manzana })) };
          });
          localStorage.setItem(`proyector_casillas_D${numero}`, JSON.stringify(refs));
      } catch (e) {}
  };

  const cargarCasillasLocal = (numero, padron) => {
      try {
          const saved = localStorage.getItem(`proyector_casillas_D${numero}`);
          if (!saved) return [];
          const refs = JSON.parse(saved);
          const norm = (v) => String(v).trim().padStart(4, '0');
          return refs.map(c => {
              if (String(c.tipo).startsWith('S')) return { uid: c.uid, tipo: c.tipo, sede: { seccion: c.sedeRef.s }, alimentadoras: [] };
              const sede = padron.find(m => norm(m.seccion) === norm(c.sedeRef.s) && norm(m.localidad) === norm(c.sedeRef.l) && norm(m.manzana) === norm(c.sedeRef.m));
              if (!sede) return null;
              const alimentadoras = (c.alimentadorasRefs || []).map(ref => padron.find(m => norm(m.seccion) === norm(ref.s) && norm(m.localidad) === norm(ref.l) && norm(m.manzana) === norm(ref.m))).filter(Boolean);
              return { uid: c.uid, tipo: c.tipo, sede, alimentadoras };
          }).filter(Boolean);
      } catch (e) { return []; }
  };

  useEffect(() => {
      if (!distritoInfo.numero) return;
      guardarCasillasLocal(distritoInfo.numero, casillasGlobales);
  }, [casillasGlobales, distritoInfo.numero]);

  const parsearUbicacionCasillas = (arrayBuffer) => {
      const data = new Uint8Array(arrayBuffer);
      const workbook = window.XLSX.read(data, { type: 'array' });
      const json = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });

      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(15, json.length); i++) {
          const rowStr = (json[i] || []).map(c => String(c).trim().toUpperCase()).join('|');
          if (rowStr.includes('TIPO CASILLA') && rowStr.includes('DOMICILIO')) { headerRowIndex = i; break; }
      }
      if (headerRowIndex === -1) throw new Error('No se detectó el formato del listado de ubicación de casillas.');

      const headers = (json[headerRowIndex] || []).map(h => String(h || '').trim().toUpperCase());
      const findCol = (...names) => headers.findIndex(h => names.some(n => h === n || h.includes(n)));
      const idx = {
          sec: findCol('SECCIÓN', 'SECCION'),
          casilla: findCol('TIPO CASILLA'),
          urna: findCol('CASILLA CON URNA ELECTRÓNICA', 'CASILLA CON URNA ELECTRONICA'),
          domicilio: findCol('DOMICILIO'),
          casillaAccesible: findCol('LA CASILLA ASEGURA LA ACCESIBILIDAD'),
          domicilioAccesible: findCol('EL DOMICILIO ASEGURA LA ACCESIBILIDAD'),
          ubicacion: findCol('UBICACIÓN', 'UBICACION'),
          referencia: findCol('REFERENCIA'),
          tipoDomicilio: findCol('TIPO DOMICILIO'),
          propietario: findCol('NOMBRE PROPIETARIO'),
          anuencia: findCol('ANUENCIA'),
          notificacion: findCol('NOTIFICACIÓN', 'NOTIFICACION'),
          reconocimiento: findCol('RECONOCIMIENTO'),
      };
      if (idx.sec === -1 || idx.casilla === -1) throw new Error('No se detectó el formato del listado de ubicación de casillas.');

      const g = (row, i) => i === -1 ? '' : String(row[i] ?? '').trim();
      return json.slice(headerRowIndex + 1)
          .filter(row => row && g(row, idx.sec) !== '' && String(row[0] ?? '').trim().toUpperCase() !== 'TOTALES')
          .map(row => ({
              seccion: g(row, idx.sec),
              casillaCodigo: normalizarCodigoCasillaINE(g(row, idx.casilla)),
              urnaElectronica: g(row, idx.urna),
              domicilio: g(row, idx.domicilio),
              casillaAccesible: g(row, idx.casillaAccesible),
              domicilioAccesible: g(row, idx.domicilioAccesible),
              ubicacion: g(row, idx.ubicacion),
              referencia: g(row, idx.referencia),
              tipoDomicilio: g(row, idx.tipoDomicilio),
              nombrePropietario: g(row, idx.propietario),
              anuencia: g(row, idx.anuencia),
              notificacion: g(row, idx.notificacion),
              reconocimiento: g(row, idx.reconocimiento),
          }));
  };

  const handleImportarUbicacion = (e) => {
      const inputElement = e.target;
      const file = inputElement.files[0];
      if (!file) return;
      if (isXlsxLibLoading) { setErrorMessage("La librería de Excel aún está cargando. Intenta de nuevo."); inputElement.value = null; return; }

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const filas = parsearUbicacionCasillas(event.target.result);
              const clavesValidas = new Set(todasLasCasillasEquipamiento.map(c => claveCasillaUbicacion(c.seccion, c.nombre)));

              const firmaDomicilio = (f) => [f.domicilio, f.ubicacion, f.referencia, f.tipoDomicilio, f.nombrePropietario].map(v => String(v).trim().toUpperCase()).join('||');
              const domiciliosExistentesPorFirma = new Map(Object.entries(domicilios).map(([id, d]) => [firmaDomicilio(d), id]));

              const nuevosDomicilios = { ...domicilios };
              const nuevasAsignaciones = { ...ubicacionCasillas };
              let asignadas = 0;
              const sinPareja = [];

              filas.forEach(f => {
                  const clave = claveCasillaUbicacion(f.seccion, f.casillaCodigo);
                  if (!clavesValidas.has(clave)) { sinPareja.push({ seccion: f.seccion, casilla: f.casillaCodigo }); return; }

                  const firma = firmaDomicilio(f);
                  let domicilioId = domiciliosExistentesPorFirma.get(firma);
                  if (!domicilioId) {
                      domicilioId = `dom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                      nuevosDomicilios[domicilioId] = {
                          tipoDomicilio: f.tipoDomicilio, domicilio: f.domicilio, ubicacion: f.ubicacion, referencia: f.referencia,
                          nombrePropietario: f.nombrePropietario, anuencia: f.anuencia, notificacion: f.notificacion,
                          reconocimiento: f.reconocimiento, domicilioAccesible: f.domicilioAccesible,
                      };
                      domiciliosExistentesPorFirma.set(firma, domicilioId);
                  }
                  nuevasAsignaciones[clave] = { domicilioId, urnaElectronica: f.urnaElectronica, casillaAccesible: f.casillaAccesible };
                  asignadas++;
              });

              setDomicilios(nuevosDomicilios);
              setUbicacionCasillas(nuevasAsignaciones);
              setImportUbicacionAviso({ totalFilas: filas.length, asignadas, sinPareja });
              setErrorMessage(null);
          } catch (err) { setErrorMessage(err.message || "El archivo no tiene un formato de ubicación de casillas válido."); }
          finally { inputElement.value = null; }
      };
      reader.readAsArrayBuffer(file);
  };

  const asignarDomicilioAClaves = (claves, datosDomicilio) => {
      const domicilioId = `dom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setDomicilios(prev => ({ ...prev, [domicilioId]: {
          tipoDomicilio: datosDomicilio.tipoDomicilio, domicilio: datosDomicilio.domicilio, ubicacion: datosDomicilio.ubicacion,
          referencia: datosDomicilio.referencia, nombrePropietario: datosDomicilio.nombrePropietario, anuencia: datosDomicilio.anuencia,
          notificacion: datosDomicilio.notificacion, reconocimiento: datosDomicilio.reconocimiento, domicilioAccesible: datosDomicilio.domicilioAccesible,
      } }));
      setUbicacionCasillas(prev => {
          const next = { ...prev };
          claves.forEach(clave => {
              next[clave] = { domicilioId, urnaElectronica: next[clave]?.urnaElectronica || 'NO', casillaAccesible: datosDomicilio.casillaAccesible ?? next[clave]?.casillaAccesible ?? 'NO' };
          });
          return next;
      });
  };

  const copiarDomicilioDeCasilla = (claveOrigen, clavesDestino) => {
      const asignOrigen = ubicacionCasillas[claveOrigen];
      if (!asignOrigen) return;
      setUbicacionCasillas(prev => {
          const next = { ...prev };
          clavesDestino.forEach(clave => { next[clave] = { ...asignOrigen }; });
          return next;
      });
  };

  const exportarPlantillaUbicacion = () => {
      if (!window.XLSX) return;
      const headers = ['Distrito Local', 'Municipio', 'Sección', 'Tipo Sección', 'Padrón Electoral', 'Listado Nominal', 'Casilla', 'Tipo Casilla', 'Casilla con urna electrónica', 'Domicilio', 'La casilla asegura la accesibilidad', 'El domicilio asegura la accesibilidad', 'Ubicación', 'Referencia', 'Tipo Domicilio', 'Nombre propietario', 'Anuencia', 'Notificación', 'Reconocimiento'];
      const rows = [headers];
      const tipoSeccionLabel = { BASICA: 'BÁSICA', EXTRAORDINARIA: 'EXTRAORDINARIA', ESPECIAL: 'ESPECIAL' };
      todasLasCasillasEquipamiento.forEach(c => {
          const clave = claveCasillaUbicacion(c.seccion, c.nombre);
          const asign = ubicacionCasillas[clave];
          const dom = asign ? domicilios[asign.domicilioId] : null;
          const codigoIne = c.nombre === 'B' ? 'B1' : c.nombre;
          const padronVal = datosMesaPorClave.mapaPadron.get(clave);
          const listaVal = datosMesaPorClave.mapaLista.get(clave);
          rows.push([
              distritoInfo.numero, c.municipio || '', f4(c.seccion), tipoSeccionLabel[c.categoria] || '', padronVal ?? '', listaVal ?? '', codigoIne, codigoIne,
              asign?.urnaElectronica || '', dom?.domicilio || '', asign?.casillaAccesible || '', dom?.domicilioAccesible || '',
              dom?.ubicacion || '', dom?.referencia || '', dom?.tipoDomicilio || '', dom?.nombrePropietario || '',
              dom?.anuencia || '', dom?.notificacion || '', dom?.reconocimiento || ''
          ]);
      });
      const ws = window.XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = headers.map(h => ({ wch: h.length > 20 ? 34 : 16 }));
      const estiloHeader = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      for (let c = 0; c < headers.length; c++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c }); if (ws[addr]) ws[addr].s = estiloHeader; }
      ws['!autofilter'] = { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: headers.length - 1 } }) };
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Ubicación de Casillas');
      window.XLSX.writeFile(wb, `Plantilla_Ubicacion_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const compararPadrones = (anterior, actual) => {
    const mapAnterior = new Map(anterior.map(m => [claveManzana(m), m]));
    const mapActual = new Map(actual.map(m => [claveManzana(m), m]));

    const manzanasNuevas = actual.filter(m => !mapAnterior.has(claveManzana(m)));
    const manzanasDesaparecidas = anterior.filter(m => !mapActual.has(claveManzana(m)));
    const manzanasCambiadas = actual.filter(m => {
        const prev = mapAnterior.get(claveManzana(m));
        return prev && ((parseInt(prev.padron) || 0) !== (parseInt(m.padron) || 0) || (parseInt(prev.lista) || 0) !== (parseInt(m.lista) || 0));
    }).map(m => {
        const prev = mapAnterior.get(claveManzana(m));
        return { ...m, padronAnterior: prev.padron, listaAnterior: prev.lista };
    });

    const locsAnterior = new Map(); anterior.forEach(m => { const k = claveLocalidad(m); if (!locsAnterior.has(k)) locsAnterior.set(k, m); });
    const locsActual = new Map(); actual.forEach(m => { const k = claveLocalidad(m); if (!locsActual.has(k)) locsActual.set(k, m); });
    const localidadesNuevas = [...locsActual.entries()].filter(([k]) => !locsAnterior.has(k)).map(([, m]) => m);
    const localidadesDesaparecidas = [...locsAnterior.entries()].filter(([k]) => !locsActual.has(k)).map(([, m]) => m);

    const secAnterior = new Set(anterior.map(m => normalizarClave(m.seccion)));
    const secActual = new Set(actual.map(m => normalizarClave(m.seccion)));
    const seccionesNuevas = [...secActual].filter(s => !secAnterior.has(s)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const seccionesDesaparecidas = [...secAnterior].filter(s => !secActual.has(s)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Totales y deltas de Padrón/Lista: distrital y por sección
    const totalesDistrito = { padronAnterior: 0, listaAnterior: 0, padronActual: 0, listaActual: 0 };
    const porSeccion = new Map();
    const getSec = (s) => {
        if (!porSeccion.has(s)) porSeccion.set(s, { seccion: s, padronAnterior: 0, listaAnterior: 0, padronActual: 0, listaActual: 0 });
        return porSeccion.get(s);
    };
    anterior.forEach(m => {
        const p = parseInt(m.padron) || 0; const l = parseInt(m.lista) || 0;
        totalesDistrito.padronAnterior += p; totalesDistrito.listaAnterior += l;
        const e = getSec(normalizarClave(m.seccion)); e.padronAnterior += p; e.listaAnterior += l;
    });
    actual.forEach(m => {
        const p = parseInt(m.padron) || 0; const l = parseInt(m.lista) || 0;
        totalesDistrito.padronActual += p; totalesDistrito.listaActual += l;
        const e = getSec(normalizarClave(m.seccion)); e.padronActual += p; e.listaActual += l;
    });
    totalesDistrito.deltaPadron = totalesDistrito.padronActual - totalesDistrito.padronAnterior;
    totalesDistrito.deltaLista = totalesDistrito.listaActual - totalesDistrito.listaAnterior;
    const deltaPorSeccion = [...porSeccion.values()]
        .map(e => ({ ...e, deltaPadron: e.padronActual - e.padronAnterior, deltaLista: e.listaActual - e.listaAnterior }))
        .sort((a, b) => a.seccion.localeCompare(b.seccion, undefined, { numeric: true }));

    return { manzanasNuevas, manzanasDesaparecidas, manzanasCambiadas, localidadesNuevas, localidadesDesaparecidas, seccionesNuevas, seccionesDesaparecidas, totalesDistrito, deltaPorSeccion };
  };

  const handleCompararPadronAnterior = (e) => {
    const inputElement = e.target;
    const file = inputElement.files[0];
    if (!file) return;

    if (isXlsxLibLoading) {
      setErrorMessage("La librería de Excel aún está cargando. Intenta de nuevo.");
      inputElement.value = null;
      return;
    }

    setComparandoPadron(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const anterior = parsearManzanasDeArchivo(event.target.result);
        setComparacionAnterior(compararPadrones(anterior, rawElectoralData));
        setErrorMessage(null);
      } catch (err) { setErrorMessage("El archivo de comparación no tiene un formato válido."); }
      finally { inputElement.value = null; setComparandoPadron(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const exportarReporteComparacionPadron = () => {
    if (!window.XLSX || !comparacionAnterior) return;
    const c = comparacionAnterior;
    const wb = window.XLSX.utils.book_new();

    const estiloHeaderComp = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };
    const aplicarEstiloHoja = (ws, numCols, numRows, colorFilas) => {
        for (let cc = 0; cc < numCols; cc++) {
            const addr = window.XLSX.utils.encode_cell({ r: 0, c: cc });
            if (ws[addr]) ws[addr].s = estiloHeaderComp;
        }
        if (colorFilas) {
            for (let r = 1; r < numRows; r++) {
                for (let cc = 0; cc < numCols; cc++) {
                    const addr = window.XLSX.utils.encode_cell({ r, c: cc });
                    if (ws[addr]) ws[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: colorFilas } }, alignment: { horizontal: 'center' } };
                }
            }
        }
        ws['!cols'] = Array(numCols).fill({ wch: 16 });
    };

    const wsResumenData = [
        ['REPORTE DE COMPARACIÓN DE PADRÓN', ''],
        [`Distrito ${f4(distritoInfo.numero)}`, ''],
        [],
        ['Secciones nuevas', c.seccionesNuevas.length],
        ['Secciones desaparecidas', c.seccionesDesaparecidas.length],
        ['Localidades nuevas', c.localidadesNuevas.length],
        ['Localidades desaparecidas', c.localidadesDesaparecidas.length],
        ['Manzanas nuevas', c.manzanasNuevas.length],
        ['Manzanas desaparecidas', c.manzanasDesaparecidas.length],
        ['Manzanas con padrón/lista distinto', c.manzanasCambiadas.length],
        [],
        ['Padrón Electoral (corte anterior)', c.totalesDistrito.padronAnterior],
        ['Padrón Electoral (corte actual)', c.totalesDistrito.padronActual],
        ['Δ Padrón Electoral', c.totalesDistrito.deltaPadron],
        ['Lista Nominal (corte anterior)', c.totalesDistrito.listaAnterior],
        ['Lista Nominal (corte actual)', c.totalesDistrito.listaActual],
        ['Δ Lista Nominal', c.totalesDistrito.deltaLista],
    ];
    const wsResumen = window.XLSX.utils.aoa_to_sheet(wsResumenData);
    wsResumen['!cols'] = [{ wch: 34 }, { wch: 14 }];
    if (wsResumen['A1']) wsResumen['A1'].s = { font: { bold: true, sz: 14 } };
    window.XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const hojaSecciones = [['Sección', 'Estado'],
        ...c.seccionesNuevas.map(s => [f4(s), 'NUEVA']),
        ...c.seccionesDesaparecidas.map(s => [f4(s), 'DESAPARECIÓ'])];
    const wsSec = window.XLSX.utils.aoa_to_sheet(hojaSecciones);
    aplicarEstiloHoja(wsSec, 2, hojaSecciones.length, null);
    for (let r = 1; r < hojaSecciones.length; r++) {
        const esNueva = hojaSecciones[r][1] === 'NUEVA';
        const addr = window.XLSX.utils.encode_cell({ r, c: 1 });
        if (wsSec[addr]) wsSec[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: esNueva ? 'C6EFCE' : 'FFC7CE' } }, font: { bold: true }, alignment: { horizontal: 'center' } };
    }
    window.XLSX.utils.book_append_sheet(wb, wsSec, 'Secciones');

    const hojaDeltaSec = [['Sección', 'Padrón Anterior', 'Padrón Actual', 'Δ Padrón', 'Lista Anterior', 'Lista Actual', 'Δ Lista'],
        ...c.deltaPorSeccion.map(e => [f4(e.seccion), e.padronAnterior, e.padronActual, e.deltaPadron, e.listaAnterior, e.listaActual, e.deltaLista]),
        ['TOTAL DISTRITO', c.totalesDistrito.padronAnterior, c.totalesDistrito.padronActual, c.totalesDistrito.deltaPadron, c.totalesDistrito.listaAnterior, c.totalesDistrito.listaActual, c.totalesDistrito.deltaLista]];
    const wsDeltaSec = window.XLSX.utils.aoa_to_sheet(hojaDeltaSec);
    wsDeltaSec['!cols'] = [{ wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }];
    for (let cc = 0; cc < 7; cc++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c: cc }); if (wsDeltaSec[addr]) wsDeltaSec[addr].s = estiloHeaderComp; }
    for (let r = 1; r < hojaDeltaSec.length; r++) {
        const esTotal = r === hojaDeltaSec.length - 1;
        for (let cc = 0; cc < 7; cc++) {
            const addr = window.XLSX.utils.encode_cell({ r, c: cc });
            if (!wsDeltaSec[addr]) continue;
            if (esTotal) { wsDeltaSec[addr].s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } }, alignment: { horizontal: 'center' } }; continue; }
            if (cc === 3 || cc === 6) {
                const val = wsDeltaSec[addr].v;
                const color = val > 0 ? 'C6EFCE' : val < 0 ? 'FFC7CE' : null;
                wsDeltaSec[addr].s = { font: { bold: true }, alignment: { horizontal: 'center' }, ...(color ? { fill: { patternType: 'solid', fgColor: { rgb: color } } } : {}) };
            } else {
                wsDeltaSec[addr].s = { alignment: { horizontal: 'center' } };
            }
        }
    }
    window.XLSX.utils.book_append_sheet(wb, wsDeltaSec, 'Padrón-Lista por Sección');

    const hojaLocalidades = [['Sección', 'Localidad', 'Nombre Localidad', 'Estado'],
        ...c.localidadesNuevas.map(m => [f4(m.seccion), f4(m.localidad), m.nombreLocalidad, 'NUEVA']),
        ...c.localidadesDesaparecidas.map(m => [f4(m.seccion), f4(m.localidad), m.nombreLocalidad, 'DESAPARECIÓ'])];
    const wsLoc = window.XLSX.utils.aoa_to_sheet(hojaLocalidades);
    wsLoc['!cols'] = [{ wch: 11 }, { wch: 11 }, { wch: 28 }, { wch: 14 }];
    for (let cc = 0; cc < 4; cc++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c: cc }); if (wsLoc[addr]) wsLoc[addr].s = estiloHeaderComp; }
    for (let r = 1; r < hojaLocalidades.length; r++) {
        const esNueva = hojaLocalidades[r][3] === 'NUEVA';
        const addr = window.XLSX.utils.encode_cell({ r, c: 3 });
        if (wsLoc[addr]) wsLoc[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: esNueva ? 'C6EFCE' : 'FFC7CE' } }, font: { bold: true }, alignment: { horizontal: 'center' } };
    }
    window.XLSX.utils.book_append_sheet(wb, wsLoc, 'Localidades');

    const filaManzana = (seccion, localidad, manzana, padronAnterior, padronActual, listaAnterior, listaActual, estado) => [
        f4(seccion), f4(localidad), f4(manzana),
        padronAnterior, padronActual, padronActual - padronAnterior,
        listaAnterior, listaActual, listaActual - listaAnterior,
        estado
    ];
    const hojaManzanas = [['Sección', 'Localidad', 'Manzana', 'Padrón Anterior', 'Padrón Actual', 'Δ Padrón', 'Lista Anterior', 'Lista Actual', 'Δ Lista', 'Estado'],
        ...c.manzanasNuevas.map(m => filaManzana(m.seccion, m.localidad, m.manzana, 0, parseInt(m.padron) || 0, 0, parseInt(m.lista) || 0, 'NUEVA')),
        ...c.manzanasDesaparecidas.map(m => filaManzana(m.seccion, m.localidad, m.manzana, parseInt(m.padron) || 0, 0, parseInt(m.lista) || 0, 0, 'DESAPARECIÓ')),
        ...c.manzanasCambiadas.map(m => filaManzana(m.seccion, m.localidad, m.manzana, parseInt(m.padronAnterior) || 0, parseInt(m.padron) || 0, parseInt(m.listaAnterior) || 0, parseInt(m.lista) || 0, 'CAMBIÓ PADRÓN/LISTA'))];
    const wsMz = window.XLSX.utils.aoa_to_sheet(hojaManzanas);
    wsMz['!cols'] = [{ wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    for (let cc = 0; cc < 10; cc++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c: cc }); if (wsMz[addr]) wsMz[addr].s = estiloHeaderComp; }
    for (let r = 1; r < hojaManzanas.length; r++) {
        const estado = hojaManzanas[r][9];
        const color = estado === 'NUEVA' ? 'C6EFCE' : estado === 'DESAPARECIÓ' ? 'FFC7CE' : 'FFEB9C';
        for (let cc = 0; cc < 10; cc++) {
            const addr = window.XLSX.utils.encode_cell({ r, c: cc });
            if (wsMz[addr]) wsMz[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: color } }, font: cc === 9 ? { bold: true } : {}, alignment: { horizontal: 'center' } };
        }
    }
    window.XLSX.utils.book_append_sheet(wb, wsMz, 'Manzanas');

    window.XLSX.writeFile(wb, `Comparacion_Padron_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const cargarRespaldoJSON = (e) => {
    const inputElement = e.target;
    const file = inputElement.files[0];
    if (!file || rawElectoralData.length === 0) { inputElement.value = null; return; }
    
    const normalize = (val) => String(val).trim().padStart(4, '0');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target.result);
        const casillasData = config.casillas || config;
        const noEncontradas = [];

        const vinculadas = casillasData.map(c => {
          const isEspecial = String(c.tipo).startsWith('S');
          if (isEspecial) return { uid: c.uid || Date.now() + Math.random(), tipo: c.tipo, sede: { seccion: c.sedeRef.s }, alimentadoras: [] };
          const sede = rawElectoralData.find(m => normalize(m.seccion) === normalize(c.sedeRef.s) && normalize(m.localidad) === normalize(c.sedeRef.l) && normalize(m.manzana) === normalize(c.sedeRef.m));
          if (!sede) noEncontradas.push({ tipo: c.tipo, rol: 'Sede', seccion: c.sedeRef.s, localidad: c.sedeRef.l, manzana: c.sedeRef.m });
          const alimentadoras = (c.alimentadorasRefs || []).map(ref => {
              const mz = rawElectoralData.find(m => normalize(m.seccion) === normalize(ref.s) && normalize(m.localidad) === normalize(ref.l) && normalize(m.manzana) === normalize(ref.m));
              if (!mz) noEncontradas.push({ tipo: c.tipo, rol: 'Alimentadora', seccion: ref.s, localidad: ref.l, manzana: ref.m });
              return mz;
          }).filter(Boolean);
          if (!sede) return null;
          return { uid: c.uid || Date.now() + Math.random(), tipo: c.tipo, sede, alimentadoras };
        }).filter(Boolean);

        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        isLocalActionActive.current = true;
        lastSavedJson.current = "";
        setCasillasGlobales(vinculadas);
        setImportJsonAvisos({ totalOriginal: casillasData.length, totalCargadas: vinculadas.length, noEncontradas });
        setSuccessMessage(`Restaurado: ${vinculadas.length} Polígonos cargados.${noEncontradas.length > 0 ? ` ⚠ ${noEncontradas.length} manzana(s) no se encontraron en el padrón actual.` : ''}`);
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (err) { setErrorMessage("Error al procesar el archivo JSON."); }
      finally { inputElement.value = null; }
    };
    reader.readAsText(file);
  };

  const ejecutarAsignacion = () => {
    if (form.manzanasSeleccionadas.length === 0) return;
    if (form.rol === 'alimentadora') {
        if (!form.casillaUidDestino) { setErrorMessage("Error: Selecciona una Casilla Destino."); return; }
        const casillaDestino = casillasGlobales.find(c => String(c.uid) === String(form.casillaUidDestino));
        if (casillaDestino && casillaDestino.sede) {
            const seccionDestino = String(casillaDestino.sede.seccion);
            const difSeccion = form.manzanasSeleccionadas.find(m => String(m.seccion) !== seccionDestino);
            if (difSeccion) { setErrorMessage(`Bloqueo: No se pueden asignar manzanas entre diferentes secciones. (Sede en Sec ${f4(seccionDestino)} - Manzana en Sec ${f4(difSeccion.seccion)})`); return; }
        }
        const sedesIds = new Set(casillasGlobales.map(c => c.sede?.id));
        const invalidManzanas = form.manzanasSeleccionadas.filter(m => sedesIds.has(m.id));
        if (invalidManzanas.length > 0) { setErrorMessage(`Bloqueo: La manzana ya funge como SEDE.`); return; }
    }
    if (form.rol === 'sede') {
        const newSedesKeys = new Set();
        for (const mzData of form.manzanasSeleccionadas) {
            const key = `${mzData.seccion}-${form.tipoElegido}`;
            if (newSedesKeys.has(key)) { setErrorMessage(`Bloqueo: Múltiples sedes simultáneas.`); return; }
            newSedesKeys.add(key);
            const duplicate = casillasGlobales.find(c => String(c.sede?.seccion) === String(mzData.seccion) && String(c.tipo) === String(form.tipoElegido) && c.sede?.id !== mzData.id);
            if (duplicate) { setErrorMessage(`Bloqueo: Ya existe una Extraordinaria '${form.tipoElegido}' en la Sección ${f4(mzData.seccion)}.`); return; }
        }
    }

    setErrorMessage(null);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    isLocalActionActive.current = true;

    setCasillasGlobales(prev => {
      let nuevasCasillas = [...prev];
      const idsSeleccionados = new Set(form.manzanasSeleccionadas.map(m => m.id));
      nuevasCasillas = nuevasCasillas.map(c => ({
        ...c, sede: (idsSeleccionados.has(c.sede?.id) && form.rol === 'sede') ? null : c.sede,
        alimentadoras: (c.alimentadoras || []).filter(a => !idsSeleccionados.has(a.id))
      })).filter(c => c.sede !== null || (c.alimentadoras && c.alimentadoras.length > 0) || String(c.tipo).startsWith('S'));

      if (form.rol === 'sede') {
        form.manzanasSeleccionadas.forEach(mzData => { nuevasCasillas.push({ uid: Date.now() + Math.random(), tipo: form.tipoElegido, sede: { ...mzData }, alimentadoras: [] }); });
      } else {
        nuevasCasillas = nuevasCasillas.map(c => {
          if (String(c.uid) === String(form.casillaUidDestino)) {
            const idsExistentes = new Set((c.alimentadoras || []).map(a => a.id));
            const filtradas = form.manzanasSeleccionadas.filter(m => !idsExistentes.has(m.id));
            return { ...c, alimentadoras: [...(c.alimentadoras || []), ...filtradas] };
          }
          return c;
        });
      }
      return nuevasCasillas;
    });
    setForm(prev => ({ ...prev, manzanasSeleccionadas: [] }));
    setSuccessMessage("Cambios aplicados.");
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const desvincularManzana = (boothUid, mzId) => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    isLocalActionActive.current = true;
    setCasillasGlobales(prev => prev.map(c => {
        if (String(c.uid) === String(boothUid)) return { ...c, alimentadoras: (c.alimentadoras || []).filter(a => a.id !== mzId) };
        return c;
    }));
  };
  
  const agregarCasillaEspecial = () => {
    if (!especialForm.seccion) return;
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    isLocalActionActive.current = true;
    setCasillasGlobales(prev => [...prev, { uid: Date.now() + Math.random(), tipo: especialForm.tipo, sede: { seccion: especialForm.seccion }, alimentadoras: [] }]);
    setModalEspecialConfig({ isOpen: false });
    setEspecialForm({ seccion: "", tipo: "S1" });
  };

  const toggleManzanaSeleccionada = (mz) => {
    setErrorMessage(null);
    const assignment = getMzAssignment(mz.id);
    setForm(prev => {
      const isSelected = prev.manzanasSeleccionadas.find(m => m.id === mz.id);
      if (prev.rol === 'alimentadora' && assignment?.type === 'sede' && !isSelected) return prev;
      if (prev.rol === 'sede') return { ...prev, manzanasSeleccionadas: isSelected ? [] : [mz] };
      return { ...prev, manzanasSeleccionadas: isSelected ? prev.manzanasSeleccionadas.filter(m => m.id !== mz.id) : [...prev.manzanasSeleccionadas, mz] };
    });
  };

  const exportarValidacionManzanas = () => {
    if (!window.XLSX || casillasGlobales.length === 0) return;

    // 1) Agrupar, por sección, todas las manzanas que el diseño (extraordinarias) reclama, con su rol.
    const disenoPorSeccion = new Map(); // secId -> Map(claveManzana -> {rol, localidad, manzana, padron, lista})
    casillasGlobales.forEach(c => {
        if (String(c.tipo).startsWith('S')) return; // especiales fuera de alcance de este reporte
        const secId = normalizarClave(c.sede?.seccion);
        if (!c.sede?.manzana) return;
        if (!disenoPorSeccion.has(secId)) disenoPorSeccion.set(secId, new Map());
        const mapa = disenoPorSeccion.get(secId);
        mapa.set(claveManzana(c.sede), { rol: `SEDE ${c.tipo}`, localidad: c.sede.localidad, manzana: c.sede.manzana, padron: c.sede.padron, lista: c.sede.lista });
        (c.alimentadoras || []).forEach(a => {
            mapa.set(claveManzana(a), { rol: `ALIMENTADORA ${c.tipo}`, localidad: a.localidad, manzana: a.manzana, padron: a.padron, lista: a.lista });
        });
    });

    if (disenoPorSeccion.size === 0) return;

    // Si ya se comparó contra un corte anterior en esta sesión, usamos ese resultado para
    // distinguir básica que ya existía de básica genuinamente nueva. Si no, todo queda como BÁSICA.
    const usaComparacionAnterior = !!comparacionAnterior;
    const manzanasNuevasSet = usaComparacionAnterior
        ? new Set(comparacionAnterior.manzanasNuevas.map(m => claveManzana(m)))
        : new Set();

    // 2) Por cada sección proyectada con extraordinaria, comparar diseño completo (extraordinaria + básica) vs padrón actual.
    const filas = [];
    const resumenPorSeccion = [];
    let totalEncontradas = 0, totalNoEncontradas = 0, totalBasica = 0, totalNuevas = 0;

    [...disenoPorSeccion.keys()].sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0)).forEach(secId => {
        const diseno = disenoPorSeccion.get(secId);
        const mzsPadronSeccion = rawElectoralData.filter(m => normalizarClave(m.seccion) === secId);
        const padronPorClave = new Map(mzsPadronSeccion.map(m => [claveManzana(m), m]));
        const fed = mzsPadronSeccion.length > 0 ? String(mzsPadronSeccion[0].federal) : "N/A";
        const loc = mzsPadronSeccion.length > 0 ? String(mzsPadronSeccion[0].local) : "N/A";
        const mun = mzsPadronSeccion.length > 0 && mzsPadronSeccion[0].municipio ? String(mzsPadronSeccion[0].municipio).trim().padStart(3, '0') : "N/A";

        let encontradas = 0, noEncontradas = 0, basica = 0, nuevas = 0;

        // Manzanas del diseño (extraordinaria): ¿siguen en el padrón?
        [...diseno.entries()].sort((a, b) => a[1].rol.localeCompare(b[1].rol) || normalizarClave(a[1].manzana).localeCompare(normalizarClave(b[1].manzana))).forEach(([clave, info]) => {
            const actual = padronPorClave.get(clave);
            const estado = actual ? 'ENCONTRADA' : 'NO ENCONTRADA';
            if (actual) encontradas++; else noEncontradas++;
            filas.push({
                'DISTRITO FEDERAL': fed, 'DISTRITO LOCAL': loc, 'MUNICIPIO': mun, 'SECCIÓN': f4(secId),
                'ROL': info.rol, 'LOCALIDAD': f4(info.localidad), 'MANZANA': f4(info.manzana),
                'PADRÓN (DISEÑO)': Number(info.padron) || 0, 'PADRÓN (ACTUAL)': actual ? (Number(actual.padron) || 0) : '',
                'LISTA (DISEÑO)': Number(info.lista) || 0, 'LISTA (ACTUAL)': actual ? (Number(actual.lista) || 0) : '',
                'ESTADO': estado
            });
        });

        // Manzanas del padrón NO reclamadas por ninguna extraordinaria de esta sección: básica.
        // Si hay una comparación previa disponible, la básica que no existía antes se marca NUEVA de verdad.
        mzsPadronSeccion.slice().sort((a, b) => normalizarClave(a.manzana).localeCompare(normalizarClave(b.manzana))).forEach(m => {
            const clave = claveManzana(m);
            if (diseno.has(clave)) return;
            const esNueva = usaComparacionAnterior && manzanasNuevasSet.has(clave);
            if (esNueva) nuevas++; else basica++;
            filas.push({
                'DISTRITO FEDERAL': fed, 'DISTRITO LOCAL': loc, 'MUNICIPIO': mun, 'SECCIÓN': f4(secId),
                'ROL': 'BÁSICA', 'LOCALIDAD': f4(m.localidad), 'MANZANA': f4(m.manzana),
                'PADRÓN (DISEÑO)': '', 'PADRÓN (ACTUAL)': Number(m.padron) || 0,
                'LISTA (DISEÑO)': '', 'LISTA (ACTUAL)': Number(m.lista) || 0,
                'ESTADO': esNueva ? 'NUEVA' : 'BÁSICA'
            });
        });

        totalEncontradas += encontradas; totalNoEncontradas += noEncontradas; totalBasica += basica; totalNuevas += nuevas;
        resumenPorSeccion.push({ seccion: f4(secId), encontradas, noEncontradas, basica, nuevas, total: encontradas + noEncontradas + basica + nuevas });
    });

    const wb = window.XLSX.utils.book_new();
    const estiloHeaderVal = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };

    // Hoja Resumen
    const wsResumenData = [
        ['VALIDACIÓN DE MANZANAS: DISEÑO VS. PADRÓN CARGADO', '', '', '', '', ''],
        [`Distrito ${f4(distritoInfo.numero)}`, '', '', '', '', ''],
        [`Comparación contra corte anterior utilizada: ${usaComparacionAnterior ? 'SÍ' : 'NO (sube un corte anterior en "Comparar Padrón" para detectar básica genuinamente nueva)'}`, '', '', '', '', ''],
        [],
        ['Secciones proyectadas con extraordinaria', resumenPorSeccion.length, '', '', '', ''],
        ['Manzanas ENCONTRADAS', totalEncontradas, '', '', '', ''],
        ['Manzanas NO ENCONTRADAS', totalNoEncontradas, '', '', '', ''],
        ['Manzanas BÁSICA', totalBasica, '', '', '', ''],
        ['Manzanas NUEVAS', totalNuevas, '', '', '', ''],
        [],
        ['Sección', 'Encontradas', 'No Encontradas', 'Básica', 'Nuevas', 'Total Manzanas'],
        ...resumenPorSeccion.map(r => [r.seccion, r.encontradas, r.noEncontradas, r.basica, r.nuevas, r.total]),
    ];
    const wsResumen = window.XLSX.utils.aoa_to_sheet(wsResumenData);
    wsResumen['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
    if (wsResumen['A1']) wsResumen['A1'].s = { font: { bold: true, sz: 14 } };
    const filaHeaderResumen = 10;
    for (let c = 0; c < 6; c++) { const addr = window.XLSX.utils.encode_cell({ r: filaHeaderResumen, c }); if (wsResumen[addr]) wsResumen[addr].s = estiloHeaderVal; }
    for (let r = filaHeaderResumen + 1; r < wsResumenData.length; r++) {
        if (wsResumenData[r][2] > 0) { const addr = window.XLSX.utils.encode_cell({ r, c: 2 }); if (wsResumen[addr]) wsResumen[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } }, font: { bold: true }, alignment: { horizontal: 'center' } }; }
    }
    window.XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // Hoja Detalle
    const headers = ['DISTRITO FEDERAL', 'DISTRITO LOCAL', 'MUNICIPIO', 'SECCIÓN', 'ROL', 'LOCALIDAD', 'MANZANA', 'PADRÓN (DISEÑO)', 'PADRÓN (ACTUAL)', 'LISTA (DISEÑO)', 'LISTA (ACTUAL)', 'ESTADO'];
    const wsDetalle = window.XLSX.utils.json_to_sheet(filas, { header: headers });
    wsDetalle['!cols'] = [{ wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    for (let c = 0; c < headers.length; c++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c }); if (wsDetalle[addr]) wsDetalle[addr].s = estiloHeaderVal; }
    const coloresEstado = { 'ENCONTRADA': 'C6EFCE', 'NO ENCONTRADA': 'FFC7CE', 'BÁSICA': 'F2F2F2', 'NUEVA': 'DDEBF7' };
    for (let r = 1; r <= filas.length; r++) {
        const estado = filas[r - 1].ESTADO;
        const color = coloresEstado[estado] || 'FFFFFF';
        for (let c = 0; c < headers.length; c++) {
            const addr = window.XLSX.utils.encode_cell({ r, c });
            if (wsDetalle[addr]) wsDetalle[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: color } }, font: c === 11 ? { bold: true } : {}, alignment: { horizontal: 'center' } };
        }
    }
    wsDetalle['!autofilter'] = { ref: window.XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length, c: headers.length - 1 } }) };
    window.XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Manzanas');

    window.XLSX.writeFile(wb, `Validacion_Manzanas_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const exportarQGIS = () => {
    if (!window.XLSX) return;
    const statsPorSeccionQGIS = {};
    sections.forEach(secId => {
        const mzsDeEstaSeccion = rawElectoralData.filter(m => String(m.seccion) === secId);
        const fed = mzsDeEstaSeccion.length > 0 ? Number(mzsDeEstaSeccion[0].federal) || 35 : 35;
        const loc = mzsDeEstaSeccion.length > 0 ? Number(mzsDeEstaSeccion[0].local) || 0 : 0;
        const mun = mzsDeEstaSeccion.length > 0 && mzsDeEstaSeccion[0].municipio ? String(mzsDeEstaSeccion[0].municipio).trim().padStart(3, '0') : "000";
        statsPorSeccionQGIS[secId] = { fed, loc, mun, mzs: mzsDeEstaSeccion };
    });

    const wsQ_data = [ ["DISTRITO", "DISTRITO LOCAL", "MUNICIPIO", "SECCION", "LOCALIDAD", "MANZANA", "PADRON", "LISTA NOMINAL", "", "BÁSICA", "EXTRAORDINARIA", "MANZANA SEDE", "llave", "mz_atributos_casillas_tipo_cas", "mz_atributos_casillas_clave_Cas"] ];

    sections.forEach(secId => {
        const s = statsPorSeccionQGIS[secId];
        const extraordinariasDeSeccion = casillasGlobales.filter(c => String(c.sede?.seccion) === secId && !String(c.tipo).startsWith('S'));
        let asignacionesMzs = {};
        extraordinariasDeSeccion.forEach(ext => {
            if (ext.sede?.id) asignacionesMzs[ext.sede.id] = { tipo: ext.tipo, esSede: true };
            (ext.alimentadoras || []).forEach(a => { if (a.id) asignacionesMzs[a.id] = { tipo: ext.tipo, esSede: false }; });
        });
        let basicasMzsIds = [];
        s.mzs.forEach(mz => { if (!asignacionesMzs[mz.id]) basicasMzsIds.push(mz.id); });
        s.mzs.forEach(mz => {
            let marcaB = ""; let marcaE = ""; let marcaSede = "";
            if (asignacionesMzs[mz.id]) {
                marcaE = asignacionesMzs[mz.id].tipo;
                if (asignacionesMzs[mz.id].esSede) marcaSede = "*";
            } else {
                marcaB = "B";
                if (basicasMzsIds[0] === mz.id) marcaSede = "*";
            }
            const tipoCas = marcaB || marcaE;
            const manzanaRaw = mz.manzana || '9999';
            const llave = `${secId}${mz.localidad}${manzanaRaw}`;
            const claveCas = `${secId}-${tipoCas}`;
            wsQ_data.push([
                s.fed, s.loc, Number(s.mun), f4(secId), f4(mz.localidad), mz.manzana ? f4(mz.manzana) : "9999",
                parseInt(mz.padron) || 0, parseInt(mz.lista) || 0, "", marcaB, marcaE, marcaSede,
                llave, tipoCas, claveCas
            ]);
        });
    });

    const wsQ = window.XLSX.utils.aoa_to_sheet(wsQ_data);
    const csv = window.XLSX.utils.sheet_to_csv(wsQ);
    const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `QGIS_Manzanas_D${distritoInfo.numero}_${obtenerFechaHoraArchivo()}.csv`);
  };

  const exportarProyeccionOficial = () => {
    if (!window.XLSX) return;
    const wb = window.XLSX.utils.book_new();
    const statsPorSeccion = {};
    sections.forEach(secId => {
      const mzsDeEstaSeccion = rawElectoralData.filter(m => String(m.seccion) === secId);
      const fed = mzsDeEstaSeccion.length > 0 ? Number(mzsDeEstaSeccion[0].federal) || 35 : 35;
      const loc = mzsDeEstaSeccion.length > 0 ? Number(mzsDeEstaSeccion[0].local) || 0 : 0;
      const mun = mzsDeEstaSeccion.length > 0 && mzsDeEstaSeccion[0].municipio ? String(mzsDeEstaSeccion[0].municipio).trim().padStart(3, '0') : "000";

      const padronSec = mzsDeEstaSeccion.reduce((sum, m) => sum + (parseInt(m.padron) || 0), 0);
      const listaSec = mzsDeEstaSeccion.reduce((sum, m) => sum + (parseInt(m.lista) || 0), 0);
      statsPorSeccion[secId] = { fed, loc, mun, padronSec, listaSec, basicas: 0, contiguas: 0, extraordinarias: 0, especiales: 0, mzs: mzsDeEstaSeccion };
    });

    consolidadoB_C.forEach(r => {
      if (statsPorSeccion[r.seccion] && r.countPadron > 0) {
        statsPorSeccion[r.seccion].basicas = 1;
        statsPorSeccion[r.seccion].contiguas = (r.countPadron - 1);
      }
    });

    casillasGlobales.forEach(c => {
      const secId = String(c.sede?.seccion);
      if (statsPorSeccion[secId]) {
        const st = calcularProyeccion(c);
        if (String(c.tipo).startsWith('S')) { statsPorSeccion[secId].especiales += st.totalMesasPadron; } 
        else { statsPorSeccion[secId].extraordinarias += st.totalMesasPadron; }
      }
    });

    const ultimaFilaSeccion = 6 + sections.length;
    const ws1_data = [
      ["MÉXICO: Proyección de casillas ", "", "", "", "", "", "", "", "", "", "", "", ""], 
      ["", "", "", "", "", "", `Corte de padrón: ${fechaCorte}`, "", "", "", "", "", ""],
      [], 
      ["Distrito Federal", "Distrito Local", "Municipio", "Sección", "Padrón", "Lista Nominal", "", "Tipo de casilla seccional", "", "", "", "", "Total"], 
      ["", "", "", "", "", "", "", "Básica", "Contiguas", "Extraordinarias", "Especiales", "", ""], 
      ["", "", "", "", "", "", "Total:", {t:'n', f:`SUM(H7:H${ultimaFilaSeccion})`}, {t:'n', f:`SUM(I7:I${ultimaFilaSeccion})`}, {t:'n', f:`SUM(J7:J${ultimaFilaSeccion})`}, {t:'n', f:`SUM(K7:K${ultimaFilaSeccion})`}, "", {t:'n', f:"SUM(H6:L6)"}] 
    ];

    let rowIdx = 7;
    sections.forEach(secId => {
      const s = statsPorSeccion[secId];
      ws1_data.push([
        String(s.fed).padStart(2, '0'), String(s.loc).padStart(2, '0'), s.mun, String(f4(secId)), s.padronSec, s.listaSec, "",
        s.basicas, s.contiguas, s.extraordinarias, s.especiales, "",
        {t: 'n', f: `SUM(H${rowIdx}:K${rowIdx})`}
      ]);
      rowIdx++;
    });

    const ws1 = window.XLSX.utils.aoa_to_sheet(ws1_data);
    ws1['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }, { s: { r: 1, c: 6 }, e: { r: 1, c: 12 } }, 
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } }, { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }, 
      { s: { r: 3, c: 2 }, e: { r: 4, c: 2 } }, { s: { r: 3, c: 3 }, e: { r: 4, c: 3 } }, 
      { s: { r: 3, c: 4 }, e: { r: 4, c: 4 } }, { s: { r: 3, c: 5 }, e: { r: 4, c: 5 } }, 
      { s: { r: 3, c: 7 }, e: { r: 3, c: 10 } }, { s: { r: 3, c: 12 }, e: { r: 4, c: 12 } } 
    ];
    ws1['!cols'] = [{wch:11.3}, {wch:13.5}, {wch:13.5}, {wch:11}, {wch:11}, {wch:14.5}, {wch:7.5}, {wch:11.5}, {wch:11.5}, {wch:11.5}, {wch:11.5}, {wch:3.5}, {wch:11.5}];
    ws1['!rows'] = [{ hpt: 27.65 }, { hpt: 27.65 }, { hpt: 13 }, { hpt: 15 }, { hpt: 13 }, { hpt: 13 }];

    const estiloTituloS = { fill: { patternType: 'solid', fgColor: { rgb: 'DBDBDB' } }, font: { bold: true, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderPrincipalS = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderTipoCasillaS = { fill: { patternType: 'solid', fgColor: { rgb: 'D53FE5' } }, font: { bold: false, sz: 8, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'medium' }, bottom: { style: 'thin' } } };
    const estiloSubHeaderTipoCasillaS = { fill: { patternType: 'solid', fgColor: { rgb: 'D53FE5' } }, font: { bold: false, sz: 8, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium' } } };
    const estiloHeaderTotalS = { fill: { patternType: 'solid', fgColor: { rgb: '7030A0' } }, font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloFilaTotalS = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } }, font: { bold: true, sz: 8 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloFilaTotalGrandeS = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } }, font: { bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };

    if (ws1['A1']) ws1['A1'].s = estiloTituloS;
    ['A2','B2','C2','D2','E2','F2','G2'].forEach(addr => { if (ws1[addr]) ws1[addr].s = estiloTituloS; });
    ['A4','B4','C4','D4','E4','F4'].forEach(addr => { if (ws1[addr]) ws1[addr].s = estiloHeaderPrincipalS; });
    if (ws1['H4']) ws1['H4'].s = estiloHeaderTipoCasillaS;
    if (ws1['M4']) ws1['M4'].s = estiloHeaderTotalS;
    ['H5','I5','J5','K5'].forEach(addr => { if (ws1[addr]) ws1[addr].s = estiloSubHeaderTipoCasillaS; });
    if (ws1['G6']) ws1['G6'].s = estiloFilaTotalGrandeS;
    ['H6','I6','J6','K6'].forEach(addr => { if (ws1[addr]) ws1[addr].s = estiloFilaTotalS; });
    if (ws1['L6']) ws1['L6'].s = estiloFilaTotalGrandeS;
    if (ws1['M6']) ws1['M6'].s = estiloFilaTotalGrandeS;

    const estiloDatoCentradoS = { alignment: { horizontal: 'center' } };
    sections.forEach((secId, idx) => {
        const r = 7 + idx;
        ['A','B','C','D','E','F','H','I','J','K','M'].forEach(col => {
            const cell = ws1[`${col}${r}`];
            if (cell) cell.s = estiloDatoCentradoS;
        });
    });

    window.XLSX.utils.book_append_sheet(wb, ws1, "Sección");

    const ws2_data = [
      ["MÉXICO: Proyección de casillas ", "", "", "", "", "", "", ""], [],
      ["Distrito Federal", "Distrito Local", "Municipio", "Sección", "Casilla", "", "Padrón Electoral", "Lista Nominal"],
      ["", "", "", "", "", "", "", ""]
    ];

    filasConsolidadoFinal.forEach(row => {
      const numCasillas = Math.max(row.countPadron, row.countLista);
      const s = statsPorSeccion[row.seccion];
      if (numCasillas === 0 && (row.padronRef > 0 || row.listaRef > 0)) {
        ws2_data.push([ String(s.fed).padStart(2, '0'), String(s.loc).padStart(2, '0'), s.mun, f4(row.seccion), "", "", Number(row.padronRef), Number(row.listaRef) ]);
      } else {
        for (let i = 0; i < numCasillas; i++) {
          let nomenclaturaCasilla = '';
          if (row.categoria === 'ESPECIAL') { nomenclaturaCasilla = row.nomenclaturaPadron; }
          else if (row.categoria === 'EXTRAORDINARIA') { nomenclaturaCasilla = i === 0 ? row.nomenclaturaPadron.split(',')[0] : `${row.nomenclaturaPadron.split(',')[0]}C${i}`; }
          else { nomenclaturaCasilla = i === 0 ? 'B' : `C${i}`; }
          const valorPadron = row.distPadron[i] ? row.distPadron[i].valor : 0;
          const valorLista = row.distLista[i] ? row.distLista[i].valor : 0;
          ws2_data.push([ String(s.fed).padStart(2, '0'), String(s.loc).padStart(2, '0'), s.mun, f4(row.seccion), nomenclaturaCasilla, "", valorPadron, valorLista ]);
        }
      }
    });

    const ws2 = window.XLSX.utils.aoa_to_sheet(ws2_data);
    ws2['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }, { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
      { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }, { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } },
      { s: { r: 2, c: 3 }, e: { r: 3, c: 3 } }, { s: { r: 2, c: 4 }, e: { r: 3, c: 4 } },
      { s: { r: 2, c: 6 }, e: { r: 3, c: 6 } }, { s: { r: 2, c: 7 }, e: { r: 3, c: 7 } }
    ];
    ws2['!cols'] = [{wch:11.3}, {wch:13.5}, {wch:13.5}, {wch:11}, {wch:11}, {wch:3.5}, {wch:15}, {wch:15}];
    ws2['!rows'] = [{ hpt: 27.65 }, { hpt: 27.65 }];

    const estiloTituloC = { fill: { patternType: 'solid', fgColor: { rgb: 'DBDBDB' } }, font: { bold: true, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderPrincipalC = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderPadronListaC = { fill: { patternType: 'solid', fgColor: { rgb: '9816A6' } }, font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    if (ws2['A1']) ws2['A1'].s = estiloTituloC;
    ['A3','B3','C3','D3','E3'].forEach(addr => { if (ws2[addr]) ws2[addr].s = estiloHeaderPrincipalC; });
    ['G3','H3'].forEach(addr => { if (ws2[addr]) ws2[addr].s = estiloHeaderPadronListaC; });
    for (let r = 5; r <= ws2_data.length; r++) {
        ['A','B','C','D','E','G','H'].forEach(col => {
            const cell = ws2[`${col}${r}`];
            if (cell) cell.s = { alignment: { horizontal: 'center' } };
        });
    }

    window.XLSX.utils.book_append_sheet(wb, ws2, "Casilla");

    const ws3_data = [ ["DISTRITO", "DISTRITO LOCAL", "MUNICIPIO", "SECCION", "LOCALIDAD", "MANZANA", "PADRON", "LISTA NOMINAL", "", "BÁSICA", "EXTRAORDINARIA", "MANZANA SEDE"] ];
    const seccionesConExtra = sections.filter(sec => statsPorSeccion[sec].extraordinarias > 0);
    
    seccionesConExtra.forEach(secId => {
      const s = statsPorSeccion[secId];
      const extraordinariasDeSeccion = casillasGlobales.filter(c => String(c.sede?.seccion) === secId && !String(c.tipo).startsWith('S'));
      let asignacionesMzs = {};
      extraordinariasDeSeccion.forEach(ext => {
         if(ext.sede?.id) asignacionesMzs[ext.sede.id] = { tipo: ext.tipo, esSede: true };
         (ext.alimentadoras || []).forEach(a => { if(a.id) asignacionesMzs[a.id] = { tipo: ext.tipo, esSede: false }; });
      });
      let basicasMzsIds = [];
      s.mzs.forEach(mz => { if(!asignacionesMzs[mz.id]) basicasMzsIds.push(mz.id); });
      s.mzs.forEach(mz => {
          let marcaB = ""; let marcaE = ""; let marcaSede = "";
          if (asignacionesMzs[mz.id]) {
              marcaE = asignacionesMzs[mz.id].tipo; 
              if (asignacionesMzs[mz.id].esSede) marcaSede = "*";
          } else {
              marcaB = "B";
              if (basicasMzsIds[0] === mz.id) marcaSede = "*"; 
          }
          ws3_data.push([
              String(s.fed).padStart(2, '0'), String(s.loc).padStart(2, '0'), s.mun, f4(secId), f4(mz.localidad), mz.manzana ? f4(mz.manzana) : "9999",
              parseInt(mz.padron) || 0, parseInt(mz.lista) || 0, "", marcaB, marcaE, marcaSede
          ]);
      });
    });

    const ws3 = window.XLSX.utils.aoa_to_sheet(ws3_data);
    ws3['!cols'] = [{wch:10}, {wch:15}, {wch:11}, {wch:10}, {wch:11}, {wch:10}, {wch:9}, {wch:15}, {wch:3.5}, {wch:9}, {wch:16}, {wch:16}];
    ws3['!rows'] = [{ hpt: 26 }];

    const estiloHeaderPrincipalE = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderBasicaE = { fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } }, font: { bold: false, sz: 9, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderExtraordinariaE = { fill: { patternType: 'solid', fgColor: { rgb: '65BFCB' } }, font: { bold: false, sz: 9, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const estiloHeaderManzanaSedeE = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }, font: { bold: false, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    ['A1','B1','C1','D1','E1','F1','G1','H1'].forEach(addr => { if (ws3[addr]) ws3[addr].s = estiloHeaderPrincipalE; });
    if (ws3['J1']) ws3['J1'].s = estiloHeaderBasicaE;
    if (ws3['K1']) ws3['K1'].s = estiloHeaderExtraordinariaE;
    if (ws3['L1']) ws3['L1'].s = estiloHeaderManzanaSedeE;
    for (let r = 2; r <= ws3_data.length; r++) {
        ['A','B','C','D','E','F','G','H','J','K','L'].forEach(col => {
            const cell = ws3[`${col}${r}`];
            if (cell) cell.s = { alignment: { horizontal: 'center' } };
        });
    }

    window.XLSX.utils.book_append_sheet(wb, ws3, "Extraordinarias");
    window.XLSX.writeFile(wb, `Proyeccion_corte_D${distritoInfo.numero}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const exportarRespaldoEquipamiento = () => {
      const data = { mamparasPorCasilla: mamparasPorCasilla, equipConfig: equipConfig };
      const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
      downloadBlob(blob, `BACKUP_EQUIPAMIENTO_D${distritoInfo.numero}.json`);
  };

  const importarRespaldoEquipamiento = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const config = JSON.parse(event.target.result);
              if (config.mamparasPorCasilla) setMamparasPorCasilla(config.mamparasPorCasilla);
              if (config.equipConfig) setEquipConfig(config.equipConfig);
              setModalConfig({ isOpen: true, message: 'Configuración de Equipamiento cargada con éxito.', onConfirm: () => {} });
          } catch (err) { setModalConfig({ isOpen: true, message: 'Error al leer el archivo de respaldo.', onConfirm: () => {} }); } 
          finally { e.target.value = null; }
      };
      reader.readAsText(file);
  };

  const marcarTodasMamparas = (tipo) => {
      const nuevoEstado = {};
      todasLasCasillasEquipamiento.forEach(c => { nuevoEstado[c.id] = tipo; });
      setMamparasPorCasilla(nuevoEstado);
  };

  const exportarReporteEquipamientoMCU = () => {
    if (!window.XLSX) return;
    const headers = [
      "Municipio", "Sección", "Casilla", "Tipo Espacio",
      "Tablones/Mesas", "Sillas FMDCU", "Sillas RPP Nacionales", "Sillas RPP Locales", "Sillas Urna", "Sillas Total",
      "Canceles (INE)", "Mamparas (INE)", "Urna Federal (INE)", "Marcadora Credenciales (INE)",
      "Líquido Indeleble (INE)", "Marcadores Boletas (INE)",
      "Urnas Locales (OPL)", "Base Porta Urna (OPL)", "Cancel IEEM (OPL)", "Cancel Opcional (OPL)", "Mampara Opcional (OPL)", "Marcadores Boletas Adic. (OPL)"
    ];
    const rows = [headers];
    const totales = Array(headers.length - 4).fill(0);

    todasLasCasillasEquipamiento.forEach(c => {
      const tipo = mamparasPorCasilla[c.id] || 'cancel';
      const req = calcularEquipamientoCasilla(equipConfig.totalElecciones, tipo === 'mampara', equipConfig);
      const fila = [
        c.municipio, f4(c.seccion), c.nombre, tipo === 'mampara' ? 'Mampara Especial' : 'Cancel',
        req.mobiliario.tablonesMesas, req.sillas.fmdcu, req.sillas.nacionales, req.sillas.locales, req.sillas.urna, req.sillas.total,
        req.materialIne.canceles, req.materialIne.mamparas, req.materialIne.urnasFederales, req.materialIne.marcadorasCredenciales,
        req.materialIne.liquidosIndelebles, req.materialIne.marcadoresBoletas,
        req.materialOpl.urnasLocales, req.materialOpl.basesPortaUrna, req.materialOpl.cancelPorCasilla, req.materialOpl.cancelOpcional, req.materialOpl.mamparaOpcional, req.materialOpl.marcadoresBoletas
      ];
      rows.push(fila);
      fila.slice(4).forEach((v, i) => { totales[i] += Number(v) || 0; });
    });

    rows.push(["", "", "", "TOTALES DISTRITALES", ...totales]);

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Equipamiento MCU");
    
    window.XLSX.writeFile(wb, `Reporte Equipamiento MCU Distrito ${f4(distritoInfo.numero)} ${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const sortedCasillasGlobales = useMemo(() => {
    return [...casillasGlobales].sort((a, b) => {
      const secA = parseInt(a.sede?.seccion) || 0;
      const secB = parseInt(b.sede?.seccion) || 0;
      if (secA !== secB) return secA - secB;
      return String(a.tipo).localeCompare(String(b.tipo), undefined, { numeric: true });
    });
  }, [casillasGlobales]);

  const sections = useMemo(() => {
    if (!rawElectoralData.length) return [];
    const municipioPorSeccion = {};
    rawElectoralData.forEach(d => {
        const sec = String(d.seccion);
        if (!(sec in municipioPorSeccion) && d.municipio) municipioPorSeccion[sec] = String(d.municipio).trim();
    });
    return [...new Set(rawElectoralData.map(d => String(d.seccion)))].sort((a, b) => {
        const munA = municipioPorSeccion[a] || '';
        const munB = municipioPorSeccion[b] || '';
        const munCompare = munA.localeCompare(munB, undefined, { numeric: true });
        if (munCompare !== 0) return munCompare;
        return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [rawElectoralData]);

  const totalesPadronLista = useMemo(() => {
    return rawElectoralData.reduce((acc, m) => {
        acc.padron += parseInt(m.padron) || 0;
        acc.lista += parseInt(m.lista) || 0;
        return acc;
    }, { padron: 0, lista: 0 });
  }, [rawElectoralData]);

  const sectionsPorNumero = useMemo(() => {
    return [...sections].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [sections]);

  const localidadesDisp = useMemo(() => {
    if (!form.seccionOrigen) return [];
    return [...new Set(rawElectoralData.filter(d => String(d.seccion) === String(form.seccionOrigen)).map(d => String(d.localidad)))].sort();
  }, [rawElectoralData, form.seccionOrigen]);

  const manzanasTablero = useMemo(() => {
    if (!form.seccionOrigen || !form.localidad) return [];
    return rawElectoralData.filter(m => String(m.seccion) === String(form.seccionOrigen) && String(m.localidad) === String(form.localidad));
  }, [rawElectoralData, form.seccionOrigen, form.localidad]);

  const totalesSeleccion = useMemo(() => {
    return form.manzanasSeleccionadas.reduce((acc, m) => {
      acc.padron += (parseInt(m.padron) || 0); acc.lista += (parseInt(m.lista) || 0); return acc;
    }, { padron: 0, lista: 0 });
  }, [form.manzanasSeleccionadas]);

  const sedesActivas = useMemo(() => sortedCasillasGlobales.filter(c => c.sede !== null && !String(c.tipo).startsWith('S')), [sortedCasillasGlobales]);

  const rawPorClave = useMemo(() => {
    const map = new Map();
    rawElectoralData.forEach(m => map.set(claveManzana(m), m));
    return map;
  }, [rawElectoralData]);

  const conflictosDiseno = useMemo(() => {
    const desaparecidas = [];
    const desactualizadas = [];
    casillasGlobales.forEach(c => {
        if (String(c.tipo).startsWith('S')) return;
        const mzs = [c.sede, ...(c.alimentadoras || [])].filter(Boolean);
        mzs.forEach(mz => {
            if (!mz.seccion || !mz.manzana) return;
            const actual = rawPorClave.get(claveManzana(mz));
            if (!actual) {
                desaparecidas.push({ tipo: c.tipo, seccion: mz.seccion, localidad: mz.localidad, manzana: mz.manzana, padron: mz.padron, lista: mz.lista });
            } else if ((parseInt(mz.padron) || 0) !== (parseInt(actual.padron) || 0) || (parseInt(mz.lista) || 0) !== (parseInt(actual.lista) || 0)) {
                desactualizadas.push({ tipo: c.tipo, seccion: mz.seccion, localidad: mz.localidad, manzana: mz.manzana, padronAnterior: mz.padron, listaAnterior: mz.lista, padronActual: actual.padron, listaActual: actual.lista });
            }
        });
    });
    return { desaparecidas, desactualizadas, total: desaparecidas.length + desactualizadas.length };
  }, [casillasGlobales, rawPorClave]);

  const exportarReporteConflictosDiseno = () => {
    if (!window.XLSX || conflictosDiseno.total === 0) return;
    const wb = window.XLSX.utils.book_new();
    const estiloHeaderConf = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };

    const seccionesAfectadas = [...new Set(conflictosDiseno.desaparecidas.map(m => String(m.seccion).trim()))];
    const localidadesAfectadas = [...new Set(conflictosDiseno.desaparecidas.map(m => `${f4(m.seccion)}-${f4(m.localidad)}`))];
    const wsResumenData = [
        ['REPORTE DE CONFLICTOS: DISEÑO VS. PADRÓN CARGADO', ''],
        [`Distrito ${f4(distritoInfo.numero)}`, ''],
        [],
        ['Manzanas usadas en el diseño que ya no existen', conflictosDiseno.desaparecidas.length],
        ['Manzanas con padrón/lista desactualizado', conflictosDiseno.desactualizadas.length],
        ['Secciones con manzanas afectadas', seccionesAfectadas.length],
        ['Localidades con manzanas afectadas', localidadesAfectadas.length],
    ];
    const wsResumen = window.XLSX.utils.aoa_to_sheet(wsResumenData);
    wsResumen['!cols'] = [{ wch: 44 }, { wch: 14 }];
    if (wsResumen['A1']) wsResumen['A1'].s = { font: { bold: true, sz: 14 } };
    window.XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const hojaDesap = [['Tipo de Casilla', 'Sección', 'Localidad', 'Manzana', 'Padrón (en el diseño)', 'Lista (en el diseño)'],
        ...conflictosDiseno.desaparecidas.map(m => [String(m.tipo), f4(m.seccion), f4(m.localidad), f4(m.manzana), m.padron, m.lista])];
    const wsDesap = window.XLSX.utils.aoa_to_sheet(hojaDesap);
    wsDesap['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }];
    for (let c = 0; c < 6; c++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c }); if (wsDesap[addr]) wsDesap[addr].s = estiloHeaderConf; }
    for (let r = 1; r < hojaDesap.length; r++) { for (let c = 0; c < 6; c++) { const addr = window.XLSX.utils.encode_cell({ r, c }); if (wsDesap[addr]) wsDesap[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFC7CE' } }, alignment: { horizontal: 'center' } }; } }
    window.XLSX.utils.book_append_sheet(wb, wsDesap, 'Manzanas Desaparecidas');

    const hojaDesact = [['Tipo de Casilla', 'Sección', 'Localidad', 'Manzana', 'Padrón Anterior', 'Padrón Actual', 'Δ Padrón', 'Lista Anterior', 'Lista Actual', 'Δ Lista'],
        ...conflictosDiseno.desactualizadas.map(m => [String(m.tipo), f4(m.seccion), f4(m.localidad), f4(m.manzana), m.padronAnterior, m.padronActual, (parseInt(m.padronActual)||0) - (parseInt(m.padronAnterior)||0), m.listaAnterior, m.listaActual, (parseInt(m.listaActual)||0) - (parseInt(m.listaAnterior)||0)])];
    const wsDesact = window.XLSX.utils.aoa_to_sheet(hojaDesact);
    wsDesact['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
    for (let c = 0; c < 10; c++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c }); if (wsDesact[addr]) wsDesact[addr].s = estiloHeaderConf; }
    for (let r = 1; r < hojaDesact.length; r++) { for (let c = 0; c < 10; c++) { const addr = window.XLSX.utils.encode_cell({ r, c }); if (wsDesact[addr]) wsDesact[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFEB9C' } }, alignment: { horizontal: 'center' } }; } }
    window.XLSX.utils.book_append_sheet(wb, wsDesact, 'Padrón-Lista Desactualizado');

    window.XLSX.writeFile(wb, `Conflictos_Diseno_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const exportarReporteImportacionJSON = () => {
    if (!window.XLSX || !importJsonAvisos) return;
    const wb = window.XLSX.utils.book_new();
    const estiloHeaderImp = { fill: { patternType: 'solid', fgColor: { rgb: 'CC0099' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' } };

    const wsResumenData = [
        ['REPORTE DE IMPORTACIÓN DE RESPALDO', ''],
        [`Distrito ${f4(distritoInfo.numero)}`, ''],
        [],
        ['Polígonos en el respaldo', importJsonAvisos.totalOriginal],
        ['Polígonos cargados exitosamente', importJsonAvisos.totalCargadas],
        ['Manzanas no encontradas en el padrón actual', importJsonAvisos.noEncontradas.length],
    ];
    const wsResumen = window.XLSX.utils.aoa_to_sheet(wsResumenData);
    wsResumen['!cols'] = [{ wch: 40 }, { wch: 14 }];
    if (wsResumen['A1']) wsResumen['A1'].s = { font: { bold: true, sz: 14 } };
    window.XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const hojaNoEnc = [['Tipo de Casilla', 'Rol', 'Sección', 'Localidad', 'Manzana'],
        ...importJsonAvisos.noEncontradas.map(m => [String(m.tipo), m.rol, f4(m.seccion), f4(m.localidad), f4(m.manzana)])];
    const wsNoEnc = window.XLSX.utils.aoa_to_sheet(hojaNoEnc);
    wsNoEnc['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    for (let c = 0; c < 5; c++) { const addr = window.XLSX.utils.encode_cell({ r: 0, c }); if (wsNoEnc[addr]) wsNoEnc[addr].s = estiloHeaderImp; }
    for (let r = 1; r < hojaNoEnc.length; r++) { for (let c = 0; c < 5; c++) { const addr = window.XLSX.utils.encode_cell({ r, c }); if (wsNoEnc[addr]) wsNoEnc[addr].s = { fill: { patternType: 'solid', fgColor: { rgb: 'FFEB9C' } }, alignment: { horizontal: 'center' } }; } }
    window.XLSX.utils.book_append_sheet(wb, wsNoEnc, 'Manzanas No Encontradas');

    window.XLSX.writeFile(wb, `Aviso_Importacion_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const consolidadoB_C = useMemo(() => {
    if (rawElectoralData.length === 0) return [];
    const padronPorSec = {}; const listaPorSec = {};
    rawElectoralData.forEach(mz => {
      const s = String(mz.seccion);
      padronPorSec[s] = (padronPorSec[s] || 0) + (parseInt(mz.padron) || 0);
      listaPorSec[s] = (listaPorSec[s] || 0) + (parseInt(mz.lista) || 0);
    });
    
    const consumedPad = {}; const consumedLis = {};
    casillasGlobales.forEach(c => {
      [c.sede, ...(c.alimentadoras || [])].forEach(m => {
        if (!m || String(c.tipo).startsWith('S')) return;
        const s = String(m.seccion);
        consumedPad[s] = (consumedPad[s] || 0) + (parseInt(m.padron) || 0);
        consumedLis[s] = (consumedLis[s] || 0) + (parseInt(m.lista) || 0);
      });
    });
    
    return sections.map(sec => {
      const totalPad = padronPorSec[sec] || 0; const totalLis = listaPorSec[sec] || 0;
      const consPad = consumedPad[sec] || 0; const consLis = consumedLis[sec] || 0;
      const remPad = Math.max(0, totalPad - consPad); const remLis = Math.max(0, totalLis - consLis);
      
      let countPadron = 0; let countLista = 0;
      let nomPadron = ""; let distPadron = []; let nomLista = ""; let distLista = [];

      const tieneExtraordinaria = casillasGlobales.some(c => String(c.sede?.seccion) === sec && !String(c.tipo).startsWith('S'));

      if (!tieneExtraordinaria && ((remPad > 0 && remPad < 100) || (remLis > 0 && remLis < 100))) {
        nomPadron = "NO INSTALA"; nomLista = "NO INSTALA";
        distPadron = [{ nombre: 'NO INSTALA', valor: remPad }]; distLista = [{ nombre: 'NO INSTALA', valor: remLis }];
      } else {
        if (remPad > 0) {
          countPadron = Math.ceil(remPad / BOOTH_LIMIT) || 1;
          const mesas = []; for(let i=0; i<countPadron; i++) mesas.push(i===0 ? 'B' : `C${i}`);
          nomPadron = mesas.join(', '); distPadron = obtenerDistribucionArray(remPad, mesas);
        }
        if (remLis > 0) {
          countLista = Math.ceil(remLis / BOOTH_LIMIT) || 1;
          const mesas = []; for(let i=0; i<countLista; i++) mesas.push(i===0 ? 'B' : `C${i}`);
          nomLista = mesas.join(', '); distLista = obtenerDistribucionArray(remLis, mesas);
        }
      }
      
      return { 
        seccion: sec, padronRestante: remPad, listaRestante: remLis, 
        nomenclaturaPadron: nomPadron, nomenclaturaLista: nomLista, countPadron, countLista, distPadron, distLista, variacion: countPadron !== countLista
      };
    });
  }, [rawElectoralData, casillasGlobales, sections]);

  const filasConsolidadoFinal = useMemo(() => {
    const res = [];
    consolidadoB_C.forEach(row => {
      const mzsDeEstaSeccion = rawElectoralData.filter(m => String(m.seccion) === String(row.seccion));
      const fed = mzsDeEstaSeccion.length > 0 ? String(mzsDeEstaSeccion[0].federal) : "N/A";
      const loc = mzsDeEstaSeccion.length > 0 ? String(mzsDeEstaSeccion[0].local) : "N/A";
      const mun = mzsDeEstaSeccion.length > 0 && mzsDeEstaSeccion[0].municipio ? String(mzsDeEstaSeccion[0].municipio).trim().padStart(3, '0') : "000";

      if (row.countPadron > 0 || row.countLista > 0 || row.padronRestante > 0 || row.listaRestante > 0) {
        res.push({ fed, loc, mun, seccion: row.seccion, categoria: 'BASICA', nomenclaturaPadron: row.nomenclaturaPadron, nomenclaturaLista: row.nomenclaturaLista, distPadron: row.distPadron, distLista: row.distLista, padronRef: row.padronRestante, listaRef: row.listaRestante, countPadron: row.countPadron, countLista: row.countLista, variacion: row.variacion });
      }
      sortedCasillasGlobales.filter(c => String(c.sede?.seccion) === String(row.seccion)).forEach(c => {
        const stats = calcularProyeccion(c);
        const isEspecial = String(c.tipo).startsWith('S');
        res.push({ fed, loc, mun, seccion: row.seccion, categoria: isEspecial ? 'ESPECIAL' : 'EXTRAORDINARIA', nomenclaturaPadron: stats.mesasDetallePadron?.join(', '), nomenclaturaLista: stats.mesasDetalleLista?.join(', '), distPadron: stats.distPadron, distLista: stats.distLista, padronRef: stats.total, listaRef: stats.totalLista, countPadron: stats.totalMesasPadron, countLista: stats.totalMesasLista, variacion: stats.variacion });
      });
    });
    return res;
  }, [consolidadoB_C, sortedCasillasGlobales, rawElectoralData]);

  // Padrón/Lista por casilla individual (para la plantilla de Ubicación), usando la misma
  // distribución por mesa (distPadron/distLista) que ya calcula el consolidado de Proyección.
  const datosMesaPorClave = useMemo(() => {
      const mapaPadron = new Map();
      const mapaLista = new Map();
      filasConsolidadoFinal.forEach(row => {
          (row.distPadron || []).forEach(item => { if (item.nombre !== 'NO INSTALA') mapaPadron.set(claveCasillaUbicacion(row.seccion, item.nombre), item.valor); });
          (row.distLista || []).forEach(item => { if (item.nombre !== 'NO INSTALA') mapaLista.set(claveCasillaUbicacion(row.seccion, item.nombre), item.valor); });
      });
      return { mapaPadron, mapaLista };
  }, [filasConsolidadoFinal]);

  const casillasParaFolios = useMemo(() => {
    // Los folios de boletas se calculan SIEMPRE con Lista Nominal, nunca con Padrón,
    // sin importar el toggle Padrón/Lista que usa el módulo de Equipamiento.
    const lista = [];
    filasConsolidadoFinal.forEach(row => {
        const dist = row.distLista;
        (dist || []).forEach((item) => {
            const esNoInstala = item.nombre === 'NO INSTALA';
            const esEspecial = row.categoria === 'ESPECIAL';
            lista.push({
                id: `${row.seccion}-${row.categoria}-${item.nombre}`,
                municipio: row.mun,
                seccion: row.seccion,
                categoria: esNoInstala ? 'BASICA' : row.categoria,
                nombreCasilla: esNoInstala ? 'BÁSICA' : formatearNombreFolio(row.categoria, item.nombre),
                ciudadanos: esEspecial ? 1000 : (Number(item.valor) || 0),
            });
        });
    });
    return lista;
  }, [filasConsolidadoFinal]);

  const filasFolios = useMemo(() => {
    let folioActual = parseInt(folioConfig.folioInicial) || 1;
    const rppNac = parseInt(folioConfig.boletasRppNacionales) || 0;
    const rppLoc = parseInt(folioConfig.boletasRppLocales) || 0;
    const ci = parseInt(folioConfig.boletasCandidaturaIndependiente) || 0;
    return casillasParaFolios.map(c => {
        const totalBoletas = c.ciudadanos + rppNac + rppLoc + ci;
        const folioInicial = folioActual;
        const folioFinal = folioActual + totalBoletas - 1;
        folioActual = folioFinal + 1;
        return { ...c, boletasRppNacionales: rppNac, boletasRppLocales: rppLoc, boletasCandidaturaIndependiente: ci, totalBoletas, folioInicial, folioFinal };
    });
  }, [casillasParaFolios, folioConfig]);

  const totalesFolios = useMemo(() => {
    const totalSecciones = new Set(filasFolios.map(f => f.seccion)).size;
    const totalCasillas = filasFolios.length;
    const totalCiudadanos = filasFolios.reduce((s, f) => s + f.ciudadanos, 0);
    const totalBoletas = filasFolios.reduce((s, f) => s + f.totalBoletas, 0);
    const folioFinalDistrito = filasFolios.length > 0 ? filasFolios[filasFolios.length - 1].folioFinal : 0;
    return { totalSecciones, totalCasillas, totalCiudadanos, totalBoletas, folioFinalDistrito };
  }, [filasFolios]);

  const exportarFoliosExcel = () => {
    if (!window.XLSX) return;
    const rows = [];
    rows.push([`Entidad: (15) MEXICO`]);
    rows.push([`Distrito: ${distritoInfo.numero}${cabeceraDistrital ? ' ' + cabeceraDistrital : ''}`]);
    rows.push([]);
    rows.push(['MUNICIPIO', 'SECCIÓN', 'CASILLA', 'TOTAL DE CIUDADANOS', 'Boletas RPP Nacionales', 'Boletas RPP Locales', 'Candidatura independiente', 'TOTAL DE BOLETAS', 'FOLIO INICIAL', 'FOLIO FINAL', 'OBSERVACIONES (INDIQUE SI ALGUNA BOLETA TIENE UN FOLIO DUPLICADO, O  ESTÁ DAÑADA, ASÍ COMO EL FOLIO DE LA MISMA)']);
    rows.push([]);
    const dataStartRow = rows.length;
    const primeraFilaDatos = dataStartRow + 1;
    const ultimaFilaDatos = dataStartRow + filasFolios.length;
    filasFolios.forEach((f, idx) => {
        const rowNum = dataStartRow + idx + 1;
        const totalBoletasFormula = { t: 'n', f: `D${rowNum}+E${rowNum}+F${rowNum}+G${rowNum}` };
        const folioInicialFormula = idx === 0
            ? { t: 'str', f: `TEXT(${parseInt(folioConfig.folioInicial) || 1},"0000000")` }
            : { t: 'str', f: `TEXT(J${rowNum - 1}+1,"0000000")` };
        const folioFinalFormula = { t: 'str', f: `TEXT(H${rowNum}+I${rowNum}-1,"0000000")` };
        rows.push([f.municipio, f4(f.seccion), f.nombreCasilla, f.ciudadanos, f.boletasRppNacionales, f.boletasRppLocales, f.boletasCandidaturaIndependiente, totalBoletasFormula, folioInicialFormula, folioFinalFormula, '']);
    });
    rows.push([
        'Totales', totalesFolios.totalSecciones, totalesFolios.totalCasillas,
        { t: 'n', f: `SUM(D${primeraFilaDatos}:D${ultimaFilaDatos})` }, '', '', '',
        { t: 'n', f: `SUM(H${primeraFilaDatos}:H${ultimaFilaDatos})` }, '', ''
    ]);

    const ws = window.XLSX.utils.aoa_to_sheet(rows);

    // Anchos de columna y alto del encabezado, para parecerse al Excel de referencia
    ws['!cols'] = [
        { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 44 }
    ];
    ws['!rows'] = { 3: { hpt: 40 } };

    const FUENTE = 'Aptos Narrow';

    if (ws['A1']) ws['A1'].s = { font: { name: FUENTE, sz: 11, bold: true } };
    if (ws['A2']) ws['A2'].s = { font: { name: FUENTE, sz: 11, bold: true } };

    // Todo el estilo de cada celda (número, alineación, color) se arma en UN solo objeto
    // y se asigna una sola vez por celda, para evitar que una asignación posterior pise a otra.
    const columnasNumericas = ['D', 'E', 'F', 'G', 'H'];
    const columnasEspecialAmarillo = ['A', 'B', 'C', 'D'];
    filasFolios.forEach((f, idx) => {
        const r = dataStartRow + idx;
        const esEspecial = f.categoria === 'ESPECIAL';
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(col => {
            const cell = ws[`${col}${r + 1}`];
            if (!cell) return;
            const estilo = { font: { name: FUENTE, sz: 9 }, alignment: { horizontal: 'center' } };
            if (columnasNumericas.includes(col)) estilo.numFmt = '#,##0';
            if (esEspecial && columnasEspecialAmarillo.includes(col)) estilo.fill = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } };
            cell.s = estilo;
        });
    });

    const totalesRowIdx = dataStartRow + filasFolios.length;
    const filaTotal = totalesRowIdx + 1;
    const estiloTotalRosa = { fill: { patternType: 'solid', fgColor: { rgb: 'FF1584' } }, font: { name: FUENTE, sz: 9, color: { rgb: 'FFFFFF' }, bold: true }, alignment: { horizontal: 'center' } };
    ['A', 'B', 'C', 'D'].forEach(col => { if (ws[`${col}${filaTotal}`]) ws[`${col}${filaTotal}`].s = estiloTotalRosa; });
    if (ws[`H${filaTotal}`]) ws[`H${filaTotal}`].s = { numFmt: '#,##0', font: { name: FUENTE, sz: 9 }, alignment: { horizontal: 'center' } };

    const headerStyleBase = { font: { name: FUENTE, sz: 10, bold: true }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const headerRosa = { ...headerStyleBase, fill: { patternType: 'solid', fgColor: { rgb: 'FF1584' } }, font: { ...headerStyleBase.font, color: { rgb: 'FFFFFF' } } };
    const headerRppNacional = { ...headerStyleBase, fill: { patternType: 'solid', fgColor: { rgb: 'BC326D' } }, font: { ...headerStyleBase.font, color: { rgb: 'FFFFFF' } } };
    const headerRppLocal = { ...headerStyleBase, fill: { patternType: 'solid', fgColor: { rgb: '6FC5E6' } } };
    const headerCandIndep = { ...headerStyleBase, fill: { patternType: 'solid', fgColor: { rgb: 'ECD5E9' } } };
    const headerStylesPorCol = { A: headerRosa, B: headerRosa, C: headerRosa, D: headerRosa, E: headerRppNacional, F: headerRppLocal, G: headerCandIndep, H: headerRosa, I: headerRosa, J: headerRosa, K: headerRosa };
    Object.entries(headerStylesPorCol).forEach(([col, estilo]) => {
        const cell = ws[`${col}4`];
        if (cell) cell.s = estilo;
    });

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, String(distritoInfo.numero || 'Distrito'));

    window.XLSX.writeFile(wb, `Asignacion_Folios_Distrito_${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`, { cellStyles: true });
  };

  const seccionesAgrupadas = useMemo(() => {
    const grupos = {};
    filasConsolidadoFinal.forEach(row => {
        if (!grupos[row.seccion]) grupos[row.seccion] = [];
        grupos[row.seccion].push(row);
    });
    return Object.entries(grupos).map(([seccion, rows]) => ({
        seccion,
        rows,
        totalPadron: rows.reduce((sum, r) => sum + Number(r.countPadron), 0),
        totalLista: rows.reduce((sum, r) => sum + Number(r.countLista), 0),
        tieneVariacion: rows.some(r => r.variacion),
        tieneNoInstala: rows.some(r => r.distPadron.some(d => d.nombre === 'NO INSTALA') || r.distLista.some(d => d.nombre === 'NO INSTALA')),
        tieneMenos100: rows.some(r => Number(r.padronRef) < 100 || Number(r.listaRef) < 100),
        categorias: [...new Set(rows.map(r => r.categoria))],
    }));
  }, [filasConsolidadoFinal]);

  const seccionesFiltradas = useMemo(() => {
    const q = busquedaProyeccion.trim().toLowerCase();
    if (!q) return seccionesAgrupadas;
    return seccionesAgrupadas
        .map(grupo => {
            const seccionMatch = String(grupo.seccion).toLowerCase().includes(q);
            if (seccionMatch) return grupo;
            const rowsMatch = grupo.rows.filter(r =>
                String(r.nomenclaturaPadron || '').toLowerCase().includes(q) ||
                String(r.nomenclaturaLista || '').toLowerCase().includes(q) ||
                String(r.categoria || '').toLowerCase().includes(q)
            );
            return rowsMatch.length > 0 ? { ...grupo, rows: rowsMatch } : null;
        })
        .filter(Boolean);
  }, [seccionesAgrupadas, busquedaProyeccion]);

  const countVariacion = useMemo(() => seccionesAgrupadas.filter(g => g.tieneVariacion).length, [seccionesAgrupadas]);
  const countMenos100 = useMemo(() => seccionesAgrupadas.filter(g => g.tieneMenos100).length, [seccionesAgrupadas]);
  const seccionesMostradas = useMemo(() => {
      if (!filtroAlerta) return seccionesFiltradas;
      if (filtroAlerta === 'variacion') return seccionesFiltradas.filter(g => g.tieneVariacion);
      if (filtroAlerta === 'menos100') return seccionesFiltradas.filter(g => g.tieneMenos100);
      return seccionesFiltradas;
  }, [seccionesFiltradas, filtroAlerta]);

  const desgloseTiposCasilla = useMemo(() => {
      let basicas = 0; let contiguas = 0; let extraordinarias = 0; let especiales = 0;
      consolidadoB_C.forEach(r => {
          if (r.countPadron > 0) { basicas += 1; contiguas += (r.countPadron - 1); }
      });
      casillasGlobales.forEach(c => {
          const st = calcularProyeccion(c);
          if (String(c.tipo).startsWith('S')) especiales += st.totalMesasPadron;
          else extraordinarias += st.totalMesasPadron;
      });
      return { basicas, contiguas, extraordinarias, especiales };
  }, [consolidadoB_C, casillasGlobales]);

  const totalCasillasDistrito = useMemo(() => {
    let bcPadron = 0; let bcLista = 0;
    consolidadoB_C.forEach(r => { bcPadron += r.countPadron; bcLista += r.countLista; });
    
    let exPadron = 0; let exLista = 0; let espPadron = 0; let espLista = 0;
    casillasGlobales.forEach(c => { 
      const st = calcularProyeccion(c); 
      if (String(c.tipo).startsWith('S')) {
          espPadron += st.totalMesasPadron; espLista += st.totalMesasLista;
      } else {
          exPadron += st.totalMesasPadron; exLista += st.totalMesasLista;
      }
    });
    
    const totalPadron = bcPadron + exPadron + espPadron;
    const totalLista = bcLista + exLista + espLista;
    return { totalPadron, totalLista, bcPadron, bcLista, exPadron, exLista, espPadron, espLista, variacion: totalPadron !== totalLista };
  }, [consolidadoB_C, casillasGlobales]);

  const todasLasCasillasEquipamiento = useMemo(() => {
     const lista = [];
     filasConsolidadoFinal.forEach(row => {
         const count = equipConfig.modoProyeccion === 'padron' ? row.countPadron : row.countLista;
         for (let i = 0; i < count; i++) {
             let nom = '';
             if (row.categoria === 'ESPECIAL') { nom = row.nomenclaturaPadron; }
             else if (row.categoria === 'EXTRAORDINARIA') { nom = i === 0 ? row.nomenclaturaPadron.split(',')[0] : `${row.nomenclaturaPadron.split(',')[0]}C${i}`; }
             else { nom = i === 0 ? 'B' : `C${i}`; }
             lista.push({ id: `${row.seccion}-${nom}`, seccion: row.seccion, municipio: row.mun, nombre: nom, categoria: row.categoria });
         }
     });
     return lista;
  }, [filasConsolidadoFinal, equipConfig.modoProyeccion]);

  const seccionesUbicacion = useMemo(() => {
      const grupos = {};
      todasLasCasillasEquipamiento.forEach(c => {
          const secId = normalizarClave(c.seccion);
          if (!grupos[secId]) grupos[secId] = { seccion: c.seccion, municipio: c.municipio, casillas: [] };
          const clave = claveCasillaUbicacion(c.seccion, c.nombre);
          const asign = ubicacionCasillas[clave];
          const dom = asign ? domicilios[asign.domicilioId] : null;
          // Grupo físico: básica + sus contiguas comparten domicilio ('B'); cada extraordinaria
          // (con sus propias contiguas) y cada especial forman su propio grupo. Nunca se cruzan
          // entre sí, porque en la realidad casi siempre tienen domicilios distintos.
          const grupoFisico = c.categoria === 'BASICA' ? 'B' : String(c.nombre).replace(/C\d+$/, '');
          grupos[secId].casillas.push({ clave, nombre: c.nombre, categoria: c.categoria, grupoFisico, asign, dom });
      });
      return Object.values(grupos).map(g => {
          const domiciliosUnicos = new Set(g.casillas.filter(c => c.asign).map(c => c.asign.domicilioId));
          const asignadas = g.casillas.filter(c => c.asign).length;
          let estado;
          if (asignadas === 0) estado = 'sin_asignar';
          else if (asignadas < g.casillas.length) estado = 'parcial';
          else if (domiciliosUnicos.size === 1) estado = 'completo_unico';
          else estado = 'completo_multiple';

          // Clusters completables automáticamente: mismo grupo físico, con UN solo domicilio
          // consistente entre las casillas ya asignadas y al menos una casilla faltante.
          const clustersPorGrupo = {};
          g.casillas.forEach(c => { (clustersPorGrupo[c.grupoFisico] = clustersPorGrupo[c.grupoFisico] || []).push(c); });
          const clustersCompletables = Object.values(clustersPorGrupo).map(casillasCluster => {
              const asignadasCluster = casillasCluster.filter(c => c.asign);
              const faltantes = casillasCluster.filter(c => !c.asign);
              const domiciliosIdsCluster = new Set(asignadasCluster.map(c => c.asign.domicilioId));
              if (asignadasCluster.length === 0 || faltantes.length === 0 || domiciliosIdsCluster.size !== 1) return null;
              return { claveOrigen: asignadasCluster[0].clave, faltantes: faltantes.map(c => c.clave) };
          }).filter(Boolean);
          const totalFaltantesCompletables = clustersCompletables.reduce((s, c) => s + c.faltantes.length, 0);

          return { ...g, asignadas, total: g.casillas.length, domiciliosUnicos: domiciliosUnicos.size, estado, clustersCompletables, totalFaltantesCompletables };
      }).sort((a, b) => (parseInt(a.seccion) || 0) - (parseInt(b.seccion) || 0));
  }, [todasLasCasillasEquipamiento, ubicacionCasillas, domicilios]);

  const completarClustersAutomaticamente = (clustersCompletables) => {
      clustersCompletables.forEach(cluster => copiarDomicilioDeCasilla(cluster.claveOrigen, cluster.faltantes));
  };

  const conteoTiposDomicilio = useMemo(() => {
      const counts = {};
      Object.values(domicilios).forEach(d => {
          const t = (d.tipoDomicilio || '').trim() || 'SIN TIPO';
          counts[t] = (counts[t] || 0) + 1;
      });
      return counts;
  }, [domicilios]);

  const statsEquipamiento = useMemo(() => {
     let b_c = 0, extra = 0, esp = 0;
     todasLasCasillasEquipamiento.forEach(c => {
         if (c.categoria === 'ESPECIAL') esp++;
         else if (c.categoria === 'EXTRAORDINARIA') extra++;
         else b_c++;
     });
     return { b_c, extra, esp, total: b_c + extra + esp };
  }, [todasLasCasillasEquipamiento]);

  // La mampara de accesibilidad es un extra OBLIGATORIO (1 por cada 4 casillas que comparten
  // domicilio), nunca condicional a si el domicilio ya es accesible. Cuando el Módulo de
  // Ubicación ya tiene el domicilio real de una casilla, se agrupa por ese domicilio real (así
  // se refleja si en la práctica el domicilio se dividió o se unificó distinto a lo asumido).
  // Las casillas que AÚN no se han capturado en Ubicación jamás se excluyen: siguen agrupándose
  // con la regla estructural de siempre (básica + contiguas, o cada extraordinaria + sus
  // contiguas, o cada especial por separado) para que el requerimiento nunca se subestime.
  const mamparasAccesibilidadPorDomicilio = useMemo(() => {
     const gruposReales = {};
     const gruposDefault = {};
     todasLasCasillasEquipamiento.forEach(c => {
         const clave = claveCasillaUbicacion(c.seccion, c.nombre);
         const asign = ubicacionCasillas[clave];
         if (asign && asign.domicilioId) {
             const dom = domicilios[asign.domicilioId];
             const key = `real-${asign.domicilioId}`;
             if (!gruposReales[key]) gruposReales[key] = { municipio: c.municipio, seccion: c.seccion, domicilio: dom?.domicilio || '(domicilio sin dirección)', categorias: new Set(), casillas: [] };
             gruposReales[key].categorias.add(c.categoria);
             gruposReales[key].casillas.push(c.nombre);
         } else {
             const domicilioBase = c.categoria === 'BASICA' ? 'B' : String(c.nombre).replace(/C\d+$/, '');
             const key = `${c.seccion}-${domicilioBase}`;
             if (!gruposDefault[key]) gruposDefault[key] = { municipio: c.municipio, seccion: c.seccion, domicilio: domicilioBase, categorias: new Set([c.categoria]), casillas: [] };
             gruposDefault[key].casillas.push(c.nombre);
         }
     });
     let totalMamparasAccesibilidad = 0;
     const detalle = [...Object.values(gruposReales), ...Object.values(gruposDefault)]
        .sort((a, b) => (parseInt(a.seccion) || 0) - (parseInt(b.seccion) || 0) || String(a.domicilio).localeCompare(String(b.domicilio), undefined, { numeric: true }))
        .map(g => {
            const mamparas = Math.ceil(g.casillas.length / 4);
            totalMamparasAccesibilidad += mamparas;
            const categoria = g.categorias.size > 1 ? 'MIXTO' : [...g.categorias][0];
            return { municipio: g.municipio, seccion: g.seccion, domicilio: g.domicilio, categoria, numCasillas: g.casillas.length, casillas: g.casillas, mamparas };
        });
     return { total: totalMamparasAccesibilidad, totalDomicilios: detalle.length, detalle };
  }, [todasLasCasillasEquipamiento, ubicacionCasillas, domicilios]);

  const exportarReporteDomicilios = () => {
    if (!window.XLSX) return;
    const headers = ['Municipio', 'Sección', 'Domicilio', 'Categoría', 'N° Casillas', 'Casillas que lo componen', 'Mamparas de Accesibilidad Requeridas'];
    const rows = [headers];
    mamparasAccesibilidadPorDomicilio.detalle.forEach(g => {
        rows.push([g.municipio, f4(g.seccion), g.domicilio, g.categoria, g.numCasillas, g.casillas.join(', '), g.mamparas]);
    });
    rows.push(['', '', '', 'TOTALES', mamparasAccesibilidadPorDomicilio.detalle.reduce((s, g) => s + g.numCasillas, 0), '', mamparasAccesibilidadPorDomicilio.total]);

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 11 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 16 }];

    const headerStyle = { fill: { patternType: 'solid', fgColor: { rgb: 'FF1584' } }, font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    headers.forEach((_, i) => {
        const addr = window.XLSX.utils.encode_cell({ r: 0, c: i });
        if (ws[addr]) ws[addr].s = headerStyle;
    });
    const totalRowIdx = mamparasAccesibilidadPorDomicilio.detalle.length + 1;
    ['D', 'E', 'G'].forEach(col => {
        const cell = ws[`${col}${totalRowIdx + 1}`];
        if (cell) cell.s = { font: { bold: true }, alignment: { horizontal: 'center' } };
    });

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Domicilios');
    window.XLSX.writeFile(wb, `Reporte_Domicilios_D${f4(distritoInfo.numero)}_${obtenerFechaHoraArchivo()}.xlsx`);
  };

  const equipamientoDistrital = useMemo(() => {
      const totales = {
          mobiliario: { tablonesMesas: 0 },
          sillas: { total: 0, fmdcu: 0, nacionales: 0, locales: 0, urna: 0 },
          materialIne: { canceles: 0, mamparas: 0, marcadorasCredenciales: 0, liquidosIndelebles: 0, marcadoresBoletas: 0, urnasFederales: 0 },
          materialOpl: { urnasLocales: 0, basesPortaUrna: 0, cancelPorCasilla: 0, cancelOpcional: 0, mamparaOpcional: 0, marcadoresBoletas: 0 }
      };
      todasLasCasillasEquipamiento.forEach(c => {
          const tipo = mamparasPorCasilla[c.id] || 'cancel';
          const req = calcularEquipamientoCasilla(equipConfig.totalElecciones, tipo === 'mampara', equipConfig);
          totales.mobiliario.tablonesMesas += req.mobiliario.tablonesMesas;
          totales.sillas.total += req.sillas.total; totales.sillas.fmdcu += req.sillas.fmdcu; totales.sillas.nacionales += req.sillas.nacionales; totales.sillas.locales += req.sillas.locales; totales.sillas.urna += req.sillas.urna;
          totales.materialIne.canceles += req.materialIne.canceles; totales.materialIne.mamparas += req.materialIne.mamparas; totales.materialIne.marcadorasCredenciales += req.materialIne.marcadorasCredenciales; totales.materialIne.liquidosIndelebles += req.materialIne.liquidosIndelebles; totales.materialIne.marcadoresBoletas += req.materialIne.marcadoresBoletas; totales.materialIne.urnasFederales += req.materialIne.urnasFederales;
          totales.materialOpl.urnasLocales += req.materialOpl.urnasLocales; totales.materialOpl.basesPortaUrna += req.materialOpl.basesPortaUrna; totales.materialOpl.cancelPorCasilla += req.materialOpl.cancelPorCasilla; totales.materialOpl.cancelOpcional += req.materialOpl.cancelOpcional; totales.materialOpl.mamparaOpcional += req.materialOpl.mamparaOpcional; totales.materialOpl.marcadoresBoletas += req.materialOpl.marcadoresBoletas;
      });
      return totales;
  }, [todasLasCasillasEquipamiento, mamparasPorCasilla, equipConfig]);

  const paqueteCancel = useMemo(() => calcularEquipamientoCasilla(equipConfig.totalElecciones, false, equipConfig), [equipConfig]);
  const paqueteMampara = useMemo(() => calcularEquipamientoCasilla(equipConfig.totalElecciones, true, equipConfig), [equipConfig]);

  useEffect(() => {
    let unsubscribe = () => {};
    if (isCloudEnabled && auth) {
      const initAuth = async () => {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
          else await signInAnonymously(auth);
        } catch (err) { console.error("Auth:", err); }
      };
      initAuth();
      unsubscribe = onAuthStateChanged(auth, setUser);
    } else { setUser({ uid: 'local-user' }); }

    const lastDistrictStr = localStorage.getItem('proyector_last_district');
    if (lastDistrictStr) {
        try {
            const parsedDistrict = JSON.parse(lastDistrictStr); setDistritoInfo(parsedDistrict);
            setCabeceraDistrital(localStorage.getItem(`proyector_cabecera_D${parsedDistrict.numero}`) || "");
            cargarUbicacionDeDistrito(parsedDistrict.numero);
            const savedExcelStr = localStorage.getItem(`proyector_excel_D${parsedDistrict.numero}`);
            if (savedExcelStr) {
                const parsedExcel = JSON.parse(savedExcelStr);
                if (parsedExcel && parsedExcel.length > 0) {
                    setRawElectoralData(parsedExcel);
                    setIsDistrictValidated(true);
                    setCasillasGlobales(cargarCasillasLocal(parsedDistrict.numero, parsedExcel));
                }
            }
        } catch (e) { setView('welcome'); }
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.XLSX) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
      script.async = true; 
      script.onload = () => setIsXlsxLibLoading(false);
      document.head.appendChild(script);
    } else if (window.XLSX) {
      setIsXlsxLibLoading(false);
    }
  }, []);

  useEffect(() => {
    if (form.rol === 'alimentadora') {
        const destinoValido = sedesActivas.some(s => String(s.uid) === String(form.casillaUidDestino));
        if (!destinoValido) setForm(prev => ({ ...prev, casillaUidDestino: sedesActivas.length > 0 ? String(sedesActivas[0].uid) : "" }));
    }
  }, [form.rol, sedesActivas, form.casillaUidDestino]);

  useEffect(() => {
    if (!isCloudEnabled || !db || !user || !distritoInfo.numero || rawElectoralData.length === 0 || view === 'welcome' || view === 'upload') {
        if (!isCloudEnabled) setSyncStatus('offline'); return;
    }
    
    const normalize = (val) => String(val).trim().padStart(4, '0');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'maquetas', `distrito_${distritoInfo.numero}`);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists() && !isLocalActionActive.current) {
        try {
          const data = docSnap.data();
          // Todo lo del distrito EXCEPTO el padrón viaja por la nube (Diseño, Ubicación,
          // Equipamiento y Folios). El padrón (rawElectoralData) se queda siempre local.
          const remoto = {
            casillas: data.casillas || [],
            domicilios: data.domicilios || {},
            ubicacionCasillas: data.ubicacionCasillas || {},
            equipConfig: data.equipConfig || DEFAULT_EQUIP_CONFIG,
            mamparasPorCasilla: data.mamparasPorCasilla || {},
            folioConfig: data.folioConfig || DEFAULT_FOLIO_CONFIG,
            fechaCorte: data.fechaCorte || "",
            cabeceraDistrital: data.cabeceraDistrital || "",
          };
          const cloudJson = JSON.stringify(remoto);

          if (cloudJson !== lastSavedJson.current) {
            const vinculadas = remoto.casillas.map(c => {
              const isEspecial = String(c.tipo).startsWith('S');
              if (isEspecial) return { uid: c.uid, tipo: c.tipo, sede: { seccion: c.sedeRef.s }, alimentadoras: [] };

              const sede = rawElectoralData.find(m => normalize(m.seccion) === normalize(c.sedeRef.s) && normalize(m.localidad) === normalize(c.sedeRef.l) && normalize(m.manzana) === normalize(c.sedeRef.m));
              const alimentadoras = (c.alimentadorasRefs || []).map(ref => rawElectoralData.find(m => normalize(m.seccion) === normalize(ref.s) && normalize(m.localidad) === normalize(ref.l) && normalize(m.manzana) === normalize(ref.m))).filter(Boolean);
              if (!sede) return null;
              return { uid: c.uid, tipo: c.tipo, sede, alimentadoras };
            }).filter(Boolean);

            lastSavedJson.current = cloudJson;
            setCasillasGlobales(vinculadas);
            setDomicilios(remoto.domicilios);
            setUbicacionCasillas(remoto.ubicacionCasillas);
            setEquipConfig({ ...DEFAULT_EQUIP_CONFIG, ...remoto.equipConfig });
            setMamparasPorCasilla(remoto.mamparasPorCasilla);
            setFolioConfig({ ...DEFAULT_FOLIO_CONFIG, ...remoto.folioConfig });
            setFechaCorte(remoto.fechaCorte);
            if (remoto.cabeceraDistrital) setCabeceraDistrital(remoto.cabeceraDistrital);
          }
        } catch (err) { console.error("Error leyendo de Firestore", err); }
      }
      setIsInitialLoadFinished(true);
      setSyncStatus('synced');
    }, (err) => { setSyncStatus('error'); });

    return () => unsubscribe();
  }, [user, distritoInfo.numero, rawElectoralData.length, view]);

  useEffect(() => {
    if (!isCloudEnabled || !db || !user || !distritoInfo.numero || !isInitialLoadFinished) return;

    const currentRefs = casillasGlobales.map(c => {
      if (String(c.tipo).startsWith('S')) return { tipo: c.tipo, uid: c.uid, sedeRef: { s: c.sede.seccion } };
      return {
        tipo: c.tipo, uid: c.uid,
        sedeRef: { s: c.sede.seccion, l: c.sede.localidad, m: c.sede.manzana },
        alimentadorasRefs: (c.alimentadoras || []).map(a => ({ s: a.seccion, l: a.localidad, m: a.manzana }))
      };
    });

    const payload = {
      casillas: currentRefs,
      domicilios,
      ubicacionCasillas,
      equipConfig,
      mamparasPorCasilla,
      folioConfig,
      fechaCorte,
      cabeceraDistrital,
    };
    const currentJson = JSON.stringify(payload);
    if (currentJson === lastSavedJson.current) return;

    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    isLocalActionActive.current = true;

    unlockTimerRef.current = setTimeout(async () => {
      setSyncStatus('saving');
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'maquetas', `distrito_${distritoInfo.numero}`);
      try {
        await setDoc(docRef, { distrito: distritoInfo, ...payload, updatedAt: new Date().toISOString() });
        lastSavedJson.current = currentJson;
        setSyncStatus('synced');
      } catch (err) { setSyncStatus('error'); }
      finally { setTimeout(() => { isLocalActionActive.current = false; }, 300); }
    }, 1500);

    return () => clearTimeout(unlockTimerRef.current);
  }, [casillasGlobales, domicilios, ubicacionCasillas, equipConfig, mamparasPorCasilla, folioConfig, fechaCorte, cabeceraDistrital, distritoInfo.numero, user, isInitialLoadFinished]);

  useEffect(() => {
    if (view === 'welcome') {
        const fetchDashboard = async () => {
            setDashboardData(prev => ({...prev, loading: true}));
            const localKeys = Object.keys(localStorage).filter(k => k.startsWith('proyector_excel_D'));
            const localDistricts = localKeys.map(k => k.replace('proyector_excel_D', '')).sort((a, b) => Number(a) - Number(b));
            
            let cloudDistricts = [];
            if (isCloudEnabled && db && user && user.uid !== 'local-user') {
                try {
                    const maquetasRef = collection(db, 'artifacts', appId, 'public', 'data', 'maquetas');
                    const snap = await getDocs(maquetasRef);
                    cloudDistricts = snap.docs.map(d => d.id.replace('distrito_', '')).sort((a, b) => Number(a) - Number(b));
                } catch (e) { console.warn("No se pudieron cargar los distritos de la nube.", e); }
            }
            setDashboardData({ loading: false, local: localDistricts, cloud: cloudDistricts });
        };
        fetchDashboard();
    }
  }, [view, user]);

  const limpiarCaché = () => {
      setModalConfig({
          isOpen: true,
          message: '¿Seguro que deseas borrar el Padrón guardado en este navegador? Tu maqueta en la nube NO se borrará.',
          onConfirm: () => {
              localStorage.clear(); setDistritoInfo({ numero: "", estado: "MÉXICO" });
              setRawElectoralData([]); setCasillasGlobales([]); setView('welcome'); setIsDistrictValidated(false);
          }
      });
  };

  const renderHeader = () => (
    <header className="bg-white text-slate-800 px-6 py-4 flex justify-between items-center shadow-sm shrink-0 pointer-events-auto z-50 border-b-4 border-pink-600">
      <div className="flex items-center gap-4">
        <div className="bg-pink-600 text-white p-1.5 rounded-lg shadow-md pointer-events-none"><Monitor className="w-4 h-4" /></div>
        <h1 className="text-sm font-black tracking-tighter uppercase italic leading-none pointer-events-none text-slate-800">D{distritoInfo.numero} | {view === 'extraordinary' ? 'DISEÑO' : view === 'equipamiento' ? 'EQUIPAMIENTO' : view === 'ubicacion' ? 'UBICACIÓN DE CASILLAS' : 'PROYECCIÓN DE CASILLAS'}</h1>
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-slate-200 ml-4 pointer-events-none">
           {!isCloudEnabled ? ( <><CloudOff className="w-3 h-3 text-slate-500" /><span className="text-[8px] font-black uppercase text-slate-500">Modo Local</span></> ) : syncStatus === 'saving' ? ( <><RefreshCw className="w-3 h-3 text-pink-600 animate-spin" /><span className="text-[8px] font-black uppercase text-slate-500">Sincronizando...</span></> ) : ( <><Cloud className="w-3 h-3 text-emerald-500" /><span className="text-[8px] font-black uppercase text-slate-500">Nube OK</span></> )}
        </div>
      </div>
    </header>
  );

  if (view === 'welcome') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6 text-center relative overflow-hidden">
        {localStorage.getItem('proyector_last_district') && (
             <button onClick={limpiarCaché} className="absolute top-6 right-6 text-xs text-slate-500 hover:text-red-500 flex items-center gap-2 transition-all z-20"><Trash2 className="w-4 h-4"/> Limpiar Caché Local</button>
        )}
        
        <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 z-10">
            <div className="bg-pink-600 p-10 rounded-[3rem] shadow-xl border border-pink-500 relative overflow-hidden flex flex-col justify-center text-center">
              <Cloud className="w-16 h-16 mx-auto mb-6 text-white" />
              <h2 className="text-3xl font-black mb-2 tracking-tighter uppercase italic leading-none text-white">Proyector Cloud</h2>
              <p className="text-pink-200 text-[10px] mb-8 uppercase tracking-[0.3em] font-bold italic">v18.0 | Panel de Control</p>
              
              <div className="space-y-4">
                  <p className="text-xs font-bold text-pink-100 uppercase tracking-widest text-left">Crear o Entrar a Distrito</p>
                  <input type="text" placeholder="Número de Distrito (Ej. 12)" className="w-full bg-pink-700/50 border border-pink-500 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-white outline-none text-center text-white placeholder:text-pink-300" value={distritoInfo.numero} onChange={e => { setDistritoInfo({...distritoInfo, numero: e.target.value}); setIsDistrictValidated(false); }}/>
                  
                  {!isDistrictValidated ? (
                      <button onClick={() => { 
                          if(distritoInfo.numero) {
                              const savedExcelStr = localStorage.getItem(`proyector_excel_D${distritoInfo.numero}`);
                              if (savedExcelStr) {
                                  try {
                                      const parsed = JSON.parse(savedExcelStr);
                                      if (parsed && parsed.length > 0) { setIsDistrictValidated(true); return; }
                                  } catch(e){}
                              }
                              const numStr = String(distritoInfo.numero);
                              localStorage.setItem('proyector_last_district', JSON.stringify({ numero: numStr, estado: "MÉXICO" }));
                              setCasillasGlobales([]); setDomicilios({}); setUbicacionCasillas({});
                              setView('upload');
                          }
                      }} className="w-full bg-white hover:bg-pink-50 text-pink-700 font-black py-4 rounded-2xl active:scale-95 uppercase tracking-widest text-xs shadow-lg transition-all">Validar Distrito <ArrowRight className="w-4 h-4 inline ml-1" /></button>
                  ) : (
                      <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
                          <div className="flex items-center gap-2 text-white bg-pink-700 p-3 rounded-xl border border-pink-500 text-sm font-bold justify-center shadow-sm">
                              <CheckCircle2 className="w-5 h-5" /> Padrón Detectado en Memoria
                          </div>
                          <p className="text-xs text-pink-100 font-bold uppercase tracking-widest text-left pt-1">¿A dónde deseas ir?</p>
                          <div className="flex gap-2">
                              <button onClick={() => { loadDistrictFromDashboard(distritoInfo.numero, 'extraordinary'); }} className="w-full bg-white hover:bg-pink-50 text-pink-700 font-black py-4 rounded-2xl active:scale-95 uppercase tracking-widest text-xs shadow-md transition-all">Extraordinarias <ArrowRight className="w-4 h-4 inline ml-1" /></button>
                              <button onClick={() => { loadDistrictFromDashboard(distritoInfo.numero, 'final'); }} className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl active:scale-95 uppercase tracking-widest text-xs shadow-md transition-all">Proyección <ChevronRight className="w-4 h-4 inline ml-1" /></button>
                          </div>
                      </div>
                  )}
              </div>
            </div>

            <div className="bg-white/80 p-8 rounded-[3rem] shadow-xl border border-slate-200 flex flex-col text-left h-[500px]">
               <h3 className="text-xl font-black mb-6 text-pink-600 flex items-center gap-2"><Database className="w-5 h-5"/> Directorio de Proyectos</h3>
               
               <div className="flex-1 overflow-y-auto pr-2 space-y-8 custom-scrollbar">
                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-2 border-b border-slate-200 pb-2"><Cloud className="w-4 h-4 text-pink-500"/> Respaldos en la Nube</h4>
                    {dashboardData.loading ? <p className="text-sm text-slate-400 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin"/> Buscando...</p> : 
                     dashboardData.cloud.length === 0 ? <p className="text-sm text-slate-400 italic">No hay distritos guardados en la nube.</p> :
                     <div className="flex flex-wrap gap-2">
                        {dashboardData.cloud.map(d => (
                            <div key={`cloud-${d}`} className="flex shadow-sm rounded-xl overflow-hidden border border-pink-200">
                                <button onClick={() => loadDistrictFromDashboard(d, 'extraordinary')} className="bg-pink-50 hover:bg-pink-100 text-pink-700 px-4 py-2 text-sm font-black transition-all flex items-center gap-2">
                                    D{f4(d)} <ArrowRight className="w-4 h-4 opacity-50"/>
                                </button>
                                <button onClick={() => loadDistrictFromDashboard(d, 'final')} title="Ir directo a Proyección" className="bg-pink-50 hover:bg-slate-800 hover:text-white text-pink-700 px-3 py-2 text-sm font-black transition-all border-l border-pink-200 flex items-center justify-center">
                                    <ChevronRight className="w-4 h-4"/>
                                </button>
                            </div>
                        ))}
                     </div>
                    }
                  </div>

                  <div>
                    <h4 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-2 border-b border-slate-200 pb-2"><HardDrive className="w-4 h-4 text-slate-600"/> En este equipo (Padrones)</h4>
                     {dashboardData.local.length === 0 ? <p className="text-sm text-slate-400 italic">No hay padrones Excel guardados localmente.</p> :
                     <div className="flex flex-wrap gap-2">
                        {dashboardData.local.map(d => (
                            <div key={`local-${d}`} className="flex shadow-sm rounded-xl overflow-hidden border border-slate-300">
                                <button onClick={() => loadDistrictFromDashboard(d, 'extraordinary')} className="bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 text-sm font-black transition-all">
                                    D{f4(d)}
                                </button>
                                <button onClick={() => loadDistrictFromDashboard(d, 'final')} title="Ir directo a Proyección" className="bg-slate-50 hover:bg-slate-800 hover:text-white text-slate-700 px-3 py-2 text-sm font-black transition-all border-l border-slate-300 flex items-center justify-center">
                                    <ChevronRight className="w-4 h-4"/>
                                </button>
                            </div>
                        ))}
                     </div>
                    }
                  </div>
               </div>
            </div>
        </div>
      </div>
    );
  }

  if (view === 'upload') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-6 text-center">
        <div className="max-w-md w-full bg-pink-600 p-10 rounded-[3rem] shadow-2xl border border-pink-500 relative overflow-hidden text-center">
          <button onClick={() => setView('welcome')} className="absolute top-6 left-6 text-pink-200 hover:text-white"><RotateCcw className="w-4 h-4" /></button>
          <Database className="w-12 h-12 mx-auto mb-4 text-white" />
          <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter text-white leading-tight">Carga de Padrón</h2>
          <p className="text-pink-200 text-xs mb-8 uppercase tracking-[0.2em] font-bold italic">Distrito {f4(distritoInfo.numero)}</p>
          {errorMessage && ( <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-left animate-in fade-in slide-in-from-top-1"><ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" /><p className="text-xs font-bold text-red-700 leading-tight">{errorMessage}</p></div> )}
          
          {rawElectoralData.length === 0 ? (
            <label className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-pink-400 rounded-3xl hover:bg-pink-700 cursor-pointer transition-all bg-pink-600 shadow-sm">
              <FileSpreadsheet className="w-10 h-10 text-white mb-4" />
              <span className="text-xs font-black uppercase tracking-widest text-pink-100">Seleccionar Padrón (.xlsx)</span>
              <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
            </label>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 mt-4">
               <div className="p-6 bg-white border border-pink-200 rounded-3xl flex flex-col items-center shadow-sm">
                   <CheckCircle2 className="w-12 h-12 text-pink-500 mb-2" />
                   <h3 className="text-xl font-black text-pink-700 uppercase tracking-tighter italic">Padrón Cargado</h3>
                   <p className="text-xs text-pink-600 font-bold uppercase tracking-widest mt-1">
                       {rawElectoralData.length.toLocaleString()} Registros procesados
                   </p>
               </div>
               <p className="text-xs text-pink-100 font-bold uppercase tracking-widest pt-2">¿A dónde deseas ir?</p>
               <div className="flex gap-2 w-full mt-2">
                   <button onClick={() => setView('extraordinary')} className="w-full bg-white hover:bg-pink-50 text-pink-700 font-black py-4 rounded-2xl shadow-md uppercase tracking-widest text-xs transition-all">
                       Extraordinarias <ArrowRight className="w-4 h-4 inline ml-1" />
                   </button>
                   <button onClick={() => setView('final')} className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-2xl shadow-md uppercase tracking-widest text-xs transition-all">
                       Proyección <ChevronRight className="w-4 h-4 inline ml-1" />
                   </button>
               </div>

               <div className="pt-4 mt-2 border-t border-pink-400/50">
                   <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed border-pink-300 rounded-2xl transition-all text-pink-100 ${comparandoPadron ? 'opacity-60' : 'hover:bg-pink-700/50 cursor-pointer'}`}>
                       {comparandoPadron ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                       <span className="text-[10px] font-black uppercase tracking-widest">{comparandoPadron ? 'Comparando...' : 'Comparar con Corte Anterior'}</span>
                       <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleCompararPadronAnterior} disabled={comparandoPadron} />
                   </label>
               </div>

               {comparacionAnterior && (
                   <div className="p-5 bg-white rounded-3xl border-2 border-pink-200 text-left animate-in fade-in slide-in-from-bottom-2">
                       <div className="flex items-center justify-between mb-3">
                           <p className="text-xs font-black text-pink-700 uppercase tracking-widest">Resultado de la Comparación</p>
                           <button onClick={() => setComparacionAnterior(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                       </div>
                       <ul className="text-[11px] font-bold text-slate-600 space-y-1.5">
                           <li>Secciones: <span className="text-emerald-600">{comparacionAnterior.seccionesNuevas.length} nuevas</span> · <span className="text-red-600">{comparacionAnterior.seccionesDesaparecidas.length} desaparecieron</span></li>
                           <li>Localidades: <span className="text-emerald-600">{comparacionAnterior.localidadesNuevas.length} nuevas</span> · <span className="text-red-600">{comparacionAnterior.localidadesDesaparecidas.length} desaparecieron</span></li>
                           <li>Manzanas: <span className="text-emerald-600">{comparacionAnterior.manzanasNuevas.length} nuevas</span> · <span className="text-red-600">{comparacionAnterior.manzanasDesaparecidas.length} desaparecieron</span> · <span className="text-amber-600">{comparacionAnterior.manzanasCambiadas.length} cambiaron padrón/lista</span></li>
                       </ul>
                       <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                           <div className="text-center">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Padrón Electoral</p>
                               <p className="text-sm font-black text-slate-800">{comparacionAnterior.totalesDistrito.padronAnterior.toLocaleString()} → {comparacionAnterior.totalesDistrito.padronActual.toLocaleString()}</p>
                               <p className={`text-xs font-black ${comparacionAnterior.totalesDistrito.deltaPadron > 0 ? 'text-emerald-600' : comparacionAnterior.totalesDistrito.deltaPadron < 0 ? 'text-red-600' : 'text-slate-400'}`}>{comparacionAnterior.totalesDistrito.deltaPadron > 0 ? '+' : ''}{comparacionAnterior.totalesDistrito.deltaPadron.toLocaleString()}</p>
                           </div>
                           <div className="text-center">
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lista Nominal</p>
                               <p className="text-sm font-black text-slate-800">{comparacionAnterior.totalesDistrito.listaAnterior.toLocaleString()} → {comparacionAnterior.totalesDistrito.listaActual.toLocaleString()}</p>
                               <p className={`text-xs font-black ${comparacionAnterior.totalesDistrito.deltaLista > 0 ? 'text-emerald-600' : comparacionAnterior.totalesDistrito.deltaLista < 0 ? 'text-red-600' : 'text-slate-400'}`}>{comparacionAnterior.totalesDistrito.deltaLista > 0 ? '+' : ''}{comparacionAnterior.totalesDistrito.deltaLista.toLocaleString()}</p>
                           </div>
                       </div>
                       <button onClick={exportarReporteComparacionPadron} className="mt-4 w-full bg-pink-600 hover:bg-pink-700 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-md"><FileDown className="w-4 h-4" /> Descargar Reporte Excel</button>
                   </div>
               )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col overflow-hidden text-left">
      {renderHeader()}
      
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center shadow-sm z-40 relative">
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {NAV_SECCIONES.map(sec => {
                  const Icon = sec.icon;
                  const isActive = view === sec.key;
                  return (
                      <button key={sec.key} onClick={(e) => { e.stopPropagation(); setView(sec.key); }} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer ${isActive ? 'bg-pink-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-white'}`}>
                          <Icon className="w-3.5 h-3.5" /> {sec.label}
                      </button>
                  );
              })}
           </div>
           <button onClick={() => setView('upload')} title="Comparar el padrón cargado contra un corte anterior" className="flex items-center gap-2 bg-white hover:bg-pink-50 text-pink-700 border border-pink-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm"><ArrowRightLeft className="w-3 h-3" /> Comparar Padrón</button>
        </div>
        <div className="flex items-center gap-3">
          {view === 'extraordinary' ? (
            <div className="flex gap-2 mr-1 border-r border-slate-200 pr-4">
               <button onClick={(e) => {
                  e.stopPropagation();
                  const currentRefs = casillasGlobales.map(c => {
                    if (String(c.tipo).startsWith('S')) return { tipo: c.tipo, uid: c.uid, sedeRef: { s: c.sede.seccion } };
                    return { tipo: c.tipo, uid: c.uid, sedeRef: { s: c.sede.seccion, l: c.sede.localidad, m: c.sede.manzana }, alimentadorasRefs: (c.alimentadoras || []).map(a => ({ s: a.seccion, l: a.localidad, m: a.manzana })) };
                  });
                  const data = {distrito: distritoInfo, casillas: currentRefs};
                  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                  downloadBlob(blob, `BACKUP_D${distritoInfo.numero}.json`);
               }} title="Respaldar JSON" className="flex items-center gap-2 bg-pink-50 hover:bg-pink-100 text-pink-700 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all shadow-sm cursor-pointer border border-pink-200"><History className="w-3 h-3" /> Respaldo</button>
               <label className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shadow-sm border border-slate-200"><FileUp className="w-3 h-3" /> Cargar <input type="file" className="hidden" accept=".json" onChange={cargarRespaldoJSON} /></label>
            </div>
          ) : null}

          <button onClick={(e) => {
              e.stopPropagation();
              setModalConfig({ 
              isOpen: true, 
              message: '¿Seguro que deseas salir? Te recomendamos exportar un respaldo primero.', 
              onConfirm: () => { setRawElectoralData([]); setCasillasGlobales([]); setDistritoInfo({ numero: "", estado: "MÉXICO" }); lastSavedJson.current = ""; setIsInitialLoadFinished(false); setView('welcome'); setIsDistrictValidated(false); }
          })}} className="text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 p-2 rounded-lg border border-slate-200 transition-all text-left cursor-pointer ml-1 shadow-sm"><RotateCcw className="w-4 h-4 text-left" /></button>
        </div>
      </div>

      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 text-left bg-slate-50">
        
        {/* --- VISTA: EQUIPAMIENTO LOGÍSTICO (MÓDULO INDEPENDIENTE) --- */}
        {view === 'equipamiento' && (
          <div className="lg:col-span-12 overflow-y-auto p-10 text-left">
            <div className="max-w-7xl mx-auto space-y-8 pb-24">

              <div className="p-8 rounded-[2.5rem] bg-gradient-to-r from-pink-600 to-pink-800 text-white shadow-xl">
                  <div className="flex items-center gap-6">
                      <div className="p-4 rounded-2xl bg-white/20 shadow-inner">
                          <Box className="w-8 h-8 text-white" />
                      </div>
                      <div>
                          <p className="text-xs font-black uppercase tracking-[0.4em] text-pink-200">
                              Proyección Logística (Modelo de Casilla Única INE · PEC 2026-2027)
                          </p>
                          <h4 className="text-3xl font-black italic tracking-tighter mt-1 text-white">Módulo de Equipamiento</h4>
                      </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-white/20">
                      <div className="text-center sm:text-left">
                          <p className="text-[10px] font-bold text-pink-200 uppercase tracking-widest">Básicas / Cont.</p>
                          <p className="text-2xl font-black text-white mt-1">{statsEquipamiento.b_c}</p>
                      </div>
                      <div className="text-center sm:text-left">
                          <p className="text-[10px] font-bold text-pink-200 uppercase tracking-widest">Extraordinarias</p>
                          <p className="text-2xl font-black text-white mt-1">{statsEquipamiento.extra}</p>
                      </div>
                      <div className="text-center sm:text-left">
                          <p className="text-[10px] font-bold text-pink-200 uppercase tracking-widest">Especiales</p>
                          <p className="text-2xl font-black text-white mt-1">{statsEquipamiento.esp}</p>
                      </div>
                  </div>
              </div>

              {/* CONTROLES PRINCIPALES */}
              <SeccionColapsable title="Configuración de la Elección" icon={<Settings2 className="w-5 h-5 text-pink-500" />} isOpen={equipExpandido.config} onToggle={() => toggleEquipSeccion('config')}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Base de Proyección</label>
                          <div className="flex bg-slate-100 p-1 rounded-xl w-max border border-slate-200">
                              <button onClick={() => setEquipConfig({...equipConfig, modoProyeccion: 'padron'})} className={`px-6 py-2 rounded-lg text-sm font-black uppercase transition-colors ${equipConfig.modoProyeccion === 'padron' ? 'bg-white text-pink-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Padrón</button>
                              <button onClick={() => setEquipConfig({...equipConfig, modoProyeccion: 'lista'})} className={`px-6 py-2 rounded-lg text-sm font-black uppercase transition-colors ${equipConfig.modoProyeccion === 'lista' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Lista Nominal</button>
                          </div>
                          <p className="text-xs text-slate-400 mt-2 italic">Afecta el total de casillas estimadas (Actualmente: {statsEquipamiento.total} casillas).</p>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">Total de Elecciones a realizar</label>
                          <div className="flex items-center gap-2">
                              <input
                                  type="number"
                                  min="1"
                                  placeholder="Default (3)"
                                  className="w-32 bg-white border-2 border-slate-300 rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800"
                                  value={equipConfig.totalElecciones}
                                  onChange={e => setEquipConfig({...equipConfig, totalElecciones: e.target.value === '' ? '' : parseInt(e.target.value)})}
                              />
                              {equipConfig.totalElecciones !== 3 && equipConfig.totalElecciones !== '' && (
                                  <button onClick={() => setEquipConfig({...equipConfig, totalElecciones: 3})} title="Restaurar a default (3)" className="bg-slate-100 border border-slate-200 p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-600"><RotateCcw className="w-4 h-4" /></button>
                              )}
                          </div>
                          <p className="text-xs text-slate-400 mt-2 italic">Edomex 2027: 3 (Dip. Federales, Dip. Locales, Ayuntamientos). 5+ eleva mobiliario y habilita aportación OPL adicional.</p>
                      </div>
                  </div>
              </SeccionColapsable>

              {/* REPRESENTACIONES ACREDITADAS (afecta sillas y urnas locales) */}
              <SeccionColapsable title="Representaciones y Elecciones Locales" icon={<Users className="w-5 h-5 text-pink-500" />} isOpen={equipExpandido.representaciones} onToggle={() => toggleEquipSeccion('representaciones')}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Partidos Nacionales</label>
                          <input type="number" min="0" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={equipConfig.numPartidosNacionales} onChange={e => setEquipConfig({...equipConfig, numPartidosNacionales: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                          <p className="text-[10px] text-slate-400 mt-1">2 sillas c/u. Nota: 8 PPN con registro (Acuerdos INE/CG344/2026 e INE/CG347/2026).</p>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Partidos Locales</label>
                          <input type="number" min="0" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={equipConfig.numPartidosLocales} onChange={e => setEquipConfig({...equipConfig, numPartidosLocales: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                          <p className="text-[10px] text-slate-400 mt-1">2 PPL con registro vigente en Edomex: PRD (local desde 2024) y Podemos (nuevo, 2026) — corte agosto 2026.</p>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Sillas x Partido Local</label>
                          <input type="number" min="0" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={equipConfig.sillasPorPartidoLocal} onChange={e => setEquipConfig({...equipConfig, sillasPorPartidoLocal: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                          <p className="text-[10px] text-slate-400 mt-1">Modelo INE 2026-2027: 1 silla (solo puede estar una representación local a la vez en casilla)</p>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Elecciones Locales (urnas OPL)</label>
                          <input type="number" min="0" className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={equipConfig.numEleccionesLocales} onChange={e => setEquipConfig({...equipConfig, numEleccionesLocales: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                          <p className="text-[10px] text-slate-400 mt-1">Edomex: Dip. Locales + Ayuntamientos = 2</p>
                      </div>
                  </div>
              </SeccionColapsable>

              {/* EQUIPAMIENTO MOBILIARIO */}
              <SeccionColapsable title="Equipamiento Mobiliario" icon={<LayoutGrid className="w-5 h-5 text-pink-500" />} isOpen={equipExpandido.mobiliario} onToggle={() => toggleEquipSeccion('mobiliario')}>
                  <div className="border-2 p-4 rounded-2xl bg-slate-50 border-slate-200 max-w-md">
                      <p className="text-xs text-slate-500 mb-3">Tablones/mesas grandes + mesa pequeña para urna(s) o mamparas. Requisito obligatorio de la casilla (haya o no que gestionarlo con un proveedor externo).</p>
                      <div className="flex items-center justify-between mb-3 pb-3 border-b-2 border-slate-200">
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={equipConfig.sillasParaUrna} onChange={(e) => setEquipConfig({...equipConfig, sillasParaUrna: e.target.checked})} className="w-5 h-5 text-pink-600 rounded border-slate-300 focus:ring-pink-500 cursor-pointer" />
                              <span className="text-sm font-black uppercase text-slate-700">Usar Silla para Urna (en lugar de Mesa Pequeña)</span>
                          </label>
                      </div>
                      <div className="flex items-center gap-3">
                          <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cantidad por Casilla (Default INE: {paqueteCancel.mobiliario.tablonesMesas})</label>
                              <div className="flex items-center gap-2">
                                  <input type="number" min="0" placeholder="Automático (INE)" className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={equipConfig.mobiliarioPorCasilla} onChange={e => setEquipConfig({...equipConfig, mobiliarioPorCasilla: e.target.value})} />
                                  {equipConfig.mobiliarioPorCasilla !== '' && (
                                      <button onClick={() => setEquipConfig({...equipConfig, mobiliarioPorCasilla: ''})} title="Restaurar a default" className="bg-slate-200 p-2 rounded-xl hover:bg-slate-300 transition-colors text-slate-600"><RotateCcw className="w-4 h-4" /></button>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </SeccionColapsable>

              {/* PAQUETE UNITARIO POR CASILLA */}
              <SeccionColapsable title="Paquete Unitario por Casilla" icon={<Layers className="w-5 h-5 text-pink-500" />} isOpen={equipExpandido.paquetes} onToggle={() => toggleEquipSeccion('paquetes')}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* PAQUETE CON CANCEL (equipo estándar) */}
                  <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-300 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-2 h-full bg-pink-500"></div>
                      <h3 className="text-base font-black uppercase text-slate-800 mb-1">Paquete Unitario (Cancel)</h3>
                      <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-4">Lo que recibe 1 sola casilla estándar</p>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-200">
                              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 border-b-2 border-slate-200 pb-1">Mobiliario / Sillas</p>
                              <ul className="text-sm text-slate-600 font-bold space-y-1.5">
                                  <li>Tablones/Mesas: <span className="text-slate-900 ml-1">{paqueteCancel.mobiliario.tablonesMesas}</span></li>
                                  <li>Sillas (total): <span className="text-slate-900 ml-1">{paqueteCancel.sillas.total}</span></li>
                              </ul>
                          </div>
                          <div className="bg-pink-50 p-4 rounded-xl border-2 border-pink-200">
                              <p className="text-[10px] text-pink-600 font-black uppercase tracking-widest mb-2 border-b-2 border-pink-200 pb-1">Aporta INE</p>
                              <ul className="text-sm text-slate-600 font-bold space-y-1.5">
                                  <li>Canceles: <span className="text-slate-900 ml-1">{paqueteCancel.materialIne.canceles}</span></li>
                                  <li>Urna Fed: <span className="text-slate-900 ml-1">{paqueteCancel.materialIne.urnasFederales}</span></li>
                                  <li>Liq. Indeleble: <span className="text-slate-900 ml-1">{paqueteCancel.materialIne.liquidosIndelebles}</span></li>
                                  <li>Marc. Boleta: <span className="text-slate-900 ml-1">{paqueteCancel.materialIne.marcadoresBoletas}</span></li>
                                  <li>Marc. Cred.: <span className="text-slate-900 ml-1">{paqueteCancel.materialIne.marcadorasCredenciales}</span></li>
                              </ul>
                          </div>
                      </div>
                      <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-900">
                          <p className="text-[10px] text-white font-black uppercase tracking-widest mb-2 border-b-2 border-slate-700 pb-1">Aporta OPL / IEEM</p>
                          <ul className="text-sm text-slate-300 font-bold space-y-1.5 grid grid-cols-2">
                              <li>Urnas Locales: <span className="text-white ml-1">{paqueteCancel.materialOpl.urnasLocales}</span></li>
                              <li>Base Porta Urna: <span className="text-white ml-1">{paqueteCancel.materialOpl.basesPortaUrna}</span></li>
                              <li>Cancel IEEM: <span className="text-white ml-1">{paqueteCancel.materialOpl.cancelPorCasilla}</span></li>
                              {equipConfig.totalElecciones >= 5 && (<>
                                  <li>Cancel Adicional: <span className="text-white ml-1">{paqueteCancel.materialOpl.cancelOpcional}</span></li>
                                  <li>Marc. Boleta Adic.: <span className="text-white ml-1">{paqueteCancel.materialOpl.marcadoresBoletas}</span></li>
                              </>)}
                          </ul>
                      </div>
                  </div>

                  {/* PAQUETE CON MAMPARA (cualquier tipo de casilla, no exclusivo de Especiales) */}
                  <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-300 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-2 h-full bg-slate-800"></div>
                      <h3 className="text-base font-black uppercase text-slate-800 mb-1">Paquete Unitario (Mampara)</h3>
                      <p className="text-[11px] text-slate-500 uppercase tracking-wider font-bold mb-4">Lo que recibe 1 casilla equipada con mamparas (en vez de cancel)</p>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-200">
                              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 border-b-2 border-slate-200 pb-1">Mobiliario / Sillas</p>
                              <ul className="text-sm text-slate-600 font-bold space-y-1.5">
                                  <li>Tablones/Mesas: <span className="text-slate-900 ml-1">{paqueteMampara.mobiliario.tablonesMesas}</span></li>
                                  <li>Sillas (total): <span className="text-slate-900 ml-1">{paqueteMampara.sillas.total}</span></li>
                              </ul>
                          </div>
                          <div className="bg-pink-50 p-4 rounded-xl border-2 border-pink-200">
                              <p className="text-[10px] text-pink-600 font-black uppercase tracking-widest mb-2 border-b-2 border-pink-200 pb-1">Aporta INE</p>
                              <ul className="text-sm text-slate-600 font-bold space-y-1.5">
                                  <li>Mamparas: <span className="text-slate-900 ml-1">{paqueteMampara.materialIne.mamparas}</span></li>
                                  <li>Urna Fed: <span className="text-slate-900 ml-1">{paqueteMampara.materialIne.urnasFederales}</span></li>
                                  <li>Liq. Indeleble: <span className="text-slate-900 ml-1">{paqueteMampara.materialIne.liquidosIndelebles}</span></li>
                                  <li>Marc. Boleta: <span className="text-slate-900 ml-1">{paqueteMampara.materialIne.marcadoresBoletas}</span></li>
                                  <li>Marc. Cred.: <span className="text-slate-900 ml-1">{paqueteMampara.materialIne.marcadorasCredenciales}</span></li>
                              </ul>
                          </div>
                      </div>
                      <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-900">
                          <p className="text-[10px] text-white font-black uppercase tracking-widest mb-2 border-b-2 border-slate-700 pb-1">Aporta OPL / IEEM</p>
                          <ul className="text-sm text-slate-300 font-bold space-y-1.5 grid grid-cols-2">
                              <li>Urnas Locales: <span className="text-white ml-1">{paqueteMampara.materialOpl.urnasLocales}</span></li>
                              <li>Base Porta Urna: <span className="text-white ml-1">{paqueteMampara.materialOpl.basesPortaUrna}</span></li>
                              <li>Cancel IEEM: <span className="text-white ml-1">{paqueteMampara.materialOpl.cancelPorCasilla}</span></li>
                              {equipConfig.totalElecciones >= 5 && (<>
                                  <li>Mampara Adicional: <span className="text-white ml-1">{paqueteMampara.materialOpl.mamparaOpcional}</span></li>
                                  <li>Marc. Boleta Adic.: <span className="text-white ml-1">{paqueteMampara.materialOpl.marcadoresBoletas}</span></li>
                              </>)}
                          </ul>
                      </div>
                  </div>
              </div>
              </SeccionColapsable>

              {/* REQUERIMIENTOS ESPECIALES: ACCESIBILIDAD */}
              <SeccionColapsable title="Requerimientos Especiales (Accesibilidad)" icon={<ShieldAlert className="w-5 h-5 text-pink-500" />} isOpen={equipExpandido.especiales} onToggle={() => toggleEquipSeccion('especiales')}>
                  {/* ACCESIBILIDAD: MAMPARA ESPECIAL POR DOMICILIO */}
                  <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-300">
                      <div className="flex flex-wrap justify-between items-start gap-3 mb-2">
                          <h3 className="text-base font-black uppercase text-slate-800 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-pink-600" /> Accesibilidad: Mampara Especial por Domicilio</h3>
                          <button onClick={exportarReporteDomicilios} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase flex items-center gap-2 shadow-sm active:scale-95 transition-all"><FileDown className="w-4 h-4" /> Reporte de Domicilios</button>
                      </div>
                      <p className="text-xs text-slate-500 mb-4">Regla independiente del cancel/mampara de cada casilla: 1 mampara especial de accesibilidad por cada 4 casillas que compartan domicilio (básica + contiguas, o extraordinaria + sus contiguas). Cada casilla especial cuenta como un domicilio adicional. Es un requisito obligatorio, no depende de si el domicilio ya es accesible.</p>
                      <p className="text-[11px] text-pink-600 font-bold mb-4 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Se conecta con el Módulo de Ubicación: si una casilla ya tiene domicilio real capturado, se agrupa por ese domicilio (por si en la práctica se dividió o unificó distinto a lo asumido); las casillas aún sin capturar se siguen contando con la regla de arriba, nunca se excluyen.</p>
                      <div className="flex gap-6">
                          <div className="bg-slate-50 border-2 border-slate-200 p-5 rounded-2xl text-center flex-1">
                              <p className="text-[10px] font-bold text-pink-600 uppercase tracking-widest mb-1">Mamparas de Accesibilidad</p>
                              <p className="text-3xl font-black text-slate-800">{mamparasAccesibilidadPorDomicilio.total}</p>
                          </div>
                          <div className="bg-white border-2 border-slate-200 p-5 rounded-2xl text-center shadow-sm flex-1">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Domicilios Detectados</p>
                              <p className="text-3xl font-black text-slate-700">{mamparasAccesibilidadPorDomicilio.totalDomicilios}</p>
                          </div>
                      </div>
                  </div>
              </SeccionColapsable>

              {/* ASIGNACIÓN MODULAR (CANCEL VS MAMPARA POR CASILLA) */}
              <div className="bg-white rounded-3xl shadow-sm border-2 border-slate-300 overflow-hidden">
                <button onClick={() => toggleEquipSeccion('asignacion')} className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors">
                    <span className="text-base font-black uppercase text-slate-800 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-pink-500" /> Asignación Modular</span>
                    {equipExpandido.asignacion ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                </button>
                {equipExpandido.asignacion && (
                <div className="px-6 pb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Selecciona qué casillas llevan cancel y cuáles mampara especial.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {/* BOTONES DE RESPALDO DE EQUIPAMIENTO */}
                        <div className="flex gap-2 mr-2 pr-2 border-r border-slate-200">
                             <button onClick={exportarRespaldoEquipamiento} className="text-xs font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-md"><Save className="w-4 h-4" /> Respaldo</button>
                             <label className="text-xs font-black uppercase tracking-wider bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer border-2 border-slate-200"><FileUp className="w-4 h-4" /> Cargar<input type="file" className="hidden" accept=".json" onChange={importarRespaldoEquipamiento} /></label>
                        </div>
                        {/* BOTONES DE ASIGNACIÓN RÁPIDA */}
                        <button onClick={() => marcarTodasMamparas('cancel')} className="text-xs font-black uppercase tracking-wider bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-xl transition-colors shadow-sm">Todas con Cancel</button>
                        <button onClick={() => marcarTodasMamparas('mampara')} className="text-xs font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl transition-colors shadow-md">Todas con Mampara</button>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[300px] overflow-y-auto p-3 bg-slate-50 rounded-2xl border-2 border-slate-200 shadow-inner custom-scrollbar">
                    {todasLasCasillasEquipamiento.map((c, i) => {
                        const tipoActual = mamparasPorCasilla[c.id] || 'cancel';
                        const isMampara = tipoActual === 'mampara';
                        return (
                            <div key={i} className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer ${isMampara ? 'bg-slate-800 border-slate-900 shadow-md text-white' : 'bg-white border-slate-300 hover:border-pink-400'}`} onClick={() => setMamparasPorCasilla(prev => ({...prev, [c.id]: isMampara ? 'cancel' : 'mampara'}))}>
                                <span className={`${isMampara ? 'bg-slate-900 text-pink-400' : 'bg-slate-800 text-white'} px-3 py-1 rounded text-sm font-black tracking-widest shadow-inner`}>SEC {c.seccion}</span>
                                <span className={`text-base font-black ${isMampara ? 'text-white' : 'text-slate-800'}`}>{c.nombre}</span>
                                <span className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-full ${isMampara ? 'bg-slate-700 text-pink-200' : 'bg-slate-100 text-slate-600'}`}>{isMampara ? 'Mampara Especial' : 'Cancel'}</span>
                            </div>
                        );
                    })}
                </div>
                </div>
                )}
              </div>

              {/* VOLUMEN TOTAL DISTRITAL */}
              <div className="bg-white rounded-[2.5rem] shadow-sm border-2 border-slate-200 overflow-hidden">
                <button onClick={() => toggleEquipSeccion('volumen')} className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                        {equipExpandido.volumen ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                        <span className="text-sm font-black uppercase tracking-widest text-slate-800">Volumen Total Requerido (Distrital)</span>
                    </div>
                </button>
                {equipExpandido.volumen && (
                <div className="px-4 sm:px-8 pb-8">
              <div className="bg-slate-900 p-8 rounded-3xl shadow-xl border-b-8 border-pink-600 text-white">
                  <div className="flex justify-end mb-6">
                      <button onClick={exportarReporteEquipamientoMCU} className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all"><FileText className="w-5 h-5" /> Exportar Reporte Material</button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div>
                          <p className="text-xs font-black uppercase tracking-[0.3em] text-pink-400 mb-4 border-b-2 border-slate-800 pb-2">Mobiliario y Sillas</p>
                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-slate-800 p-5 rounded-2xl text-center border-2 border-slate-700 shadow-sm">
                                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Tablones/Mesas</p>
                                  <p className="text-3xl font-black text-white">{equipamientoDistrital.mobiliario.tablonesMesas.toLocaleString()}</p>
                              </div>
                              <div className="bg-slate-800 p-5 rounded-2xl text-center border-2 border-slate-700 shadow-sm">
                                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Sillas</p>
                                  <p className="text-3xl font-black text-white">{equipamientoDistrital.sillas.total.toLocaleString()}</p>
                              </div>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-3 font-bold">Desglose sillas: FMDCU {equipamientoDistrital.sillas.fmdcu.toLocaleString()} · RPP Nacionales {equipamientoDistrital.sillas.nacionales.toLocaleString()} · RPP Locales {equipamientoDistrital.sillas.locales.toLocaleString()}{equipConfig.sillasParaUrna && ` · Urna ${equipamientoDistrital.sillas.urna.toLocaleString()}`}</p>

                          <p className="text-xs font-black uppercase tracking-[0.3em] text-pink-400 mt-6 mb-4 border-b-2 border-slate-800 pb-2">Accesibilidad</p>
                          <div className="grid grid-cols-1 gap-4">
                              <div className="bg-slate-800 p-5 rounded-2xl border-2 border-slate-700 flex flex-col justify-center items-center shadow-sm">
                                  <span className="text-[10px] font-bold text-slate-300 uppercase text-center mb-1">Mamparas Especiales (por domicilio)</span>
                                  <span className="text-2xl font-black text-pink-400">{mamparasAccesibilidadPorDomicilio.total.toLocaleString()}</span>
                              </div>
                          </div>
                      </div>

                      <div>
                          <p className="text-xs font-black uppercase tracking-[0.3em] text-pink-400 mb-4 border-b-2 border-slate-800 pb-2">Material Electoral — Aporta INE</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Canceles</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.canceles.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Mamparas</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.mamparas.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Urnas Fed</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.urnasFederales.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Marc. Boletas</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.marcadoresBoletas.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Marc. Cred</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.marcadorasCredenciales.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-slate-300 uppercase">Líq. Indeleble</span>
                                  <span className="text-base font-black text-white">{equipamientoDistrital.materialIne.liquidosIndelebles.toLocaleString()}</span>
                              </div>
                          </div>

                          <p className="text-xs font-black uppercase tracking-[0.3em] text-pink-400 mt-6 mb-4 border-b-2 border-slate-800 pb-2">Material Electoral — Aporta OPL / IEEM</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-pink-200 uppercase">Urnas Locales</span>
                                  <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.urnasLocales.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-pink-200 uppercase">Base P/Urna</span>
                                  <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.basesPortaUrna.toLocaleString()}</span>
                              </div>
                              <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                  <span className="text-[11px] font-bold text-pink-200 uppercase">Cancel IEEM</span>
                                  <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.cancelPorCasilla.toLocaleString()}</span>
                              </div>
                              {equipConfig.totalElecciones >= 5 && (<>
                                  <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                      <span className="text-[11px] font-bold text-pink-200 uppercase">Cancel Adic.</span>
                                      <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.cancelOpcional.toLocaleString()}</span>
                                  </div>
                                  <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                      <span className="text-[11px] font-bold text-pink-200 uppercase">Mampara Adic.</span>
                                      <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.mamparaOpcional.toLocaleString()}</span>
                                  </div>
                                  <div className="bg-slate-800 p-4 rounded-xl border-2 border-slate-700 flex justify-between items-center shadow-sm">
                                      <span className="text-[11px] font-bold text-pink-200 uppercase">Marc. Boleta</span>
                                      <span className="text-base font-black text-pink-400">{equipamientoDistrital.materialOpl.marcadoresBoletas.toLocaleString()}</span>
                                  </div>
                              </>)}
                          </div>
                      </div>
                  </div>
              </div>
                </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- VISTA: UBICACIÓN DE CASILLAS --- */}
        {view === 'ubicacion' && (
          <div className="lg:col-span-12 overflow-y-auto p-10 text-left">
            <div className="max-w-7xl mx-auto space-y-8 pb-24">

              <div className="p-8 rounded-[2.5rem] bg-gradient-to-r from-pink-600 to-pink-800 text-white shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-6">
                          <div className="bg-white/20 p-4 rounded-2xl shadow-inner"><Building2 className="w-8 h-8" /></div>
                          <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-200">Domicilios y sitios de instalación</p>
                              <h2 className="text-2xl font-black italic">Módulo de Ubicación de Casillas</h2>
                          </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase cursor-pointer transition-all border border-white/30"><FileUp className="w-4 h-4" /> Importar Listado<input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImportarUbicacion} /></label>
                          <button onClick={exportarPlantillaUbicacion} className="flex items-center gap-2 bg-white text-pink-700 hover:bg-pink-50 px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-md"><FileDown className="w-4 h-4" /> Exportar Plantilla</button>
                      </div>
                  </div>
                  <p className="text-xs text-pink-100 mt-4 font-bold max-w-3xl">Sube el "Listado de Ubicación de Casillas" oficial (desglosado por casilla) de un proceso anterior para pre-asignar domicilios automáticamente por Sección + Casilla, o exporta la plantilla del sistema, complétala y vuelve a subirla para actualizar en lote.</p>
              </div>

              {Object.keys(conteoTiposDomicilio).length > 0 && (
                  <div className="bg-white rounded-3xl shadow-sm border-2 border-slate-200 px-6 py-5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Tipos de domicilio registrados</p>
                      <div className="flex flex-wrap gap-2">
                          {Object.entries(conteoTiposDomicilio).sort((a, b) => b[1] - a[1]).map(([tipo, count]) => (
                              <button key={tipo} onClick={() => setFiltroTipoUbicacion(prev => prev === tipo ? 'todos' : tipo)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${filtroTipoUbicacion === tipo ? 'bg-pink-600 text-white shadow-md ring-2 ring-pink-300' : 'bg-pink-50 text-pink-700 hover:bg-pink-100'}`}>{count} {tipo}</button>
                          ))}
                      </div>
                  </div>
              )}

              {importUbicacionAviso && (
                  <div className={`rounded-2xl px-6 py-4 border-2 ${importUbicacionAviso.sinPareja.length > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                      <div className="flex items-start gap-4">
                          {importUbicacionAviso.sinPareja.length > 0 ? <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />}
                          <div className="flex-1">
                              <p className={`text-sm font-black uppercase tracking-wide ${importUbicacionAviso.sinPareja.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>Importación de ubicación completada</p>
                              <p className={`text-xs mt-1 font-bold ${importUbicacionAviso.sinPareja.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {importUbicacionAviso.asignadas} de {importUbicacionAviso.totalFilas} filas del archivo se asignaron a casillas de tu proyección actual.
                                  {importUbicacionAviso.sinPareja.length > 0 && ` ${importUbicacionAviso.sinPareja.length} fila(s) no encontraron una casilla equivalente (sección eliminada, renombrada o casilla no proyectada) y se omitieron.`}
                              </p>
                              {importUbicacionAviso.sinPareja.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-3">
                                      {importUbicacionAviso.sinPareja.slice(0, 40).map((s, i) => (
                                          <span key={i} className="text-[10px] font-bold bg-white border-2 border-amber-200 text-amber-700 px-2 py-1 rounded-lg">Sec {f4(s.seccion)} · {s.casilla}</span>
                                      ))}
                                      {importUbicacionAviso.sinPareja.length > 40 && <span className="text-[10px] font-bold text-amber-600">+{importUbicacionAviso.sinPareja.length - 40} más</span>}
                                  </div>
                              )}
                          </div>
                          <button onClick={() => setImportUbicacionAviso(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                      </div>
                  </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="relative max-w-xs w-full">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" placeholder="Buscar sección..." className="pl-9 pr-4 py-2.5 bg-white border-2 border-slate-300 rounded-full text-xs font-bold outline-none w-full focus:ring-2 focus:ring-pink-500 shadow-sm text-slate-800" value={busquedaUbicacion} onChange={e => setBusquedaUbicacion(e.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                      <button onClick={() => setFiltroEstadoUbicacion(prev => prev === 'completo' ? 'todas' : 'completo')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${filtroEstadoUbicacion === 'completo' ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>{seccionesUbicacion.filter(s => s.estado.startsWith('completo')).length} Completas</button>
                      <button onClick={() => setFiltroEstadoUbicacion(prev => prev === 'parcial' ? 'todas' : 'parcial')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${filtroEstadoUbicacion === 'parcial' ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-300' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>{seccionesUbicacion.filter(s => s.estado === 'parcial').length} Parciales</button>
                      <button onClick={() => setFiltroEstadoUbicacion(prev => prev === 'sin_asignar' ? 'todas' : 'sin_asignar')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all ${filtroEstadoUbicacion === 'sin_asignar' ? 'bg-slate-700 text-white shadow-md ring-2 ring-slate-400' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{seccionesUbicacion.filter(s => s.estado === 'sin_asignar').length} Sin Asignar</button>
                  </div>
              </div>

              <div className="space-y-4">
                  {seccionesUbicacion.filter(g => !busquedaUbicacion.trim() || f4(g.seccion).includes(busquedaUbicacion.trim())).filter(g => filtroEstadoUbicacion === 'todas' || (filtroEstadoUbicacion === 'completo' ? g.estado.startsWith('completo') : g.estado === filtroEstadoUbicacion)).filter(g => filtroTipoUbicacion === 'todos' || g.casillas.some(c => (c.dom?.tipoDomicilio || (c.dom ? 'SIN TIPO' : null)) === filtroTipoUbicacion)).map(grupo => {
                      const isOpen = !!seccionesUbicacionExpandidas[grupo.seccion];
                      const estiloEstado = grupo.estado === 'completo_unico' ? 'bg-emerald-100 text-emerald-700' : grupo.estado === 'completo_multiple' ? 'bg-sky-100 text-sky-700' : grupo.estado === 'parcial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600';
                      const textoEstado = grupo.estado === 'completo_unico' ? 'Un domicilio para toda la sección' : grupo.estado === 'completo_multiple' ? `${grupo.domiciliosUnicos} domicilios distintos` : grupo.estado === 'parcial' ? `${grupo.asignadas}/${grupo.total} asignadas` : 'Sin asignar';
                      return (
                          <div key={grupo.seccion} className="bg-white rounded-3xl shadow-sm border-2 border-slate-300 overflow-hidden">
                              <button onClick={() => setSeccionesUbicacionExpandidas(prev => ({ ...prev, [grupo.seccion]: !prev[grupo.seccion] }))} className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors">
                                  <div className="flex items-center gap-3">
                                      {isOpen ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                                      <span className="text-base font-black uppercase text-slate-800">Sec {f4(grupo.seccion)}</span>
                                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${estiloEstado}`}>{textoEstado}</span>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{grupo.total} casilla{grupo.total !== 1 ? 's' : ''}</span>
                              </button>
                              {isOpen && (
                                  <div className="px-6 pb-6 space-y-3">
                                      <div className="flex justify-end gap-2">
                                          {grupo.totalFaltantesCompletables > 0 && (
                                              <button onClick={() => completarClustersAutomaticamente(grupo.clustersCompletables)} title="Copia el domicilio ya asignado a las casillas faltantes, sólo dentro del mismo grupo físico (básica+contiguas, cada extraordinaria o cada especial por separado)" className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Copy className="w-3.5 h-3.5" /> Completar automáticamente ({grupo.totalFaltantesCompletables})</button>
                                          )}
                                          <button onClick={() => { setSeleccionUbicacion(grupo.casillas.map(c => c.clave)); setModalUbicacionConfig({ isOpen: true, claves: grupo.casillas.map(c => c.clave) }); }} className="text-[10px] font-black uppercase bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Home className="w-3.5 h-3.5" /> Un domicilio para toda la sección</button>
                                      </div>
                                      {grupo.casillas.map(c => (
                                          <div key={c.clave} className={`flex flex-wrap items-center gap-3 p-4 rounded-2xl border-2 ${seleccionUbicacion.includes(c.clave) ? 'border-pink-400 bg-pink-50' : 'border-slate-200 bg-slate-50'}`}>
                                              <input type="checkbox" className="w-4 h-4 accent-pink-600" checked={seleccionUbicacion.includes(c.clave)} onChange={() => setSeleccionUbicacion(prev => prev.includes(c.clave) ? prev.filter(x => x !== c.clave) : [...prev, c.clave])} />
                                              <span className="bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-black">{c.nombre}</span>
                                              <div className="flex-1 min-w-[200px]">
                                                  {c.dom ? (
                                                      <div className="text-xs">
                                                          <span className="font-black text-slate-800">{c.dom.tipoDomicilio || 'SIN TIPO'}</span>
                                                          <span className="text-slate-500"> — {c.dom.domicilio || 'sin dirección'}</span>
                                                          {c.dom.ubicacion && <p className="text-slate-400 text-[11px]">{c.dom.ubicacion}</p>}
                                                      </div>
                                                  ) : (
                                                      <span className="text-xs font-bold text-slate-400 italic">Sin asignar</span>
                                                  )}
                                              </div>
                                              <div className="flex gap-2">
                                                  <button onClick={() => { setSeleccionUbicacion([c.clave]); setModalUbicacionConfig({ isOpen: true, claves: [c.clave], prefill: c.dom }); }} className="text-slate-500 hover:text-pink-600 p-2 rounded-lg hover:bg-white transition-all" title="Editar"><Pencil className="w-4 h-4" /></button>
                                                  {grupo.casillas.some(other => other.clave !== c.clave && other.grupoFisico === c.grupoFisico && other.asign) && (
                                                      <button onClick={() => { const origen = grupo.casillas.find(other => other.clave !== c.clave && other.grupoFisico === c.grupoFisico && other.asign); if (origen) copiarDomicilioDeCasilla(origen.clave, [c.clave]); }} className="text-slate-500 hover:text-pink-600 p-2 rounded-lg hover:bg-white transition-all" title="Copiar domicilio de otra casilla del mismo grupo físico (básica+contiguas, o la misma extraordinaria/especial)"><Copy className="w-4 h-4" /></button>
                                                  )}
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>

              {seleccionUbicacion.length > 0 && !modalUbicacionConfig.isOpen && (
                  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-50">
                      <span className="text-xs font-black uppercase">{seleccionUbicacion.length} casilla(s) seleccionada(s)</span>
                      <button onClick={() => setModalUbicacionConfig({ isOpen: true, claves: seleccionUbicacion })} className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase">Asignar Domicilio</button>
                      <button onClick={() => setSeleccionUbicacion([])} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>
              )}

            </div>
          </div>
        )}

        {/* --- VISTA: CIERRE (CONSOLIDADO FINAL) --- */}
        {view === 'final' && (
          <div className="lg:col-span-12 overflow-y-auto p-10 text-left bg-slate-50">
            <div className="max-w-7xl mx-auto space-y-8 pb-24 text-left">
                <AlertaConflictosDiseno conflictos={conflictosDiseno} expandido={detalleConflictosAbierto} onToggle={() => setDetalleConflictosAbierto(v => !v)} onExportar={exportarReporteConflictosDiseno} />
                <div className="bg-white rounded-[2.5rem] shadow-sm border-2 border-slate-200 overflow-hidden">
                    <button onClick={() => setResumenExpandido(!resumenExpandido)} className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                            {resumenExpandido ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                            <span className="text-sm font-black uppercase tracking-widest text-slate-800">Resumen Distrital</span>
                        </div>
                        {!resumenExpandido && (
                            <span className={`text-lg font-black italic ${totalCasillasDistrito.variacion ? 'text-red-600' : 'text-pink-600'}`}>
                                P: {totalCasillasDistrito.totalPadron} | L: {totalCasillasDistrito.totalLista} Casillas
                            </span>
                        )}
                    </button>
                    {resumenExpandido && (
                        <div className="px-8 pb-8 space-y-6">
                            <div className={`p-8 rounded-[2.5rem] bg-slate-900 text-white shadow-xl border-b-8 ${totalCasillasDistrito.variacion ? 'border-red-500' : 'border-pink-600'}`}>
                                <div className="flex items-center gap-6 text-left">
                                    <div className={`p-5 rounded-2xl shadow-inner text-left ${totalCasillasDistrito.variacion ? 'bg-red-500/20 text-red-400' : 'bg-pink-500/20 text-pink-400'}`}>
                                        {totalCasillasDistrito.variacion ? <AlertTriangle className="w-10 h-10" /> : <Calculator className="w-10 h-10" />}
                                    </div>
                                    <div className="text-left">
                                        <p className={`text-xs font-black uppercase tracking-[0.4em] text-left ${totalCasillasDistrito.variacion ? 'text-red-400' : 'text-pink-400'}`}>
                                            Resumen Distrito {f4(distritoInfo.numero)}
                                        </p>
                                        <h4 className="text-4xl font-black italic tracking-tighter mt-1 text-left text-white">P: {totalCasillasDistrito.totalPadron} | L: {totalCasillasDistrito.totalLista} Casillas</h4>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-700">
                                    <div className="text-center sm:text-left">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Básicas / Contiguas</p>
                                        <p className="text-2xl font-black text-white mt-1">P: {totalCasillasDistrito.bcPadron} | L: {totalCasillasDistrito.bcLista}</p>
                                    </div>
                                    <div className="text-center sm:text-left">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Extraordinarias</p>
                                        <p className="text-2xl font-black text-pink-400 mt-1">P: {totalCasillasDistrito.exPadron} | L: {totalCasillasDistrito.exLista}</p>
                                    </div>
                                    <div className="text-center sm:text-left">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Especiales</p>
                                        <p className="text-2xl font-black text-white mt-1">P: {totalCasillasDistrito.espPadron} | L: {totalCasillasDistrito.espLista}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Total de Secciones</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{sections.length}</h5>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-pink-600 uppercase tracking-widest mb-1">Padrón Electoral</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{totalesPadronLista.padron.toLocaleString()}</h5>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-violet-600 uppercase tracking-widest mb-1">Lista Nominal</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{totalesPadronLista.lista.toLocaleString()}</h5>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Básicas</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{desgloseTiposCasilla.basicas}</h5>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Contiguas</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{desgloseTiposCasilla.contiguas}</h5>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Extraordinarias</p>
                                    <h5 className="text-4xl font-black italic text-pink-600">{desgloseTiposCasilla.extraordinarias}</h5>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-200 flex flex-col justify-center items-center">
                                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Especiales</p>
                                    <h5 className="text-4xl font-black italic text-slate-800">{desgloseTiposCasilla.especiales}</h5>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-[2.5rem] shadow-sm border-2 border-slate-200 overflow-hidden">
                    <button onClick={() => setFoliosExpandido(!foliosExpandido)} className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                            {foliosExpandido ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                            <span className="text-sm font-black uppercase tracking-widest text-slate-800">Asignación de Folios de Boletas</span>
                        </div>
                        {!foliosExpandido && (
                            <span className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                <span><span className="text-pink-600">{totalesFolios.totalCasillas}</span> casillas</span>
                                <span className="text-slate-300">·</span>
                                <span><span className="text-violet-600">{totalesFolios.totalBoletas.toLocaleString()}</span> boletas</span>
                                <span className="text-slate-300">·</span>
                                <span>Folio final: <span className="text-emerald-600">{totalesFolios.folioFinalDistrito.toLocaleString()}</span></span>
                            </span>
                        )}
                    </button>
                    {foliosExpandido && (
                        <div className="px-4 sm:px-8 pb-8 space-y-6">
                            <div className="flex flex-wrap justify-between items-start gap-4 text-left pt-2">
                                <div className="text-left">
                                    <h2 className="text-3xl font-black tracking-tighter uppercase italic text-slate-800 text-left">Asignación de Folios de Boletas</h2>
                                    <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] text-left mt-1">Boletas de Diputación Federal · Lista Nominal</p>
                                </div>
                                <button onClick={exportarFoliosExcel} className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-md active:scale-95 transition-all"><FileDown className="w-5 h-5" /> Exportar Excel</button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Cabecera Distrital</label>
                                    <input type="text" placeholder="Ej. TEPEXPAN" className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={cabeceraDistrital} onChange={e => { const val = e.target.value.toUpperCase(); setCabeceraDistrital(val); localStorage.setItem(`proyector_cabecera_D${distritoInfo.numero}`, val); }} />
                                    <p className="text-[10px] text-slate-400 mt-1">Nombre de la cabecera del distrito (aparece en "Distrito: {distritoInfo.numero} ..." del Excel). Se guarda por distrito.</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Boletas x Repres. RPP Nacional</label>
                                    <input type="number" min="0" className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={folioConfig.boletasRppNacionales} onChange={e => setFolioConfig({...folioConfig, boletasRppNacionales: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                                    <p className="text-[10px] text-slate-400 mt-1">Default: 2 x 8 partidos nacionales vigentes. Sin lineamiento exacto confirmado — ajustar si la Junta define otra cifra.</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Boletas x Repres. RPP Local</label>
                                    <input type="number" min="0" className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={folioConfig.boletasRppLocales} onChange={e => setFolioConfig({...folioConfig, boletasRppLocales: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                                    <p className="text-[10px] text-slate-400 mt-1">Default: 1 x 2 partidos locales vigentes en Edomex (PRD, Podemos).</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Boletas x Candidatura Indep.</label>
                                    <input type="number" min="0" className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-slate-800" value={folioConfig.boletasCandidaturaIndependiente} onChange={e => setFolioConfig({...folioConfig, boletasCandidaturaIndependiente: e.target.value === '' ? '' : parseInt(e.target.value)})} />
                                    <p className="text-[10px] text-slate-400 mt-1">Default: 0 (sin candidaturas independientes registradas en el corte actual).</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <div className="bg-slate-900 p-4 rounded-xl text-center">
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Secciones</p>
                                    <p className="text-xl font-black text-white">{totalesFolios.totalSecciones}</p>
                                </div>
                                <div className="bg-slate-900 p-4 rounded-xl text-center">
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Casillas</p>
                                    <p className="text-xl font-black text-white">{totalesFolios.totalCasillas}</p>
                                </div>
                                <div className="bg-slate-900 p-4 rounded-xl text-center">
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1">Ciudadanos</p>
                                    <p className="text-xl font-black text-white">{totalesFolios.totalCiudadanos.toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-900 p-4 rounded-xl text-center">
                                    <p className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-1">Total Boletas</p>
                                    <p className="text-xl font-black text-pink-400">{totalesFolios.totalBoletas.toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-900 p-4 rounded-xl text-center col-span-2 sm:col-span-1">
                                    <p className="text-[10px] font-bold text-pink-400 uppercase tracking-widest mb-1">Folio Final</p>
                                    <p className="text-xl font-black text-pink-400">{totalesFolios.folioFinalDistrito.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-auto max-h-[500px]">
                                <table className="w-full text-left border-collapse min-w-[900px]">
                                    <thead className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest border-b-8 border-pink-600">
                                        <tr>
                                            <th className="p-4">Municipio</th>
                                            <th className="p-4">Sección</th>
                                            <th className="p-4">Casilla</th>
                                            <th className="p-4 text-right">Ciudadanos</th>
                                            <th className="p-4 text-right">RPP Nac.</th>
                                            <th className="p-4 text-right">RPP Loc.</th>
                                            <th className="p-4 text-right">Cand. Ind.</th>
                                            <th className="p-4 text-right">Total Boletas</th>
                                            <th className="p-4 text-right">Folio Inicial</th>
                                            <th className="p-4 text-right">Folio Final</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs font-bold divide-y divide-slate-100">
                                        {filasFolios.map(f => (
                                            <tr key={f.id} className={`hover:bg-slate-50 ${f.categoria === 'ESPECIAL' ? 'bg-yellow-100' : ''}`}>
                                                <td className="p-4 text-slate-600">{f.municipio}</td>
                                                <td className="p-4 text-slate-900">{f4(f.seccion)}</td>
                                                <td className="p-4 text-slate-600">{f.nombreCasilla}</td>
                                                <td className="p-4 text-right text-slate-900">{f.ciudadanos.toLocaleString()}</td>
                                                <td className="p-4 text-right text-slate-500">{f.boletasRppNacionales}</td>
                                                <td className="p-4 text-right text-slate-500">{f.boletasRppLocales}</td>
                                                <td className="p-4 text-right text-slate-500">{f.boletasCandidaturaIndependiente}</td>
                                                <td className="p-4 text-right text-pink-700 font-black">{f.totalBoletas.toLocaleString()}</td>
                                                <td className="p-4 text-right text-slate-500 font-mono">{String(f.folioInicial).padStart(7, '0')}</td>
                                                <td className="p-4 text-right text-slate-500 font-mono">{String(f.folioFinal).padStart(7, '0')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-[2.5rem] shadow-sm border-2 border-slate-200 overflow-hidden">
                    <button onClick={() => setListadoExpandido(!listadoExpandido)} className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                            {listadoExpandido ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                            <span className="text-sm font-black uppercase tracking-widest text-slate-800">Listado de Casillas</span>
                        </div>
                        {!listadoExpandido && (
                            <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                                {seccionesAgrupadas.length} secciones · <span className="text-red-600">{countVariacion} con variación</span> · <span className="text-amber-600">{countMenos100} con menos de 100</span>
                            </span>
                        )}
                    </button>
                    {listadoExpandido && (
                        <div className="px-4 sm:px-8 pb-8 space-y-6">
                            <div className="flex flex-wrap justify-between items-start gap-4 text-left pt-2">
                               <div className="text-left">
                                   <h2 className="text-3xl font-black tracking-tighter uppercase italic text-slate-800 text-left">PROYECCIÓN DE CASILLAS</h2>
                                   <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.2em] text-left mt-1">Listado consolidado por sección con proyección individual</p>
                                   <div className="relative mt-3 max-w-xs">
                                       <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                       <input type="text" placeholder="Buscar sección, nomenclatura o tipo..." className="pl-9 pr-4 py-2 bg-white border-2 border-slate-300 rounded-full text-xs font-bold outline-none w-full focus:ring-2 focus:ring-pink-500 shadow-sm text-slate-800" value={busquedaProyeccion} onChange={e => setBusquedaProyeccion(e.target.value)} />
                                   </div>
                                   <div className="flex flex-wrap gap-2 mt-3">
                                       <button onClick={() => setFiltroAlerta(filtroAlerta === 'variacion' ? null : 'variacion')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border-2 transition-all ${filtroAlerta === 'variacion' ? 'bg-orange-600 border-orange-600 text-white shadow-md' : 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50'}`}>
                                           <AlertTriangle className="w-3.5 h-3.5" /> Variación ({countVariacion})
                                       </button>
                                       <button onClick={() => setFiltroAlerta(filtroAlerta === 'menos100' ? null : 'menos100')} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border-2 transition-all ${filtroAlerta === 'menos100' ? 'bg-amber-600 border-amber-600 text-white shadow-md' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                                           <AlertTriangle className="w-3.5 h-3.5" /> Menos de 100 ({countMenos100})
                                       </button>
                                       {filtroAlerta && (
                                           <button onClick={() => setFiltroAlerta(null)} className="px-4 py-2 rounded-full text-[10px] font-black uppercase flex items-center gap-2 border-2 border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                                               <X className="w-3.5 h-3.5" /> Quitar filtro
                                           </button>
                                       )}
                                   </div>
                               </div>
                               <div className="flex flex-wrap items-center gap-3 justify-end">
                                   <div className="flex flex-col">
                                       <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Corte de padrón</label>
                                       <input type="text" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} placeholder="DD/MM/AAAA" className="px-3 py-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs font-black text-slate-800 outline-none focus:ring-2 focus:ring-pink-500 w-32 text-center" />
                                   </div>
                                   <button onClick={() => setModalEspecialConfig({ isOpen: true })} className="bg-slate-900 hover:bg-black text-white px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-md active:scale-95 transition-all relative z-40"><Star className="w-5 h-5 text-pink-500" /> Agregar Casillas Especiales</button>
                                   <button onClick={exportarProyeccionOficial} className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-md active:scale-95 transition-all relative z-40"><Bookmark className="w-5 h-5 text-pink-200" /> Proyección Oficial INE</button>
                                   <button onClick={exportarQGIS} className="bg-gradient-to-r from-pink-700 to-slate-900 hover:from-pink-800 hover:to-black text-white px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-md active:scale-95 transition-all relative z-40"><Download className="w-5 h-5" /> QGIS</button>
                               </div>
                            </div>
                            
                            {seccionesMostradas.length === 0 ? (
                                <div className="p-16 text-center text-slate-400 italic font-bold">No se encontraron secciones o casillas que coincidan con los filtros aplicados.</div>
                            ) : (
                                <div className="bg-white rounded-[2.5rem] shadow-xl border-2 border-slate-200 overflow-hidden overflow-x-auto text-left">
                                    <table className="w-full text-left border-collapse min-w-[1000px] text-left">
                                        <thead className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest border-b-8 border-pink-600 text-left">
                                            <tr>
                                                <th className="p-6 text-left">Sección</th>
                                                <th className="p-6 text-left">Grupo</th>
                                                <th className="p-6 text-left">Nomenclatura</th>
                                                <th className="p-6 text-left">Padrón / Lista</th>
                                                <th className="p-6 text-left">Proyección Detallada</th>
                                                <th className="p-6 text-center text-left">Total Casillas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-xs font-bold divide-y-2 divide-slate-100 text-left">
                                            {seccionesMostradas.map((grupo) => {
                                                const isExpanded = !!seccionesExpandidas[grupo.seccion] || busquedaProyeccion.trim() !== '' || !!filtroAlerta;
                                                return (
                                                    <React.Fragment key={grupo.seccion}>
                                                        <tr onClick={() => toggleSeccion(grupo.seccion)} className={`cursor-pointer transition-colors ${isExpanded ? 'bg-pink-50' : 'hover:bg-slate-50'} ${grupo.tieneVariacion ? 'bg-red-50/50' : ''}`}>
                                                            <td className="p-6" colSpan={4}>
                                                                <div className="flex items-center gap-4 flex-wrap">
                                                                    {isExpanded ? <ChevronUp className="w-5 h-5 text-pink-600 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                                                                    <span className="font-black text-slate-900 text-lg">Sec {f4(grupo.seccion)}</span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {grupo.categorias.map(cat => (
                                                                            <span key={cat} className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${cat === 'EXTRAORDINARIA' ? 'bg-pink-100 text-pink-700' : cat === 'ESPECIAL' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600'}`}>{cat}</span>
                                                                        ))}
                                                                        {grupo.tieneNoInstala && <span className="px-2 py-1 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No Instala</span>}
                                                                        {grupo.tieneVariacion && <span className="px-2 py-1 rounded text-[9px] font-black uppercase bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Variación</span>}
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-auto mr-4">{grupo.rows.length} {grupo.rows.length === 1 ? 'registro' : 'registros'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-6"></td>
                                                            <td className="p-6 text-center">
                                                                <div className="flex flex-col items-center justify-center">
                                                                    <span className="text-xl font-black text-pink-700">P: {grupo.totalPadron}</span>
                                                                    <span className="text-sm font-bold text-slate-600 mt-1">L: {grupo.totalLista}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && grupo.rows.map((row, idx) => {
                                                            const noInstala = row.distPadron.some(d => d.nombre === 'NO INSTALA') || row.distLista.some(d => d.nombre === 'NO INSTALA');
                                                            return (
                                                                <tr key={idx} className={`hover:bg-slate-50 transition-colors ${row.categoria === 'EXTRAORDINARIA' ? 'bg-pink-50/40' : row.categoria === 'ESPECIAL' ? 'bg-slate-50' : ''}`}>
                                                                    <td className="p-6"></td>
                                                                    <td className="p-6"><span className={`text-[10px] font-black tracking-widest uppercase ${row.categoria === 'EXTRAORDINARIA' ? 'text-pink-600' : row.categoria === 'ESPECIAL' ? 'text-slate-800' : 'text-slate-500'}`}>{String(row.categoria)}</span></td>
                                                                    <td className="p-6">
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {row.nomenclaturaPadron && <span className={`px-3 py-1 rounded-lg text-[10px] font-black italic shadow-sm border ${row.categoria === 'EXTRAORDINARIA' ? 'bg-pink-600 text-white border-pink-700' : row.categoria === 'ESPECIAL' ? 'bg-slate-800 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300'}`}>P: {String(row.nomenclaturaPadron)}</span>}
                                                                            {row.nomenclaturaLista && <span className={`px-3 py-1 rounded-lg text-[10px] font-black italic shadow-sm border ${row.categoria === 'EXTRAORDINARIA' ? 'bg-slate-100 text-slate-700 border-slate-300' : row.categoria === 'ESPECIAL' ? 'bg-slate-200 text-slate-800 border-slate-400' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>L: {String(row.nomenclaturaLista)}</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6 text-slate-500 font-mono text-left">
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className="text-slate-900 font-black text-base">P: {Number(row.padronRef).toLocaleString()}</span>
                                                                            <span className="text-slate-500 text-xs font-bold">L: {Number(row.listaRef).toLocaleString()}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6 text-left">
                                                                        <div className="flex flex-col gap-1.5">
                                                                            <div className="flex flex-wrap gap-1.5 text-left">
                                                                                {row.distPadron.map((item, i) => {
                                                                                    const isNoInstala = item.nombre === 'NO INSTALA';
                                                                                    return (
                                                                                        <span key={`p-${i}`} className={`border px-2 py-1 rounded text-[10px] italic text-left flex items-center gap-1 shadow-sm ${isNoInstala ? 'bg-amber-100 border-amber-300 text-amber-800 font-black' : row.categoria === 'ESPECIAL' ? 'bg-slate-100 border-slate-300 text-slate-700 font-bold' : 'bg-pink-50 border-pink-300 text-pink-700 font-bold'}`}>
                                                                                            <span className="font-black text-[9px] opacity-50">P:</span>
                                                                                            <span>{item.nombre} {!isNoInstala && `(${item.valor})`}</span>
                                                                                            {isNoInstala && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1.5 text-left">
                                                                                {row.distLista.map((item, i) => {
                                                                                    const isNoInstala = item.nombre === 'NO INSTALA';
                                                                                    return (
                                                                                        <span key={`l-${i}`} className={`border px-2 py-1 rounded text-[10px] italic text-left flex items-center gap-1 shadow-sm ${isNoInstala ? 'bg-amber-100 border-amber-300 text-amber-800 font-black' : row.categoria === 'ESPECIAL' ? 'bg-slate-200 border-slate-400 text-slate-800 font-bold' : 'bg-slate-100 border-slate-300 text-slate-700 font-bold'}`}>
                                                                                            <span className="font-black text-[9px] opacity-50">L:</span>
                                                                                            <span>{item.nombre} {!isNoInstala && `(${item.valor})`}</span>
                                                                                            {isNoInstala && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                                                                                        </span>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6 text-center">
                                                                        <div className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 ${row.variacion ? 'bg-red-50 border-red-200' : noInstala ? 'bg-amber-50 border-amber-300 shadow-sm' : 'bg-white border-slate-200 shadow-sm'}`}>
                                                                            <span className={`text-xl font-black ${noInstala ? 'text-amber-800' : 'text-pink-700'}`}>P: {Number(row.countPadron)}</span>
                                                                            <span className={`text-sm font-bold mt-1 ${noInstala ? 'text-amber-600' : 'text-slate-600'}`}>L: {Number(row.countLista)}</span>
                                                                            {row.variacion && <AlertTriangle className="w-5 h-5 text-red-500 mt-2" title="Variación detectada entre Padrón y Lista" />}
                                                                            {!row.variacion && noInstala && (
                                                                                <div className="mt-2 flex items-center gap-1 px-3 py-1.5 rounded shadow-sm bg-amber-100 border border-amber-400 text-amber-900">
                                                                                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                                                                                    <span className="text-[9px] font-black uppercase leading-none text-center">No Instala</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
          </div>
        )}

        {/* --- VISTA: MESA DE DISEÑO (EXTRAORDINARIAS) --- */}
        {view === 'extraordinary' && (
          <>
            {(conflictosDiseno.total > 0 || (importJsonAvisos && importJsonAvisos.noEncontradas.length > 0)) && (
              <div className="lg:col-span-12 p-4 pb-0 text-left">
                <AvisoImportacionJSON aviso={importJsonAvisos} onClose={() => setImportJsonAvisos(null)} onExportar={exportarReporteImportacionJSON} />
                <AlertaConflictosDiseno conflictos={conflictosDiseno} expandido={detalleConflictosAbierto} onToggle={() => setDetalleConflictosAbierto(v => !v)} onExportar={exportarReporteConflictosDiseno} />
              </div>
            )}
            <div className="lg:col-span-4 border-r border-slate-200 bg-white p-6 overflow-y-auto shadow-inner text-left">
              <h2 className="text-xl font-black tracking-tighter uppercase italic text-pink-700 mb-6">ARMADO DE EXTRAORDINARIAS</h2>
              
              <div className="bg-pink-50/50 p-6 rounded-3xl border-2 border-pink-200 space-y-6 shadow-sm text-left">
                <div className="flex items-center justify-between border-b-2 border-pink-100 pb-3 text-left">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-pink-600 flex items-center gap-2 text-left"><Settings2 className="w-4 h-4 text-left" /> Mesa de Armado</h3>
                </div>
                <div className="space-y-5 text-left">
                  {errorMessage && ( <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3 shadow-sm text-left"><ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5 text-left" /><p className="text-xs font-bold text-red-800 leading-tight text-left">{errorMessage}</p><button onClick={()=>setErrorMessage(null)}><X className="w-4 h-4 text-red-400 text-left" /></button></div> )}
                  {successMessage && ( <div className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl flex items-start gap-3 text-left shadow-sm"><CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /><p className="text-xs font-bold text-emerald-800 leading-tight text-left">{successMessage}</p><button onClick={()=>setSuccessMessage(null)}><X className="w-4 h-4 text-emerald-400" /></button></div> )}
                  
                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 text-left">Sec. Sede</label>
                        <select className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-left text-slate-800" value={form.seccionOrigen} onChange={e => setForm({...form, seccionOrigen: e.target.value, localidad: "", manzanasSeleccionadas: []})}>
                            <option value="">-- SEC --</option>
                            {sectionsPorNumero.map(s => <option key={s} value={s}>{f4(s)}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 text-left">Localidad</label>
                        <select className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none text-left text-slate-800" value={form.localidad} onChange={e => setForm({...form, localidad: e.target.value, manzanasSeleccionadas: []})}>
                            <option value="">-- LOC --</option>
                            {localidadesDisp.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                  </div>

                  {form.localidad && (
                    <div className="space-y-5 text-left">
                      <div className="space-y-2.5 text-left">
                        <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block ml-1 text-left">Manzanas en {form.localidad}</label>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 max-h-[220px] overflow-y-auto p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-inner custom-scrollbar text-left">{manzanasTablero.map(m => {
                            const assign = getMzAssignment(m.id); const isSelected = form.manzanasSeleccionadas.some(sm => sm.id === m.id);
                            return (<button key={m.id} title={m.nombreLocalidad} onClick={() => toggleManzanaSeleccionada(m)} className={`flex flex-col items-center p-3 rounded-xl border-2 text-[10px] font-black transition-all relative ${isSelected ? 'border-pink-600 bg-pink-50 scale-105 z-10 shadow-md text-pink-800' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'} ${assign?.type === 'sede' ? 'text-slate-800 bg-slate-200 border-slate-300 shadow-inner font-black' : ''} ${assign?.type === 'alimentadora' ? 'text-pink-700 bg-pink-100 border-pink-300 shadow-inner' : ''}`}><span className="opacity-50 mb-1 font-mono text-[8px] text-left">MZ</span><span className="text-sm">{f4(m.manzana)}</span>{isSelected && <div className="absolute -top-2 -left-2 bg-pink-600 text-white rounded-full p-1 shadow-sm text-left"><CheckCircle2 className="w-3 h-3" /></div>}{assign && !isSelected && <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-slate-800 border-2 border-white shadow-sm text-left"></div>}</button>);
                        })}</div>
                      </div>
                      
                      {form.manzanasSeleccionadas.length > 0 && (
                        <div className="p-5 bg-slate-900 rounded-3xl text-white space-y-5 shadow-xl border-b-4 border-pink-600 text-left">
                          <div className="flex justify-between items-center text-left">
                             <div className="text-left"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-pink-200 text-left">Selección</p><h4 className="text-2xl font-black italic text-left text-white">{form.manzanasSeleccionadas.length} MZ</h4></div>
                             <div className="text-right text-left text-right">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-pink-200 text-left text-right">Sumatoria</p>
                                <p className="text-lg font-black text-left text-white">P: {totalesSeleccion.padron.toLocaleString()}</p>
                                <p className="text-xs font-bold text-left text-pink-100 mt-0.5">L: {totalesSeleccion.lista.toLocaleString()}</p>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-left">
                            <button onClick={() => setForm(f => ({ ...f, rol: 'sede', manzanasSeleccionadas: f.manzanasSeleccionadas.slice(0, 1) }))} className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all ${form.rol === 'sede' ? 'bg-pink-600 text-white shadow-md scale-105 border-2 border-pink-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-2 border-transparent'}`}>Establecer Sede</button>
                            <button onClick={() => setForm(f => ({ ...f, rol: 'alimentadora' }))} className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all ${form.rol === 'alimentadora' ? 'bg-pink-600 text-white shadow-md scale-105 border-2 border-pink-500' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-2 border-transparent'}`}>Alimentadora</button>
                          </div>
                          
                          <select className="w-full bg-slate-800 rounded-xl p-3 text-sm font-bold text-white border-2 border-slate-700 text-left focus:ring-2 focus:ring-pink-500 outline-none" value={form.rol === 'sede' ? form.tipoElegido : form.casillaUidDestino} onChange={e => setForm({...form, [form.rol === 'sede' ? 'tipoElegido' : 'casillaUidDestino']: e.target.value})}>
                            {form.rol === 'sede' ? Array.from({length:60},(_,i)=>`E${i+1}`).map(e=><option key={e} value={e}>{e}</option>) : sedesActivas.map(c=><option key={c.uid} value={c.uid}>{String(c.tipo)} (Sec {f4(c.sede?.seccion)} Mz {f4(c.sede?.manzana)})</option>)}
                          </select>
                          
                          <button onClick={ejecutarAsignacion} className="w-full bg-white text-slate-900 font-black py-4 rounded-xl uppercase text-[11px] tracking-widest hover:bg-pink-50 shadow-md active:scale-95 transition-all text-left flex justify-center items-center">Confirmar Vínculo</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-8 p-8 overflow-y-auto bg-slate-50 relative text-left">
              <div className="flex justify-between items-center mb-8 px-2 sticky top-0 bg-slate-50/90 backdrop-blur z-40 pb-4 border-b-2 border-slate-200 text-left">
                <div className="flex items-center gap-4 text-left">
                   <h2 className="text-2xl font-black tracking-tighter uppercase italic text-slate-800 leading-none text-left">POLÍGONOS GUARDADOS</h2>
                   <div className="relative text-left"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-left" /><input type="text" placeholder="Filtrar..." className="pl-9 pr-4 py-2 bg-white border-2 border-slate-300 rounded-full text-xs font-bold outline-none w-56 focus:ring-2 focus:ring-pink-500 shadow-sm text-left text-slate-800" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}/></div>
                </div>
                <div className="flex items-center gap-3 text-left">
                  <div className={`text-white px-5 py-2 rounded-full flex items-center gap-2 shadow-sm text-left ${totalCasillasDistrito.exPadron !== totalCasillasDistrito.exLista ? 'bg-red-600' : 'bg-slate-800'}`}>
                    <Hash className="w-4 h-4 text-left" />
                    <span className="text-xs font-black uppercase text-left tracking-wider">
                      Sedes: {sedesActivas.length} | Casillas: P:{totalCasillasDistrito.exPadron} L:{totalCasillasDistrito.exLista}
                    </span>
                  </div>
                  <div className={`px-5 py-2 rounded-full flex items-center gap-2 shadow-sm text-left ${conflictosDiseno.total === 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {conflictosDiseno.total === 0 ? <CheckCircle2 className="w-4 h-4 text-left" /> : <AlertTriangle className="w-4 h-4 text-left" />}
                    <span className="text-xs font-black uppercase text-left tracking-wider">
                      Armado vs Padrón: {conflictosDiseno.total === 0 ? 'Correcto' : `${conflictosDiseno.total} Diferencias`}
                    </span>
                  </div>
                  <button onClick={exportarValidacionManzanas} className="bg-pink-600 hover:bg-pink-700 text-white px-5 py-2 rounded-full flex items-center gap-2 shadow-md active:scale-95 transition-all text-left relative z-40"><FileDown className="w-4 h-4 text-left" /><span className="text-xs font-black uppercase text-left tracking-wider">Validar Manzanas</span></button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-24 text-left">
                {sortedCasillasGlobales.length === 0 ? ( <div className="lg:col-span-3 h-[50vh] border-4 border-dashed border-slate-300 rounded-[3rem] flex flex-col items-center justify-center opacity-50 italic text-center p-8 text-slate-500 text-left bg-white shadow-sm text-lg font-bold">Inicia configurando una sede extraordinaria en la Mesa de Armado.</div> ) : (
                  sortedCasillasGlobales.filter(c => String(c.tipo).toLowerCase().includes(searchQuery.toLowerCase()) || String(c.sede?.seccion).toLowerCase().includes(searchQuery.toLowerCase())).map(c => {
                      const stats = calcularProyeccion(c);
                      const isEspecial = String(c.tipo).startsWith('S');

                      return (
                        <div key={c.uid} className={`bg-white border-2 ${stats.variacion ? 'border-red-400' : isEspecial ? 'border-slate-300' : 'border-slate-300'} rounded-3xl overflow-hidden shadow-md hover:shadow-lg transition-all flex flex-col group text-left`}>
                          <div className={`p-4 flex justify-between items-center text-left border-b-2 ${stats.variacion ? 'bg-red-50 border-red-200' : isEspecial ? 'bg-slate-100 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
                              <div className="flex items-center gap-3 text-left">
                                  <span className={`${isEspecial ? 'bg-slate-800 text-white' : 'bg-pink-600 text-white'} px-3 py-1 rounded-lg font-black italic text-base text-left shadow-sm`}>{String(c.tipo)}</span>
                                  <p className="text-lg font-black uppercase text-slate-700 text-left tracking-widest">SEC. {f4(c.sede?.seccion)}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                  {stats.variacion && <AlertTriangle className="w-5 h-5 text-red-500" title="Variación Padrón/Lista" />}
                                  <button onClick={() => { if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current); isLocalActionActive.current = true; setCasillasGlobales(prev => prev.filter(x => x.uid !== c.uid)); }} className="text-slate-400 hover:text-red-500 transition-all p-1.5 rounded-lg hover:bg-red-50 text-left"><X className="w-5 h-5 text-left" /></button>
                              </div>
                          </div>
                          
                          <div className="p-5 space-y-4 flex-1 text-left">
                            <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3 text-left">
                                <span className="text-[10px] font-black text-slate-400 uppercase text-left tracking-widest">Padrón / Lista</span>
                                <div className="text-right">
                                    <span className="text-2xl font-black italic tracking-tighter text-pink-600 text-left mr-3">P:{Number(stats.total).toLocaleString()}</span>
                                    <span className="text-base font-bold text-slate-500 text-left">L:{Number(stats.totalLista).toLocaleString()}</span>
                                </div>
                            </div>

                            {isEspecial ? (
                                <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border-2 border-slate-200 text-slate-600">
                                    <Star className="w-6 h-6 shrink-0 text-slate-400" />
                                    <p className="text-[11px] font-black uppercase">Casilla Especial sin recuento de manzanas.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start gap-3 text-left"><MapPin className="w-4 h-4 text-pink-500 mt-1 shrink-0 text-left" /><div className="flex-1 text-left"><p className="text-[9px] font-black text-slate-400 uppercase leading-none text-left tracking-widest">Sede</p><p className="text-xs font-bold text-slate-800 mt-1.5 truncate uppercase text-left" title={c.sede?.nombreLocalidad}>Mz {f4(c.sede?.manzana)} • Loc {String(c.sede?.localidad)} {c.sede?.nombreLocalidad ? `- ${c.sede?.nombreLocalidad}` : ''}</p></div><span className="text-[10px] font-mono text-slate-500 font-bold bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg shadow-sm text-left text-center">P:{String(c.sede?.padron)}<br/>L:{String(c.sede?.lista)}</span></div>
                                    <div className="pt-3 border-t-2 border-slate-100 text-left">
                                      <div className="flex justify-between items-center mb-1.5">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Localidades del Polígono</p>
                                        <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg font-black shadow-sm">Total MZ: {[c.sede, ...(c.alimentadoras || [])].length}</span>
                                      </div>
                                      <p className="text-xs font-bold text-slate-700 leading-snug">{stats.localidadesInvolucradas}</p>
                                    </div>

                                    <div className={`rounded-2xl p-4 border-2 relative shadow-sm text-left ${stats.variacion ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                        <div className="flex justify-between items-center mb-3 text-left">
                                            <span className={`text-[9px] font-black uppercase tracking-widest text-left ${stats.variacion ? 'text-red-600' : 'text-slate-500'}`}>Distribución</span>
                                            <div className="flex gap-2">
                                                <span className="bg-pink-100 border border-pink-200 text-pink-700 px-2.5 py-1 rounded-md text-[9px] font-black text-left shadow-sm">P: {Number(stats.totalMesasPadron)}</span>
                                                <span className="bg-slate-200 border border-slate-300 text-slate-800 px-2.5 py-1 rounded-md text-[9px] font-black text-left shadow-sm">L: {Number(stats.totalMesasLista)}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex flex-wrap gap-1.5 text-left">
                                                {stats.distPadron.map((item, i) => {
                                                    const isNoInstala = item.nombre === 'NO INSTALA';
                                                    return (
                                                        <div key={`dp-${i}`} className={`border-2 rounded-lg px-2 py-1 shadow-sm text-[9px] font-black italic flex items-center gap-1 ${isNoInstala ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold' : 'bg-white border-pink-200 text-slate-700'}`}>
                                                            <span className={`${isNoInstala ? 'text-amber-600' : 'text-pink-600'} mr-0.5`}>P:</span>
                                                            {item.nombre} {(!isNoInstala) && `(${item.valor})`}
                                                            {isNoInstala && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 text-left">
                                                {stats.distLista.map((item, i) => {
                                                    const isNoInstala = item.nombre === 'NO INSTALA';
                                                    return (
                                                        <div key={`dl-${i}`} className={`border-2 rounded-lg px-2 py-1 shadow-sm text-[9px] font-black italic flex items-center gap-1 ${isNoInstala ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold' : 'bg-white border-slate-300 text-slate-700'}`}>
                                                            <span className={`${isNoInstala ? 'text-amber-600' : 'text-slate-500'} mr-0.5`}>L:</span>
                                                            {item.nombre} {(!isNoInstala) && `(${item.valor})`}
                                                            {isNoInstala && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {c.alimentadoras && c.alimentadoras.length > 0 && (
                                      <div className="pt-3 border-t-2 border-slate-100 text-left">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">Cuerpo Alimentador ({c.alimentadoras.length})</p>
                                        <div className="flex flex-col gap-2 max-h-32 overflow-y-auto custom-scrollbar text-left">
                                            {c.alimentadoras.map((a, i) => (
                                                <div key={i} className="flex items-center justify-between bg-white border-2 border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 transition-colors text-left text-[10px] font-black text-slate-700 text-left shadow-sm">
                                                    <span title={a.nombreLocalidad}>Mz {f4(a.manzana)} <span className="text-slate-400 font-bold ml-1.5 italic text-left">(Sec {f4(a.seccion)})</span></span>
                                                    <div className="flex gap-3 items-center">
                                                        <span className="text-slate-500 font-bold">P:{a.padron} / L:{a.lista}</span>
                                                        <button onClick={() => desvincularManzana(c.uid, a.id)} className="text-slate-300 hover:text-red-500 transition-colors text-left bg-white p-1 rounded-md shadow-sm border border-slate-200 hover:border-red-200"><MinusCircle className="w-4 h-4 text-left" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                      </div>
                                    )}
                                </>
                            )}
                          </div>
                        </div>
                      );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }`}</style>

      {/* MODAL ESPECIALES */}
      {modalEspecialConfig.isOpen && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-left border-2 border-slate-200">
            <h3 className="text-2xl font-black italic tracking-tighter text-slate-900 mb-1">Agregar Especial</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Sección donde se instala</p>
            
            <div className="space-y-5 mb-8">
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Sección Destino</label>
                    <select className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={especialForm.seccion} onChange={e => setEspecialForm({...especialForm, seccion: e.target.value})}>
                        <option value="">-- SELECCIONA SECCIÓN --</option>
                        {sectionsPorNumero.map(s => <option key={s} value={s}>{f4(s)}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Nomenclatura (Ej. S1, S2)</label>
                    <input type="text" className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={especialForm.tipo} onChange={e => setEspecialForm({...especialForm, tipo: String(e.target.value).toUpperCase()})} placeholder="S1" />
                </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setModalEspecialConfig({ isOpen: false })} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl transition-colors text-xs uppercase tracking-wider">Cancelar</button>
              <button onClick={agregarCasillaEspecial} disabled={!especialForm.seccion || !especialForm.tipo} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white font-black rounded-xl transition-colors text-xs flex items-center gap-2 uppercase tracking-wider shadow-md"><Star className="w-4 h-4 text-pink-500" /> Insertar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 text-center border-2 border-slate-200">
            <AlertTriangle className="w-14 h-14 text-pink-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-slate-900 mb-2">Confirmar Acción</h3>
            <p className="text-sm text-slate-600 mb-8 font-bold">{modalConfig.message}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setModalConfig({ isOpen: false, message: '', onConfirm: null })} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase tracking-wider rounded-xl transition-colors text-xs">Cancelar</button>
              {modalConfig.onConfirm && (
                <button onClick={() => { modalConfig.onConfirm(); setModalConfig({ isOpen: false, message: '', onConfirm: null }); }} className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-black uppercase tracking-wider rounded-xl transition-colors shadow-md text-xs">Confirmar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ASIGNACIÓN DE DOMICILIO */}
      {modalUbicacionConfig.isOpen && (
        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full mx-4 text-left border-2 border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black italic tracking-tighter text-slate-900 mb-1 flex items-center gap-2"><Building2 className="w-6 h-6 text-pink-600" /> Asignar Domicilio</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">{modalUbicacionConfig.claves?.length || 0} casilla(s) seleccionada(s)</p>

            <div className="space-y-4 mb-8">
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Tipo de Domicilio</label>
                    <select className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={formUbicacionDraft.tipoDomicilio} onChange={e => setFormUbicacionDraft({ ...formUbicacionDraft, tipoDomicilio: e.target.value })}>
                        <option value="">-- SELECCIONA --</option>
                        {CATALOGO_TIPO_DOMICILIO.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Domicilio</label>
                    <input type="text" className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={formUbicacionDraft.domicilio} onChange={e => setFormUbicacionDraft({ ...formUbicacionDraft, domicilio: e.target.value })} placeholder="Calle, número, colonia, código postal, municipio" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Ubicación</label>
                        <input type="text" className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={formUbicacionDraft.ubicacion} onChange={e => setFormUbicacionDraft({ ...formUbicacionDraft, ubicacion: e.target.value })} placeholder="Ej. Escuela Primaria..." />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Referencia</label>
                        <input type="text" className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={formUbicacionDraft.referencia} onChange={e => setFormUbicacionDraft({ ...formUbicacionDraft, referencia: e.target.value })} placeholder="Ej. Esquina con..." />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Nombre Propietario</label>
                    <input type="text" className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-pink-500 outline-none mt-1 text-slate-800" value={formUbicacionDraft.nombrePropietario} onChange={e => setFormUbicacionDraft({ ...formUbicacionDraft, nombrePropietario: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t-2 border-slate-100">
                    {[
                        { key: 'anuencia', label: 'Anuencia' }, { key: 'notificacion', label: 'Notificación' },
                        { key: 'reconocimiento', label: 'Reconocimiento' }, { key: 'domicilioAccesible', label: 'Domicilio Accesible' },
                        { key: 'casillaAccesible', label: 'Casilla Accesible' }, { key: 'urnaElectronica', label: 'Urna Electrónica' },
                    ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2">
                            <span className="text-[10px] font-black uppercase text-slate-600">{label}</span>
                            <button onClick={() => setFormUbicacionDraft({ ...formUbicacionDraft, [key]: formUbicacionDraft[key] === 'SÍ' ? 'NO' : 'SÍ' })} className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${formUbicacionDraft[key] === 'SÍ' ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}>{formUbicacionDraft[key]}</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => { setModalUbicacionConfig({ isOpen: false }); setSeleccionUbicacion([]); }} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black rounded-xl transition-colors text-xs uppercase tracking-wider">Cancelar</button>
              <button onClick={() => { asignarDomicilioAClaves(modalUbicacionConfig.claves, formUbicacionDraft); setModalUbicacionConfig({ isOpen: false }); setSeleccionUbicacion([]); }} disabled={!formUbicacionDraft.tipoDomicilio || !formUbicacionDraft.domicilio} className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:bg-slate-300 text-white font-black rounded-xl transition-colors text-xs flex items-center gap-2 uppercase tracking-wider shadow-md"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import ReactDOM from 'react-dom/client';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);