# Proyector Cloud — contexto para Claude Code

Herramienta interna de Mario González (VOE, INE Estado de México) para proyectar casillas
electorales por distrito: armado de extraordinarias, básicas/contiguas, especiales, ubicación
(domicilios), equipamiento, folios y reportes. La usan los VOES de los 40 distritos. Responder
siempre en español. Mario aprueba todo viendo primero el ambiente de pruebas.

## Trabajo en dos equipos (casa y trabajo) — OBLIGATORIO
Mario trabaja este repo desde dos computadoras, cada una con su propio chat. Lo único que
comparten es GitHub, Firebase y este archivo; la memoria de cada chat NO viaja.
- **Al iniciar:** el hook `.claude/hooks/sync_inicio.sh` (SessionStart) hace `git pull --ff-only`
  y avisa el resultado. Si avisa cambios sin commitear, ramas divergidas o sin internet,
  resolverlo y decírselo a Mario ANTES de editar nada. Nunca dar el repo por "al día" sin esto.
- **Al terminar** (cuando Mario diga que ya terminamos, se despida o vaya a cambiar de equipo):
  actualizar en este archivo "Estado actual" y "Pendientes" con lo hecho y lo que queda,
  hacer commit (incluyendo cualquier cambio pendiente que Mario haya aprobado) y `git push`.
  Confirmar con `git status` limpio y `git log origin/master..HEAD` vacío.
- Todo lo que deba recordarse entre equipos va aquí, no en la memoria del chat.

## Estado actual
Al 23-oct-2026: todo en `master`, sincronizado con GitHub y publicado en producción y pruebas;
sin código a medias. Último cambio en producción (23-oct): asignar secciones de menos de 100 a
otra sección + regla "sección sin básica" (ver Reglas de negocio). Probado en pruebas D14.
Falta: agregar estas dos funciones a la Guía Rápida (dentro de 02/05, sin cambiar el orden).
En pruebas D14 queda de ejemplo: E1 en la 0600 con toda la sección (sale "sin básica") y la
asignación 0600→0601 en pausa.

## Stack (sin build)
- Una sola app React 18 en `src/App.jsx` (~6,000 líneas), compilada **en el navegador** con
  Babel standalone. `index.html` carga React/lucide desde esm.sh, Tailwind por CDN (con su
  `tailwind.config` dentro del HTML), Firebase 10.14.1 desde gstatic, y xlsx-js-style / jsPDF +
  autotable como globales (`window.XLSX`, `window.jspdf`).
- `src/utils/helpers.js` (funciones puras: corte de 750, comparar versiones, fuente Arial en
  Excel…), `src/data/constantes.js` (BOOTH_LIMIT=750, MARGEN_CORTE_750=15, municipios),
  `src/data/localidades.json`, `src/data/Guia_Rapida_Proyector_Cloud.pdf`.
- Comprobar sintaxis después de editar App.jsx:
  `npx --yes esbuild src/App.jsx --loader:.jsx=jsx --log-level=error --outfile=<tmp>/out.js`

## Ambientes y despliegue
| | Producción | Pruebas |
|---|---|---|
| URL | https://proyector-voe.web.app | https://proyector-voe-pruebas.web.app |
| Proyecto Firebase | `proyector-voe` | `proyector-voe-pruebas` (separado por completo) |
| HTML | `index.html` | `index.staging.html` (franja naranja "PRUEBAS", su propia config) |
| Publicar | `powershell -File deploy.ps1` | `powershell -File deploy-staging.ps1` |

- Los scripts copian `index*.html`, `src/App.jsx`, `src/data/*`, `src/utils/*` a
  `web-deploy/` o `web-deploy-staging/` y corren `firebase deploy --only hosting`.
  Requiere Firebase CLI con sesión (`firebase login`) con la cuenta dueña de ambos proyectos.
- **Flujo obligatorio:** cambio → publicar en PRUEBAS → Mario revisa → solo con su "súbelo"
  publicar en PRODUCCIÓN y hacer commit + push a `master` (GitHub mariogonzaleza/proyector-cloud).
  Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- La paleta de colores vive en el `tailwind.config` de cada HTML: si cambia, copiar el bloque de
  `index.staging.html` a `index.html` (sin tocar título, firebaseConfig ni la franja).
- Nunca probar contra distritos reales: un servidor local conectado a producción puede pisar un
  distrito con el autoguardado. Probar en PRUEBAS, distrito 14 (ver "Cómo probar").

