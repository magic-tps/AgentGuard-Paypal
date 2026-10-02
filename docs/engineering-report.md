# AgentGuard — informe de implementación y validación

Fecha: 2 de octubre de 2026, America/Lima.

La aplicación funciona localmente con PostgreSQL y el build de producción. Se verificó el recorrido completo con captura **simulada** y con autorización y captura **reales de PayPal Sandbox por $537 USD**, después de la aprobación interactiva del comprador.

Actualización: la IA primaria es **Ollama local**, sin API pagada ni necesidad de `OPENAI_API_KEY`. La inferencia real, los casos de permisos y la selección con inyección se verificaron; consulta el [informe de IA local](local-ai-report.md). El flujo financiero validado se conservó.

## 1. Estado inicial y cambios

El repositorio ya contenía las páginas solicitadas, APIs, esquema Prisma, motor de políticas, máquina de estados, adaptadores OpenAI/PayPal, aprobaciones, auditoría y pruebas. Se conservó esa implementación. La base local estaba apagada: las 17 pruebas de integración iniciales fallaron por conexión; al iniciar PostgreSQL y ejecutar el setup, funcionaron.

Cambios de esta sesión:

- El compilador usa el menor límite explícito de gasto automático, no concede autonomía a frases que requieren aprobación y rechaza respuestas de OpenAI que excedan presupuesto o autonomía reconocidos.
- La reserva de cantidades usa la misma normalización de categorías que la evaluación: cambiar `monitor` a `Monitor` ya no permite repetir la cantidad autorizada.
- Las peticiones JSON se limitan a 32 KiB durante la lectura del stream; se cancelan cuando exceden el límite y se conserva la decodificación UTF-8.
- OAuth valida la estructura del token con Zod, rechazando tipos incorrectos.
- Se añadieron pruebas del REST de PayPal sustituyendo únicamente `fetch`, de sesiones firmadas y de los cambios anteriores.
- Se corrigieron etiquetas del campo de intención y del selector de mandato, navegación de login/logout e imports. Las decisiones se muestran como `ALLOW`, `BLOCK` y `REQUIRE APPROVAL`.
- Playwright puede probar el build de producción con `E2E_PRODUCTION=true` y `E2E_PORT=3002`; sus selectores verifican los controles y referencias visibles. La configuración del origen se lee en el servidor durante la ejecución para evitar que Next congele el puerto de compilación en las validaciones y URLs de retorno.
- Se añadió `npm run paypal:check`, una comprobación reproducible de órdenes reales y bloqueo de ataques.
- Se formatearon los archivos de aplicación para que los componentes y controles sean legibles; se actualizaron instrucciones y capturas.

Las credenciales PayPal proporcionadas permanecen exactamente en `.env`, ignorado por Git. No se copiaron a ejemplos ni documentación. No se borraron datos existentes; las pruebas de navegador y Sandbox agregan sus propios mandatos y transacciones.

## 2. Arquitectura, archivos y modelos

**Humano → compilador de intención → borrador → revisión y activación → propuesta de compra → motor determinista → aprobación si procede → PayPal AUTHORIZE → comprobación final → CAPTURE o VOID → recibo.**

| Componente           | Archivos principales                                                                  | Responsabilidad                                                        |
| -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Contratos y estados  | `src/lib/domain/schemas.ts`, `state-machine.ts`                                       | Zod estricto, dinero en centavos, transiciones permitidas              |
| IA                   | `src/lib/ai/policy-compiler.ts`, `shopping-agent.ts`                                  | Crear borradores y proponer IDs del catálogo                           |
| Política y riesgo    | `src/lib/policy/evaluate-purchase.ts`, `src/lib/risk/index.ts`                        | Decisiones deterministas y riesgo explicado                            |
| Flujos persistentes  | `src/lib/services/mandates.ts`, `purchases.ts`, `payments.ts`, `transaction-store.ts` | Versiones, reservas, aprobación, pagos y recibos                       |
| PayPal               | `src/lib/paypal/`                                                                     | OAuth, órdenes, autorización, captura, anulación, firma e idempotencia |
| HTTP y sesiones      | `src/lib/config.ts`, `src/lib/http.ts`, `src/lib/security/`                           | Configuración de ejecución, origen, sesión, límites y errores seguros  |
| Interfaz             | `src/components/`, `src/app/`                                                         | Mandatos, agente, AG Grid, aprobaciones, recibos y Attack Lab          |
| Datos                | `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`                        | PostgreSQL, migración y seed repetible                                 |
| Comprobación externa | `scripts/check-sandbox.mjs`                                                           | Orden real sin aprobar ni capturar por el comprador                    |

