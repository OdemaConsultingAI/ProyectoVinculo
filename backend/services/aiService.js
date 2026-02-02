/**
 * Servicio de IA: Whisper (transcripción) + GPT-4o-mini (extracción por entidad).
 * Prompts modulares en backend/prompts/ (gestos.txt, momentos.txt, desahogo.txt).
 * Todas las llamadas GPT usan response_format: json_object para evitar fallos de parseo.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');

const PROMPTS_DIR = path.join(__dirname, '..', 'prompts');

/** Fecha actual en ISO YYYY-MM-DD para inyectar en prompts (mañana, próximo lunes, etc.). */
function getCurrentDateISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Día de la semana en español (lunes, martes, ...) para resolver "el próximo lunes", "este viernes", etc. */
function getCurrentWeekdaySpanish() {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return days[new Date().getDay()];
}

/**
 * Lee un prompt desde backend/prompts/ y reemplaza {{CURRENT_DATE}} y {{CURRENT_WEEKDAY}}.
 * @param {string} filename - ej. 'gestos.txt', 'momentos.txt'
 * @returns {string}
 */
function readPrompt(filename) {
  const filePath = path.join(PROMPTS_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8').trim();
      content = content.replace(/\{\{CURRENT_DATE\}\}/g, getCurrentDateISO());
      content = content.replace(/\{\{CURRENT_WEEKDAY\}\}/g, getCurrentWeekdaySpanish());
      return content;
    }
  } catch (e) {
    console.warn('No se pudo leer prompt', filename, e?.message);
  }
  return '';
}

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

/** Ruta del prompt legacy (voice-to-action) para endpoint que expone el texto. */
const PROMPT_FILE_VOICE = path.join(PROMPTS_DIR, 'voice-to-action.txt');

/**
 * Lee el prompt legacy voice-to-action (para compatibilidad con endpoint que lo expone).
 * @returns {string}
 */