## Datos (Firestore)
- Un documento por distrito: `artifacts/{appId}/public/data/maquetas/distrito_{N}`
  (appId `proyector-cloud-v18`). El autoguardado (debounce 1.5 s) hace `setDoc` del documento
  COMPLETO: casillas (refs sección/localidad/manzana), domicilios, ubicacionCasillas,
  equipConfig, mamparasPorCasilla, basicaSedePorSeccion, folioConfig, fechaCorte,
  cabeceraDistrital, reporteDiferenciaProyeccion, comparativo2024Base, historialCambiosDomicilio.
  Riesgos conocidos: límite de 1 MB por documento y "el último que guarda gana".
- Subcolección `versionesExtra/{id}`: versiones de la proyección (foto completa por corte).
- **El padrón nunca se guarda** (ni en nube ni en localStorage): se vuelve a cargar del Excel en
  cada sesión y el armado se re-vincula contra él.
- Copia local por distrito en localStorage: `proyector_<campo>_D<N>`.
- Reglas (`firestore.rules`): lectura/escritura solo con usuario autenticado (auth anónima).
- Realtime Database `proyector-voe-default-rtdb`: NO se usa, está vacía y con reglas en false.
  `databaseURL` en index.html sobra (pendiente quitarla).
- Cuidado histórico: nunca borrar/fusionar documentos duplicados de Firestore de producción sin
  visto bueno de Mario caso por caso; la limpieza del huérfano `distrito_9` quedó diferida (no
  reintentar); nunca arrastrar el valor contaminado "TEPEXPAN" a `distrito_09`.

## Reglas de negocio importantes
- Casillas = techo(electores / 750). 750 sigue siendo 1 casilla; la segunda abre en 751.
  "Margen al corte" (`margenCorte750`): "Faltan N (+1 casilla)" / "Sobran N (-1 casilla)";
  alerta si N ≤ 15; riesgo ALTO ≤5, MEDIO ≤10, BAJO ≤15. No tocar el cálculo de proyección ni el
  reparto de padrón/lista (Mario confirmó que están bien).
- Básica con 1–99 electores: NO se proyecta ("NO INSTALA"), salvo que su sección tenga una
  extraordinaria PROYECTADA. Extraordinaria con 1–99: SÍ se proyecta (1 casilla) — regla vieja,
  no cambiarla.
- Cualquier casilla con 0 electores no se proyecta. Extraordinaria formada solo por manzanas en 0
  (dadas de alta en cartografía): "Sin electores · no instala" (0 casillas; `extraTieneElectores`),
  se conserva en el armado, no cuenta como extraordinaria proyectada de su sección (su básica
  recibe el trato normal de menos de 100), y en Proyección Oficial/QGIS sus manzanas van a la
  básica. Las especiales no aplican (no llevan padrón por manzana; siempre 1 casilla).
- **Asignar sección de menos de 100** (`seccionesAsignadas` = {origen: destino}, guardado en el
  documento del distrito; `resolverAsignacionesMenos100`): una sección cuya básica no se instala
  (1–99, sin extraordinaria proyectada) se manda COMPLETA a la básica de otra sección del
  distrito (cualquier municipio). Su padrón/lista se suma a la básica destino (puede subir de
  casillas) y los folios salen en el destino. Sin cadenas (una sección mandada no recibe ni se
  manda a otra mandada). En Proyección Oficial el origen queda con padrón 0 y nota "Padrón
  asignado a la sección X"; el destino "Incluye padrón y lista de la sección X asignada por menos
  de 100". Las notas van en la primera columna vacía después de los datos, SIN encabezado (así lo
  pidió Mario). QGIS: manzanas del origen con claveCas `<destino>-B`. Si cambian las condiciones
  (le arman extraordinaria, llega a 100, sale del padrón…), la asignación queda "en pausa" con
  aviso en el Listado y botón "Quitar asignación"; no se borra sola.
- **Primero es la básica**: no puede haber una sección con extraordinaria(s) y básica en 0
  electores (aunque conserve manzanas en 0; los electores recibidos por asignación sí cuentan).
  La Mesa de armado BLOQUEA el confirmar que dejaría así una sección; los casos que ya existen
  solo se avisan en ámbar (Polígonos guardados y Listado, etiqueta "Sin básica").
- Especiales: nomenclatura S + número, sin repetir dentro de una sección (la numeración es por
  sección); se administran en Proyección → "Casillas especiales" (no salen en Polígonos).
- "Reiniciar" (barra superior, con candado de 15 s) borra SOLO el armado: extraordinarias,
  especiales y sede de básicas. Conserva padrón, domicilios, equipamiento, folios, cabecera y
  versiones.
- Todo borrado pasa por `confirmarBorrado(...)` → "¿Estás seguro?" con botón rojo. Nunca borrar
  directo.

