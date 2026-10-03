---
name: WanderSync Travel Solutions
description: Bonos de viaje de agencia, emitidos completos o anulados completos.
colors:
  jacket: "#0e2a47"
  jacket-2: "#163a60"
  jacket-line: "#2b5480"
  on-jacket: "#e8f0f7"
  on-jacket-soft: "#a9c0d6"
  desk: "#e7ecf0"
  sheet: "#fbfcfc"
  rule: "#cfd8df"
  ink: "#12202e"
  ink-soft: "#4b5b6b"
  voucher: "#e1edf6"
  voucher-line: "#8fb2d0"
  tint-flight: "#d6e6f5"
  tint-flight-ink: "#1d4f86"
  tint-hotel: "#f6ddd7"
  tint-hotel-ink: "#93382a"
  tint-car: "#d7eee0"
  tint-car-ink: "#1d6a43"
  tint-pay: "#ece6f5"
  tint-pay-ink: "#5a3f8f"
  stamp-ok: "#1e7a46"
  stamp-void: "#c8102e"
  stamp-pending: "#1f4fa8"
  serial: "#c8102e"
  gold: "#e3a72f"
  row-hover: "#f1f5f8"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 2.4vw, 2.15rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 122"
  code:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "2.3rem"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
    fontFeature: "'tnum'"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 800
    lineHeight: 1.1
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 850
    lineHeight: 1
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 125"
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  amount:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 800
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 700
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 118"
  typed:
    fontFamily: "'Courier Prime', 'Courier New', monospace"
    fontSize: "0.95rem"
    fontWeight: 400
    letterSpacing: "0.01em"
rounded:
  tick: "3px"
  paper: "4px"
  slip: "6px"
  control: "8px"
  tab: "10px"
  sheet: "12px"
  form: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  row: "14px"
  md: "16px"
  lg: "22px"
  xl: "28px"
  gutter: "32px"
components:
  button-issue:
    backgroundColor: "{colors.jacket}"
    textColor: "{colors.on-jacket}"
    rounded: "{rounded.tab}"
    padding: "15px 20px"
  button-issue-hover:
    backgroundColor: "#12365c"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.jacket}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-paper:
    backgroundColor: "{colors.voucher}"
    textColor: "{colors.jacket}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  folder-tab:
    backgroundColor: "rgba(255, 255, 255, 0.07)"
    textColor: "{colors.on-jacket-soft}"
    rounded: "10px 10px 0 0"
    padding: "11px 22px 10px"
  folder-tab-active:
    backgroundColor: "{colors.jacket-2}"
    textColor: "#ffffff"
  ticket:
    backgroundColor: "{colors.jacket}"
    textColor: "{colors.on-jacket}"
    rounded: "{rounded.control}"
    padding: "14px 14px 14px 18px"
  ticket-selected:
    backgroundColor: "{colors.voucher}"
    textColor: "{colors.ink}"
  date-pill:
    backgroundColor: "transparent"
    textColor: "{colors.on-jacket}"
    typography: "{typography.typed}"
    rounded: "{rounded.pill}"
    padding: "5px 14px"
  date-pill-selected:
    backgroundColor: "{colors.on-jacket}"
    textColor: "{colors.jacket}"
  tariff-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "10px 20px 10px 14px"
  voucher:
    backgroundColor: "{colors.voucher}"
    textColor: "{colors.ink}"
    rounded: "{rounded.paper}"
    padding: "18px 22px"
    width: "440px"
  stub-flight:
    backgroundColor: "{colors.tint-flight}"
    padding: "11px 22px"
  stub-hotel:
    backgroundColor: "{colors.tint-hotel}"
    padding: "11px 22px"
  stub-car:
    backgroundColor: "{colors.tint-car}"
    padding: "11px 22px"
  stub-pay:
    backgroundColor: "{colors.tint-pay}"
    padding: "11px 22px"
  typed-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.typed}"
    rounded: "0"
    padding: "6px 2px"
  ledger:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
---

# Design System: WanderSync Travel Solutions

## Overview

**Creative North Star: "El bono de agencia"**

