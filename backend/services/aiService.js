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

/** Modelo fijo para voz → clasificación/extracción (bajo costo). */
const MODEL_VOICE = 'gpt-4o-mini';

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

  return {
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    tarea: typeof parsed.tarea === 'string' ? parsed.tarea.trim() : (texto || 'Tarea desde voz'),
    fecha: typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : new Date().toISOString().slice(0, 10)
  };
}

/**
 * Flujo completo: audio → transcripción → extracción → { texto, vinculo, tarea, fecha }.
 */
async function voiceToTaskStructured(audioBuffer, mimeType, nombresContactos = []) {
  const texto = await transcribe(audioBuffer, mimeType);
  if (!texto || !texto.trim()) {
    return { texto: '', vinculo: 'Sin asignar', tarea: 'Tarea desde voz', fecha: new Date().toISOString().slice(0, 10) };
  }
  const extracted = await textToTask(texto, nombresContactos);
  return { texto: texto.trim(), ...extracted };
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

/** Categorías de tarea permitidas (deben coincidir con la app). */
const CLASIFICACIONES_TAREA = ['Llamar', 'Visitar', 'Enviar mensaje', 'Cumpleaños', 'Otro'];

/**
 * Clasifica la nota de voz en interacción o tarea y extrae datos.
 * Usa siempre el modelo GPT-4o-mini y el prompt de voice-to-action.txt.
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
  const userContent = `${listaNombres}

Texto transcrito: "${texto}"

Responde solo con el JSON de 4 claves: tipo, vinculo, clasificacion, fecha. No reescribas el texto.`;

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
      clasificacion: 'Otro'
    };
  }

  const tipo = (parsed.tipo === 'interacción' || parsed.tipo === 'interaccion') ? 'interacción' : 'tarea';
  const hoy = new Date().toISOString().slice(0, 10);
  const clasificacionRaw = typeof parsed.clasificacion === 'string' ? parsed.clasificacion.trim() : 'Otro';
  const clasificacion = CLASIFICACIONES_TAREA.includes(clasificacionRaw) ? clasificacionRaw : 'Otro';

  return {
    tipo,
    vinculo: typeof parsed.vinculo === 'string' ? parsed.vinculo.trim() : 'Sin asignar',
    tarea: '',
    descripcion: '',
    fecha: typeof parsed.fecha === 'string' ? parsed.fecha.trim().slice(0, 10) : hoy,
    clasificacion
  };
}

module.exports = {
  transcribe,
  textToTask,
  voiceToTaskStructured,
  getVoicePrompt,
  extractVoiceAction,
  MODEL_VOICE,
  LIMITE_PETICIONES_GRATIS,
  COSTE_ESTIMADO_POR_PETICION_USD
};
