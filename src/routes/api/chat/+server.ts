import { json } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are SpineGuide, a compassionate and knowledgeable AI health companion for spine surgery patients. Your role is to:

1. EDUCATE patients about spine surgery, recovery processes, and physiotherapy in simple, clear language
2. SUPPORT patients emotionally through their recovery journey
3. SUGGEST safe physiotherapy exercises appropriate for their recovery stage
4. ENCOURAGE healthy recovery habits and adherence to prescribed therapies
5. GUIDE patients on when to contact their healthcare provider

IMPORTANT RULES:
- Always use simple, non-medical jargon language
- Never claim to diagnose conditions
- Never replace professional medical advice
- For any severe symptoms (sudden numbness, loss of bladder/bowel control, severe chest pain, extreme weakness), immediately advise the patient to seek emergency care
- Always be warm, encouraging, and patient-centered
- Keep responses concise and easy to read
- Include a gentle disclaimer when providing health guidance

You are NOT a doctor. You are an educational and supportive companion.`;

export async function POST({ request }: { request: Request }) {
	try {
		const { message, history, patientContext } = await request.json();

		if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('your_new_key_here') || OPENAI_API_KEY === 'your_openai_api_key_here') {
			return json({ error: 'API key not configured' }, { status: 500 });
		}

		const openai = new OpenAI({ 
			apiKey: OPENAI_API_KEY,
			baseURL: 'https://api.groq.com/openai/v1'
		});

		const systemInstruction =
			SYSTEM_PROMPT +
			(patientContext
				? `\n\nPatient Context:\n- Surgery type: ${patientContext.surgeryType || 'unknown'}\n- Recovery stage: ${patientContext.recoveryStage || 'unknown'}\n- Days since surgery: ${patientContext.daysSinceSurgery || 'unknown'}${patientContext.symptoms ? `\n- Current Symptoms: ${patientContext.symptoms}` : ''}${patientContext.precautions ? `\n- Precautions: ${patientContext.precautions}` : ''}`
				: '');

		const messages = [
			{ role: 'system', content: systemInstruction },
			...(history || []).map((h: any) => ({
				role: h.role === 'model' ? 'assistant' : 'user',
				content: h.parts ? h.parts.map((p: any) => p.text).join('\n') : ''
			})),
			{ role: 'user', content: message }
		];

		const response = await openai.chat.completions.create({
			model: 'llama-3.3-70b-versatile',
			messages: messages as any,
			temperature: 0.7
		});

		const text = response.choices[0]?.message?.content || '';

		return json({ text });
	} catch (error: unknown) {
		console.error('[SpineGuide API] Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		const status = message.includes('429') ? 429 : 500;
		return json({ error: message }, { status });
	}
}
