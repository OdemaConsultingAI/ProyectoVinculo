/**
 * Palabras que provocan el rechazo de la petición ANTES de enviar a OpenAI (ahorra costo de tokens).
 * Se comprueba la transcripción de Whisper (texto en minúsculas) contra esta lista.
 * Si el texto contiene alguna, se responde 400 y no se llama a GPT.
 * Añade o quita términos según la política de contenido de la app.
 */
module.exports = [
  "matar", "asesinar", "porno", "sexo", "bomba",
  "suicidio", "nazi", "terrorista", "pene", "vagina"
];
