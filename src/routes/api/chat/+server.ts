import { json } from '@sveltejs/kit';
import { GEMINI_API_KEY } from '$env/static/private';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

		if (!GEMINI_API_KEY) {
			return json({ error: 'API key not configured' }, { status: 500 });
		}

		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

		const systemInstruction =
			SYSTEM_PROMPT +
			(patientContext
				? `\n\nPatient Context: Surgery type: ${patientContext.surgeryType || 'unknown'}, Recovery stage: ${patientContext.recoveryStage || 'unknown'}, Days since surgery: ${patientContext.daysSinceSurgery || 'unknown'}.`
				: '');

		const model = genAI.getGenerativeModel({
			model: 'gemini-1.5-flash',
			systemInstruction
		});

		const chat = model.startChat({ history: history || [] });
		const result = await chat.sendMessage(message);
		const text = result.response.text();

		return json({ text });
	} catch (error: unknown) {
		console.error('[SpineGuide API] Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		const status = message.includes('429') ? 429 : 500;
		return json({ error: message }, { status });
	}
}
