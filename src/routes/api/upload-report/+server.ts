import { json } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParseLib = require('pdf-parse');
const PDFParse = pdfParseLib.PDFParse;

export async function POST({ request }: { request: Request }) {
	try {
		const formData = await request.formData();
		const file = formData.get('report') as File;

		if (!file) {
			return json({ error: 'No PDF file provided.' }, { status: 400 });
		}

		if (file.type !== 'application/pdf') {
			return json({ error: 'Uploaded file must be a PDF.' }, { status: 400 });
		}

		// 1. Extract text from PDF
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		let text = '';
		
		try {
			const parser = new PDFParse({ data: buffer });
			const pdfData = await parser.getText();
			text = pdfData.text;
			await parser.destroy();
		} catch (err) {
			console.error('[Upload API] PDF parse error:', err);
			return json({ error: 'Failed to parse the PDF document. It may be corrupted or protected.' }, { status: 400 });
		}

		if (!text || text.trim().length === 0) {
			return json({ error: 'No readable text found in the PDF. Please ensure it is a text-based document, not just scanned images.' }, { status: 400 });
		}

		// 2. Setup AI API
		if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('your_new_key_here') || OPENAI_API_KEY === 'your_openai_api_key_here') {
			return json({ error: 'API key not configured' }, { status: 500 });
		}

		const openai = new OpenAI({ 
			apiKey: OPENAI_API_KEY,
			baseURL: 'https://api.groq.com/openai/v1'
		});

		// 3. Extract JSON using AI
		const systemInstruction = `You are a clinical data extraction assistant for SpineSync, a spine recovery application. 
Your task is to analyze the following extracted text from a patient's hospital surgery report.
Extract these exact fields in a valid JSON format (and nothing else):
{
  "surgeryType": "Extract the type of surgery performed. If not found, use 'Other'",
  "recoveryStage": "Determine the stage based on the dates or context. Must be exactly one of: 'pre-op', 'early', 'mid', 'late', 'complete'. If unknown, use 'early'.",
  "painScore": Extract current pain score if mentioned (number 0-10). If not mentioned, use 5.
  "symptoms": "Briefly list any current symptoms. If none, leave empty string.",
  "limitations": "Briefly list any physical limitations or precautions. If none, leave empty string."
}

Ensure the output is ONLY valid JSON without any markdown formatting wrappers or extra text.`;

		const messages = [
			{ role: 'system', content: systemInstruction },
			{ role: 'user', content: text.substring(0, 15000) } // Send up to 15000 chars to avoid token limits
		];

		const response = await openai.chat.completions.create({
			model: 'llama-3.3-70b-versatile',
			messages: messages as any,
			response_format: { type: 'json_object' }
		});

		let aiOutput = response.choices[0]?.message?.content || '{}';
		
		// Aggressively clean markdown blocks if LLaMA inserts them despite json_object mode
		aiOutput = aiOutput.replace(/```json/g, '').replace(/```/g, '').trim();

		const jsonMatch = aiOutput.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			aiOutput = jsonMatch[0];
		}
		
		let extractedData;
		try {
			extractedData = JSON.parse(aiOutput);
		} catch (e) {
			console.error('[Upload API] Failed to parse JSON from AI output:', aiOutput);
			extractedData = { surgeryType: 'Unspecified Spine Surgery', recoveryStage: 'early', painScore: 5, symptoms: 'No specific symptoms extracted.', limitations: 'General post-operative limitations.' };
		}

		return json({
            success: true,
            data: extractedData
        });
	} catch (error: unknown) {
		console.error('[Upload API] Error:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: message }, { status: 500 });
	}
}