WanderSync se ve como el mostrador de una agencia de viajes de papel: una carpeta azul marino que guarda documentos impresos. El paquete no es una grilla de tarjetas con un resumen lateral; es un bono en papel de seguridad celeste, con guilloché, microimpresión y número de serie en rojo, del que cuelgan talones perforados teñidos por tipo de servicio. Las tarifas se leen en un tarifario impreso de filas regladas, y el resultado de cada reserva se marca con sellos de goma. Todo lo que el sistema produce es un documento: el bono, la bitácora mecanografiada de la SAGA, la orden de actualización de la ingesta y el libro mayor de corridas.

La densidad es de oficina: filas regladas, columnas mecanografiadas y cifras grandes de ancho expandido, pensadas para leerse proyectadas a 1280–1440 px. Dos voces tipográficas reparten el trabajo: Archivo variable, expandida, pone los códigos IATA, montos y títulos; Courier Prime pone lo que una máquina de escribir llenaría (fechas, horas, fuentes, series, bitácora). El color estructural es marino; el color semántico vive en los tintes de los talones y en las tintas de sello.

**Key Characteristics:**
- Carpeta marina (cabecera, pestañas, banda de destinos) sobre un escritorio gris azulado; los documentos son las únicas superficies claras.
- Un tinte por servicio, siempre el mismo: celeste vuelo, rosa hotel, menta auto, lavanda pago.
- Estado expresado como sello de goma (borde doble, rotado, tinta con grano), nunca como chip de color plano.
- Archivo con `wdth` 108–125 % para todo lo que es código, cifra o título; Courier Prime para lo llenado a máquina.
- Perforaciones (bordes discontinuos y mordidas circulares) separan las piezas de un mismo documento.

## Colors

Paleta de agencia: un marino estructural, papeles fríos, cuatro tintes de servicio con su tinta oscura emparejada y tres tintas de sello semánticas.

### Primary
- **Marino de carpeta** (jacket): cabecera fija, pestañas de carpeta, tiquetes no seleccionados, botón de emisión, texto de títulos y cifras sobre papel. Es la "tinta" de la agencia.
- **Marino de solapa** (jacket-2): banda de destinos y pestaña activa de "Armar paquete"; el segundo plano de la carpeta.
- **Filete marino** (jacket-line): bordes de controles sobre fondo marino (botones de icono, píldoras de fecha, contorno de tiquete).
- **Papel sobre marino** (on-jacket) y **Papel sobre marino tenue** (on-jacket-soft): texto principal y secundario sobre la carpeta.

### Secondary
- **Papel de seguridad** (voucher) con **Filete de guilloché** (voucher-line): fondo del bono, de la orden de actualización, del diálogo de ficha y del tiquete seleccionado; el filete dibuja el guilloché y el hover de filas.
- **Tintes de talón**: celeste vuelo (tint-flight), rosa hotel (tint-hotel), menta auto (tint-car), lavanda pago (tint-pay). Cada uno tiene su **tinta emparejada** (tint-*-ink) para el filete superior del tarifario, la pestaña activa y el texto sobre el tinte. Celeste vuelo-tinta también es el color de los enlaces.

### Tertiary
- **Tinta verde de sello** (stamp-ok): CONFIRMADO, RESERVADO, PAGADO, ofertas, pasos exitosos de la bitácora.
- **Tinta roja de sello** (stamp-void): ANULADO, FALLÓ, SIN COBRO, compensaciones, errores, cifras de fallo y el recuadro de modo demo.
- **Tinta azul de sello** (stamp-pending): EN TRÁMITE y la línea que se está mecanografiando.
- **Rojo de serie** (serial): números de bono y códigos de reserva en Courier Prime, precio del tiquete seleccionado.
- **Oro de foco** (gold): anillo de foco, selección de texto, variables en el inspector y estrellas de hotel. Solo señala; nunca rellena una superficie.

### Neutral
- **Escritorio** (desk): fondo de página y "mordida" de las perforaciones de talón.
- **Hoja** (sheet): tarifario, bitácora, libro mayor, cajones de reservas, comprobantes.
- **Regla** (rule): filas regladas discontinuas, contornos de hoja, casillas.
- **Tinta** (ink) y **Tinta tenue** (ink-soft): texto de cuerpo y texto secundario, etiquetas y metadatos.
- **Fila resaltada** (row-hover): hover del tarifario y fila abierta del libro mayor.

