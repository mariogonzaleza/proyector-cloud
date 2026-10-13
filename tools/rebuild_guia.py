# -*- coding: utf-8 -*-
"""Genera la Guía Rápida (src/data/Guia_Rapida_Proyector_Cloud.pdf).

Uso:  py -3 tools/rebuild_guia.py   (requiere: pip install -r tools/requirements-guia.txt)

REGLA: nunca cambiar el orden de las secciones 01→05; lo nuevo va dentro de su sección.
Colores: solo los oficiales del Manual INE (cajas ámbar solo para alertas).

Historia: reconstruye la Guía Rápida completa, reordenando el contenido al orden real del flujo:
01 Padrón (con la advertencia de pegado incluida) -> 02 Armar extraordinarias -> 03 Sede de la
Básica -> 04 Candados -> 05 Referencia rápida. Reusa exactamente los tokens visuales medidos del
documento original (fuentes, tamaños, colores, márgenes) vía un motor de flujo manual con salto
de página automático, para no depender de coordenadas fijas por sección."""
import io
import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from pypdf import PdfReader, PdfWriter

PAGE_W, PAGE_H = letter

# Manual de Identidad INE (revisión 24-sept-2026): solo colores oficiales, salvo las cajas
# ámbar, que se conservan a propósito como señal de "alerta" dentro de la guía.
def _rgb(r, g, b): return (r / 255, g / 255, b / 255)
INK_TITLE    = _rgb(0, 0, 0)          # Negro (oficial) — títulos
INK_BODY     = _rgb(69, 66, 72)       # Gris Oxford (oficial) — texto
INK_FOOTER   = _rgb(130, 138, 145)    # Gris medio (oficial) — pie y subtítulos
ACCENT       = _rgb(69, 66, 72)       # Gris Oxford (oficial) — números de sección, pasos
NEUTRAL_FILL   = _rgb(221, 212, 206)  # Gris cálido (oficial) — fondo de cajas informativas
NEUTRAL_BORDER = _rgb(197, 169, 137)  # Beige (oficial) — borde de cajas informativas
NEUTRAL_LABEL  = _rgb(69, 66, 72)     # Gris Oxford (oficial)
AMBER_FILL   = (0.992157, 0.952941, 0.905882)  # Ámbar: se conserva como color de alerta
AMBER_BORDER = (0.952941, 0.85098, 0.658824)
AMBER_LABEL  = (0.705882, 0.329412, 0.039216)
DIVIDER      = _rgb(197, 169, 137)    # Beige (oficial) — líneas divisorias

L_MARGIN, R_MARGIN = 62.7, 549.3
BOX_X0, BOX_X1 = 70.0, 542.0
BODY_FONT, BODY_SIZE, BODY_LEAD = 'Helvetica', 9.6, 13.5
CONTENT_BOTTOM = 738.0

def wrap_runs(runs, font_reg, font_bold, size, max_width):
    """runs: lista de (texto, bold). Devuelve lista de líneas, cada línea lista de (texto,bold)."""
    words = []
    for text, bold in runs:
        for i, w in enumerate(text.split(' ')):
            if w:
                words.append((w, bold))
    lines, cur, cur_w = [], [], 0.0
    space_w = stringWidth(' ', font_reg, size)
    for w, bold in words:
        f = font_bold if bold else font_reg
        ww = stringWidth(w, f, size)
        extra = (space_w if cur else 0) + ww
        if cur and cur_w + extra > max_width:
            lines.append(cur)
            cur, cur_w = [(w, bold)], ww
        else:
            cur.append((w, bold))
            cur_w += extra
    if cur:
        lines.append(cur)
    return lines

def wrap_text(text, font, size, max_width):
    return [' '.join(w for w, _ in line) for line in wrap_runs([(text, False)], font, font, size, max_width)]

