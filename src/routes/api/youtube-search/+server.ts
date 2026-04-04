import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import ytSearch from 'yt-search';

export async function GET({ url }: RequestEvent) {
	const query = url.searchParams.get('q');
	if (!query) {
		return json({ error: 'Query parameter "q" is required' }, { status: 400 });
	}

	try {
		// adding context to find better therapy videos
		const params = { query: `${query} valid physical therapy correct form`, pages: 1 };
		const r = await ytSearch(params);
		const videos = r.videos;
		const video = videos.length > 0 ? videos[0] : null;

		return json({ 
			videoUrl: video ? video.url : null, 
			videoId: video ? video.videoId : null 
		});
	} catch (error) {
		console.error('[YouTube Search API] Error:', error);
		return json({ error: 'Failed to search YouTube videos' }, { status: 500 });
	}
}