Modelos: `User`, `SpendingMandate`, `PolicyVersion`, `Agent`, `Merchant`, `Product`, `PurchaseRequest`, `Transaction`, `TransactionItem`, `PolicyDecision`, `HumanApproval`, `AuditEvent`, `PayPalOperation`, `DecisionReceipt` y `WebhookEvent`. IDs internos UUID, importes Decimal, identificadores externos únicos y restricciones únicas de operaciones/aprobaciones/webhooks.

## 3. Flujos implementados

**Compilador:** utiliza `AI_PROVIDER=ollama` y `OLLAMA_MODEL`; recibe JSON estructurado, valida con Zod y comprueba presupuesto/autonomía/umbrales. OpenAI requiere selección explícita. El parser solo funciona con `AI_PROVIDER=deterministic` y `DEMO_MODE=true`, etiquetado como DETERMINISTIC FALLBACK. Fallos del modelo no cambian de proveedor ni inventan valores. Guarda intención, modelo, política y versión como borrador; la activación requiere revisión humana. Límites no reconocidos necesitan aclaración; la revisión humana sigue siendo necesaria para todas las restricciones semánticas.

**Agente de compras:** utiliza el mismo proveedor local para seleccionar y explicar un ID existente del catálogo. Descripciones son datos no confiables; el mandato no cambia. La alternativa determinista requiere selección explícita y se etiqueta como fallback. El agente no tiene herramientas de pago, credenciales financieras ni acceso a mutaciones de estado financiero.

**Motor determinista:** verifica suma de partidas, presupuesto acumulado reservado/capturado, autonomía, moneda, cantidad acumulada, categoría, condición, tamaño/resolución/palabras requeridas, prohibiciones, comerciantes, precio, estado activo y versión. Un incumplimiento duro siempre bloquea; una compra sobre la autonomía y dentro del presupuesto exige aprobación. El riesgo no cambia esas reglas.

**Riesgo:** score 0–100 con contribuciones visibles y niveles LOW/MEDIUM/HIGH/CRITICAL. Contenido sospechoso, cambios de precio, comerciantes nuevos, extras y revisión humana añaden evidencia.

**Estados:** `DRAFT → POLICY_CHECKED → BLOCKED / REQUIRES_APPROVAL / PAYPAL_ORDER_CREATED`. La aprobación permite `APPROVED → PAYPAL_ORDER_CREATED`. Continúa por `PAYER_APPROVED → AUTHORIZED → FINAL_POLICY_CHECK → CAPTURED / VOIDED`; existen fallos controlados. Estados cerrados no permiten nueva captura; las repeticiones de acciones ya realizadas devuelven el registro sin repetir ejecución.

**Aprobación:** vincula usuario, fecha, importe, moneda, hash de la cotización y versión. Aprobar vuelve a evaluar; una política o cotización obsoleta no conserva permiso. Rechazar cierra la transacción.

**PayPal:** OAuth del servidor; orden `intent=AUTHORIZE`; aprobación alojada en Sandbox; recuperación y verificación de la orden; autorización; nueva evaluación del catálogo/mandato y de los importes autorizados; captura o anulación. Claves de operación estables y locks por mandato evitan ejecuciones concurrentes. Una URL de retorno no prueba aprobación. El historial simulado conserva su modo aunque se añadan credenciales reales.

**Attack Lab:** normal $537 → ALLOW; presupuesto $812 → BLOCK; garantías/cables → BLOCK; $675 → REQUIRE_APPROVAL; inyección y carrito $812 → BLOCK; $590→$675 exige aprobación y $590→$720 bloquea. Cada ejecución usa un mandato aislado confirmado y el mismo backend.

**Inyección:** descripciones de comerciantes delimitadas como datos no confiables, renderizadas como texto, con detección heurística explicada. Incluso si la detección falla, presupuesto y partidas no autorizadas siguen bloqueándose. No se promete detección perfecta.

**Seguridad:** secretos del servidor, validación Zod, comprobación de origen, sesión HMAC expirable, cookies HttpOnly/SameSite/Secure sobre HTTPS, ownership, locks, límites de petición y errores sin stacks. Webhooks verifican firma antes de cambiar datos, son idempotentes y no crean por sí solos una operación de captura autorizada.

**Auditoría y recibos:** eventos de creación/compilación/activación, propuesta/evaluación/bloqueo, revisión humana, PayPal y reconciliación. Sin endpoint de edición de eventos. El recibo conserva intención, política/versiones, propuesta, checks, violaciones, riesgo, intervención, identificadores y estados; se puede exportar JSON. La inmutabilidad es a nivel de aplicación, no frente a un administrador de la base.

## 4. Validación ejecutada

