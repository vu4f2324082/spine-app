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
		const { message, history, patientContext, requestSuggestions, temperature } = await request.json();

		if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('your_new_key_here') || OPENAI_API_KEY === 'your_openai_api_key_here') {
			return json({ error: 'API key not configured' }, { status: 500 });
		}

		const openai = new OpenAI({ 
			apiKey: OPENAI_API_KEY,
			baseURL: 'https://api.groq.com/openai/v1'
		});

		let systemInstruction =
			SYSTEM_PROMPT +
			(patientContext
				? `\n\nPatient Context:\n- Surgery type: ${patientContext.surgeryType || 'unknown'}\n- Recovery stage: ${patientContext.recoveryStage || 'unknown'}\n- Days since surgery: ${patientContext.daysSinceSurgery || 'unknown'}${patientContext.symptoms ? `\n- Current Symptoms: ${patientContext.symptoms}` : ''}${patientContext.precautions ? `\n- Precautions: ${patientContext.precautions}` : ''}`
				: '');

		if (requestSuggestions) {
			systemInstruction += `\n\nAt the very end of your response, provide exactly 3 suggested follow-up questions for the user to ask next. Format them strictly as a JSON array inside a <suggestions> tag, like this: \n<suggestions>["Question 1?", "Question 2?", "Question 3?"]</suggestions>\nDo not put any other text after this tag.`;
		}

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
			temperature: temperature ?? 0.7
		});

		const rawText = response.choices[0]?.message?.content || '';
		let text = rawText;
		let suggestions: string[] | undefined = undefined;

		if (requestSuggestions) {
			const match = text.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
			if (match) {
				try {
					suggestions = JSON.parse(match[1]);
					text = text.replace(match[0], '').trim();
				} catch (e) {
					console.error('[SpineGuide API] Failed to parse suggestions:', e);
				}
			}
		}

		return json({ text, suggestions });
	} catch (error: unknown) {
		console.error('[SpineGuide API] Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		const status = message.includes('429') ? 429 : 500;
		return json({ error: message }, { status });
	}
}
