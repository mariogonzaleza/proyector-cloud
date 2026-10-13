# Plan: versión de Proyector Cloud que funcione sin internet

**Origen (13-oct-2026):** casi todos los VOES estaban en una reunión en Querétaro y no pudieron
conectarse con el internet del hotel. Mario pidió una versión que funcione sin conexión y que
sincronice los cambios al reconectar. Acordado: app instalable (PWA) en 3 fases, probando
siempre en PRUEBAS antes de producción (ver CLAUDE.md).

## Por qué hoy no funciona sin internet
1. **No abre:** cada carga descarga de CDNs React/lucide (esm.sh), Tailwind (cdn.tailwindcss.com),
   Babel standalone (unpkg), Firebase (gstatic) y las librerías de Excel/PDF, y compila App.jsx
   en el navegador. Un hotel o la red de la junta puede bloquear cualquiera de esos dominios.
2. **No guarda:** `getFirestore(app)` sin caché persistente; el autoguardado hace `setDoc` y,
   sin red, marca "Error al guardar"; al recargar se pierde lo no sincronizado.
3. **Inicio de sesión:** `signInAnonymously` necesita red; si falla, la app cae a
   `{ uid: 'local-user' }` (Modo Local) y deja de usar la nube.

## Fase 1 — Que abra sin internet
- Introducir un paso de build: `npm` con react, react-dom, lucide-react, firebase,
  xlsx-js-style, jspdf, jspdf-autotable; empaquetar con esbuild (adiós Babel en el navegador:
  carga más rápida).
- Tailwind CLI para generar el CSS. Mover el `tailwind.config` (hoy dentro de cada HTML) a un
  `tailwind.config.js` compartido; lo que difiere entre ambientes (firebaseConfig, título,
  franja de PRUEBAS) se inyecta en el build.
- Revisar cómo se cargan hoy xlsx/jsPDF (hay estados `isXlsxLibLoading` / `isPdfLibLoading`:
  probablemente se insertan desde CDN en tiempo de ejecución) y empaquetarlas también.
- Service worker con precache versionado del app shell + `manifest.json` + íconos → "Instalar
  app" en Chrome. Al publicar una versión nueva, el SW la toma en la siguiente apertura con red.
- Ajustar `deploy.ps1` / `deploy-staging.ps1` para correr el build antes de publicar.
- Primera vez en cada equipo: se necesita internet una vez (instalar y abrir cada distrito).

## Fase 2 — Que guarde sin internet y sincronice solo
- `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`
  en lugar de `getFirestore`. Las escrituras quedan en IndexedDB y se envían al reconectar,
  aunque se cierre la app.
- Auth sin red: Firebase Auth restaura el usuario anónimo guardado; no caer a `local-user`
  si ya hubo sesión antes (esperar `onAuthStateChanged` antes de decidir).
- Indicador en la barra: "Sin conexión · N cambios pendientes" → "Sincronizado"
  (usar `snapshot.metadata.hasPendingWrites`, `onSnapshotsInSync`, `waitForPendingWrites`,
  eventos `online`/`offline`). Reemplaza el "Error al guardar" cuando la causa sea falta de red.
- Directorio de inicio (`getDocs` de maquetas) y versiones deben leer de la caché si no hay red.
- Un distrito que nunca se abrió en ese equipo no está en caché: avisarlo claramente.

## Fase 3 — Sincronizar sin pisar a otros
Riesgo actual: el distrito es UN documento y cada guardado lo reemplaza entero. Si alguien
trabaja sin red y otra persona edita el mismo distrito en línea, al reconectar el primero
pisa todo lo del segundo. Mientras no exista esta fase: **sin conexión, una sola persona por
distrito** (para los VOES suele ser así).
- Partir el documento por entidad: subcolecciones `casillas/{uid}`, `domicilios/{clave}`,
  `ubicacion/{clave}`, `historial/{id}`; el documento del distrito queda solo con configuración
  (equipConfig, folioConfig, fechaCorte, cabecera, reportes SUC, basicaSedePorSeccion…).
- Escribir por elemento (`setDoc`/`deleteDoc`/`updateDoc` puntuales) en vez del documento
  completo: al reconectar solo sube lo que cambió esa persona.
- Conflictos: campo `actualizadoEn`/`version` por elemento; si al sincronizar la nube trae un
  cambio más nuevo del mismo elemento, avisar en vez de reemplazar.
- Migración única desde el documento actual (guardar respaldo del original), probada en
  PRUEBAS con dos sesiones simultáneas (una sin red).
- De paso elimina el límite de 1 MB por distrito y el "último que guarda gana" en línea.

## Mientras tanto (si vuelve a pasar en una reunión)
- Compartir datos del celular (hotspot): la app gasta ~2–3 MB al abrir y casi nada al guardar.
- Si otras páginas abren pero Proyector Cloud no, el hotel bloquea algún dominio (Firebase o
  los CDNs): la fase 1 lo resuelve.
- No trabajar sin conexión estable; si alguien ya trabajó, descargar "Respaldo" (.json) en la
  Mesa de Diseño antes de cerrar.