### Named Rules
**La regla del tinte fijo.** Un servicio tiene un solo tinte en todo el producto: vuelo es celeste, hotel rosa, auto menta, pago lavanda, en la pestaña, la hoja del tarifario, la fila seleccionada y el talón. No se reasignan ni se usan como decoración.

**La regla de la tinta de sello.** Verde, rojo y azul de sello significan estado (hecho, anulado o fallido, en trámite) y nada más. Un elemento sin estado no se pinta con ellos, salvo el rojo de serie para numeración.

**La regla de la carpeta.** El marino es estructura, no superficie de contenido: la carpeta enmarca y los documentos claros se apoyan en el escritorio o sobre la carpeta.

## Typography

**Display Font:** Archivo Variable (eje `wdth`, con Archivo y system-ui de respaldo), empaquetada localmente con @fontsource.
**Body Font:** Archivo Variable al ancho 100 %.
**Label/Mono Font:** Courier Prime 400/700 (con Courier New), empaquetada localmente.

**Character:** Un grotesco de agencia que se ensancha cuando habla en códigos y montos, frente a una máquina de escribir que llena los campos. El ancho expandido es la voz del membrete; el mecanografiado es la voz del empleado que llena el bono.

### Hierarchy
- **Code** (850, 2.2–2.3rem, wdth 125 %, interlineado 1, cifras tabulares): códigos IATA de tiquete y ruta, total del paquete. Baja a 1.9–2rem en móvil.
- **Display** (800, clamp(1.6rem, 2.4vw, 2.15rem), wdth 122 %, −0.02em): titular de la banda de destinos; la portada de ingesta usa clamp(2rem, 3.2vw, 2.9rem).
- **Headline** (800, 1.2–1.6rem, wdth 112 %): encabezados de cajón, bitácora, diálogo y hoja vacía.
- **Title** (850, 1.4rem, wdth 125 %, MAYÚSCULAS): el título impreso de un documento ("BONO DE VIAJE", "ORDEN DE ACTUALIZACIÓN") en su cabecera.
- **Amount** (800, 1–1.28rem, cifras tabulares): precios de fila, talón y comprobante.
- **Body** (400–700, 0.86–1.05rem, 1.5–1.6): nombres de oferta, párrafos de introducción (máx. 52–64ch).
- **Label** (700–800, 0.66–0.72rem, wdth 118 %, 0.08–0.09em, MAYÚSCULAS): rótulos de campo de formulario y de cifra, cabeceras de columna del tarifario y del libro mayor.
- **Typed** (Courier Prime 400/700, 0.76–1.05rem): fechas, horas, duraciones, fuentes de datos, números de bono, bitácora SAGA, campos de formulario, inspector GraphQL.

### Named Rules
**La regla de las dos voces.** Si una máquina de escribir lo llenaría (fecha, hora, serie, fuente, línea de bitácora, valor de campo), va en Courier Prime. Si está impreso en el formulario (código, monto, título, rótulo), va en Archivo. No se mezcla dentro del mismo dato.

**La regla del ancho expandido.** Los códigos y montos grandes usan `font-stretch` 112–125 % y pesos 800–850; el cuerpo se queda en 100 %. El ancho es jerarquía, no adorno.

**La regla de las cifras tabulares.** Todo monto en COP lleva `font-variant-numeric: tabular-nums` y alineación a la derecha en columnas.

## Layout

Contenedor centrado de 1400 px con márgenes de 32 px (16 px bajo 820 px). La cabecera marina es fija; la banda de destinos se sangra a todo el ancho con `margin-inline: calc(50% - 50vw)` y vuelve a alinear su contenido con el contenedor.

- **Armar paquete:** cuatro tiquetes de destino en una fila (2 columnas bajo 1180 px), luego el constructor: tarifario fluido a la izquierda y bono de 440 px fijo (`sticky`, top 124px) a la derecha, separados 28 px. Bajo 1180 px el bono pasa debajo; bajo 820 px aparece una barra de reserva fija en la parte inferior, marina, con total y botón.
- **Mis reservas:** cajón de archivo de 330 px (sticky) + bono emitido y bitácora en dos columnas; una sola columna bajo 1180/820 px.
- **Ingesta:** introducción + orden de actualización de 400 px; debajo el libro mayor, que bajo 600 px se convierte en fichas de corrida.
- **Ritmo:** pasos de 4/8/14/16/22/28/32 px; 22 px entre bloques de página, 14 px entre columnas de fila, 6–8 px entre filas o fichas apiladas.
- **Pantallas bajas** (≥1181 px y ≤860 px de alto): se comprimen la banda y los tiquetes para que el bono y su botón quepan en la primera pantalla de proyección.