class Doc:
    def __init__(self):
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=letter)
        self.page = 0
        self.y = 0.0
        self._start_page(hero=True)

    def top_y(self, top):
        return PAGE_H - top

    def _footer(self):
        c = self.c
        c.setStrokeColorRGB(*DIVIDER)
        c.setLineWidth(0.75)
        c.line(56.7, self.top_y(749.5), 538.6, self.top_y(749.5))
        c.setFont('Helvetica', 8)
        c.setFillColorRGB(*INK_FOOTER)
        c.drawString(56.7, self.top_y(762.5), 'Proyector Cloud · Guía Express')
        c.drawRightString(542.0, self.top_y(762.5), f'Página {self.page}')

    def _start_page(self, hero=False):
        self.page += 1
        if hero:
            c = self.c
            c.setFont('Helvetica-Bold', 9)
            c.setFillColorRGB(*ACCENT)
            c.drawString(62.7, self.top_y(61.2), 'GUÍA EXPRESS')
            c.setFont('Helvetica-Bold', 26)
            c.setFillColorRGB(*INK_TITLE)
            c.drawString(62.7, self.top_y(98.6), 'Proyector Cloud')
            c.setFont('Helvetica', 10.5)
            c.setFillColorRGB(*INK_FOOTER)
            c.drawString(62.7, self.top_y(112.0), 'Padrón, extraordinarias, y lo esencial de Proyección · v18')
            c.setStrokeColorRGB(*DIVIDER)
            c.setLineWidth(0.75)
            c.line(62.7, self.top_y(122.2), 549.3, self.top_y(122.2))
            self.y = 135.5
        else:
            self.y = 60.0

    def new_page(self):
        self._footer()
        self.c.showPage()
        self._start_page(hero=False)

    def ensure(self, needed):
        if self.y + needed > CONTENT_BOTTOM:
            self.new_page()

    def divider_before_section(self):
        # Deja aire y traza la línea divisoria previa a un encabezado de sección, salvo que
        # estemos justo al inicio de una página (ya trae su propio margen).
        if self.y > 70:
            self.y += 12
            self.ensure(6)
            self.c.setStrokeColorRGB(*DIVIDER)
            self.c.setLineWidth(0.75)
            self.c.line(62.7, self.top_y(self.y), 549.3, self.top_y(self.y))
            self.y += 15

    def section_header(self, numero, titulo):
        self.divider_before_section()
        self.ensure(20)
        c = self.c
        baseline = self.y + 10.5
        c.setFont('Helvetica-Bold', 13)
        c.setFillColorRGB(*ACCENT)
        c.drawString(66.0, self.top_y(baseline), numero)
        c.setFont('Helvetica-Bold', 14)
        c.setFillColorRGB(*INK_TITLE)
        c.drawString(86.0, self.top_y(baseline), titulo)
        self.y += 26

    def paragraph(self, runs, x=None, max_width=None, size=BODY_SIZE, leading=BODY_LEAD, color=INK_BODY, gap_after=10):
        x = L_MARGIN if x is None else x
        max_width = (R_MARGIN - L_MARGIN) if max_width is None else max_width
        if isinstance(runs, str):
            runs = [(runs, False)]
        lines = wrap_runs(runs, 'Helvetica', 'Helvetica-Bold', size, max_width)
        self.ensure(len(lines) * leading + gap_after)
        c = self.c
        for line in lines:
            cx = x
            for word, bold in line:
                f = 'Helvetica-Bold' if bold else 'Helvetica'
                c.setFont(f, size)
                c.setFillColorRGB(*color)
                c.drawString(cx, self.top_y(self.y + size), word)
                cx += stringWidth(word + ' ', f, size)
            self.y += leading
        self.y += gap_after

    def two_col_bullets(self, left_items, right_items, gap_after=10):
        col2_x = L_MARGIN + 253.3
        rows = max(len(left_items), len(right_items))
        self.ensure(rows * 15.5)
        c = self.c
        for i in range(rows):
            ry = self.y + i * 15.5
            c.setFont(BODY_FONT, BODY_SIZE)
            c.setFillColorRGB(*INK_BODY)
            if i < len(left_items):
                c.drawString(L_MARGIN, self.top_y(ry + BODY_SIZE), '•  ' + left_items[i])
            if i < len(right_items):
                c.drawString(col2_x, self.top_y(ry + BODY_SIZE), '•  ' + right_items[i])
        self.y += rows * 15.5 + gap_after

    def info_box(self, label, runs, style='neutral', gap_after=14):
        fill, border, labelcolor = (NEUTRAL_FILL, NEUTRAL_BORDER, NEUTRAL_LABEL) if style == 'neutral' else (AMBER_FILL, AMBER_BORDER, AMBER_LABEL)
        if isinstance(runs, str):
            runs = [(runs, False)]
        text_x = BOX_X0 + 82.0
        text_max_w = BOX_X1 - 10.0 - text_x
        lines = wrap_runs(runs, 'Helvetica', 'Helvetica-Bold', BODY_SIZE, text_max_w)
        label_max_w = text_x - 80.0 - 6.0
        label_lines = wrap_text(label, 'Helvetica-Bold', 8.2, label_max_w)
        pad_top, pad_bottom = 10.7, 9.0
        n_rows = max(len(lines), len(label_lines))
        box_h = pad_top + n_rows * BODY_LEAD + pad_bottom
        self.ensure(box_h + gap_after)
        c = self.c
        box_top = self.y
        box_bottom = box_top + box_h
        c.setFillColorRGB(*fill)
        c.setStrokeColorRGB(*border)
        c.setLineWidth(1)
        c.roundRect(BOX_X0, self.top_y(box_bottom), BOX_X1 - BOX_X0, box_h, 4, fill=1, stroke=1)
        ly = box_top + pad_top + 8.0
        c.setFont('Helvetica-Bold', 8.2)
        c.setFillColorRGB(*labelcolor)
        for lline in label_lines:
            c.drawString(80.0, self.top_y(ly), lline)
            ly += BODY_LEAD
        ty = box_top + pad_top + 8.0
        for line in lines:
            cx = text_x
            for word, bold in line:
                f = 'Helvetica-Bold' if bold else 'Helvetica'
                c.setFont(f, BODY_SIZE)
                c.setFillColorRGB(*INK_BODY)
                c.drawString(cx, self.top_y(ty), word)
                cx += stringWidth(word + ' ', f, BODY_SIZE)
            ty += BODY_LEAD
        self.y = box_bottom + gap_after

    def wizard_step(self, numero, titulo, runs, gap_after=14):
        if isinstance(runs, str):
            runs = [(runs, False)]
        text_x = 95.0
        max_w = R_MARGIN - text_x
        title_h = 14.5
        desc_lines = wrap_runs(runs, 'Helvetica', 'Helvetica-Bold', BODY_SIZE, max_w)
        block_h = title_h + len(desc_lines) * BODY_LEAD
        self.ensure(block_h + gap_after)
        c = self.c
        badge_top = self.y
        c.setFillColorRGB(*ACCENT)
        c.roundRect(65.0, self.top_y(badge_top + 22), 22, 22, 5, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 11)
        c.setFillColorRGB(1, 1, 1)
        c.drawCentredString(76.0, self.top_y(badge_top + 15.5), numero)
        c.setFont('Helvetica-Bold', 10.6)
        c.setFillColorRGB(*INK_TITLE)
        c.drawString(text_x, self.top_y(badge_top + 10.6), titulo)
        ty = badge_top + title_h + BODY_SIZE
        for line in desc_lines:
            cx = text_x
            for word, bold in line:
                f = 'Helvetica-Bold' if bold else 'Helvetica'
                c.setFont(f, BODY_SIZE)
                c.setFillColorRGB(*INK_BODY)
                c.drawString(cx, self.top_y(ty), word)
                cx += stringWidth(word + ' ', f, BODY_SIZE)
            ty += BODY_LEAD
        self.y = badge_top + block_h + gap_after

    def candados_grid(self, items, gap_after=14):
        # items: lista de 4 (titulo, descripcion). Rejilla 2x2, cada celda con altura por contenido.
        col_w = (BOX_X1 - BOX_X0) / 2.0
        col_xs = [BOX_X0 + 6.0, BOX_X0 + col_w + 6.0]
        max_w = col_w - 16.0
        wrapped = [wrap_text(desc, 'Helvetica', 8.6, max_w) for _, desc in items]
        row1_h = max(len(wrapped[0]), len(wrapped[1])) * 12.5 + 22
        row2_h = max(len(wrapped[2]), len(wrapped[3])) * 12.5 + 22
        self.ensure(row1_h + row2_h + gap_after)
        c = self.c
        top0 = self.y
        rows_h = [row1_h, row2_h]
        row_top = top0
        idx = 0
        for r in range(2):
            for col in range(2):
                titulo, _ = items[idx]
                x = col_xs[col]
                ty = row_top
                c.setFont('Helvetica-Bold', 9.6)
                c.setFillColorRGB(*INK_BODY)
                c.drawString(x, self.top_y(ty + 9.6), titulo)
                ty += 17.0
                c.setFont(BODY_FONT, 8.6)
                c.setFillColorRGB(*INK_FOOTER)
                for line in wrapped[idx]:
                    c.drawString(x, self.top_y(ty + 8.6), line)
                    ty += 12.5
                idx += 1
            row_top += rows_h[r]
        c.setStrokeColorRGB(*DIVIDER)
        c.setLineWidth(0.75)
        c.line(BOX_X0, self.top_y(top0 + row1_h), BOX_X1, self.top_y(top0 + row1_h))
        c.line(BOX_X0 + col_w, self.top_y(top0), BOX_X0 + col_w, self.top_y(top0 + row1_h + row2_h))
        self.y = top0 + row1_h + row2_h + gap_after

    def save(self, path, extra_pages=None):
        self._footer()
        self.c.showPage()
        self.c.save()
        self.buf.seek(0)
        overlay_reader = PdfReader(self.buf)
        writer = PdfWriter()
        for p in overlay_reader.pages:
            writer.add_page(p)
        with open(path, 'wb') as f:
            writer.write(f)


