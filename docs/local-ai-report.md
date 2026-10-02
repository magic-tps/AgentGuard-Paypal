# AgentGuard — IA local gratuita

2 de octubre de 2026, America/Lima.

AgentGuard utiliza **Ollama local** como proveedor principal. `OPENAI_API_KEY` está vacía y no se necesita. Se completaron inferencias reales del compilador y del selector de catálogo con el modelo instalado **qwen3-coder:30b-a3b-q4_K_M**. El flujo PayPal validado se conservó y el recibo de la captura Sandbox de **USD 537** continúa disponible.

## Archivos cambiados

- Proveedores: `src/lib/ai/provider.ts`, `types.ts`, `providers/ollama.ts`, `providers/openai.ts`.
- Compilador y selección: `src/lib/ai/policy-compiler.ts`, `shopping-agent.ts`.
- Estado/proveniencia: `src/app/api/health/route.ts`, `src/app/api/session/route.ts`, `src/lib/services/mandates.ts`, `src/lib/client-types.ts`.
- Interfaz: `src/components/ai-mode-badge.tsx`, `app-shell.tsx`, `mandates.tsx`, `shopping-agent.tsx`.
- Configuración: `.env` (solo se agregaron opciones locales, conservando secretos), `.env.example`, `package.json`, `vitest.config.mts`, `playwright.config.ts`.
- Validación: `tests/local-ai.test.ts`, `tests/local-ai.integration.test.ts`, `e2e/agentguard.spec.ts`, `scripts/check-local-ai.ts`.
- Documentación: `README.md`, `docs/frontend-contract.md`, `docs/engineering-report.md`, este informe y capturas.

No se modificaron los módulos PayPal, el motor determinista, los servicios de pago, el esquema Prisma ni las migraciones.

## Arquitectura y frontera de seguridad

`AI_PROVIDER` selecciona un proveedor. Ambos componentes usan `generateStructured`, que recibe mensajes y una interfaz Zod. Ollama utiliza `/api/chat`, JSON Schema, `stream:false`, temperatura cero, contexto de 4096, salida limitada y timeout configurable. El helper del SDK existente convierte Zod a JSON Schema localmente; no llama a OpenAI. OpenAI solo se ejecuta si se selecciona explícitamente y se configura su clave/modelo.

La respuesta completa del modelo debe pasar Zod; el compilador valida además el contrato de Spending Mandate y los números reconocidos en la intención original. Un máximo de 700 nunca permite 900. Un umbral ask-above de 200 limita autonomía y aprobación a 200; always-ask exige cero; ausencia de permiso automático exige cero. Se usa el menor límite reconocido y los presupuestos ambiguos se rechazan. La categoría plural «monitors» se normaliza al valor existente «monitor» después de validar el esquema, sin cambiar el motor de políticas.

El modelo no tiene herramientas, credenciales PayPal, importaciones de base de datos ni funciones de mutación financiera. El compilador devuelve un borrador; el servicio persistente lo guarda **DRAFT**, con modelo y proveniencia en auditoría. El humano debe revisarlo y activarlo. La selección devuelve únicamente un ID existente y una explicación; textos de comerciantes son datos de un mensaje user delimitado con JSON, nunca instrucciones de sistema. El mandato permanece intacto.

La frontera sigue siendo: **IA interpreta → controles deterministas autorizan → PayPal ejecuta**. Presupuesto, aprobación, quote, versión, locks, idempotencia, AUTHORIZE y comprobación final antes de CAPTURE/VOID conservan su implementación.