## Elevation & Depth

Híbrido: la carpeta y las hojas son planas y se separan por color y filetes interiores (`inset 0 0 0 1px`), mientras que los papeles sueltos sobre el escritorio (bono, orden de actualización, diálogo, tiquete seleccionado, fotos) se levantan con sombras marinas difusas. Las sombras siempre se tiñen con el marino (rgba 14,42,71 o 4,16,30), nunca negro neutro.

### Shadow Vocabulary
- **Papel suelto** (`box-shadow: 0 2px 4px rgba(14,42,71,.08), 0 22px 44px -12px rgba(14,42,71,.35)`): el bono.
- **Hoja apoyada** (`box-shadow: 0 1px 2px rgba(14,42,71,.08), 0 10px 24px -14px rgba(14,42,71,.25)`): el tarifario.
- **Tiquete levantado** (`box-shadow: 0 12px 26px rgba(4,18,34,.35)` con `translateY(-3px)`): tiquete seleccionado sobre la banda marina.
- **Botón de emisión** (`box-shadow: 0 6px 14px rgba(14,42,71,.28)`; hover `0 10px 20px rgba(14,42,71,.32)`).
- **Foto pegada** (`box-shadow: 0 0 0 4px #fff, 0 3px 8px 3px rgba(18,32,46,.16)` con rotación ±1°): instantáneas de hotel y auto con marco blanco.
- **Filete de hoja** (`box-shadow: inset 0 0 0 1px var(--rule)`): libro mayor, bitácora, fichas archivadas; 2px marino cuando están seleccionadas.

### Named Rules
**La regla del papel suelto.** Solo un documento que se puede "tomar" del escritorio lleva sombra de despegue; las hojas fijas y las filas se separan con filetes.

## Shapes

Esquinas pequeñas y de papel: 3 px casillas, 4 px bono y comprobantes, 6 px recuadros y fichas, 8 px controles y tiquetes, 10 px pestañas (solo esquinas superiores) y botón de emisión, 12–14 px hojas y formularios grandes, 999 px solo para píldoras de fecha y enlaces externos. Las piezas de un documento se separan con perforaciones: borde superior discontinuo de 2 px y mordidas circulares de 16 px del color del escritorio a cada lado del talón; los tiquetes llevan muescas laterales de 8 px por máscara radial y una línea discontinua entre código y datos. Las filas del tarifario y de la bitácora se reglan con 1 px discontinuo. Las cabeceras de tabla cierran con un filete sólido de 1.5–2 px en tinta o marino.

## Components

### Buttons
Táctiles y de mostrador.
- **Emitir (primario):** marino de carpeta, texto papel, 750 a wdth 112 %, 1.05rem, esquinas de 10 px, sombra de botón; hover sube 1 px y aclara a #12365c, active baja 1 px, deshabilitado al 50 %. En la barra móvil se invierte a papel de seguridad con texto marino.
- **Fantasma:** contorno marino de 1.5 px, 8 px, texto marino 700; hover con velo marino al 6 %.
- **Papel:** sobre la carpeta, fondo papel de seguridad y texto marino; hover a blanco.
- **Icono:** 38 px, 8 px, filete marino sobre carpeta o regla sobre papel.
- **Paso (stepper):** círculos de 26 px con contorno marino de 1.5 px.

### Chips
- **Píldora de fecha:** Courier Prime 0.86rem, contorno filete marino, transparente sobre la banda; seleccionada en papel sobre marino con texto marino.
- **Oferta:** texto verde de sello, contorno del mismo color de 1.5 px, 4 px, mayúsculas 0.74rem.

### Cards / Containers
- **Hoja (tarifario, bitácora, libro mayor):** fondo hoja, 12 px (el tarifario 0 0 6px 6px con filete superior de 4 px en la tinta del servicio), filete interior de regla.
- **Ficha archivada (Mis reservas):** hoja, 8 px, filete interior; hover desliza 3 px a la derecha; seleccionada en papel de seguridad con filete marino de 2 px.
- **Comprobante de worker:** hoja, 4 px, borde de regla, sello pequeño en la esquina superior derecha.

