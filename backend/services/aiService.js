/**
 * Servicio de IA: Whisper (transcripción) + GPT-4o-mini (clasificación interacción vs tarea).
 * Uso low-cost: ~$0.006/min Whisper + ~$0.001 por petición GPT-4o-mini.
 * El prompt de clasificación se lee de backend/prompts/voice-to-action.txt (editable).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
/** Límite diario de consultas de IA (notas de voz) para usuarios Free. Premium sin límite. */
const LIMITE_PETICIONES_GRATIS = 10;
const COSTE_ESTIMADO_POR_PETICION_USD = 0.001;

/** Precios por millón de tokens para gpt-4o-mini (USD). Fuente: platform.openai.com/docs/pricing */
const PRECIO_INPUT_PER_MILLION = 0.15;
const PRECIO_OUTPUT_PER_MILLION = 0.60;

/** Modelo fijo para voz → clasificación/extracción (bajo costo). */
const MODEL_VOICE = 'gpt-4o-mini';

/**
 * Calcula el coste en USD de una llamada a GPT según tokens de entrada y salida.
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @returns {number} Coste en USD
 */
function calcCostFromUsage(promptTokens = 0, completionTokens = 0) {
  const inputCost = (Number(promptTokens) / 1e6) * PRECIO_INPUT_PER_MILLION;
  const outputCost = (Number(completionTokens) / 1e6) * PRECIO_OUTPUT_PER_MILLION;
  return inputCost + outputCost;
}

function getClient() {
  if (!OPENAI_API_KEY || !OPENAI_API_KEY.trim()) {
    throw new Error('OPENAI_API_KEY no configurado');
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY.trim() });
}

/**
 * Transcribe audio a texto con Whisper (modelo whisper-1).
 * En Node el SDK requiere un stream o path; usamos archivo temporal + createReadStream.
 * @param {Buffer} audioBuffer - Buffer del archivo de audio (m4a, mp3, etc.)
 * @param {string} [mimeType] - Tipo MIME, ej. 'audio/mp4', 'audio/mpeg'
 * @returns {Promise<string>} Texto transcrito
 */
