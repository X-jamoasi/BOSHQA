import { generateAi } from './ai-provider.js';

export async function generateChatAnswer({ instructions, contents }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const primary = await generateAi({ instructions, contents, timeoutMs: key ? 12000 : 24000 });
  if (!primary.error || !key || (!primary.temporary && !primary.unconfigured)) return primary;

  const model = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4.1-mini';
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model,
        instructions,
        input: contents.map(item => ({
          role: item.role === 'model' ? 'assistant' : 'user',
          content: item.parts.map(part => part.text).join('\n'),
        })),
        store: false,
        max_output_tokens: 700,
      }),
    });
    if (!response.ok) {
      console.warn('Backup chat provider request failed', response.status);
      if (response.status === 429) return { error: 'Zaxira AI loyihasining kvotasi yoki so‘rov limiti tugagan.', temporary: true };
      if ([401, 403].includes(response.status)) return { error: 'Zaxira AI xizmati kalitni yoki loyiha ruxsatini rad etdi.' };
      return { error: 'Jonli AI xizmatlari hozir javob bera olmadi. Keyinroq urinib ko‘ring.', temporary: true };
    }
    const body = await response.json();
    const text = body.output?.filter(item => item.type === 'message' && item.role === 'assistant')
      .flatMap(item => item.content ?? [])
      .filter(item => item.type === 'output_text' && typeof item.text === 'string')
      .map(item => item.text).join('\n').trim();
    return text ? { text, model } : { error: 'Zaxira AI xizmatidan matnli javob kelmadi.', temporary: true };
  } catch {
    return { error: 'Zaxira AI xizmatiga ulanib bo‘lmadi. Keyinroq urinib ko‘ring.', temporary: true };
  }
}