### Inputs / Fields
- **Campo mecanografiado:** sin caja; solo una línea base marina de 1.5 px, Courier Prime, fondo transparente, esquinas 0. Los `select` comparten el estilo.
- **Foco:** la línea base cambia a oro y se engrosa con `box-shadow: 0 2px 0 gold`. Foco global: contorno oro de 2 px con 2 px de separación.
- **Error:** texto rojo de sello sobre rosa pálido con borde rosa, 6 px.

### Navigation
Pestañas de carpeta: 650 a wdth 108 %, 0.95rem, fondo blanco al 7 % y texto papel tenue sobre la carpeta, esquinas superiores de 10 px, desplazadas 1 px para fundirse con lo que tienen debajo. La activa toma el color de la superficie que abre (escritorio, o marino de solapa en "Armar paquete"). En móvil bajan a 0.8rem y se desplazan horizontalmente.

### Tiquete de destino
Tiquete marino con muescas laterales, código IATA en Code separado por línea discontinua de la ciudad, fechas mecanografiadas y precio "desde". Hover sube 2 px; seleccionado pasa a papel de seguridad, se levanta 3 px y el precio cambia a rojo de serie.

### Tarifario
Tabla de filas regladas sobre hoja: cabecera en Label con filete de tinta de 1.5 px, casilla cuadrada de 22 px, nombre en Body 700 sobre la hora en Courier Prime, columnas mecanografiadas en tinta tenue y tarifa en Amount a la derecha. Fila seleccionada se rellena con el tinte del servicio.

### Bono de viaje (componente firma)
Papel de seguridad con rosetón de guilloché (SVG generado, filete de guilloché al 55 %), cabecera con título impreso en Title y número de serie en Courier Prime rojo, línea de microimpresión, ruta IATA → IATA con arco discontinuo, talones teñidos perforados que se extienden a sangre, y pie con total en Code y botón de emisión. El bono emitido añade un sello grande y tacha en rojo los talones anulados.

### Sello de goma
Borde doble de 3 px (5 px el grande), 6 px, mayúsculas 850 a wdth 125 %, rotación −6° (−9° el grande), `mix-blend-mode: multiply` y máscara de grano de tinta; entra con un golpe (escala 1.7 → 1 con desenfoque, 260 ms). EN TRÁMITE late suavemente. Tamaños 0.72 / 1 / 2.1rem.

### Bitácora SAGA
Hoja con líneas mecanografiadas regladas en Courier Prime: hora, paso, estado coloreado en tinta de sello, detalle debajo; cada línea entra escribiéndose de izquierda a derecha y la línea en curso lleva un cursor parpadeante.

## Do's and Don'ts

### Do:
- **Do** emitir cada paquete como un bono: guilloché, microimpresión, número de serie rojo en Courier Prime y talones perforados por servicio.
- **Do** respetar el tinte fijo de cada servicio (celeste vuelo, rosa hotel, menta auto, lavanda pago) en pestaña, hoja, fila seleccionada y talón.
- **Do** comunicar el estado de una reserva, talón o corrida con un sello de goma en tinta verde, roja o azul.
- **Do** poner fechas, horas, fuentes, series y bitácora en Courier Prime, y códigos, montos y títulos en Archivo expandida con cifras tabulares.
- **Do** separar las piezas de un documento con perforaciones y reglas discontinuas, y las cabeceras de tabla con un filete sólido marino o de tinta.
- **Do** teñir todas las sombras con marino y reservarlas para papeles sueltos.
- **Do** usar oro solo para foco, selección y estrellas.

### Don't:
- **Don't** volver a la grilla OTA de tarjetas de oferta con un resumen lateral genérico; el resumen es el bono.
- **Don't** usar las tintas de sello para decorar elementos sin estado.
- **Don't** mostrar estados como chips planos de color de fondo; son sellos o texto en tinta de sello.
- **Don't** encajonar los campos de formulario; son líneas base mecanografiadas.
- **Don't** poner un rótulo pequeño en mayúsculas encima de un encabezado como antetítulo; el rótulo en mayúsculas es para nombrar campos, cifras y columnas, y el título impreso solo encabeza el propio documento.
- **Don't** cargar fuentes desde un CDN; Archivo y Courier Prime van empaquetadas localmente.