doc = Doc()

doc.info_box('TRABAJO EN EQUIPO', (
    'Varias personas pueden trabajar el mismo distrito a la vez sin problema, si cada quien está en '
    'una función distinta (una en Extraordinarias, otra en Equipamiento). El riesgo es que dos '
    'personas editen la MISMA función al mismo tiempo — ahí sí se puede perder información o pisar '
    'cambios. Repártanse por función, no por sección.'
), style='amber')

# ===================== 01 — Excel para alimentar el padrón =====================
doc.section_header('01', 'Excel para alimentar el padrón')
doc.paragraph('Un renglón por manzana, con estos encabezados (en cualquier orden):', gap_after=6)
doc.two_col_bullets(
    ['SECCION', 'MUNICIPIO', 'LOCALIDAD (código)', 'MANZANA'],
    ['PADRON', 'LISTA', 'DISTRITO FEDERAL / LOCAL', 'NOMBRE DE LOCALIDAD (opcional)'],
)
doc.paragraph([
    ('Si el archivo trae la columna ', False), ('PIVOTE,', True),
    (' el sistema lo reconoce como el formato oficial completo. ¿No tienes el archivo? Botón ', False),
    ('“Descargar Plantilla para Padrón”', True),
    (' en la pantalla principal — ya trae la fórmula de PIVOTE lista para arrastrar.', False),
])
doc.paragraph([
    ('Al copiar ', False), ('PADRÓN', True), (' y ', False), ('LISTA NOMINAL', True),
    (' desde otro archivo y pegar con Ctrl+V normal, Excel puede arrastrar fórmulas, formato o '
     'vínculos del archivo de origen — y sobrescribir la fórmula de PIVOTE sin que se note.', False),
])
doc.info_box('IMPORTANTE', [
    ('Pega las columnas PADRÓN y LISTA NOMINAL con ', False), ('Pegado especial → Solo valores', True),
    (' (clic derecho → Pegado especial → Valores, o Ctrl+Alt+V y luego V). Así no arrastras fórmulas '
     'ni formato del archivo de origen, y la fórmula de PIVOTE de la plantilla queda intacta.', False),
])
doc.paragraph(
    'Si la columna PIVOTE queda en blanco o marcada con error después de pegar, es señal de que se '
    'pegó con fórmula — bórrala y vuelve a arrastrarla desde la última fila que sí la tenga correcta.',
)

