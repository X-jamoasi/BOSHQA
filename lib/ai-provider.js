export async function generateAi({ instructions, contents }) {
  let model = process.env.GEMINI_MODEL?.trim().replace(/^models\//, '') || 'gemini-2.5-flash';
  const failure = error => ({ error, model });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { error: 'AI xizmati serverda sozlanmagan.', unconfigured: true };
  try {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    const generate = name => fetch(endpoint + '/' + encodeURIComponent(name) + ':generateContent', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    let response = await generate(model);
    if ([400, 404].includes(response.status)) {
      const catalog = await fetch(endpoint + '?pageSize=100', { headers, signal: AbortSignal.timeout(5000) });
      if (catalog.ok) {
        const { models = [] } = await catalog.json();
        const alternatives = models
          .filter(item => /^models\/gemini-[\d.]+-flash(?:[-\w]*)$/.test(item.name) &&
            !/(image|audio|tts|live|robotics)/.test(item.name) &&
            item.supportedGenerationMethods?.includes('generateContent'))
          .map(item => item.name.slice('models/'.length))
          .filter(name => name !== model)
          .sort((a, b) => Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)) ||
            b.localeCompare(a, 'en', { numeric: true }));
        for (const candidate of alternatives.slice(0, 2)) {
          model = candidate;
          response = await generate(model);
          if (response.status !== 404) break;
        }
      }
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const code = result?.error?.status;
      const details = Array.isArray(result?.error?.details) ? result.error.details : [];
      const keyRejected = details.some(item => ['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED'].includes(item.reason));
      console.warn('AI provider request failed', response.status);
      if (response.status === 429) return failure('AI so‘rovlari kvotasi tugagan. AI Studio’da loyiha limitini tekshiring.');
      if (keyRejected || [401, 403].includes(response.status)) {
        return failure('AI xizmati kalitni yoki loyiha ruxsatini rad etdi. AI Studio’dagi kalitni tekshiring.');
      }
      if (response.status === 404) return failure('Tanlangan AI modeli mavjud emas. AI Studio’dagi model nomini tekshiring.');
      if (code === 'FAILED_PRECONDITION') return failure('AI loyiha sozlamalari so‘rovga ruxsat bermadi. AI Studio’da loyiha va xizmat hududini tekshiring.');
      return failure('AI xizmati so‘rovni bajarmadi (HTTP ' + response.status + ').');
    }
    const text = result?.candidates?.[0]?.content?.parts
      ?.filter(part => !part.thought && typeof part.text === 'string')
      .map(part => part.text).join('').trim();
    return text ? { text, model } : failure('AI javobida matn topilmadi.');
  } catch (error) {
    return failure(error.name === 'TimeoutError'
      ? 'AI belgilangan vaqtda javob bermadi.'
      : 'AI xizmatiga ulanishda xato yuz berdi.');
  }
}