| Comprobación                                                     | Resultado                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install --ignore-scripts --no-audit --no-fund`              | Dependencias actualizadas respecto del lockfile; sin cambios necesarios                                                                     |
| `npm run db:setup`                                               | Cliente Prisma generado, sin migraciones pendientes, seed repetible, datos preservados                                                      |
| `npm run typecheck`                                              | Pasó                                                                                                                                        |
| `npm run lint`                                                   | Pasó sin advertencias                                                                                                                       |
| `npm test`                                                       | **112 pruebas, 10 archivos, todas pasaron**, con PostgreSQL real                                                                            |
| `npm run build`                                                  | Pasó; páginas y APIs solicitadas presentes                                                                                                  |
| `npx playwright install chromium`                                | Disponible                                                                                                                                  |
| `E2E_PRODUCTION=true E2E_PORT=3002 npm run test:e2e -- --headed` | **4 pruebas pasaron**: mandato→agente→captura simulada, inyección bloqueada, aprobación humana y móvil                                      |
| `npm run format:check`                                           | Pasó                                                                                                                                        |
| Inspección de bundles del navegador                              | 22 archivos JavaScript; secretos configurados ausentes                                                                                      |
| `npm run paypal:check`                                           | Orden real creada, repetición devuelve mismo ID, inyección bloqueada con cero operaciones de pago                                           |
| Aprobación del comprador y autorización/captura por backend      | **CAPTURED real en Sandbox por $537 USD**, con comprobación final de política y referencias verificadas en PayPal                           |
| Revisión Codex Security                                          | 109 archivos sustantivos; fixes inspeccionados, sin hallazgos altos/medios en el alcance revisado; limitación baja pendiente descrita abajo |

Las pruebas sustituyen los servicios externos, no la política, base, aprobación ni orquestación. Las primeras ejecuciones del navegador localizaron errores de etiquetas y diferencias de presentación/selectores; se corrigieron y la ejecución final pasó sin aumentar timeouts ni omitir pruebas.

## 5. Evidencia de PayPal real y configuración pendiente

Orden Sandbox real: **22G673728L3306907**, importe **$537 USD**, estado local y PayPal **CAPTURED**. Repetir creación devolvió la misma orden. Autorización **5S481085LL587635D**; captura **2US03005SE554815A**.

- [Recibo de la orden real](http://localhost:3000/transactions/1175c263-52c8-401d-8879-4eec121e6e5e).
- [Recibo del ataque bloqueado](http://localhost:3000/transactions/0be1d92f-73ef-40d7-a9ae-182debdce2fa): $812, extras/inyección, sin órdenes ni operaciones PayPal incluso tras intentar crear una.
- Evidencia local adicional en `.data/sandbox-validation.json`, ignorado por Git.

El comprador aprobó la orden en PayPal Sandbox. El backend recuperó y verificó la aprobación, autorizó el importe y registró `PAYPAL_AUTHORIZED`, `FINAL_POLICY_CHECK` y `PAYPAL_CAPTURED`. La respuesta final y el recibo confirman la captura real; la evidencia no depende únicamente de la URL de retorno. El flujo también pasó en simulación y en integración con PostgreSQL y el límite externo sustituido.

Variables soportadas: `DATABASE_URL`, `AI_PROVIDER`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID`, `NEXT_PUBLIC_APP_URL`, `DEMO_MODE`, `OPERATOR_PASSWORD`, `SESSION_SECRET`. `OPENAI_API_KEY` y `OPENAI_MODEL` son opcionales, únicamente para `AI_PROVIDER=openai`.

Configuración pendiente para publicación: **PAYPAL_WEBHOOK_ID, OPERATOR_PASSWORD, SESSION_SECRET**. `OPENAI_API_KEY` está vacía y no se necesita: el demo usa inferencia local real en Ollama y PayPal Sandbox real. Recepción de webhooks HTTPS y acceso protegido fuera del demo necesitan su configuración. Las credenciales de vendedor no equivalen al login del comprador.

## 6. Comandos y procedimiento local

No sobrescribas `.env`: ya tiene tus credenciales.

```powershell
npm install
# Terminal 1; usa este launcher O Docker, ambos escuchan en 54329.
npm run db:local
# Alternativa: docker compose up -d db

# Terminal 2
npm run db:setup
npm run build
npm start
```

