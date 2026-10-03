# Guion de la Demostración en Vivo (≈ 15 minutos)

El enunciado exige evidenciar en vivo:

| | Qué hay que mostrar | Sección del guion |
|---|---|---|
| **(a)** | Panel de Prefect monitoreando los flujos | [Paso 3](#paso-3--prefect-monitoreando-los-flujos-a) y [Paso 6](#paso-6--la-saga-dentro-de-prefect) |
| **(b)** | Ejecución de tareas distribuidas en Dask | [Paso 2](#paso-2--ingesta-distribuida-en-dask-b) |
| **(c)** | Consumo de la API GraphQL desde el frontend | [Paso 4](#paso-4--el-frontend-consume-solo-graphql-c) |
| **(d)** | Simulación de un fallo transaccional con compensaciones SAGA | [Paso 5](#paso-5--simulación-de-fallo-y-compensaciones-saga-d) |

---

## Antes de la sustentación (checklist, 30 min antes)

- [ ] Docker Desktop abierto con ≥ 8 GB de RAM.
- [ ] `.env` con `DATABASE_URL` de Supabase (Session pooler) y `PGSSL=true`.
- [ ] Levantar todo y esperar la primera ingesta:

  ```bash
  docker compose up --build -d
  ```

  ```bash
  docker compose ps
  ```

  Todos deben estar `Up`/`healthy` (el `migrator` en `Exited (0)` es correcto: es de una sola ejecución).
- [ ] Abrir `http://127.0.0.1:4200` → **Runs**: la corrida `ingesta-BOG-30d-caos0.0` debe estar **Completed**.
- [ ] Abrir `http://127.0.0.1:8080`: deben verse 4 destinos con precios.
- [ ] Crear el usuario de la demo desde el frontend (*Iniciar sesión → Regístrate*).
- [ ] Pestañas del navegador preparadas, en este orden:
  1. Frontend `http://127.0.0.1:8080`
  2. Prefect `http://127.0.0.1:4200/runs`
  3. Dask `http://127.0.0.1:8787/status`
  4. Apollo Sandbox `http://127.0.0.1:4000/graphql`
  5. Supabase → Table Editor (opcional)
- [ ] Una terminal en la raíz del repo.

---

## Paso 1 · Arquitectura y despliegue (2 min)

**Mostrar:** `docker-compose.yml` y la terminal con `docker compose ps`.

**Decir:**
> "Todo el ecosistema se despliega con un único `docker compose up`. Son 14 contenedores en dos redes: la red `edge`,
> donde solo están el frontend y el API Gateway, y la red `backend` con los microservicios de Vuelos, Hoteles, Autos,
> Órdenes/Facturación, el orquestador de la SAGA, Prefect y el clúster Dask de un scheduler y tres workers. Los
> microservicios no publican puertos: el navegador solo puede hablar con GraphQL. El orden de arranque lo garantizan
> los healthchecks: primero el migrador crea los esquemas en Supabase, luego los servicios, el gateway y el frontend."

Opcional: mostrar el diagrama de contenedores en [ARQUITECTURA.md](ARQUITECTURA.md#21-diagrama-de-contenedores).

---

## Paso 2 · Ingesta distribuida en Dask (b) (3 min)

> **Importante:** el Dask Dashboard solo muestra tareas *mientras* corren; al terminar la corrida, el scheduler
> las libera y `/status` queda vacío. Sin pausa, toda la ingesta dura ~18 s en Dask. Por eso `.env` trae
> `INGESTION_DEMO_PAUSE_SECONDS=8` (pausa antes de cada extracción, registrada en los logs como "pausa de demo"),
> que deja ~35–40 s de actividad visible. Súbela a 15 si quieres más margen; ponla en 0 fuera de la demo.

1. Abrir **primero** el **Dask Dashboard** (`http://127.0.0.1:8787/status`) en otra pestaña.
2. En el frontend → pestaña **Ingesta de datos**, mover **"Tasa de fallos de red simulados" a 30 %**.
3. Clic en **Ejecutar ingesta ahora** y cambiar de inmediato a la pestaña de Dask.
4. Para ver el historial después de que termine: `http://127.0.0.1:8787/tasks` (Task Stream ampliado) y
   `http://127.0.0.1:8787/workers` (CPU y memoria de cada worker).

**Qué se ve:** en *Task Stream* aparecen barras en las filas de los 3 workers al mismo tiempo; en *Progress*, las
barras `extraer` (12) y `transformar_y_cargar`.

**Decir:**
> "Esta corrida lanza 12 tareas de scraping: 3 fuentes reales —Google Flights, Google Hotels y Kayak— por 4 destinos.
> Prefect las somete al clúster con `DaskTaskRunner`, y cada worker las ejecuta en paralelo: Google con `requests` y
> Kayak con Selenium y Chromium headless, porque arma sus resultados con JavaScript. Apenas termina una extracción, se
> somete su limpieza con pandas y el upsert directo a Supabase desde el mismo worker."

Opcional: pestaña **Workers** del dashboard para ver CPU y memoria de `dask-worker-1..3`.

---

## Paso 3 · Prefect monitoreando los flujos (a) (3 min)

1. Pestaña **Prefect → Runs** → abrir la corrida `ingesta-BOG-30d-caos0.3`.
2. Mostrar el **grafo de tareas**: `validar_cluster`, `registrar_inicio`, las 12 `extraer-*`, las 12 `cargar-*`,
   `registrar_fin`.
3. Buscar una tarea `extraer-*` con **reintentos** (estado *AwaitingRetry* / *Retrying*) y abrir sus logs:
   `SimulatedNetworkError: [caos] Fallo de red simulado…` seguido de un intento exitoso.
4. Pestaña **Artifacts** de la corrida: tabla con cada fuente/destino, **qué worker hizo el scraping y cuál la carga**.
5. Volver al frontend → Ingesta: la fila de la corrida muestra `Completada` o `Parcial`; al hacer clic se ven las
   tareas con su worker.

**Decir:**
> "Prefect es el orquestador y la capa de observabilidad; Dask es el motor de cómputo. Las tareas de extracción tienen
> una política explícita de 3 reintentos con backoff creciente —3, 8 y 15 segundos— y jitter para que los workers no
> reintenten en sincronía. Aquí se ve un fallo de red inyectado a propósito y el reintento que lo resuelve. Si una
> fuente agota los reintentos, la corrida termina `PARTIAL` y el resto del catálogo sigue funcionando."

Mostrar también **Deployments → ingesta-programada**: se ejecuta cada 6 h y se puede lanzar desde la UI (*Run*).

---

## Paso 4 · El frontend consume solo GraphQL (c) (2 min)

1. Frontend → **Armar paquete** → elegir un destino.
2. Abrir el **Inspector GraphQL** (botón negro abajo a la derecha).
3. Seleccionar la operación `PackageSearch`: se ve la consulta exacta, que pide solo los campos que se pintan.
4. (Opcional) En **Apollo Sandbox** ejecutar:

   ```graphql
   query {
     packageSearch(searchKey: "BOG-CTG-...") {   # copiar un searchKey de la query Destinations
       flights(limit: 3) { airline priceCop }
     }
   }
   ```

   y luego mostrar en los logs que **no se llamó al servicio de hoteles ni al de autos**:

   ```bash
   docker compose logs --since 1m hotels cars flights
   ```

**Decir:**
> "Toda interacción del frontend pasa por un único endpoint GraphQL; Nginx no expone nada más. Cada lista del paquete
> —vuelos, hoteles, autos— tiene su propio resolver, así que si el cliente no pide autos, el gateway ni llama al
> servicio de autos. Además, la lista de campos pedidos viaja hasta la base de datos: los microservicios consultan el
> catálogo con `pg_graphql`, el GraphQL nativo de Supabase, y solo leen esas columnas. No hay over-fetching de punta a
> punta."

---

## Paso 5 · Simulación de fallo y compensaciones SAGA (d) (4 min)

### 5.1 Happy path (rápido)
1. Seleccionar vuelo, hotel y auto; **Modo demo: "Sin fallo (happy path)"** → **Reservar paquete**.
2. Se abre **Mis reservas**: la línea de tiempo muestra Vuelo ✓ → Hotel ✓ → Auto ✓ → Pago ✓ → Factura ✓ y la orden
   termina **CONFIRMADA** con número de factura `WS-2026-…`.

### 5.2 Fallo del servicio de autos (el caso del enunciado)
1. Volver a **Armar paquete** → **Modo demo: "Falla el servicio de Autos"** → **Reservar paquete**.
2. Narrar mientras avanza la línea de tiempo:
   - Vuelo **ok** (*inventario restante: 8*) · Hotel **ok**.
   - Auto **en curso → reintento 1 → reintento 2 → falló**.
   - **↩ Compensar Hotel → compensado** (liberado: 1).
   - **↩ Compensar Vuelo → compensado**.
   - Orden **COMPENSADA** · "sin cobro".
3. Clic en **Ver flow en Prefect ↗**: el grafo muestra `T3 · reservar_auto` en rojo y luego
   `C2 · cancelar_hotel` y `C1 · cancelar_vuelo` en verde; el flow termina en estado **Compensada**.

**Decir:**
> "El servicio de autos responde 503. Como es un fallo transitorio, Prefect lo reintenta dos veces; al agotarse, el
> orquestador ejecuta las compensaciones en orden inverso: primero libera el hotel, después el vuelo. El inventario
> vuelve exactamente a su valor original y no hay cobro: no quedan reservas huérfanas. Todos los pasos son
> idempotentes por el id de la saga, así que un reintento nunca reserva ni cobra dos veces."

### 5.3 Pago rechazado (contraste)
1. **Modo demo: "Pago rechazado"** → Reservar.
2. Vuelo, hotel y auto quedan **ok**; el pago **falla sin reintentos** (es un rechazo de negocio 402, no un fallo
   de red) y se compensan **auto → hotel → vuelo**.

> "Aquí la diferencia es que un pago rechazado no se reintenta: reintentar no lo arregla. El orquestador distingue
> fallos transitorios de rechazos de negocio."

### 5.4 Prueba automatizada (si hay tiempo)

```bash
node scripts/e2e/saga-scenarios.mjs
```

Ejecuta los 5 escenarios y verifica que el inventario quede consistente en cada uno.

---

## Paso 6 · La SAGA dentro de Prefect

En **Prefect → Runs** filtrar por flow `saga-reserva-paquete`: cada reserva es un flow run llamado
`saga-<id de la orden>`, en verde "Completed" (confirmada) o "Compensada".

---

## Paso 7 · Ciberseguridad (1–2 min)

```bash
node scripts/security/security-tests.mjs
```

Recorrer la salida:
- **Session Fixation**: el id de sesión cambia al iniciar sesión y el viejo devuelve `me: null`.
- **Argon2id** `m=65536,t=3,p=1`.
- **Rate limiting**: el 6.º login fallido devuelve `TOO_MANY_REQUESTS`; ni la contraseña correcta entra durante el
  bloqueo. Checkout limitado a 5/min.
- **Supply chain**: abrir [`docs/SEGURIDAD.md §3`](SEGURIDAD.md#3-seguridad-en-la-cadena-de-suministro-supply-chain-security):
  568 dependencias auditadas con `npm audit` y `pip-audit`, 0 vulnerabilidades.

> El script registra un usuario nuevo y el registro está limitado a 5 por IP cada 15 minutos. Si se ejecutó varias
> veces antes de la demo: `docker compose restart gateway` reinicia los contadores (están en memoria).

---

## Plan B · Si algo falla

| Problema en vivo | Qué hacer |
|---|---|
| **Supabase no responde** | Revisar el estado del proyecto en el panel de Supabase (los proyectos gratuitos se pausan por inactividad: reactivarlo el día anterior) y `docker compose logs migrator`. Tener internet estable: Supabase y el scraping lo requieren. |
| **Una fuente devuelve 0 resultados (bloqueo o cambio de HTML)** | Es el caso previsto: Prefect reintenta y la corrida queda `PARTIAL`. Explicarlo como demostración de resiliencia. El catálogo de la corrida anterior sigue disponible. |
| **La UI de Prefect no carga** | Usar `127.0.0.1` y no `localhost`. |
| **El catálogo aparece vacío** | La primera ingesta aún corre: `docker compose logs -f ingestion`. |
| **`TOO_MANY_REQUESTS` en el login** | Es el rate limiting; esperar o `docker compose restart gateway`. |
| **Un contenedor en `unhealthy`** | `docker compose logs <servicio>` y `docker compose up -d <servicio>`. |

---

## Preguntas probables del jurado

**¿Por qué orquestación y no coreografía?**
Porque el flujo tiene un orden estricto y compensaciones inversas; con un orquestador la lógica está en un solo lugar,
es fácil de demostrar y Prefect nos da reintentos, historial y visualización gratis. En coreografía la compensación
queda repartida entre servicios y seguirla exige correlacionar eventos.

**¿Qué pasa si falla una compensación?**
Se reintenta hasta 5 veces (son idempotentes). Si aun así falla, la orden queda `FAILED`, el flow en rojo en Prefect
y el *saga log* dice exactamente qué paso quedó pendiente, para intervención manual.

**¿Cómo evitan cobrar dos veces si Prefect reintenta el pago?**
`billing.payments.order_id` es `UNIQUE`; un segundo intento devuelve el pago existente (*replay*). Lo mismo con las
reservas (`saga_id UNIQUE`).

**¿Dónde está el GraphQL "nativo" de la base de datos?**
En los microservicios: leen el catálogo con `select graphql.resolve(query, variables)`, la función de la extensión
`pg_graphql` de Supabase.

**¿Por qué Dask si el volumen es pequeño?**
Porque el cuello de botella es la espera de red y el navegador de Kayak, no la CPU: paralelizar 12 extracciones en 3
workers reduce el tiempo total de forma lineal, y la arquitectura escala a más destinos o fuentes agregando workers.

**¿Qué pasa si se cae un worker de Dask a mitad de la ingesta?**
El scheduler detecta la desconexión y reasigna las tareas pendientes a los workers vivos. Se puede demostrar con
`docker compose stop dask-worker-2` durante una corrida.

**¿Por qué sesiones con cookie y no JWT?**
El requisito pide regenerar el identificador de sesión, que es propio de sesiones con estado; además permiten revocar
en el logout y la cookie `HttpOnly` no es accesible a JavaScript.
