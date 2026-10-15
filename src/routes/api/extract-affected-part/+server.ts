import { json } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';

/**
 * These MUST match the `regionName` values used in Spine3D.svelte's spineRegions array
 * so that the highlighting logic can find and colour the correct meshes.
 */
const VALID_REGIONS = [
  'Cervical (Neck)',
  'Thoracic (Mid Back)',
  'Lumbar (Lower Back)',
  'Sacrum & Coccyx',
  'Cranium & Jaw'
] as const;

export async function POST({ request }: { request: Request }) {
  try {
    const { surgeryType } = await request.json();

    if (!surgeryType || typeof surgeryType !== 'string') {
      return json({ error: 'surgeryType is required' }, { status: 400 });
    }

    if (
      !OPENAI_API_KEY ||
      OPENAI_API_KEY.includes('your_new_key_here') ||
      OPENAI_API_KEY === 'your_openai_api_key_here'
    ) {
      return json({ error: 'API key not configured' }, { status: 500 });
    }

    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    });

    const systemInstruction = `You are a clinical anatomy assistant for SpineSync, a spine recovery app.
Given a spine surgery type, identify which anatomical region(s) of the spine are affected.

You MUST respond with a valid JSON object containing a single key "regions" whose value is an array of strings.
Each string MUST be EXACTLY one of the following options (case-sensitive, copy verbatim):
- "Cervical (Neck)"
- "Thoracic (Mid Back)"
- "Lumbar (Lower Back)"
- "Sacrum & Coccyx"
- "Cranium & Jaw"

Return only the most relevant region(s) for the surgery. Most surgeries affect 1-2 regions.
Example response format: {"regions": ["Lumbar (Lower Back)"]}
Respond ONLY with valid JSON, no markdown, no extra text.`;

    const response = await openai.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: `Surgery type: ${surgeryType}` }
      ] as any,
      response_format: { type: 'json_object' }
    });

    let aiOutput = response.choices[0]?.message?.content || '{}';
    // Strip any accidental markdown fences
    aiOutput = aiOutput.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) aiOutput = jsonMatch[0];

    let parsed: { regions?: string[] };
    try {
      parsed = JSON.parse(aiOutput);
    } catch {
      // Fallback: map common surgery types deterministically if JSON parsing fails
      parsed = { regions: fallbackMap(surgeryType) };
    }

    // Validate & filter to known region names only
    const regions: string[] = (parsed.regions || []).filter((r) =>
      (VALID_REGIONS as readonly string[]).includes(r)
    );

    // Ultimate fallback if AI returned no usable data
    if (regions.length === 0) {
      regions.push(...fallbackMap(surgeryType));
    }

    return json({ regions });
  } catch (error: unknown) {
    console.error('[extract-affected-part] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return json({ error: message }, { status: 500 });
  }
}

/** Rule-based fallback so the feature works even if the AI call fails. */
function fallbackMap(surgeryType: string): string[] {
  const s = surgeryType.toLowerCase();
  if (s.includes('cervical') || s.includes('acdf') || s.includes('neck')) {
    return ['Cervical (Neck)'];
  }
  if (s.includes('thoracic') || s.includes('kyphosis') || s.includes('scoliosis')) {
    return ['Thoracic (Mid Back)'];
  }
  if (s.includes('sacr') || s.includes('coccyx') || s.includes('sacroiliac')) {
    return ['Sacrum & Coccyx'];
  }
  if (s.includes('vertebroplasty') || s.includes('kyphoplasty')) {
    return ['Lumbar (Lower Back)', 'Thoracic (Mid Back)'];
  }
  // Default: lumbar (most common spine surgeries)
  return ['Lumbar (Lower Back)'];
}