async function transcribe(audioBuffer, mimeType = 'audio/mp4') {
  const extension = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'm4a';
  const tmpPath = path.join(os.tmpdir(), `whisper-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
  let stream;
  try {
    fs.writeFileSync(tmpPath, audioBuffer);
    stream = fs.createReadStream(tmpPath);
    const client = getClient();
    const transcription = await client.audio.transcriptions.create({
      file: stream,
      model: 'whisper-1',
      response_format: 'text'
    });
    return typeof transcription === 'string' ? transcription : (transcription.text || '');
  } finally {
    try {
      if (stream && typeof stream.destroy === 'function') stream.destroy();
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (e) {
      // ignorar errores al limpiar
    }
  }
}

/**
 * Extrae de un texto libre: vínculo (nombre contacto), tarea y fecha.
 * Usa GPT-4o-mini y devuelve JSON: { vinculo, tarea, fecha (YYYY-MM-DD) }.
 * @param {string} texto - Texto transcrito (ej. "Recordar comprarle el libro de arte a Juan para el viernes")
 * @param {string[]} nombresContactos - Nombres de contactos del usuario para desambiguar
 * @returns {Promise<{ vinculo: string, tarea: string, fecha: string }>}
 */
async function textToTask(texto, nombresContactos = []) {
  const client = getClient();
  const listaNombres = nombresContactos.length
    ? `Lista de nombres de contactos del usuario (usa uno de estos si aplica): ${nombresContactos.join(', ')}.`
    : '';

  const systemContent = `Eres un asistente que convierte notas de voz en tareas para una app de contactos.
Devuelves ÚNICAMENTE un JSON válido, sin markdown ni texto extra, con exactamente estas claves:
- "vinculo": nombre del contacto o vínculo (string). Si no se menciona, usa "Sin asignar".
- "tarea": descripción breve de la tarea (string).
- "fecha": fecha en formato YYYY-MM-DD. Si no se menciona fecha, usa la de hoy. Para "mañana", "el viernes", etc., calcula la fecha correcta.`;

  const userContent = `${listaNombres}

Texto del usuario: "${texto}"

Responde solo con el JSON, ejemplo: {"vinculo":"Juan","tarea":"Comprar libro de arte","fecha":"2026-02-05"}`;

  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ],
    temperature: 0.2,
    max_tokens: 256
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = { vinculo: 'Sin asignar', tarea: texto || 'Tarea desde voz', fecha: new Date().toISOString().slice(0, 10) };
  }

  const usage = completion.usage || null;
  return {
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    tarea: typeof parsed.tarea === 'string' ? parsed.tarea.trim() : (texto || 'Tarea desde voz'),
    fecha: typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : new Date().toISOString().slice(0, 10),
    usage
  };
}

/**
 * Flujo completo: audio → transcripción → extracción → { texto, vinculo, tarea, fecha }.
 */
async function voiceToTaskStructured(audioBuffer, mimeType, nombresContactos = []) {
  const texto = await transcribe(audioBuffer, mimeType);
  if (!texto || !texto.trim()) {
    return { texto: '', vinculo: 'Sin asignar', tarea: 'Tarea desde voz', fecha: new Date().toISOString().slice(0, 10), usage: null };
  }
  const extracted = await textToTask(texto, nombresContactos);
  const { usage } = extracted;
  return { texto: texto.trim(), vinculo: extracted.vinculo, tarea: extracted.tarea, fecha: extracted.fecha, usage };
}

/** Ruta del archivo de prompt (editable). */
const PROMPT_FILE = path.join(__dirname, '..', 'prompts', 'voice-to-action.txt');

const DEFAULT_VOICE_PROMPT = `Eres un asistente que analiza notas de voz y determina si son una INTERACCIÓN (algo que ya ocurrió) o una TAREA (algo a agendar).
Devuelves ÚNICAMENTE un JSON válido con: "tipo" ("interacción"|"tarea"), "vinculo", "tarea", "descripcion", "fecha" (YYYY-MM-DD).`;

/**
 * Lee el prompt de clasificación desde backend/prompts/voice-to-action.txt.
 * Si el archivo no existe o falla la lectura, devuelve el prompt por defecto.
 * @returns {string}
 */
function getVoicePrompt() {
  try {
    if (fs.existsSync(PROMPT_FILE)) {
      return fs.readFileSync(PROMPT_FILE, 'utf8').trim() || DEFAULT_VOICE_PROMPT;
    }
  } catch (e) {
    console.warn('No se pudo leer prompt voice-to-action:', e?.message);
  }
  return DEFAULT_VOICE_PROMPT;
}

/**
 * Lista completa de Tipos de Gesto para la IA.
 * Lo que está entre paréntesis no se muestra en el filtro de la app; toda la lista se pasa al prompt para clasificar.
 * Al guardar se usa solo la parte antes del paréntesis (clave de filtro).
 */
const TIPOS_DE_GESTO_FULL = [
  'Llamar (para felicitar)',
  'Visitar (en persona)',
  'Enviar mensaje',
  'Cumpleaños',
  'Regalo',
  'Evento',
  'Otro'
];

/** Parte visible en filtro/chips: texto antes del primer " (" o toda la cadena. */
function getDisplayPart(full) {
  if (typeof full !== 'string' || !full.trim()) return 'Otro';
  const idx = full.indexOf(' (');
  return idx > 0 ? full.slice(0, idx).trim() : full.trim();
}

/** Lista solo para mostrar en filtro (sin paréntesis). Usada también para validar valor guardado. */
const TIPOS_DE_GESTO_DISPLAY = TIPOS_DE_GESTO_FULL.map(getDisplayPart);

/**
 * Clasifica la nota de voz en interacción o tarea y extrae datos.
 * Usa siempre el modelo GPT-4o-mini y el prompt de voice-to-action.txt.
 * La lista completa TIPOS_DE_GESTO_FULL se inyecta en el mensaje para que la IA clasifique; al guardar se normaliza a la parte sin paréntesis.
 * @param {string} texto - Texto transcrito
 * @param {string[]} nombresContactos - Nombres de contactos del usuario para desambiguar
 * @returns {Promise<{ tipo: 'interacción'|'tarea', vinculo: string, tarea: string, descripcion: string, fecha: string, clasificacion: string }>}
 */
async function extractVoiceAction(texto, nombresContactos = []) {
  const client = getClient();
  const systemContent = getVoicePrompt();
  const listaNombres = nombresContactos.length
    ? `Lista de nombres de contactos del usuario (usa uno de estos si aplica): ${nombresContactos.join(', ')}.`
    : '';
  const listaClasificacion = `Opciones de clasificacion (devuelve exactamente UNA de estas cadenas, tal cual): ${TIPOS_DE_GESTO_FULL.join(', ')}.`;
  const userContent = `${listaNombres}
${listaClasificacion}

Texto transcrito: "${texto}"

Responde solo con el JSON de 5 claves: tipo, vinculo, clasificacion, fecha, hora (HH:mm 24h). No resumas ni reescribas el texto; solo clasifica (tipo de gesto, contacto, fecha). La transcripción se guarda completa tal cual.`;

  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    max_tokens: 256
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = {
      tipo: 'tarea',
      vinculo: 'Sin asignar',
      fecha: new Date().toISOString().slice(0, 10),
      clasificacion: 'Otro',
      hora: '09:00',
      descripcion: ''
    };
  }

  const tipo = (parsed.tipo === 'interacción' || parsed.tipo === 'interaccion') ? 'interacción' : 'tarea';
  const hoy = new Date().toISOString().slice(0, 10);
  let fecha = typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : hoy;
  // Para tareas, nunca devolver fecha pasada (gestos son para el futuro)
  if (tipo === 'tarea' && fecha < hoy) fecha = hoy;

  const clasificacionRaw = typeof parsed.clasificacion === 'string' ? parsed.clasificacion.trim() : 'Otro';
  const clasificacionNormalized = getDisplayPart(clasificacionRaw);
  const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(clasificacionNormalized) ? clasificacionNormalized : 'Otro';

  // Hora en HH:mm (24h). Validar formato; si no viene o es inválido, "09:00"
  let hora = typeof parsed.hora === 'string' ? parsed.hora.trim() : '09:00';
  const horaMatch = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (horaMatch) {
    const h = Math.min(23, Math.max(0, parseInt(horaMatch[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(horaMatch[2], 10)));
    hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else {
    hora = '09:00';
  }

  const descripcion = typeof parsed.descripcion === 'string' ? parsed.descripcion.trim().slice(0, 500) : '';

  const usage = completion.usage || null;
  return {
    tipo,
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    tarea: '',
    descripcion,
    fecha,
    hora,
    clasificacion,
    usage
  };
}

/** Etiquetas emocionales para Mi Refugio (desahogo). */
const ETIQUETAS_DESAHOGO = ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'];

/**
 * Extrae emoción predominante y frase reflexiva de un texto de desahogo.
 * No crea tareas ni gestos; solo valida la emoción del usuario.
 * @param {string} texto - Texto transcrito del desahogo
 * @returns {Promise<{ emotion: string, resumenReflexivo: string, usage?: object }>}
 */
async function extractDesahogo(texto) {
  const client = getClient();
  const systemContent = `Eres un asistente de bienestar. Analizas notas de voz personales (desahogos) con empatía, sin juzgar.
Tu ÚNICA tarea: clasificar la emoción predominante del texto (triste, alegre, estresado, calmado, agradecido, depresivo, etc.). No resumas, no reescribas, no modifiques el contenido. Solo devuelves la etiqueta emocional.
Devuelves ÚNICAMENTE un JSON con UNA clave:
- "emotion": exactamente UNA de: Calma, Estrés, Gratitud, Tristeza, Alegre, Depresivo`;

  const userContent = `Texto del usuario (solo para clasificar emoción; no lo resumas): "${(texto || '').trim().slice(0, 2000)}"

Responde solo con el JSON, sin markdown. Ejemplo: {"emotion":"Alegre"}`;

  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    max_tokens: 150
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    parsed = { emotion: 'Calma', resumenReflexivo: '' };
  }

  const emotionRaw = typeof parsed.emotion === 'string' ? parsed.emotion.trim() : 'Calma';
  const emotion = ETIQUETAS_DESAHOGO.includes(emotionRaw) ? emotionRaw : 'Calma';

  return {
    emotion,
    resumenReflexivo: '', // No se usa: la transcripción se muestra completa; la IA solo clasifica emoción
    usage: completion.usage || null
  };
}

/**
 * El Espejo: resumen breve del estado de ánimo de la semana (últimos 7 días de desahogos).
 * Sin juzgar; tono cálido y validante.
 * @param {Array<{ emotion: string, resumenReflexivo?: string }>} desahogos - Lista de desahogos de la semana
 * @returns {Promise<string>} Una frase breve (máx. ~120 caracteres)
 */
async function getEspejoSummary(desahogos) {
  if (!desahogos || desahogos.length === 0) {
    return '';
  }
  const client = getClient();
  const resumen = desahogos
    .map((d) => `- ${d.emotion || 'Calma'}${d.resumenReflexivo ? `: ${d.resumenReflexivo.slice(0, 80)}` : ''}`)
    .join('\n');
  const systemContent = `Eres un espejo empático. Recibes una lista de emociones y frases de alguien durante su semana.
Tu tarea: escribe UNA sola frase breve (máx. 120 caracteres) que resuma su estado de ánimo general de la semana.
Tono: cálido, validante, sin juzgar. No des consejos ni tareas. Ejemplo: "Esta semana se notó un vaivén entre calma y gratitud."`;

  const userContent = `Resumen de la semana:\n${resumen}\n\nResponde solo con esa frase, sin comillas ni explicaciones.`;

  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent }
    ],
    temperature: 0.5,
    max_tokens: 80
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '';
  return raw.slice(0, 200);
}

module.exports = {
  transcribe,
  textToTask,
  voiceToTaskStructured,
  getVoicePrompt,
  extractVoiceAction,
  extractDesahogo,
  getEspejoSummary,
  calcCostFromUsage,
  TIPOS_DE_GESTO_FULL,
  TIPOS_DE_GESTO_DISPLAY,
  getDisplayPart,
  MODEL_VOICE,
  LIMITE_PETICIONES_GRATIS,
  COSTE_ESTIMADO_POR_PETICION_USD
};