function getVoicePrompt() {
  try {
    if (fs.existsSync(PROMPT_FILE_VOICE)) {
      return fs.readFileSync(PROMPT_FILE_VOICE, 'utf8').trim();
    }
  } catch (e) {
    console.warn('No se pudo leer prompt voice-to-action:', e?.message);
  }
  return readPrompt('gestos.txt') || 'Prompt no disponible.';
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
 * Extrae datos de una TAREA FUTURA (agenda). Si el texto no es una tarea futura, devuelve null.
 * Usa prompt backend/prompts/gestos.txt y response_format json_object.
 * @param {string} texto - Texto transcrito
 * @param {string[]} nombresContactos - Nombres de contactos para desambiguar
 * @returns {Promise<{ vinculo: string, clasificacion: string, fecha: string, hora: string, usage?: object } | null>}
 */
async function extractGesto(texto, nombresContactos = []) {
  const systemContent = readPrompt('gestos.txt');
  if (!systemContent) {
    console.warn('Prompt gestos.txt vacío; usando fallback.');
  }
  const listaNombres = nombresContactos.length
    ? `Contactos (usa uno si aplica): ${nombresContactos.join(', ')}.`
    : '';
  const userContent = `${listaNombres}\n\nTexto: "${(texto || '').trim().slice(0, 1500)}"`;

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent || 'Extraes tareas futuras. Responde solo JSON con esTarea, vinculo, clasificacion, fecha, hora.' },
      { role: 'user', content: userContent }
    ],
    temperature: 0.2,
    max_tokens: 256,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (parsed.esTarea === false) return null;

  const hoy = getCurrentDateISO();
  let fecha = typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : hoy;
  if (fecha < hoy) fecha = hoy;

  const clasificacionRaw = typeof parsed.clasificacion === 'string' ? parsed.clasificacion.trim() : 'Otro';
  const clasificacionNormalized = getDisplayPart(clasificacionRaw);
  const clasificacion = TIPOS_DE_GESTO_DISPLAY.includes(clasificacionNormalized) ? clasificacionNormalized : 'Otro';

  let hora = typeof parsed.hora === 'string' ? parsed.hora.trim() : '09:00';
  const horaMatch = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (horaMatch) {
    const h = Math.min(23, Math.max(0, parseInt(horaMatch[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(horaMatch[2], 10)));
    hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else {
    hora = '09:00';
  }

  return {
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    clasificacion,
    fecha,
    hora,
    usage: completion.usage || null
  };
}

/**
 * @deprecated Usar extractGesto (gesto) o extractMomento (momento). Mantenido para compatibilidad.
 */
async function extractVoiceAction(texto, nombresContactos = []) {
  const gesto = await extractGesto(texto, nombresContactos);
  const hoy = getCurrentDateISO();
  if (!gesto) {
    return {
      tipo: 'interacción',
      vinculo: 'Sin asignar',
      tarea: '',
      descripcion: (texto || '').trim().slice(0, 500),
      fecha: hoy,
      hora: '09:00',
      clasificacion: 'Otro',
      usage: null
    };
  }
  return {
    tipo: 'tarea',
    vinculo: gesto.vinculo,
    tarea: '',
    descripcion: (texto || '').trim().slice(0, 500),
    fecha: gesto.fecha,
    hora: gesto.hora,
    clasificacion: gesto.clasificacion,
    usage: gesto.usage
  };
}

/** Etiquetas emocionales (Momentos y Desahogo). */
const ETIQUETAS_EMOCIONALES = ['Calma', 'Estrés', 'Gratitud', 'Tristeza', 'Alegre', 'Depresivo'];

/**
 * Extrae de un texto que describe algo que YA PASÓ (momento/interacción): vínculo, fecha, hora y emocion.
 * Usa prompt backend/prompts/momentos.txt y response_format json_object.
 * @param {string} texto - Texto transcrito
 * @param {string[]} nombresContactos - Nombres de contactos para desambiguar
 * @returns {Promise<{ tipo: 'interacción', vinculo: string, fecha: string, hora: string, emocion: string, descripcion: string, usage?: object }>}
 */
async function extractMomento(texto, nombresContactos = []) {
  const systemContent = readPrompt('momentos.txt');
  const listaNombres = nombresContactos.length
    ? `Contactos (usa uno si aplica): ${nombresContactos.join(', ')}.`
    : '';
  const userContent = `${listaNombres}\n\nTexto: "${(texto || '').trim().slice(0, 1500)}"`;

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent || 'Extraes quién, cuándo y emoción de momentos pasados. Responde solo JSON con vinculo, fecha, hora, emocion.' },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    max_tokens: 256,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = { vinculo: 'Sin asignar', fecha: getCurrentDateISO(), hora: '09:00', emocion: 'Calma' };
  }

  const hoy = getCurrentDateISO();
  const fecha = typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : hoy;
  let hora = typeof parsed.hora === 'string' ? parsed.hora.trim() : '09:00';
  const horaMatch = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (horaMatch) {
    const h = Math.min(23, Math.max(0, parseInt(horaMatch[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(horaMatch[2], 10)));
    hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } else {
    hora = '09:00';
  }

  const emocionRaw = typeof parsed.emocion === 'string' ? parsed.emocion.trim() : 'Calma';
  const emocion = ETIQUETAS_EMOCIONALES.includes(emocionRaw) ? emocionRaw : 'Calma';

  return {
    tipo: 'interacción',
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    fecha,
    hora,
    emocion,
    descripcion: (texto || '').trim().slice(0, 500),
    usage: completion.usage || null
  };
}

/**
 * Extrae emoción predominante de un texto de desahogo (Mi Refugio).
 * Usa prompt backend/prompts/desahogo.txt y response_format json_object.
 * @param {string} texto - Texto transcrito del desahogo
 * @returns {Promise<{ emotion: string, usage?: object }>}
 */
async function extractDesahogo(texto) {
  const systemContent = readPrompt('desahogo.txt');
  const userContent = `Texto: "${(texto || '').trim().slice(0, 2000)}"`;

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: MODEL_VOICE,
    messages: [
      { role: 'system', content: systemContent || 'Clasificas emoción. Responde solo JSON: {"emotion":"Calma|Estrés|Gratitud|Tristeza|Alegre|Depresivo"}' },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    max_tokens: 64,
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = { emotion: 'Calma' };
  }

  const emotionRaw = typeof parsed.emotion === 'string' ? parsed.emotion.trim() : 'Calma';
  const emotion = ETIQUETAS_EMOCIONALES.includes(emotionRaw) ? emotionRaw : 'Calma';

  return {
    emotion,
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
  getCurrentDateISO,
  readPrompt,
  extractGesto,
  extractVoiceAction,
  extractMomento,
  extractDesahogo,
  getEspejoSummary,
  calcCostFromUsage,
  TIPOS_DE_GESTO_FULL,
  TIPOS_DE_GESTO_DISPLAY,
  getDisplayPart,
  ETIQUETAS_EMOCIONALES,
  MODEL_VOICE,
  LIMITE_PETICIONES_GRATIS,
  COSTE_ESTIMADO_POR_PETICION_USD
};