Para desarrollo: `npm run dev`. Para validar, con la base encendida:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
$env:E2E_PRODUCTION = "true"
$env:E2E_PORT = "3002"
npm run test:e2e -- --headed
Remove-Item Env:E2E_PRODUCTION
Remove-Item Env:E2E_PORT
npm run format:check
```

El harness levanta su propio servidor **SIMULATED** y rechaza reutilizar uno con pagos reales. `E2E_PORT=3002` permite probar sin interrumpir el servidor Sandbox normal en 3000. Sin esa variable, detén el servidor normal antes de E2E y después vuelve a iniciar `npm start` para usar las credenciales de `.env`.

### Procedimiento exacto Sandbox

1. Inicia la app en `http://localhost:3000` con ambas credenciales y `PAYPAL_ENV=sandbox`. El modo debe mostrar **PAYPAL SANDBOX**.
2. El recibo real anterior ya está capturado y permite revisar la evidencia sin otro pago. Para repetir el proceso, ejecuta `npm run paypal:check` para crear una nueva orden de validación. Esa comprobación agrega registros nuevos.
3. En el recibo de la nueva orden pulsa **Approve in PayPal Sandbox**. Accede con una cuenta **Personal Sandbox** diferente del vendedor y aprueba los $537.
4. Vuelve al recibo y pulsa **Authorize & capture**. El servidor verifica aprobación y carrito, autoriza y ejecuta la comprobación final antes de capturar.
5. Verifica **CAPTURED**, IDs reales de autorización/captura y eventos `PAYPAL_AUTHORIZED`, `FINAL_POLICY_CHECK`, `PAYPAL_CAPTURED`. Si falla, conserva el error y estado; no asumas éxito.
6. Para webhooks reales registra el endpoint público HTTPS de la misma aplicación Sandbox y configura `PAYPAL_WEBHOOK_ID`; las firmas continúan siendo obligatorias.

## 7. Qué es real, límites y mejoras

Reales: inferencia local Ollama, PostgreSQL, Prisma, políticas, reservas, estados, aprobaciones, recibos, auditoría, OAuth y creación, autorización y captura Sandbox comprobadas. Deterministas sin IA: compilador/selector cuando se elige explícitamente el fallback. Simulados: pagos de E2E y seed etiquetado. Sandbox usa cuentas de prueba; no se ejecutó dinero de producción ni entrega de productos.

La revisión de seguridad conserva un hallazgo **bajo de disponibilidad**: el login del único operador comparte cinco intentos por minuto; solicitudes anónimas pueden agotar temporalmente esa cuota e impedir nuevos logins. No afecta sesiones existentes ni el demo local. Antes de publicar, configura límites por identidad de cliente obtenida de un proxy confiable y un almacén compartido; no confíes en IPs de headers arbitrarios. La revisión excluyó secretos, árboles de dependencias/advisories y la revisión completa del CSS decorativo; no equivale a certificación.

Otros límites: catálogo controlado, USD, un operador y un vendedor Sandbox receptor; sin impuestos/envíos, fulfillment, reembolsos iniciados por la app, onboarding o suscripciones. Órdenes abandonadas conservan reservas. Resultados de red/base ambiguos que superan la ventana de replay requieren reconciliación; faltan workers durables/outbox y expiración automática. La interpretación general de OpenAI sigue pendiente de una clave y validación con el modelo de la cuenta.

Prioridad antes de presentación: mantener Ollama/modelo precargados, configurar webhook HTTPS si se mostrará, preparar el comprador si repetirás el pago y verificar el tiempo de la demo. Ollama real y captura Sandbox están validados sin API pagada. Para evolución del producto: reconciliación durable, expiración de reservas, identidad/RBAC, rate limits distribuidos y evidencia de cotizaciones de comerciantes.

## 8. Demo de tres minutos

| Tiempo    | Acción                                                                                 |
| --------- | -------------------------------------------------------------------------------------- |
| 0:00–0:20 | Landing y separación IA → política → PayPal                                            |
| 0:20–0:50 | Crear mandato inglés $700/$600, generar borrador, revisar y activar                    |
| 0:50–1:15 | Agente: tres Monitor Alpha, $537, ALLOW y checks                                       |
| 1:15–1:45 | Orden/compra Sandbox con comprador preparado, o captura SIMULATED claramente anunciada |
| 1:45–2:15 | Attack Lab E: $812, garantía/cables, BLOCKED y PAYPAL NOT EXECUTED                     |
| 2:15–2:40 | Lab D: $675, aprobación/rechazo y evento de auditoría                                  |
| 2:40–3:00 | Dashboard, filtro de bloqueos y recibo con evidencia                                   |

Capturas: [landing](screenshots/landing.png), [dashboard](screenshots/dashboard.png), [Attack Lab](screenshots/attack-lab.png), [recibo Sandbox](screenshots/sandbox-receipt.png), [móvil](screenshots/mobile.png). El recibo Sandbox fotografiado muestra la captura real de $537 y sus referencias.
