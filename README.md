# ◈ AgentGuard

**The trust layer between AI agents and your money.**

AgentGuard controla compras propuestas por agentes. Una persona describe su intención, revisa un mandato de gasto y lo activa. El agente recomienda productos; el backend reconstruye el carrito y aplica reglas deterministas para decidir **ALLOW**, **BLOCK** o **REQUIRE_APPROVAL**. PayPal Sandbox ejecuta el pago después de los controles y de la aprobación del comprador.

**AI interprets intent. Deterministic controls authorize money movement. PayPal executes payment.**

Es un MVP de hackathon funcional con PostgreSQL, IA local Ollama, políticas versionadas, aprobación humana, Attack Lab, auditoría y recibos. **No requiere una API de IA pagada ni `OPENAI_API_KEY`.** La interfaz de producto está en inglés; esta guía y los informes técnicos están en español.

Este README describe la implementación y la evidencia registrada hasta el **3 de octubre de 2026**. Los resultados históricos se identifican como tales; actualizar documentación no vuelve a ejecutar inferencias, pruebas ni pagos.

![Dashboard de AgentGuard](docs/screenshots/dashboard.png)

## Contenido

- [Estado verificado del proyecto](#estado-verificado-del-proyecto)
- [Funcionalidades y alcance](#funcionalidades-y-alcance)
- [Tecnologías y requisitos](#tecnologías-y-requisitos)
- [Instalación y ejecución local](#instalación-y-ejecución-local)
- [Variables de entorno](#variables-de-entorno)
- [IA local y modos de ejecución](#ia-local-y-modos-de-ejecución)
- [Uso de la aplicación](#uso-de-la-aplicación)
- [Arquitectura](#arquitectura)
- [Mandatos y cálculo del dinero](#mandatos-y-cálculo-del-dinero)
- [Motor de políticas y riesgo](#motor-de-políticas-y-riesgo)
- [Estados, reservas e idempotencia](#estados-reservas-e-idempotencia)
- [PayPal Sandbox](#paypal-sandbox)
- [Webhooks](#webhooks)
- [Attack Lab y catálogo](#attack-lab-y-catálogo)
- [Autenticación y seguridad](#autenticación-y-seguridad)
- [Base de datos](#base-de-datos)
- [Referencia de APIs](#referencia-de-apis)
- [Interfaz, recibos y métricas](#interfaz-recibos-y-métricas)
- [Despliegue público con Render y Neon](#despliegue-público-con-render-y-neon)
- [Comandos del proyecto](#comandos-del-proyecto)
- [Pruebas y validaciones](#pruebas-y-validaciones)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Demo de tres minutos](#demo-de-tres-minutos)
- [Resolución de problemas](#resolución-de-problemas)
- [Limitaciones y siguientes pasos](#limitaciones-y-siguientes-pasos)
- [Documentación y evidencias](#documentación-y-evidencias)
- [Contribución y licencia](#contribución-y-licencia)

## Estado verificado del proyecto

| Componente        | Estado y alcance de la evidencia                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Aplicación local  | Next.js con PostgreSQL persistente, catálogo, mandatos, políticas, aprobaciones y recibos.                      |
| IA local          | Inferencias reales Ollama para compilación y selección de productos; no necesita OpenAI.                        |
| PayPal Sandbox    | Captura real de **USD 537** después de buyer approval, autorización y comprobación final. Son fondos de prueba. |
| Bloqueo de ataque | Transacción de **USD 812** bloqueada, con cero operaciones de pago incluso tras intentar crear la orden.        |
| Tests registrados | **146 pruebas en 14 archivos** y **4 E2E** de producción; typecheck, lint, formato y build pasaron.             |
| Neon              | Conexión real, endpoint TLS, migración y seed verificados el 3 de octubre de 2026.                              |
| Render            | Repositorio y configuración preparados; publicación externa pendiente de validación.                            |
| Webhooks públicos | Firma, deduplicación y reconciliación implementadas y probadas; entrega HTTPS firmada real pendiente.           |
| OpenAI            | Adaptador opcional; no utilizado en las inferencias locales registradas.                                        |
| PayPal Live       | No admitido por el adaptador.                                                                                   |

Neon se inicializó sin tablas públicas previas. La lectura final `2026-10-03T05:20:51.241Z` confirmó **una migración aplicada, cero migraciones fallidas, un operador, un agente, dos comerciantes, seis productos, tres mandatos/versiones y siete transacciones de demostración**. No se crearon operaciones PayPal ni transacciones Sandbox. Se verificaron los índices únicos de idempotencia y `Decimal(12,2)`.

La conexión Neon se usó en procesos administrativos. El `.env` local se conservó y sigue apuntando a su base local. **Los recibos históricos locales no se transfirieron a Neon.** Tener Neon preparado no demuestra que Render, el checkout público o los webhooks externos estén funcionando. Detalle en el [informe de despliegue](docs/deployment-report.md).

## Funcionalidades y alcance

1. Compilar intención humana en un borrador estructurado de política.
2. Revisar restricciones, confirmar la versión y activar el mandato.
3. Elegir un producto del catálogo o solicitar recomendación al agente.
4. Evaluar presupuesto, cantidad, producto, comerciante y permisos.
5. Solicitar aprobación humana cuando el importe supera autonomía.
6. Crear una orden Sandbox y autorizar/capturar después de buyer approval y reevaluación final.
7. Examinar checks, riesgo, versiones, permisos y referencias en un Decision Receipt exportable.
8. Reproducir ataques de presupuesto, extras, prompt injection y cambios de precio en un laboratorio aislado.

El MVP trabaja con catálogo controlado, USD, un operador y un receptor Sandbox. No compra productos físicos a tiendas externas: no hay envío, impuestos, fulfillment ni onboarding de vendedores independientes.

## Tecnologías y requisitos

| Área           | Implementación                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js **22.x**, npm y lockfile versionado.                                                          |
| Aplicación     | Next.js **16.3.8** App Router, React **19.2**, TypeScript estricto.                                   |
| Interfaz       | Tailwind CSS 4, componentes locales estilo shadcn/ui, Radix Slot, CVA, Lucide y AG Grid Community 35. |
| Persistencia   | PostgreSQL y Prisma **6.19.3**; Compose utiliza PostgreSQL 17 Alpine.                                 |
| Validación     | Zod 3, contratos estrictos e importes en centavos.                                                    |
| Interpretación | Ollama local, parser determinista explícito y SDK OpenAI opcional.                                    |
| Pagos          | PayPal REST Sandbox: OAuth, Orders y Payments.                                                        |
| Calidad        | Vitest, Playwright/Chromium, ESLint, Prettier y GitHub Actions.                                       |

Para demo sin IA basta Node, npm y PostgreSQL con fallback explícito. Para inferencia real necesitas Ollama y un modelo descargado. Para Sandbox necesitas las credenciales REST y una cuenta Personal Sandbox de comprador. Docker es una alternativa al launcher de PostgreSQL.

El modelo usado en la evidencia local es `qwen3-coder:30b-a3b-q4_K_M`, aproximadamente 18 GB. Es una observación del modelo instalado, no un requisito mínimo universal. Rendimiento y viabilidad dependen de RAM, VRAM y carga del equipo; el nombre se configura por entorno.

## Instalación y ejecución local

### 1. Dependencias y configuración

Desde la raíz del repositorio:

```powershell
npm ci
# Crear solo si no existe; preservar la configuración anterior.
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

En macOS/Linux puedes copiar `.env.example` a `.env` si todavía no existe. Los comandos npm son los mismos.

El ejemplo tiene base y origen vacíos porque también sirve de plantilla pública. Para una instalación **local nueva**, configura estos valores públicos de desarrollo:

```dotenv
DATABASE_URL=postgresql://agentguard:agentguard_local@127.0.0.1:54329/agentguard
NEXT_PUBLIC_APP_URL=http://localhost:3000
DEMO_MODE=true
AI_PROVIDER=deterministic
PAYPAL_ENV=sandbox
```

En ese modo la consola muestra **DETERMINISTIC FALLBACK**: no hay inferencia. Para una demo nueva simulada deja vacíos ambos campos PayPal. Si tu `.env` tiene credenciales Sandbox, conserva sus valores: las propuestas nuevas utilizarán Sandbox real. El modo de pagos es independiente de la IA.

### 2. Iniciar una sola base local

**Opción A: launcher incluido**, en una terminal que debe permanecer abierta:

```powershell
npm run db:local
```

Escucha en `127.0.0.1:54329`, utiliza SCRAM y conserva datos en `.data/postgres`. Ctrl+C detiene el proceso sin eliminar los datos. En Linux utiliza un usuario normal; el launcher no crea usuarios del sistema.

**Opción B: Docker Compose**, como alternativa:

```powershell
docker compose up -d db
```

Compose publica el mismo puerto y conserva datos en `agentguard_data`. Ambas opciones ocupan **54329**, con almacenamientos diferentes: cambiar de una a otra no migra datos. Compose ejecuta PostgreSQL; la aplicación se inicia aparte con npm.

### 3. Migración, seed y aplicación

En otra terminal:

```powershell
npm run db:setup
npm run dev
```

Abre **http://localhost:3000**. Usa el origen exacto de `NEXT_PUBLIC_APP_URL`; `localhost` y `127.0.0.1` son distintos para mutaciones. El seed prepara operador, agente, catálogo, plantilla e historial simulado. Es repetible secuencialmente y conserva trabajo existente.

### 4. Build de producción local

Detén el servidor de aplicación antes de regenerar Prisma/build en Windows para liberar su DLL; conserva PostgreSQL y Ollama.

```powershell
npm run build
npm start -- --hostname 127.0.0.1
```

`build` genera Prisma y compila Next; no migra ni siembra. `npm start` sin el flag local usa el binding de producción y `PORT`, aptos para Render. El servidor `dev` conserva loopback.

## Variables de entorno

| Variable               | Función y condición                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL obligatoria para APIs; en público exige `sslmode=require`, `verify-ca` o `verify-full`.                     |
| `NEXT_PUBLIC_APP_URL`  | Origen exacto; local `http://localhost:3000`, público HTTPS real sin path/query/fragmento/credenciales.                |
| `AI_PROVIDER`          | Default `ollama`; parser `deterministic` explícito u `openai` opcional.                                                |
| `OLLAMA_BASE_URL`      | API local; default `http://127.0.0.1:11434`; admite loopback y `host.docker.internal`.                                 |
| `OLLAMA_MODEL`         | Modelo descargado requerido con Ollama; modelos cloud se rechazan.                                                     |
| `OLLAMA_TIMEOUT_MS`    | Entero entre 1000 y 180000 ms; default 90000; ejemplo 180000.                                                          |
| `OPENAI_API_KEY`       | Solo requerida con selección explícita `openai`.                                                                       |
| `OPENAI_MODEL`         | Solo requerido para el proveedor OpenAI.                                                                               |
| `PAYPAL_CLIENT_ID`     | Client ID de la app REST Sandbox; debe acompañarse del secret.                                                         |
| `PAYPAL_CLIENT_SECRET` | Secreto de la misma app, solo servidor; ambas credenciales seleccionan Sandbox real.                                   |
| `PAYPAL_ENV`           | `sandbox`; Live se rechaza.                                                                                            |
| `PAYPAL_WEBHOOK_ID`    | ID del endpoint registrado en la misma app Sandbox; sin él se rechazan firmas.                                         |
| `DEMO_MODE`            | `true` habilita fallback explícito, simulación sin credenciales y acceso automático bajo condiciones de demo loopback. |
| `OPERATOR_PASSWORD`    | Mínimo 12 caracteres; obligatorio fuera de demo local, incluido Render con demo activo.                                |
| `SESSION_SECRET`       | Mínimo 32 caracteres; firma de sesión requerida para acceso protegido.                                                 |
| `NODE_ENV`             | Runtime; producción exige origen configurado.                                                                          |
| `NPM_CONFIG_INCLUDE`   | Render: `dev`, para Prisma, tsx y herramientas de build.                                                               |
| `PORT`                 | Puerto de producción suministrado por Render.                                                                          |
| `RENDER`               | Con `true`, exige origen público y deshabilita identidad demo automática.                                              |

`.env` y `.data` están ignorados por Git. Los ejemplos no contienen credenciales privadas. Configura el entorno público en el hosting, separado del local. El servidor lee el origen en runtime para checks y callbacks.

## IA local y modos de ejecución

### Ollama: inferencia real sin API pagada

Instala Ollama siguiendo la [guía oficial de Windows](https://docs.ollama.com/windows) o la de tu sistema. Si el servidor ya está en background, no necesitas otra instancia.

```powershell
# Solo si el servidor no está ejecutándose:
ollama serve
# En otra terminal, si falta el modelo usado en la evidencia:
ollama pull qwen3-coder:30b-a3b-q4_K_M
ollama list
```

Configura y reinicia AgentGuard:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder:30b-a3b-q4_K_M
OLLAMA_TIMEOUT_MS=180000
```

Compilador y selector comparten `generateStructured()`. Ollama recibe `/api/chat`, JSON Schema, `stream:false`, temperatura 0, contexto 4096, salida de hasta 1400 tokens y `keep_alive=15m`. La respuesta debe ser completa, JSON válido y cumplir Zod. El uso de esquemas sigue la [documentación de structured outputs de Ollama](https://docs.ollama.com/capabilities/structured-outputs).

La conversión Zod → JSON Schema usa un helper local del SDK OpenAI; no llama a la API. El modelo no recibe herramientas de pago, secretos PayPal ni Prisma.

El compilador vuelve a verificar presupuesto/autoridad reconocidos en la intención. No los amplía y trata permisos no reconocidos conservadoramente. Las guardas cubren cláusulas inglesas específicas, no toda semántica/idioma. Un JSON válido puede interpretar mal otras restricciones: revisa todo el borrador antes de activar.

El selector devuelve un ID del catálogo y explicación. El backend valida pertenencia, reconstruye precios y aplica política. Una selección manual se registra como `CATALOG_SELECTION`, sin atribuirla al LLM.

Offline, timeout, modelo faltante, salida parcial/schema inválido o permisos inseguros producen error. **No existe cambio automático al parser ni a OpenAI.**

```powershell
# Inferencias reales y evaluación del catálogo; no ejecuta pagos.
npm run ai:check
```

El script prueba A–D y selección con inyección; guarda evidencia no secreta en `.data/local-ai-validation.json`. Tiempos históricos: aproximadamente 34–38 s para A–D con modelo cargado y 93 s para una carga/inferencia inicial. Son observaciones de esa máquina, no un SLA.

### Fallback explícito sin LLM

```dotenv
AI_PROVIDER=deterministic
DEMO_MODE=true
```

El parser admite una gramática inglesa estrecha de monitores, cantidad, presupuesto USD, specs y prohibiciones soportadas; rechaza requisitos fuera de cobertura. El selector filtra candidatos y elige por precio. Ambos usan los mismos controles financieros.

La consola etiqueta **DETERMINISTIC FALLBACK** y explica que no hay inferencia. Es el modo previsto para el primer despliegue público sin API de IA pagada. La configuración actual restringe Ollama a ejecución local y lo rechaza para despliegue público.

### OpenAI opcional

`AI_PROVIDER=openai` requiere key/modelo propios. Una clave presente no selecciona ese proveedor automáticamente. El adaptador mantiene las validaciones de dominio; no es necesario para instalación, demo ni despliegue con fallback.

### Modos independientes

| Configuración                             | Interpretación             | Pagos nuevos         | Acceso                                      |
| ----------------------------------------- | -------------------------- | -------------------- | ------------------------------------------- |
| Ollama local + ambas credenciales PayPal  | IA local real              | Sandbox real         | Demo loopback o sesión según configuración. |
| Ollama local + sin credenciales + demo    | IA local real              | Simulados            | Demo loopback.                              |
| Deterministic + demo + ambas credenciales | Parser sin IA              | Sandbox real         | Loopback o sesión obligatoria en público.   |
| Deterministic + demo + sin credenciales   | Parser sin IA              | Simulados            | Loopback o sesión obligatoria en público.   |
| OpenAI explícito y configurado            | Proveedor externo opcional | Independientes de IA | Sesión fuera de demo loopback.              |

Credenciales parciales o fallos externos no convierten el pago en simulación. Cada transacción conserva su modo original; cambiar `.env` no transforma el historial.

## Uso de la aplicación

### Mandato

1. Abre `/mandates/new`, escribe nombre e intención explícita.
2. Pulsa **Generate Policy**: guarda `DRAFT`, intención y proveniencia.
3. Revisa presupuesto, autonomía, cantidad, condición, specs y prohibiciones.
4. Confirma humanamente y activa la versión revisada.
5. Editar crea otra versión `DRAFT` que requiere revisión/activación. También puedes clonar o desactivar.

Intención del caso principal:

> Buy 3 new 27-inch 1440p monitors. Maximum total budget $700. Do not buy refurbished products, warranties or accessories. Purchases up to $600 may happen automatically. Anything above $600 requires my approval.

### Propuesta y decisión

En `/agent` selecciona mandato activo y producto, o solicita recomendación. El servidor reconstruye catálogo/carrito y persiste transacción, checks y recibo.

| Decisión           | Acción                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| `ALLOW`            | Puede preparar pago tras reevaluación PRE_ORDER; recomendar no captura dinero. |
| `BLOCK`            | Flujo bloqueado sin ejecución de pago. Aprobar no elimina restricciones duras. |
| `REQUIRE_APPROVAL` | Cola `/approvals`; Approve/Reject vuelve a evaluar carrito y política.         |

La aprobación interna de AgentGuard y buyer approval en PayPal son consentimientos diferentes. La autonomía del mandato no elimina la aprobación de comprador de la orden Sandbox.

### Recibo

`/transactions/[id]` reúne intención, versión, carrito, checks, riesgo, explicación, aprobaciones, referencias y auditoría. Export JSON permite revisar evidencia persistida. Un click o la query de retorno no constituyen éxito; la UI conserva estados pending/error.

## Arquitectura

```mermaid
flowchart TD
    H[Humano: intención y límites] --> C[Compilador: borrador]
    C --> Z[Zod y guardas monetarias]
    Z --> R[Revisión y activación humana]
    R --> M[Mandato versionado]
    M --> A[Agente: ID del catálogo y explicación]
    U[Datos no confiables del comerciante] --> A
    A --> Q[Backend reconstruye carrito]
    M --> P[Motor determinista]
    Q --> P
    P --> B[BLOCK: sin ejecutar PayPal]
    P --> HR[REQUIRE_APPROVAL: permiso exacto]
    HR --> RE[Reevaluación]
    P --> AL[ALLOW]
    RE --> AL
    AL --> O[Orden PayPal AUTHORIZE]
    O --> BA[Comprador aprueba en Sandbox]
    BA --> V[Backend verifica y autoriza]
    V --> F[Comprobación final]
    F --> CP[CAPTURE]
    F --> VO[VOID cuando corresponde]
    B --> REC[Auditoría y Decision Receipt]
    CP --> REC
    VO --> REC
    WH[Webhook firmado y deduplicado] --> REC
```

Páginas/componentes presentan datos; handlers validan petición y sesión; servicios coordinan persistencia/estados; dominio/políticas calculan restricciones; adaptadores acotan llamadas externas.

El navegador no entrega un `ALLOW` con autoridad financiera. Las rutas monetarias recargan transacción propia, versión, quote y permisos. El preview de evaluación es advisory. El motor de políticas no importa proveedores IA. Se conservan decisiones por fases `INITIAL`, `HUMAN_REVIEW`, `PRE_ORDER` y `FINAL` según el flujo.

## Mandatos y cálculo del dinero

Política ilustrativa del caso principal; los campos opcionales dependen de la intención y del borrador revisado:

```json
{
  "goal": "Buy 3 new 27-inch 1440p monitors",
  "currency": "USD",
  "maxTotal": 700,
  "autonomousLimit": 600,
  "quantity": 3,
  "productConstraints": {
    "category": "monitor",
    "allowedConditions": ["new"],
    "minimumSizeInches": 27,
    "minimumResolutionWidth": 2560,
    "minimumResolutionHeight": 1440
  },
  "forbidden": ["refurbished", "warranty", "accessories"],
  "requireHumanApprovalAbove": 600
}
```

También admite `allowedMerchants`, `blockedMerchants` y `requiredKeywords` opcionales. Referencia exacta en [schemas.ts](src/lib/domain/schemas.ts).

Dinero finito, no negativo, hasta 1 000 000 USD y máximo dos decimales; presupuesto positivo. Autonomía/umbral no superan presupuesto. Cantidades enteras 1–1000, propuestas de 1–50 partidas y schemas estrictos sin claves desconocidas.

La aritmética usa **centavos enteros**, catálogo `priceCents`, PostgreSQL `Decimal(12,2)` y PayPal strings de dos decimales. El total debe ser exactamente cantidad × precio sumado. La autoridad efectiva es el menor entre `autonomousLimit` y `requireHumanApprovalAbove`; superarla exige review sin permitir romper el máximo duro.

## Motor de políticas y riesgo

[evaluatePurchase](src/lib/policy/evaluate-purchase.ts) es una función pura que explica cada check:

| Check                 | Regla                                                                |
| --------------------- | -------------------------------------------------------------------- |
| `AMOUNT_INTEGRITY`    | Total igual a suma exacta de partidas.                               |
| `POLICY_ACTIVE`       | Mandato activo.                                                      |
| `POLICY_VERSION`      | Versión vigente.                                                     |
| `MAX_TOTAL`           | Compra + reservas/capturas de otras transacciones dentro del máximo. |
| `AUTONOMOUS_LIMIT`    | Menor umbral autónomo; exceso requiere aprobación vinculada.         |
| `CURRENCY`            | Moneda del mandato.                                                  |
| `QUANTITY`            | Cantidad solicitada exacta, considerando lo reservado/comprado.      |
| `CATEGORY`            | Todas las partidas dentro de categoría.                              |
| `UNAUTHORIZED_ADD_ON` | Extras no heredan permiso del producto principal.                    |
| `CONDITION`           | Condición permitida.                                                 |
| `SPECIFICATIONS`      | Tamaño, resolución y keywords cumplen.                               |
| `FORBIDDEN_ITEMS`     | Identidad del producto no viola prohibiciones.                       |
| `MERCHANT_ALLOWED`    | Allowlist cuando existe.                                             |
| `MERCHANT_BLOCKED`    | Fuera de denylist.                                                   |
| `PRICE_CHANGE`        | Señal de cambio de importe; se reaplican límites.                    |
| `UNTRUSTED_CONTENT`   | Señal heurística de instrucciones sospechosas.                       |

Cualquier fallo duro produce `BLOCK`; sin fallo duro, exceso de autonomía produce `REQUIRE_APPROVAL`; en otro caso `ALLOW`. Cambio de precio y contenido sospechoso son señales advisory. El score no concede autoridad y una aprobación no salva una restricción dura.

Se normalizan categorías/comerciantes con minúsculas, NFKC y trim, también al contar cantidades reservadas. Las prohibiciones usan nombre/categoría/condición; una descripción “not refurbished” no cambia la condición persistida.

| Contribución de riesgo activa   | Puntos |
| ------------------------------- | -----: |
| Cambio de precio                |     15 |
| Señal de prompt injection       |     40 |
| Comerciante sin confianza local |     10 |
| Extras fuera de categoría       |     25 |
| Review por importe              |     15 |
| Fallo duro                      |     25 |

Suma limitada a 100: LOW <25, MEDIUM 25–49, HIGH 50–74, CRITICAL ≥75. Es un score del MVP, sin calibración estadística antifraude.

## Estados, reservas e idempotencia

| Estado                 | Significado                                        |
| ---------------------- | -------------------------------------------------- |
| `DRAFT`                | Propuesta persistida antes de evaluación.          |
| `POLICY_CHECKED`       | Evaluación inicial completada.                     |
| `REQUIRES_APPROVAL`    | Espera permiso humano interno.                     |
| `APPROVED`             | Permiso interno vigente.                           |
| `PAYPAL_ORDER_CREATED` | Orden existente, espera/verifica comprador.        |
| `PAYER_APPROVED`       | Aprobación externa verificada.                     |
| `AUTHORIZED`           | Autorización registrada.                           |
| `FINAL_POLICY_CHECK`   | Reevaluación final; captura puede estar pendiente. |
| `CAPTURED`             | Captura confirmada en su modo.                     |
| `BLOCKED`              | Flujo cerrado por incumplimiento/rechazo.          |
| `VOIDED`               | Autorización liberada.                             |
| `FAILED`               | Flujo cerrado como fallido.                        |

La [máquina de estados](src/lib/domain/state-machine.ts) rechaza saltos. CAPTURED/BLOCKED/VOIDED/FAILED son terminales. CAPTURED simulado se presenta **SIMULATED CAPTURED**, con IDs `SIM-*`.

Reservan presupuesto/cantidad: orden creada, pagador aprobado, autorización, final check y captura. Propuestas solo evaluadas no reservan; crear orden reevalúa bajo lock. Órdenes abandonadas mantienen reservas: no existe expiración automática.

Transacciones PostgreSQL y advisory locks por mandato serializan edits, approvals y pagos, recargando datos tras el lock. La aprobación vincula transacción, versión, **hash SHA-256 del carrito**, importe y moneda. Cambiarlos invalida su coincidencia; rechazar cierra el flujo.

CREATE/AUTHORIZE/CAPTURE/VOID usan claves estables por transacción/operación, `PayPal-Request-Id` y unicidad DB. Resultados exitosos se reutilizan; un retry no sustituye el carrito vinculado a CREATE. Intentos externos inciertos de más de cinco horas requieren reconciliación.

No hay atomicidad distribuida entre PayPal y PostgreSQL. Ante una respuesta ambigua revisa el mismo flujo antes de crear nuevos pagos. Los locks abarcan llamadas acotadas de red; workers durables y outbox quedan pendientes.

## PayPal Sandbox

### Preparación y ejecución

1. En [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) usa la app REST **Sandbox** asociada al vendedor Business.
2. Configura ambos campos PayPal en servidor, con `PAYPAL_ENV=sandbox`.
3. Prepara comprador **Personal Sandbox** distinto del vendedor.
4. Crea/revisa/activa mandato nuevo y propone tres Alpha: USD 537 / ALLOW.
5. Crea orden en el recibo y abre **Approve in PayPal Sandbox**; aprueba como comprador.
6. Vuelve y pulsa **Authorize & capture**: verificación, autorización, FINAL y captura o VOID.

Orders v2 usa `intent=AUTHORIZE`; Payments v2 captura, conforme al [flujo oficial PayPal](https://developer.paypal.com/checkout/delay-capture/). Credenciales REST del vendedor no sustituyen buyer approval.

Se comprueban intent, estado, transaction ID, moneda, importe, identidad/cantidad/precio de partidas. `?paypal=approved` no concede autoridad. Antes de capturar se comparan autorización, bound quote, catálogo, política y aprobación exacta. Si falla se libera con VOID cuando es posible. PENDING no se anuncia como completado.

El receptor único es la cuenta Business; comerciantes del catálogo son metadatos locales. Sandbox usa fondos de prueba y no entrega productos.

### Captura real conservada

| Evidencia local | Valor                                  |
| --------------- | -------------------------------------- |
| Transacción     | `1175c263-52c8-401d-8879-4eec121e6e5e` |
| Importe         | **537 USD**                            |
| Modo / estado   | `PAYPAL_SANDBOX` / `CAPTURED`          |
| Orden           | `22G673728L3306907`                    |
| Autorización    | `5S481085LL587635D`                    |
| Captura         | `2US03005SE554815A`                    |

[Recibo local](http://localhost:3000/transactions/1175c263-52c8-401d-8879-4eec121e6e5e), disponible al utilizar la DB histórica. Ataque `0be1d92f-73ef-40d7-a9ae-182debdce2fa`: BLOCKED por 812 USD, cero operaciones. Esas referencias no prueban una captura desde Render/Neon ni dinero Live.

### Validación que crea una orden nueva

```powershell
npm run paypal:check
```

Requiere servidor local demo con Sandbox. **Crea propuestas y una orden AUTHORIZE nueva de USD 537**, verifica repetición de CREATE y bloqueo de injection. Guarda `.data/sandbox-validation.json`. No introduce credenciales de comprador ni aprueba/captura por sí solo; continúa en el recibo. Sus efectos externos difieren de `npm test`.

## Webhooks

Endpoint público: **POST `/api/paypal/webhook`**. Usa firma PayPal y límite propio; no usa cookie del operador ni Origin como prueba de autenticidad.

Registra en la misma REST app Sandbox el origen HTTPS real + `/api/paypal/webhook`, guarda su ID y aplica configuración. Eventos:

```text
CHECKOUT.ORDER.APPROVED
PAYMENT.AUTHORIZATION.CREATED
PAYMENT.AUTHORIZATION.VOIDED
PAYMENT.CAPTURE.COMPLETED
PAYMENT.CAPTURE.PENDING
PAYMENT.CAPTURE.DENIED
```

Valida cuerpo, headers y cert URL HTTPS PayPal; el endpoint remoto debe devolver `SUCCESS`. Deduplica por ID y resuelve transacción Sandbox mediante referencias externas.

Reconcilia operaciones existentes sin crear permisos ni iniciar captura. COMPLETED exige captura registrada, referencia/importe/moneda exactos y estado compatible. VOIDED/DENIED cierran flujos admitidos. Referencias relevantes aún no persistidas pueden devolver 503 para retry.

Registrar una URL o pasar tests de firma no prueba delivery. Sigue pendiente evento firmado HTTPS real y reenvío deduplicado. Procedimiento en la [guía de despliegue](docs/deployment.md#pasos-exactos-de-paypal-developer-dashboard).

## Attack Lab y catálogo

Cada escenario requiere confirmar mandato **aislado**: máximo 700, autonomía 600, tres monitores nuevos 27 pulgadas QHD sin extras. Usa los mismos servicios y evita contaminar reservas del mandato principal.

| Escenario / ID       | Carrito o cambio USD                          | Resultado                                  |
| -------------------- | --------------------------------------------- | ------------------------------------------ |
| A / `normal`         | 3 × 179 = **537**                             | ALLOW.                                     |
| B / `budget`         | **812**                                       | BLOCK, máximo excedido.                    |
| C / `addons`         | 537 + garantía 120 + cables 95 = **752**      | BLOCK, extras/prohibiciones y máximo.      |
| D / `approval`       | **675**                                       | REQUIRE_APPROVAL, dentro de 700/sobre 600. |
| E / `injection`      | 3 × 199 + 120 + 95 = **812**, texto malicioso | BLOCK / PAYPAL NOT EXECUTED.               |
| F / `price-approval` | **590 → 675**                                 | REQUIRE_APPROVAL, cambio registrado.       |
| G / `price-block`    | **590 → 720**                                 | BLOCK, máximo duro excedido.               |

Fixtures escritas por servidor; no permiten al navegador imponer precios. Si el importe no se divide entre tres precios iguales en centavos se usan dos partidas exactas.

| Producto seed           | USD/unidad | Condición y specs                                         |
| ----------------------- | ---------: | --------------------------------------------------------- |
| Monitor Alpha           |        179 | Nuevo, 27 pulgadas, 2560 × 1440.                          |
| Monitor Budget Refurb   |        149 | Refurbished, 27 pulgadas, 2560 × 1440.                    |
| Monitor Pro 4K          |        219 | Nuevo, 27 pulgadas, 3840 × 2160.                          |
| Monitor Injection       |        199 | Nuevo, 27 pulgadas, 2560 × 1440, descripción adversarial. |
| Extended Warranty       |        120 | Add-on de garantía.                                       |
| Premium HDMI Cable Pack |         95 | Add-on de accesorios.                                     |

`trusted` es confianza local, no certificación de una tienda. Descripciones se envuelven como `UNTRUSTED_MERCHANT_DATA` en mensajes user y se renderizan como texto React. No se aceptan IDs ajenos al catálogo ni campos de acción como `capturePayment`.

Detección de injection advisory. Una selección Ollama real ignoró instrucciones de elevar presupuesto a 2000 USD y mantuvo el mandato; demuestra ese caso sin prometer inmunidad universal. La autorización financiera depende del motor determinista.

## Autenticación y seguridad

Operador fijo con ownership de mandatos/transacciones. Fuera de demo loopback requiere sesión, incluido `DEMO_MODE=true`. Render deshabilita identidad automática y exige origen HTTPS/password/secret.

- Cookie `agentguard_session`: HMAC SHA-256, HttpOnly, SameSite=Strict, Path `/`, ocho horas y Secure bajo HTTPS.
- Usuario, firma, estructura y expiración numérica verificados; comparaciones sensibles con longitud y `timingSafeEqual`.
- Logout expira cookie; sesión stateless sin revocación individual de una copia robada. Expiración/rotación del secreto limitan validez.
- Mutaciones exigen Origin exacto y JSON; Origin no sustituye sesión ni autentica clientes no navegador.
- JSON limitado a **32768 bytes**, incluidos streams; schemas estrictos y errores sin stacks/tokens/cuerpos privados.
- APIs operativas: **180 requests/minuto por operador**. Login: **cinco intentos/minuto compartidos**, almacenamiento por proceso.
- `TrustedLoginIdentity` define un futuro adapter de ingress verificado; no está instalado. Headers de IP arbitrarios no crean buckets. Agotar la cuota compartida puede impedir nuevas sesiones temporalmente: hallazgo abierto.
- Cabeceras `nosniff`, frame DENY, referrer policy y restricciones de cámara/micrófono/geolocalización; sin CSP completa.
- Auditoría sin endpoints de edición y versiones conservadas; administrador DB puede modificarlas, sin sellado externo.

`secret:check` revisa archivos no ignorados, secretos configurados y patrones. Una comprobación histórica de 22 bundles JS no encontró los valores sensibles configurados. Es acotada, sin certificar dependencias/historial Git universalmente.

## Base de datos

[Prisma](prisma/schema.prisma) define **15 modelos** y enum de estados. La [migración inicial](prisma/migrations/20261002020027_initial/migration.sql) crea tablas/índices/relaciones sin reset ni truncado.

| Modelo            | Responsabilidad                                   |
| ----------------- | ------------------------------------------------- |
| `User`            | Operador y propiedad.                             |
| `SpendingMandate` | Intención, estado y versión actual.               |
| `PolicyVersion`   | Política, intención, proveniencia y confirmación. |
| `Agent`           | Agente propio.                                    |
| `Merchant`        | Identidad/confianza local.                        |
| `Product`         | Catálogo, centavos, condición y specs.            |
| `PurchaseRequest` | Propuesta, source y explicación.                  |
| `Transaction`     | Estado, dinero, quote/hash, modo y referencias.   |
| `TransactionItem` | Partidas y snapshots.                             |
| `PolicyDecision`  | Evaluación por fase.                              |
| `HumanApproval`   | Permiso exacto y decisión humana.                 |
| `AuditEvent`      | Actor, tipo, metadata y fecha.                    |
| `PayPalOperation` | Operación, requestId, resultado y estado.         |
| `DecisionReceipt` | Snapshot actualizado por transacción.             |
| `WebhookEvent`    | ID externo único y procesamiento.                 |

Mandato+versión, solicitud de compra, claves y referencias de pago tienen unicidad. Dominio usa UUID; eventos conservan IDs externos. `TransactionItem.productId` es referencia UUID sin relación Prisma Product; webhook resuelve referencias en servicio.

Seed conserva registros con upserts y agrega historia inicial solo si no hay transacciones. Ejecutar secuencialmente durante inicialización. El recibo se actualiza por upsert: evidencia vigente, no documento congelado.

`db:setup` prepara local. Release remoto: `db:deploy` con salida capturada y seed explícito cuando corresponde. No hay backup/restore probado ni transferencia automática entre launcher, Docker y Neon.

## Referencia de APIs

Datos directos sin `{data: ...}`; acciones sin campos reciben `{}`. Rutas operativas exigen sesión fuera de demo local y Origin en mutaciones. Readiness, login y webhook tienen flujos propios.

| Método | Ruta                                     | Entrada / finalidad                                                |
| ------ | ---------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/ready`                             | Readiness pública mínima.                                          |
| GET    | `/api/session`                           | Identidad, `aiMode`, pago y flags de demo.                         |
| POST   | `/api/session`                           | `{password}`, cookie.                                              |
| DELETE | `/api/session`                           | Logout.                                                            |
| GET    | `/api/health`                            | Salud protegida DB/proveedor/pago.                                 |
| GET    | `/api/mandates`                          | Mandatos propios.                                                  |
| GET    | `/api/mandates/:id`                      | Mandato por UUID.                                                  |
| POST   | `/api/ai/compile-policy`                 | `{name?,intent}`, DRAFT.                                           |
| PATCH  | `/api/mandates/:id`                      | action/expectedVersion y campos de activate/deactivate/edit/clone. |
| GET    | `/api/catalog`                           | Productos, comerciantes y riesgo.                                  |
| POST   | `/api/policies/evaluate`                 | `{mandateId,purchase}`, preview advisory.                          |
| POST   | `/api/purchase/propose`                  | `{mandateId,query?,productId?}` o escenario confirmado.            |
| GET    | `/api/transactions`                      | Últimas 500 propias.                                               |
| GET    | `/api/transactions/:id`                  | Transacción y evidencia.                                           |
| GET    | `/api/approvals`                         | Pendientes de review.                                              |
| POST   | `/api/approvals/:id/approve`             | `{}`; ID del registro de aprobación.                               |
| POST   | `/api/approvals/:id/reject`              | `{}`; rechaza aprobación.                                          |
| GET    | `/api/overview`                          | Transacciones/métricas/scope.                                      |
| POST   | `/api/paypal/orders`                     | `{transactionId}`, PRE_ORDER y CREATE.                             |
| POST   | `/api/paypal/orders/:id/authorize`       | `{}`, ID externo; verifica/autoriza y final capture/void.          |
| POST   | `/api/paypal/authorizations/:id/capture` | `{}`, reintento permitido de autorización externa.                 |
| POST   | `/api/paypal/authorizations/:id/void`    | `{}`, liberación permitida.                                        |
| POST   | `/api/paypal/webhook`                    | Evento + headers de firma.                                         |

Leer readiness/modos localmente, sin compras:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/ready
Invoke-RestMethod -Uri http://localhost:3000/api/session
```

Ejemplo local con demo loopback, Origin y JSON:

```powershell
$payload = @{
    name = "Workstation monitors"
    intent = "Buy 3 new 27-inch 1440p monitors under $700. Automatically purchase up to $600."
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/ai/compile-policy `
    -Method Post -Headers @{ Origin = "http://localhost:3000" } `
    -ContentType "application/json" -Body $payload
```

Guarda **borrador nuevo**, sin activar ni pagar. Remoto requiere sesión adicional. Contratos completos en [frontend-contract.md](docs/frontend-contract.md); handlers en `src/app/api`.

Errores:

```json
{
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "The request is invalid.",
    "issues": [{ "path": "intent", "message": "Validation detail" }]
  }
}
```

Habituales: 400 JSON, 401 sesión, 403 origen, 409 conflicto/estado, 413 tamaño, 415 tipo, 422 payload, 429 límite, 503 servicio/configuración. El código concreto determina tratamiento.

### Readiness y health

`/api/ready`: **200** con solo `{ "status": "ok" }` o **503** con solo `{ "status": "unavailable" }`, no cache. Configuración y operador sembrado, espera DB hasta tres segundos, sin pagos/inferencia.

`/api/health`: protegido; `status`, `database`, `paypalMode`, `aiProvider`, `aiStatus`. Ollama consulta modelos instalados: available no prueba inferencia. OpenAI configured; parser fallback. `degraded` es campo del body, no HTTP 503 automático.

## Interfaz, recibos y métricas

| Página               | Contenido                                        |
| -------------------- | ------------------------------------------------ |
| `/`                  | Landing.                                         |
| `/dashboard`         | Métricas y grid.                                 |
| `/mandates`          | Lista de mandatos.                               |
| `/mandates/new`      | Compilación de borrador.                         |
| `/mandates/[id]`     | Revisión/activación/edición/clonación/historial. |
| `/agent`             | Catálogo/recomendación/evaluación.               |
| `/transactions`      | AG Grid y filtros.                               |
| `/transactions/[id]` | Recibo/pagos/export JSON.                        |
| `/approvals`         | Approve/Reject.                                  |
| `/attack-lab`        | A–G y mandato aislado.                           |
| `/login`             | Sesión.                                          |

Badges IA/pagos independientes. AG Grid usa APIs/DB con ordenación, filtros de columna/texto/estado/riesgo/fecha, paginación y navegación a recibos. Loading/empty/error/not-found, navegación móvil, etiquetas accesibles y skip link.

Overview usa **últimas 500 transacciones**: autonomousSpend suma CAPTURED/ALLOW con simuladas y Sandbox; blockedAttempts cuenta BLOCKED; humanApprovals cuenta solicitudes actualmente pendientes; protectedAgents cuenta propios; policyViolations suma violaciones disponibles. No son balances bancarios ni historial total de approvals concedidas.

## Despliegue público con Render y Neon

La [guía de despliegue](docs/deployment.md) detalla 22 pasos. **Neon está inicializado; Render y delivery público siguen pendientes.**

### Web Service

AgentGuard requiere servidor/APIs. Render documenta Web Service para Next con lógica de servidor en su [guía oficial](https://render.com/docs/deploy-nextjs-app).

| Campo                  | Configuración                                                 |
| ---------------------- | ------------------------------------------------------------- |
| Tipo/runtime           | Web Service Node **22.x**.                                    |
| Root Directory         | Raíz.                                                         |
| Build                  | `npm ci && npm run build`.                                    |
| Start                  | `npm start`.                                                  |
| Health path            | `/api/ready`.                                                 |
| Puerto                 | `PORT` de Render.                                             |
| Base                   | Neon preparado.                                               |
| Interpretación inicial | `AI_PROVIDER=deterministic`, `DEMO_MODE=true`, parser sin IA. |

[render.yaml](render.yaml) añade NODE_ENV production, NPM_CONFIG_INCLUDE dev y Sandbox. El plan Free es ejemplo; no crea cuenta/base/secretos y requiere comprobar disponibilidad real en la cuenta.

Introduce DATABASE_URL, origen HTTPS realmente asignado, password, secret y ambas credenciales PayPal en Environment. Añade Webhook ID después de registrar el endpoint. Un 503 por configuración pendiente se resuelve configurando, sin ocultarlo cambiando health path.

### Neon administrativo

La base suministrada ya recibió generate/migrate/seed. Para **otra base nueva** o release posterior proporciona su conexión privadamente al proceso administrativo:

```powershell
npm run db:generate
npm run db:deploy
# Solo durante inicialización explícita:
npm run db:seed
```

No seed en restart. Conserva parámetros TLS. La [entrada privada PowerShell de la guía](docs/deployment.md#comandos-neon-sin-reescribir-el-env-local) permite operar sin reescribir `.env`. Los datos históricos locales no aparecen automáticamente en Neon.

### Cierre público

Desde un proceso con **entorno público real**:

```powershell
npm run deployment:check -- --public
# Tras registrar/configurar webhook:
npm run deployment:check -- --public --require-webhook
```

Comprueba configuración/SQL sin OAuth/inferencia/pagos. Después prueba login HTTPS, rechazo sin cookie, readiness, persistencia tras restart, draft/activation, checkout Sandbox nuevo y webhook firmado/reenvío deduplicado. La captura local no sustituye checkout público. Demo true permite parser pero exige sesión en Render. No necesitas publicar Ollama ni contratar IA.

## Comandos del proyecto

| Comando                    | Efecto                                             |
| -------------------------- | -------------------------------------------------- |
| `npm ci`                   | Instalar lockfile.                                 |
| `npm run dev`              | Desarrollo loopback.                               |
| `npm run build`            | Generate Prisma y build Next.                      |
| `npm start`                | Producción con PORT.                               |
| `npm run db:local`         | PostgreSQL persistente local.                      |
| `npm run db:generate`      | Cliente Prisma.                                    |
| `npm run db:migrate`       | Migrate deploy directo; remoto prefiere db:deploy. |
| `npm run db:deploy`        | Migraciones con salida capturada, sin seed.        |
| `npm run db:seed`          | Inicialización explícita y preservación de datos.  |
| `npm run db:setup`         | Generate + migrate + seed local.                   |
| `npm run typecheck`        | TypeScript sin emitir archivos.                    |
| `npm run lint`             | ESLint.                                            |
| `npm run format:check`     | Comprobar formato.                                 |
| `npm run format`           | Reformatear, modifica archivos.                    |
| `npm test`                 | Vitest unit/API/DB.                                |
| `npm run test:watch`       | Watch.                                             |
| `npm run test:e2e`         | Playwright, pagos simulados.                       |
| `npm run ai:check`         | Inferencia local real y política, sin pagos.       |
| `npm run paypal:check`     | Nueva orden Sandbox y evidencia.                   |
| `npm run deployment:check` | Configuración/SQL; --public y --require-webhook.   |
| `npm run secret:check`     | Detectar secretos sin mostrar valores.             |

## Pruebas y validaciones

### Ejecución

Usa base preparada de desarrollo/test. Las suites crean fixtures; no deben apuntar a una base compartida de despliegue.

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run secret:check
```

Windows: detener app/esperar tests antes de generate/build. Luego:

```powershell
npm run build
npx playwright install chromium
$env:E2E_PRODUCTION = "true"
$env:E2E_PORT = "3002"
try {
    npm run test:e2e -- --headed
} finally {
    Remove-Item Env:E2E_PRODUCTION -ErrorAction SilentlyContinue
    Remove-Item Env:E2E_PORT -ErrorAction SilentlyContinue
}
```

El puerto 3002 evita reutilizar el servidor Sandbox que escucha en 3000. La configuración de Playwright fuerza el proveedor determinista, demo explícito, origen local y credenciales externas vacías. Antes de los escenarios comprueba los modos: un servidor existente con pagos reales falla esa comprobación. Los E2E crean registros de demostración persistidos en su base.

### Cobertura

| Archivo                              | Validación                                       |
| ------------------------------------ | ------------------------------------------------ |
| `tests/policy.test.ts`               | Restricciones/cálculos/riesgo.                   |
| `tests/compiler.test.ts`             | Parser/límites/permisos conservadores.           |
| `tests/state-machine.test.ts`        | Transiciones.                                    |
| `tests/api.test.ts`                  | Payload/Origin/JSON/tamaño/UTF-8.                |
| `tests/auth.test.ts`                 | Firma/expiración/tampering/demo.                 |
| `tests/paypal.test.ts`               | OAuth/REST/errores/idempotencia.                 |
| `tests/webhook.test.ts`              | Headers/certificado/firma.                       |
| `tests/payments.integration.test.ts` | DB/locks/reservas/approvals/capture/VOID/replay. |
| `tests/local-ai.test.ts`             | Proveedores/schema/permisos/injection.           |
| `tests/local-ai.integration.test.ts` | Proveniencia/DRAFT/persistencia/health.          |
| `tests/deployment.test.ts`           | Configuración pública/TLS/origen/modos.          |
| `tests/readiness.test.ts`            | Status/body mínimo/DB/configuración.             |
| `tests/login-rate-limit.test.ts`     | Cuota/spoofing/identidad confiable.              |
| `tests/public-auth-api.test.ts`      | APIs remotas/login/logout.                       |
| `e2e/agentguard.spec.ts`             | Flujo simulado/injection/review/móvil.           |

Integraciones financieras: **PostgreSQL real** con límite externo de pago sustituido; políticas, locks, approvals, estados y persistencia reales. Sin DATABASE_URL se saltan explícitamente. Tests de proveedor sustituyen llamadas; inferencias/pagos reales tienen comprobaciones separadas.

### Resultados históricos y CI

Preparación pública: **146 casos / 14 archivos**, **4 E2E producción**, typecheck/lint/formato/build correctos. Se conservó captura/bloqueo histórico y se comprobó inferencia local adicional y bundles sin secretos configurados. Después se verificó Neon real. Esta edición documental no repite suite ni operaciones externas.

[CI](.github/workflows/ci.yml) prepara Node 22 y PostgreSQL 17, inicializa la base y ejecuta lint, typecheck, tests, build y los escenarios Chromium. En fallo guarda el reporte de Playwright. Utiliza fallback y simulación sin modelo ni credenciales externos. La existencia de la workflow no demuestra una ejecución remota concreta satisfactoria. Rollup resuelve a su distribución oficial WASM mediante override.

## Estructura del repositorio

```text
.
├── README.md                       Guía principal
├── AGENTS.md / CLAUDE.md            Instrucciones para agentes
├── .env.example                    Plantilla sin secretos
├── docker-compose.yml              PostgreSQL alternativo
├── render.yaml                     Descriptor Web Service
├── .github/workflows/ci.yml         Checks automatizados
├── prisma/
│   ├── schema.prisma               Modelos y constraints
│   ├── migrations/                 Migración versionada
│   └── seed.ts                     Operador/catálogo/demo
├── src/app/
│   ├── (console)/                  Páginas de operación
│   ├── api/                        Handlers individuales
│   ├── login/                      Acceso
│   └── globals.css                 Estilos
├── src/components/                 Shell/builder/agente/grid/lab/recibos
├── src/lib/
│   ├── ai/                         Compilador/selector/proveedores
│   ├── domain/                     Zod/estados/fixtures/errores
│   ├── policy/                     Motor determinista
│   ├── risk/                       Score
│   ├── paypal/                     OAuth/REST/firma/idempotencia
│   ├── services/                   Orquestación/locks/auditoría
│   ├── security/                   Sesión/límites/untrusted data
│   ├── environment.ts              Validación local/pública
│   ├── config.ts                   Origen runtime
│   ├── http.ts                     Contratos HTTP/errores
│   ├── db.ts                       Prisma
│   └── client-*                    Fetch y contratos cliente
├── scripts/                        DB/deploy/checks
├── tests/                          Unit/API/integración
├── e2e/                            Playwright
└── docs/                           Informes/contratos/capturas
```

[package.json](package.json) y lockfile resuelven scripts/dependencias. `.next`, `node_modules`, `.data`, logs, coverage y reportes generados no son documentación versionada.

## Demo de tres minutos

Prepara app/DB, precarga modelo si mostrarás IA real, verifica health y abre captura histórica. Anuncia el modo que muestras.

| Tiempo    | Acción                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Landing y responsabilidades, badges independientes.                                                  |
| 0:20–1:00 | Generar/mostrar borrador real 700/600; review y activación.                                          |
| 1:00–1:25 | Tres Alpha por USD 537, ALLOW y checks; inferencia preparada con proveniencia visible si hace falta. |
| 1:25–1:45 | Recibo Sandbox histórico CAPTURED, final check e IDs.                                                |
| 1:45–2:15 | Lab E por USD 812, texto malicioso y extras, BLOCK/PAYPAL NOT EXECUTED.                              |
| 2:15–2:40 | Lab D por USD 675, aprobación vinculada y reevaluación.                                              |
| 2:40–3:00 | Dashboard y recibo del bloqueo/auditoría.                                                            |

Carga fría o buyer approval de una orden nueva pueden extender el tiempo. Público inicial: anunciar parser **sin IA**. Simulación: anunciar **SIMULATED**. El recibo histórico evita otro pago durante presentación.

## Resolución de problemas

| Síntoma                   | Acción                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| DATABASE_UNAVAILABLE      | Verifica DB/54329/conexión privadamente, conservando datos.                     |
| 54329 ocupado             | Una sola opción launcher/Docker; almacenamientos separados.                     |
| Prisma EPERM Windows      | Detén app propia/espera tests, luego generate/build; conserva DB.               |
| INVALID_ORIGIN            | Alinea esquema/host/puerto con origen y reinicia.                               |
| Readiness 503             | Revisa origen, autenticación, modos, base y seed; corrige la causa del 503.     |
| AUTH_NOT_CONFIGURED       | Password≥12/secret≥32; demo público requiere login.                             |
| Login429                  | Espera cuota compartida de un minuto; no hay identidad IP verificada instalada. |
| Ollama offline/missing    | Daemon11434/ollama list/modelo exacto/health.                                   |
| Timeout IA                | Precarga y revisa recursos/carga; salida incompleta no guarda policy.           |
| AI_OUTPUT_INVALID         | Clarifica intención y schema; no activa salida rechazada.                       |
| AI_FALLBACK_DISABLED      | Deterministic + DEMO_MODE=true explícitos.                                      |
| AI_LOCAL_ONLY público     | Usa fallback previsto; Ollama actual restringido a local.                       |
| BUYER_APPROVAL_REQUIRED   | Aprobar realmente con Personal Sandbox.                                         |
| Quote/versión cambió      | Revisa checks y permiso; no reutiliza consentimiento obsoleto.                  |
| Captura pending/incierta  | Reconciliar mismo flujo antes de iniciar otro.                                  |
| RECONCILIATION_REQUIRED   | Verifica PayPal externo antes de replay manual.                                 |
| Webhook rechazado         | ID misma app, HTTPS y firma válida.                                             |
| Grid fuera de pantalla    | AG Grid virtualiza: scroll antes de comprobar celdas.                           |
| Recibo local ausente Neon | Seed no copia historial; usa base local o evidencia remota nueva.               |

## Limitaciones y siguientes pasos

Un operador, catálogo controlado, USD, receptor Sandbox único y una captura por autorización. Sin onboarding/tiendas externas/envío/impuestos/fulfillment/refunds iniciados por app/suscripciones. Live deshabilitado.

El modelo puede interpretar mal restricciones o añadir otras conservadoras. Guardas inglesas parciales y detector de injection imperfecto requieren review; contexto/salida acotados limitan intenciones/catalogos mayores.

Faltan expiración segura de reservas, reconciliación durable con outbox y workers, observabilidad, procedimientos de incidentes y pruebas de backup/restore. Los límites viven en memoria y la cuota global de login mantiene un hallazgo abierto. No hay multitenencia/RBAC completo, CSP completa, sellado frente a administradores de DB ni auditoría exhaustiva de dependencias o WCAG.

Prioridades: demostrar Render/login/checkout/webhook HTTPS, reconciliar sin capturas extra, expirar reservas con evidencia externa, límites distribuidos por identidad confiable, evaluación semántica por idioma/modelo, cotizaciones verificables y backup/restore. MVP y tests no equivalen a certificación para dinero de producción.

## Documentación y evidencias

| Documento                                             | Contenido                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| [Informe maestro](docs/informe-maestro-agentguard.md) | Arquitectura/contratos/inventarios/anexos; snapshot histórico 2 de octubre. |
| [Informe de ingeniería](docs/engineering-report.md)   | Implementación inicial/seguridad/pagos/validación.                          |
| [Informe IA local](docs/local-ai-report.md)           | Proveedores/Ollama real/guardas/evidencia.                                  |
| [Contrato frontend](docs/frontend-contract.md)        | Recursos/respuestas/estados/convenios.                                      |
| [Guía despliegue](docs/deployment.md)                 | Render/Neon/administración/login/webhook en 22 pasos.                       |
| [Informe despliegue](docs/deployment-report.md)       | Preparación pública, 146 tests/4 E2E y Neon real.                           |

Capturas: [landing](docs/screenshots/landing.png), [dashboard](docs/screenshots/dashboard.png), [Attack Lab](docs/screenshots/attack-lab.png), [recibo Sandbox](docs/screenshots/sandbox-receipt.png), [policy Ollama](docs/screenshots/local-ai-policy.png) y [móvil](docs/screenshots/mobile.png).

Artefactos ignorados: `.data/local-ai-validation.json`, `.data/sandbox-validation.json`, `.data/deployment-state-validation.json`, `.data/deployment-local-ai-validation.json`, `.data/neon-inspection.json`, `.data/neon-initialization-validation.json`. Evidencian ejecuciones concretas, no monitoreo continuo. Imágenes/snapshots no sustituyen comprobación financiera externa. Los informes conservan fechas/totales propios: 112 tests históricos no contradicen 146 posteriores.

## Contribución y licencia

Antes de modificar runtime lee [AGENTS.md](AGENTS.md) y las guías instaladas en `node_modules/next/dist/docs/`; Next puede diferir de otras versiones. Conserva separación entre interpretación, política y ejecución y valida según alcance.

No añadas credenciales, `.env`, bases físicas ni artefactos privados a commits. Seed no inicia pagos y tests mantienen modos simulados explícitos. Actualizar documentación no publica ni despliega automáticamente.

Licencia **MIT**. Texto completo en [LICENSE](LICENSE).