# ===================== 02 — Cómo armar casillas extraordinarias =====================
doc.section_header('02', 'Cómo armar casillas extraordinarias')
doc.paragraph(
    'La Mesa de Armado ahora es un asistente de 4 pasos — cada paso solo aparece cuando el anterior '
    'ya está resuelto.',
)
doc.wizard_step('1', 'Elige qué quieres hacer', [
    ('Dos opciones grandes: ', False), ('“Crear una casilla nueva”', True),
    (' (le pones un número E1, E2… y su manzana sede) o ', False),
    ('“Agregar manzanas a una casilla ya creada”', True),
    (' (suma manzanas a su Padrón y Lista). La segunda se deshabilita si todavía no existe ninguna '
     'casilla.', False),
])
doc.wizard_step('2', 'Según lo elegido', [
    ('Si es casilla nueva: eliges el número (E1…E60). Si es agregar a una existente: eliges a cuál '
     '— y la ', False), ('Sección se fija sola', True),
    (' según esa casilla, ya no se escribe a mano (evita el error de mezclar secciones distintas).', False),
])
doc.wizard_step('3', 'Elige la localidad', 'Selecciona la localidad donde están las manzanas que vas a usar.')
doc.wizard_step('4', 'Selecciona la(s) manzana(s) y confirma', [
    ('Clic en el tablero: una sola manzana si es sede, una o varias si son ', False),
    ('Mz Integrantes.', True),
    (' Antes de aplicar nada, aparece un resumen en español ("Vas a hacer esto…") con el botón ', False),
    ('Confirmar.', True),
])
doc.info_box('SEGUROS', (
    'El sistema no deja crear dos casillas con el mismo número (E1, E2…) en la misma sección, ni '
    'mezclar manzanas de otra sección en una casilla existente. Y si seleccionas una manzana que ya '
    'está en uso en otra casilla (como sede o como Mz Integrante), no la mueve en silencio: te avisa '
    'primero de dónde se quitaría y qué pasaría con esa otra casilla, y solo continúa si confirmas.'
), style='amber')
doc.info_box('CORREGIR', (
    '¿Asignaste mal una manzana? Dentro de “Mz Integrantes”, el botón pequeño junto a esa manzana la '
    'quita sin tocar el resto de la casilla. Si necesitas borrar la casilla completa, la ‘X’ en la '
    'esquina superior de su tarjeta la elimina entera. Todo borrado te pregunta “¿Estás seguro?” antes '
    'de hacerlo. En “Polígonos Guardados”, cada casilla aparece colapsada como lista — da clic en su '
    'fila para ver o editar el detalle. Ahí solo aparecen extraordinarias: las especiales se ven en '
    'Proyección (sección 05).'
), style='neutral')
doc.info_box('EMPEZAR DE CERO', [
    ('Si moviste algo por error y prefieres armar todo de nuevo, usa ', False), ('“Reiniciar”', True),
    (' en la barra superior (junto a “Salir”). Viene con candado: el primer clic lo desbloquea y el '
     'segundo pregunta antes de borrar. Borra extraordinarias, especiales y sede de las básicas para '
     'todo el equipo; el padrón, domicilios, equipamiento, folios y versiones guardadas no se tocan.', False),
], style='amber')