## Diseño (aprobado oct-2026 — no reabrir sin que Mario lo pida)
- Pantalla: estilo de los formatos oficiales del INE 2026. Mucho blanco; Gris medio (#6B7278) en
  pestañas activas y tarjetas principales; topo (#84705A) como único acento de acción; Beige
  oficial (#C5A989) en etiquetas; gris neutro en fondos/textos. Sin degradados, sin brillos, sin
  cursivas. Títulos de sección como píldora beige (`rounded-l-md rounded-r-full`, estilo
  "Participan:").
- Claves Tailwind remapeadas (un solo punto de control): `pink`=topo (acción, ~240 usos),
  `beige`=beige, `violet`/`oxford`=gris medio, `slate`=gris neutro.
- Rechazado por Mario: bronce/crema con degradados, rosa+lila, rosa quemado (parece guinda →
  asociación partidista), lila vivo, Gris Oxford en tarjetas grandes ("demasiado negras").
- Semáforo silencioso: estados correctos en gris; ámbar suave cuando hay que revisar; rojo solo
  para borrar/errores.
- Reportes Excel/PDF: SOLO paleta del Manual INE (Gris Oxford #454248, Gris #B2B2B2, Beige
  #C5A989, Gris medio #828A91, Gris claro #C5C9CC, Gris cálido #DDD4CE, negro, blanco) y Arial
  (`aplicarFuenteInstitucional`). Respetar colores de formato que esperan otras áreas en la
  "Proyección Oficial INE" (FFFF00, 4472C4, 65BFCB, 6FC5E6, FFF2CC). Gráficas: pares validados
  Oxford↔Beige, Oxford↔Gris medio; toda barra lleva su valor escrito.

## Guía Rápida
- Se genera con `py -3 tools/rebuild_guia.py` (dependencias en `tools/requirements-guia.txt`),
  escribe `src/data/Guia_Rapida_Proyector_Cloud.pdf`. Revisar el PDF (p. ej. con pymupdf a PNG)
  antes de publicar.
- REGLA de Mario: nunca cambiar el orden de funciones 01 Padrón → 02 Extraordinarias → 03 Sede
  de la Básica → 04 Candados → 05 Referencia rápida. Lo nuevo va dentro de su sección.

## Cómo probar (pruebas, distrito 14)
Con el panel del navegador en https://proyector-voe-pruebas.web.app: escribir 14 en el número
de distrito, "Validar distrito", y cargar un padrón de prueba generado en la propia página:
```js
const H=['PIVOTE','DISTRITO FEDERAL','DISTRITO LOCAL','MUNICIPIO','SECCION','LOCALIDAD','MANZANA','PADRON','LISTA','NOMBRE DE LOCALIDAD'];
const D=[['0500','0001','001',320,310,'CABECERA'],['0500','0001','002',280,270,'CABECERA'],['0500','0001','003',150,150,'CABECERA'],
         ['0501','0001','001',410,400,'CABECERA'],['0501','0001','002',345,340,'CABECERA'],['0502','0001','001',740,730,'CABECERA']];
const X=window.XLSX, wb=X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([H, ...D.map(r=>['14','14','14','057',...r])]), 'Padron');
const inp=document.querySelectorAll('input[type=file]')[0], dt=new DataTransfer();
dt.items.add(new File([X.write(wb,{type:'array',bookType:'xlsx'})],'padron.xlsx')); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true}));
```
- Cargar un padrón chico re-vincula y QUITA del armado las manzanas que no existan → el
  autoguardado lo deja así en la nube de pruebas (normal en pruebas; avisar a Mario).
- Para capturar descargas: reemplazar `window.XLSX.writeFile` o envolver el constructor
  `window.jspdf.jsPDF` (sobrescribir `save` en el prototipo no funciona).
- Leer Firestore de pruebas por REST con el token de `indexedDB('firebaseLocalStorageDb')`.

## Pendientes (en orden de prioridad acordada)
0. **Guía Rápida**: agregar "Asignar a otra sección (menos de 100)" y la regla "primero es la
   básica" (respetar orden 01→05).
1. **Versión sin internet** → ver `docs/PLAN_OFFLINE.md` (Mario lo pidió el 13-oct-2026: los
   VOES no pudieron conectarse en una reunión en Querétaro).
2. Presencia: mostrar quién está editando cada distrito (Realtime Database con onDisconnect,
   reglas solo para autenticados) — aprobado para "próximas actualizaciones".
3. Quitar `databaseURL` de index.html (si no se usa Realtime DB para lo anterior).
4. Vigilar el límite de 1 MB por distrito (lo resuelve la fase 3 del plan offline).
5. Opcionales ofrecidos: alerta de especiales duplicadas ya existentes; botón "Reiniciar" más
   compacto cuando está desbloqueado (en pantallas angostas baja a segunda línea).
