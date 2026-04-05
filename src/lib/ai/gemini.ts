// All Gemini API calls go through the server endpoint /api/chat
// so the API key is never exposed to the browser.

export interface ChatHistoryItem {
	role: 'user' | 'model';
	parts: { text: string }[];
}

export interface PatientContext {
	surgeryType?: string;
	recoveryStage?: string;
	daysSinceSurgery?: number;
	precautions?: string;
	symptoms?: string;
}

let chatHistory: ChatHistoryItem[] = [];
let patientContext: PatientContext | undefined;

export function createChatSession(context?: PatientContext, history?: ChatHistoryItem[]) {
	chatHistory = history || [];
	patientContext = context;
}

export async function sendMessage(
	_session: unknown,
	message: string
): Promise<{text: string; suggestions?: string[]}> {
	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				message,
				history: chatHistory,
				patientContext,
				requestSuggestions: true
			})
		});

		const data = await response.json();

		if (!response.ok) {
			console.error('[SpineGuide AI] API error:', data.error);
			if (response.status === 429 || (data.error && data.error.includes('429'))) {
				return { text: '⚠️ The AI assistant has reached its daily usage limit. Please try again tomorrow, or update the OpenAI API key in the .env file with a fresh key.' };
			}
			return { text: `⚠️ AI error: ${data.error || 'Unknown error'}` };
		}

		// Add to history so the conversation has context
		chatHistory.push({ role: 'user', parts: [{ text: message }] });
		chatHistory.push({ role: 'model', parts: [{ text: data.text }] });

		return { text: data.text, suggestions: data.suggestions };
	} catch (error: unknown) {
		console.error('[SpineGuide AI] sendMessage error:', error);
		return { text: "I'm having trouble connecting right now. Please try again in a moment, or contact your healthcare provider if you have urgent concerns." };
	}
}

export async function generatePhysiotherapyPlan(params: {
	surgeryType: string;
	recoveryStage: string;
	painScore: number;
	symptoms: string;
	limitations: string;
}): Promise<string> {
	const prompt = `As SpineGuide, generate a highly custom, individualized physiotherapy exercise plan for a patient with the precisely extracted clinical details:
- Surgery Type: ${params.surgeryType}
- Recovery Stage: ${params.recoveryStage}
- Current Pain Score: ${params.painScore}/10
- Current Symptoms: ${params.symptoms || 'None reported'}
- Physical Limitations: ${params.limitations || 'None reported'}

CRITICAL INSTRUCTION: You MUST strictly tailor every single exercise to this specific surgery and these specific symptoms. DO NOT just output a generic static list of "Ankle Pumps", "Glute Bridges" or "Heel Slides" every single time! Invent descriptive, unique variations of safe exercises directly targeted at the physical limitations and pain score. The exercises MUST vary based on the inputs provided! 

MOST IMPORTANT: ALL exercises MUST be STRICTLY PHYSIOTHERAPY based (i.e. physical stretches, joint mobility, or muscular strengthening). DO NOT include "Deep Breathing", "Meditation", "Relaxation", or "Mindfulness" as exercises, even for the evening category. If you need a gentle evening task, use a physical mobility stretch.

Please provide a structured plan with:
1. MORNING exercises (3-4 highly targeted gentle exercises)
2. AFTERNOON exercises (2-3 targeted exercises)
3. EVENING exercises (2-3 gentle physical stretching/mobility exercises)
4. PRECAUTIONS (3-4 important customized safety tips)
5. RED FLAGS (symptoms that require immediate doctor contact)

Format as JSON with structure:
{
  "morning": [{"name": "", "duration": "", "reps": "", "description": ""}],
  "afternoon": [{"name": "", "duration": "", "reps": "", "description": ""}],
  "evening": [{"name": "", "duration": "", "reps": "", "description": ""}],
  "precautions": [""],
  "redFlags": [""]
}

Keep exercises safe, gentle, and appropriate for the recovery stage. Add exercise IDs as "ex_morning_1", "ex_morning_2" etc.`;

	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ message: prompt, history: [], temperature: 0.9 })
	});

	if (!response.ok) {
		const data = await response.json();
		throw new Error(data.error || 'Failed to generate physiotherapy plan');
	}

	const data = await response.json();
	const text: string = data.text;
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (jsonMatch) return jsonMatch[0];
	return text;
}

export async function generateRecoverySummary(params: {
	logs: Array<{ date: string; painScore: number; mobility: number }>;
	exerciseAdherence: number;
}): Promise<string> {
	const prompt = `Based on this patient's weekly recovery data, provide a brief, encouraging summary (2-3 sentences) and one specific tip for improvement:
Pain scores (last 7 days): ${params.logs.map((l) => l.painScore).join(', ')}
Mobility scores: ${params.logs.map((l) => l.mobility).join(', ')}
Exercise adherence: ${params.exerciseAdherence}%

Be warm, encouraging, and constructive. Keep it under 100 words.`;

	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: prompt, history: [] })
		});

		if (!response.ok) throw new Error('API error');
		const data = await response.json();
		return data.text;
	} catch {
		return 'Keep up the great work on your recovery journey! Consistency with your exercises and monitoring your symptoms are key to a successful recovery. Remember to stay hydrated and get adequate rest.';
	}
}