# ===================== 03 — Sede de la Manzana Básica =====================
doc.section_header('03', 'Sede de la Manzana Básica')
doc.paragraph([
    ('Dentro de Extraordinarias hay un submenú, ', False), ('“Sede de la Básica”', True),
    (' — ahí eliges cuál manzana es la sede de la casilla básica en las secciones que ya tienen una '
     'extraordinaria armada. Antes el sistema elegía sola la primera manzana que sobraba; ahora lo '
     'decides tú.', False),
])
doc.info_box('IMPORTANTE', (
    'Aparecen todas las secciones con extraordinaria armada, incluso si solo les queda una manzana '
    'sobrante — elige la manzana en el menú y da clic en “Confirmar”. Mientras no confirmes, se usa '
    'la primera de la lista por default, pero no cuenta como decidido hasta que le des clic.'
))
doc.paragraph(
    'El interruptor “Ocultar confirmadas” te deja ver solo las secciones que faltan, para no '
    'perderte entre muchas.',
)

# ===================== 04 — Candados que vas a encontrar =====================
doc.section_header('04', 'Candados que vas a encontrar')
doc.paragraph('Por seguridad, ninguno se queda guardado — todos inician cerrados cada vez que abres la app.')
doc.candados_grid([
    ('Editar Configuración', 'Equipamiento → Configuración. Protege partidos, elecciones locales y mobiliario por casilla.'),
    ('Precios de Renta', 'Equipamiento → Mobiliario. Oculta los costos de renta hasta que le des clic.'),
    ('Limpieza Total', 'Proyección → Domicilios. Borra TODOS los domicilios del distrito — de un solo uso.'),
    ('Reiniciar', 'Barra superior, junto a “Salir”. Borra el armado para empezar de cero; se vuelve a bloquear solo a los 15 segundos.'),
])
doc.paragraph([
    ('Aviso “Armado vs Padrón”', True),
    (' (no es candado): en gris cuando todo coincide; en ámbar si alguna manzana de tu armado ya no está '
     'en el padrón que acabas de cargar. Da clic para ver cuáles y descargar el Excel de conflictos.', False),
])