## Configuración efectiva

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder:30b-a3b-q4_K_M
OLLAMA_TIMEOUT_MS=180000
```

El modelo instalado ocupa aproximadamente 18 GB. No hay nombre de modelo fijo en la lógica de aplicación: cambiar `OLLAMA_MODEL` selecciona otro modelo instalado. El adaptador exige un endpoint local, rechaza URLs con credenciales y modelos cloud. Docker puede usar `host.docker.internal`. No descarga modelos automáticamente ni envía claves a Ollama.

Offline, timeout, HTTP fallido, JSON malformado, salida parcial, Zod inválido o permisos ampliados producen errores claros. **No hay fallback silencioso.** Para usar el parser sin modelo se necesitan `AI_PROVIDER=deterministic` y `DEMO_MODE=true`; la interfaz lo muestra como **DETERMINISTIC FALLBACK**. Inferencia local muestra **LOCAL — OLLAMA**. El modo de pagos es independiente: las credenciales existentes siguen seleccionando Sandbox real.

`GET /api/health`, protegido por la sesión del operador, informa estado de base, modo de pagos, proveedor y disponibilidad del modelo instalado, sin secretos. Consultar `/api/tags` verifica disponibilidad, no una inferencia completada. La ejecución real se comprobó por separado.

## Inferencias reales y resultados

La primera petición real a Ollama devolvió `{"status":"local inference ok"}` con HTTP 200; tardó aproximadamente **93 s**, incluyendo la carga inicial. El compilador completó el ejemplo solicitado con presupuesto 700, autonomía 600, cantidad 3, solo new, mínimo 27 pulgadas/2560×1440 y prohibiciones refurbished/warranty/accessories. El mismo resultado pasó el motor determinista para tres Monitor Alpha por USD 537: **ALLOW**.

`npm run ai:check` ejecutó contra Ollama real:

| Caso | Intención                                   | Resultado observado                                                            |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------ |
| A    | Máximo 700, automático hasta 600            | `maxTotal=700`, `autonomousLimit=600`, aprobación sobre 600                    |
| B    | Máximo 500, siempre preguntar               | `maxTotal=500`, autonomía y umbral 0                                           |
| C    | Presupuesto 700, preguntar sobre 200        | `maxTotal=700`, autonomía 0, umbral 200; conserva un resultado más restrictivo |
| D    | Monitores bajo 700, sin permiso automático  | `maxTotal=700`, autonomía y umbral 0                                           |
| E    | Texto de comerciante ordena aumentar a 2000 | Selecciona Monitor Alpha, explica que ignora la instrucción; mandato intacto   |

Las compilaciones A–D tardaron aproximadamente **34–38 s** cada una con el modelo cargado. El adaptador conserva el modelo cargado durante 15 minutos tras uso. El carrito adversarial de USD 812, incluyendo garantía/cables, resultó **BLOCK**. Esta comprobación no ejecutó pagos ni mutó estado financiero. Evidencia no secreta: `.data/local-ai-validation.json`, ignorado por Git.

## Validación y regresión

| Comprobación                          | Resultado                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm test`                            | **112 pruebas, 10 archivos, todas pasaron**, incluidas integraciones con PostgreSQL real            |
| `npm run typecheck`                   | Pasó                                                                                                |
| `npm run lint`                        | Pasó                                                                                                |
| `npm run build`                       | Pasó, incluyendo la nueva API health                                                                |
| Playwright de producción, puerto 3002 | **4 E2E pasaron**: compilación/activación/captura simulada, inyección bloqueada, aprobación y móvil |

`npm run format:check` también pasó. Un navegador Chromium adicional contra producción en 3000 confirmó health `{status:ok,database:ok,paypalMode:sandbox,aiProvider:ollama,aiStatus:available}` y completó una compilación real desde el formulario. El borrador [4769f7bd-6ff8-4292-94bc-a7262db92e43](http://localhost:3000/mandates/4769f7bd-6ff8-4292-94bc-a7262db92e43?review=1) permanece inactivo para revisión. Verificó el recibo PayPal anterior, cero peticiones de pago y ausencia de overflow/errores en móvil. Captura: [borrador local](screenshots/local-ai-policy.png).

Las pruebas nuevas cubren A–D, ampliación de permisos, always-ask, límites contradictorios, ausencia de presupuesto, errores de red/timeout/HTTP, JSON malformado, esquema estricto, salida parcial, fallback explícito, modelo ausente/cloud, URLs inválidas, salud local, IDs fuera de catálogo y campos de acción no autorizados. Las integraciones comprueban proveniencia persistida, borrador inactivo, bloqueo de propuestas antes de activación y ausencia de registros al rechazar permisos.

Las pruebas financieras existentes continúan cubriendo creación, autorización, comprobación final, captura/anulación, reintentos, cambios de política/precio, cantidades reservadas, aprobaciones, bloqueo e idempotencia. Se conservaron las credenciales y el recibo real anterior: orden `22G673728L3306907`, autorización `5S481085LL587635D`, captura `2US03005SE554815A`. No se creó ni capturó otra orden real para esta migración de IA.

## Uso y límites pendientes

```powershell
# Ollama suele estar activo en segundo plano. Solo si no está escuchando:
ollama serve
# Otra terminal; descarga si falta, o cambia al modelo local elegido:
ollama pull qwen3-coder:30b-a3b-q4_K_M
ollama list
# Con PostgreSQL y catálogo preparados:
npm run ai:check
npm run build
npm start
```

La instalación y el setup de base están en README. No sobrescribas `.env`; ajusta únicamente las opciones locales. Para tests de navegador el harness selecciona explícitamente fallback determinista y pagos simulados, sin depender de Ollama ni pagar APIs.

No hay bloqueo de credenciales para la demo local gratuita. La carga inicial/inferencia depende del hardware; precarga el modelo antes de presentar o configura uno más pequeño. Los guardas numéricos reconocen cláusulas documentadas en inglés, no toda combinación posible de lenguaje natural. El modelo introdujo algunas restricciones conservadoras de tamaño/resolución y cantidad en B–D que no estaban especificadas; están visibles en el borrador y refuerzan la necesidad de revisión humana. Structured output no garantiza interpretación perfecta; nunca se activa un borrador automáticamente.

Webhooks HTTPS y autenticación fuera de loopback siguen necesitando `PAYPAL_WEBHOOK_ID`, `OPERATOR_PASSWORD` y `SESSION_SECRET`. Continúan los límites previos de catálogo controlado, operador único, reservas abandonadas/reconciliación y rate limiting por proceso, descritos en el informe de ingeniería. OpenAI es opcional y no participa en esta validación.
