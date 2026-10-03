# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Viajero colombiano (usuario principal del producto):** arma un paquete vuelo + hotel + auto desde Bogotá hacia un destino nacional (Cartagena, Santa Marta, Medellín, Cali) para unas fechas concretas, compara opciones reales y reserva todo de una vez.
- **Jurado académico (audiencia de la demostración en vivo):** evalúa el parcial de *Patrones Arquitectónicos Avanzados*. Necesita ver, sin salir de la app, la SAGA con sus compensaciones, la ingesta distribuida Dask + Prefect y que el frontend consume exclusivamente GraphQL.

La interfaz debe sentirse como un producto real para el viajero y, al mismo tiempo, dejar visibles las piezas técnicas que el jurado califica.

## Product Purpose
WanderSync Travel Solutions comercializa paquetes turísticos dinámicos que combinan vuelos, hoteles y alquiler de autos con precios extraídos en tiempo real de fuentes públicas. El objetivo de negocio es eliminar las "reservas huérfanas": una reserva se confirma completa o se revierte completa. Éxito = el viajero reserva un paquete coherente en pocos pasos y, si algo falla, ve con claridad que nada quedó cobrado ni reservado a medias.

## Positioning
Precios reales del día (Google Flights, Google Hotels, Kayak) unificados en un solo paquete, y una reserva "todo o nada" que se compensa sola y lo muestra paso a paso.

## Operating Context
- Se usa en vivo durante una sustentación, proyectado o en pantalla compartida, con navegador de escritorio (1280–1440 px). El presentador alterna entre la app, la UI de Prefect (:4200), el Dask Dashboard (:8787) y Apollo Sandbox (:4000).
- Flujo típico de demo: elegir destino → elegir vuelo, hotel y auto → reservar con o sin fallo simulado → ver la línea de tiempo de la SAGA → disparar una ingesta con caos y ver las corridas.

## Capabilities and Constraints
- Secciones: **Armar paquete**, **Mis reservas**, **Ingesta de datos**; registro/inicio de sesión en diálogo.
- Toda comunicación con el backend es GraphQL vía `/graphql` (Apollo Client, mismo origen). No se pueden agregar llamadas REST.
- Funciones de demo obligatorias que deben seguir visibles: selector de fallo SAGA ("Modo demo"), Inspector GraphQL flotante, línea de tiempo SAGA con reintentos/compensaciones y enlace a Prefect, panel de ingesta con tasa de caos, tabla de corridas por worker y enlaces a Prefect/Dask/Apollo.
- La CSP de Nginx solo permite imágenes de `*.googleusercontent.com`, `*.gstatic.com` y `content.r9cdn.net`, estilos propios e inline y scripts propios. No hay CDN de fuentes permitido: cualquier fuente debe empaquetarse localmente.
- Datos: 4 destinos × ~12 vuelos, ~12 hoteles (con foto, rating, estrellas, descuento) y ~12 autos (con imagen, categoría, proveedor) por ventana; precios en COP.
- Stack: React 18 + Vite + TypeScript + Apollo Client 3, CSS plano.

## Brand Commitments
- Nombre: **WanderSync Travel Solutions** (del enunciado). Sin logo, paleta ni tipografía obligatorias.
- Idioma: español de Colombia; montos en pesos colombianos.

## Evidence on Hand
- Fotos reales de hoteles (Google) e imágenes de autos (Kayak) llegan con cada oferta.
- No hay testimonios, clientes, cifras comerciales ni premios: no deben inventarse.

## Product Principles
1. Todo o nada: la confianza del viajero viene de ver que una reserva fallida no deja rastros.
2. El precio real del día es el protagonista; la procedencia de cada dato (fuente, hora de captura) se muestra con honestidad.
3. Lo técnico se muestra como prueba, no como ruido: visible y legible para el jurado sin estorbar la compra.
4. Legible a distancia: la demo se proyecta.

## Accessibility & Inclusion
Contraste alto y tamaños legibles en proyección; navegación por teclado en los controles de reserva y diálogos.