# ===================== 05 — Referencia rápida del resto del sistema =====================
doc.section_header('05', 'Referencia rápida del resto del sistema')
doc.paragraph([
    ('•  ', False), ('Proyección → Resumen Distrital', True),
    (' — Vista general del distrito con gráficas: casillas por tipo (padrón y lista), por municipio y '
     'comparativo vs 2023-2024. El botón “Descargar PDF” genera el resumen listo para presentar.', False),
], gap_after=6)
doc.paragraph([
    ('•  ', False), ('Versiones de la proyección', True),
    (' (dentro de Resumen Distrital) — “Guardar versión” al terminar el armado de cada corte; '
     '“Agregar corte anterior” para registrar meses pasados con el Excel de padrón de ese corte. Tres '
     'vistas: Comparar dos versiones, Historial completo y Ficha de una versión; y el “Excel de '
     'análisis” con todo.', False),
], gap_after=8)
doc.info_box('IMPORTANTE', (
    'Cada versión congela las cifras del padrón que estaba cargado al guardarla. Si guardas varias '
    'versiones con el mismo padrón, saldrán iguales: para un mes anterior usa “Agregar corte anterior”.'
))
doc.paragraph([
    ('•  ', False), ('Proyección → Asignación de Folios de Boletas', True),
    (' — Ahí se descarga el Excel con el rango de folios de cada casilla.', False),
], gap_after=8)
doc.paragraph([
    ('•  ', False), ('Proyección → Listado de Casillas', True),
    (' — Tu proyección completa por sección, con las observaciones (Variación, Menos de 100, Cerca '
     'del Corte de 750). La de 750 indica el margen: “Faltan N (+1 casilla)” o “Sobran N (-1 casilla)”; '
     '750 sigue siendo 1 casilla y la segunda se abre en 751.', False),
], gap_after=8)
doc.info_box('IMPORTANTE', [
    ('Dentro de Listado de Casillas, el botón ', False), ('“Proyección Oficial INE”', True),
    (' es el que se tiene que mandar a la Junta Local — no los otros exportes.', False),
])
doc.paragraph([
    ('•  ', False), ('Casillas especiales', True),
    (' — Botón “Casillas Especiales” dentro de Listado de Casillas: ahí se ven, se agregan y se borran. '
     'No deja repetir la misma (S1, S2…) en una sección y te sugiere la siguiente libre.', False),
], gap_after=8)
doc.paragraph([
    ('•  ', False), ('Proyección → Tipos de Domicilios de Casillas (Ubicación)', True),
    (' — Dos botones de carga, cada uno con un uso distinto:', False),
], gap_after=6)
doc.paragraph([
    ('•  ', False), ('“Importar Listado SUC”', True),
    (' — Solo para el Listado de Ubicación de Casillas oficial del INE (2023-2024, o el real de este '
     'proceso). Una sola carga asigna todos los domicilios que coincidan y recalcula Diferencia de '
     'Proyección y el Comparativo vs 2023-2024.', False),
], gap_after=6)
doc.paragraph([
    ('•  ', False), ('“Importar Listado”', True),
    (' — Para tu propia plantilla del día a día. Actualiza domicilios (nuevos o ya asignados) sin '
     'tocar los otros dos reportes.', False),
], gap_after=8)
doc.info_box('IMPORTANTE', [
    ('Cada carga avisa cuántos domicilios cambiaron; el detalle queda en la pestaña ', False),
    ('“Última Actualización”', True),
    (' (también se incluye al exportar “Listado Tipos de Domicilio”). El Comparativo 2023-2024 se '
     'actualiza solo si cambia tu proyección — no hace falta recargar el archivo del SUC.', False),
])
doc.paragraph([
    ('•  ', False), ('Equipamiento', True),
    (' — Mobiliario, sillas y material electoral por casilla y a nivel distrital. Ahí está la '
     'Asignación Cancel/Mampara (todas parten con mampara; marca ahí las excepciones), y el botón '
     '“Exportar Reporte Material” dentro de “Volumen Total Requerido” para bajar el Excel completo '
     '(incluye el costo de renta si usaste el candado de Precios de Renta).', False),
], gap_after=14)
doc.info_box('¿Dudas o comentarios?', (
    'Mario González · mario.gonzaleza@ine.mx · 938 132 2312 (de preferencia por WhatsApp). Se da '
    'atención a cualquier hora, de ser necesario.'
), gap_after=0)

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'data', 'Guia_Rapida_Proyector_Cloud.pdf')
doc.save(out_path)
print('OK - paginas:', doc.page, '->', os.path.normpath(out_path))
