/**
 * Servicio de IA: Whisper (transcripción) + GPT-4o-mini (texto → tarea estructurada).
 * Uso low-cost: ~$0.006/min Whisper + ~$0.001 por petición GPT-4o-mini.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LIMITE_PETICIONES_GRATIS = 10;
const COSTE_ESTIMADO_POR_PETICION_USD = 0.001;

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
    model: 'gpt-4o-mini',
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

module.exports = {
  transcribe,
  textToTask,
  voiceToTaskStructured,
  LIMITE_PETICIONES_GRATIS,
  COSTE_ESTIMADO_POR_PETICION_USD
};
