// api/_lib/anthropic.js
// Aanroep van Claude met gestructureerde JSON-uitvoer en prompt caching.
//
// Route: eerst AWS Bedrock in Frankfurt met het EU-profiel, zodat de
// verwerking in Europa blijft. Weigert Bedrock (account nog niet vrijgegeven,
// model niet beschikbaar, storing), dan gaat die ene aanroep via de Claude API
// en slaan we Bedrock een paar minuten over. Zodra AWS vrijgeeft, loopt alles
// vanzelf via Frankfurt. In het logboek staat per aanroep via welke route.
//
// Sleutel: BEDROCK_API_KEY (Bedrock, API keys). Een sleutelpaar
// (BEDROCK_ACCESS_KEY_ID en BEDROCK_SECRET_ACCESS_KEY) mag ook.

const Anthropic = require('@anthropic-ai/sdk');
const { AnthropicBedrock } = require('@anthropic-ai/bedrock-sdk');

// Zelfde model als waarop de prompts zijn afgestemd; alleen de route verschilt.
const MODEL = 'claude-sonnet-5';
const MODEL_EU = 'eu.anthropic.claude-sonnet-5';
const PAUZE_NA_WEIGERING_MS = 5 * 60 * 1000;

const HEEFT_BEDROCK = Boolean(
  process.env.BEDROCK_API_KEY || (process.env.BEDROCK_ACCESS_KEY_ID && process.env.BEDROCK_SECRET_ACCESS_KEY)
);

const bedrock = HEEFT_BEDROCK
  ? new AnthropicBedrock({
      awsRegion: process.env.BEDROCK_REGION || 'eu-central-1',
      ...(process.env.BEDROCK_API_KEY ? { apiKey: process.env.BEDROCK_API_KEY } : {}),
      awsAccessKey: process.env.BEDROCK_ACCESS_KEY_ID || null,
      awsSecretKey: process.env.BEDROCK_SECRET_ACCESS_KEY || null,
      maxRetries: 0,
    })
  : null;
const direct = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY || undefined });

let bedrockPauzeTot = 0;

function bedrockNu() {
  return Boolean(bedrock) && Date.now() >= bedrockPauzeTot;
}

// Probeert Bedrock; bij een weigering of storing de Claude API. Geeft de route terug.
async function maakBericht(params, label) {
  if (bedrockNu()) {
    try {
      const response = await bedrock.messages.create({ ...params, model: MODEL_EU });
      return { response, via: 'bedrock-eu' };
    } catch (err) {
      bedrockPauzeTot = Date.now() + PAUZE_NA_WEIGERING_MS;
      // Alleen status en het begin van de melding van AWS, nooit inhoud van de gebruiker.
      console.log(JSON.stringify({
        call: label, bedrock_geweigerd: err?.status || 'fout',
        reden: String(err?.message || '').slice(0, 120),
      }));
    }
  }
  const response = await direct.messages.create({ ...params, model: MODEL });
  return { response, via: 'claude-api' };
}

// system: [{ text, cache: true|false }]; het laatste gecachete blok krijgt het breekpunt.
async function jsonCall({ system, user, schema, maxTokens = 4000, thinking = true, effort = 'medium', label }) {
  const { response, via } = await maakBericht({
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
  }, label);

  const u = response.usage || {};
  // Alleen tellingen loggen, nooit inhoud.
  console.log(JSON.stringify({
    call: label, via, stop: response.stop_reason,
    input: u.input_tokens, cache_write: u.cache_creation_input_tokens, cache_read: u.cache_read_input_tokens,
    output: u.output_tokens,
  }));

  if (response.stop_reason === 'refusal') throw new Error('Model weigerde het verzoek');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`Geen tekst in antwoord (${response.stop_reason})`);
  return { data: JSON.parse(text), usage: u };
}

module.exports = { jsonCall, MODEL, MODEL_EU, Anthropic };
