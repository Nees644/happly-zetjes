// api/_lib/anthropic.js
// Aanroep van Claude met gestructureerde JSON-uitvoer en prompt caching.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY || undefined });

// system: [{ text, cache: true|false }]; het laatste gecachete blok krijgt het breekpunt.
async function jsonCall({ system, user, schema, maxTokens = 4000, thinking = true, effort = 'medium', label }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    ...(thinking ? {} : { thinking: { type: 'disabled' } }),
    output_config: {
      ...(thinking ? { effort } : {}),
      format: { type: 'json_schema', schema },
    },
    system: system.map((b) => ({
      type: 'text',
      text: b.text,
      ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}),
    })),
    messages: [{ role: 'user', content: user }],
  });

  const u = response.usage || {};
  // Alleen tellingen loggen, nooit inhoud.
  console.log(JSON.stringify({
    call: label, stop: response.stop_reason,
    input: u.input_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens,
    output: u.output_tokens,
  }));

  if (response.stop_reason === 'refusal') throw new Error('Model weigerde het verzoek');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`Geen tekst in antwoord (${response.stop_reason})`);
  return { data: JSON.parse(text), usage: u };
}

module.exports = { jsonCall, MODEL, Anthropic };
