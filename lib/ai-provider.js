import { setTimeout as delay } from 'node:timers/promises';

const transientStatus = status => [500, 502, 503, 504].includes(status);

export async function generateAi({ instructions, contents }) {
  let model = process.env.GEMINI_MODEL?.trim().replace(/^models\//, '') || 'gemini-2.5-flash';
  const failure = (error, temporary = false) => ({ error, model, temporary });
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { error: 'AI xizmati serverda sozlanmagan.', unconfigured: true };
  try {
    const deadline = AbortSignal.timeout(24000);
    const attemptSignal = milliseconds => AbortSignal.any([deadline, AbortSignal.timeout(milliseconds)]);
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents,
      generationConfig: { maxOutputTokens: 1024 },
    });

    async function request(stage, url, options, milliseconds, requestedModel) {
      const signal = attemptSignal(milliseconds);
      const started = performance.now();
      let phase = 'headers';
      let status;
      try {
        const response = await fetch(url, { ...options, headers, signal });
        status = response.status;
        phase = 'body';
        const data = await response.json().catch(error => {
          if (signal.aborted) throw error;
          return null;
        });
        return { ok: response.ok, status, data };
      } catch (error) {
        const timeout = signal.aborted && signal.reason?.name === 'TimeoutError';
        console.warn('AI provider request interrupted', {
          stage, phase, model: requestedModel, status, timeout, elapsedMs: Math.round(performance.now() - started),
        });
        return { timeout, phase };
      }
    }

    const generate = (name, stage) => request(stage, endpoint + '/' + encodeURIComponent(name) + ':generateContent',
      { method: 'POST', body }, 8000, name);

    let stage = 'primary';
    let response = await generate(model, stage);
    if (transientStatus(response.status)) {
      await delay(500, undefined, { signal: deadline });
      stage = 'retry';
      response = await generate(model, stage);
    }
    if ([400, 404].includes(response.status) || transientStatus(response.status) || response.timeout) {
      const catalog = await request('catalog', endpoint + '?pageSize=100', {}, 3500);
      if (catalog.ok) {
        const models = catalog.data?.models ?? [];
        const alternatives = models
          .filter(item => /^models\/gemini-[\d.]+-flash(?:[-\w]*)$/.test(item.name) &&
            !/(image|audio|tts|live|robotics)/.test(item.name) &&
            item.supportedGenerationMethods?.includes('generateContent'))
          .map(item => item.name.slice('models/'.length))
          .filter(name => name !== model)
          .sort((a, b) => Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)) ||
            b.localeCompare(a, 'en', { numeric: true }));
        for (const candidate of alternatives.slice(0, 2)) {
          if (deadline.aborted) break;
          model = candidate;
          stage = 'alternate';
          response = await generate(model, stage);
          if (response.status !== 404 && !transientStatus(response.status) && !response.timeout) break;
        }
      } else if (catalog.timeout && response.timeout) {
        return failure('AI modelidan javob kelmadi va muqobil modellar ro‘yxati ham vaqtida olinmadi. (AI-CATALOG)', true);
      }
    }
    if (response.timeout) {
      const phase = response.phase === 'body' ? 'javob matnini yuborishda' : 'javobni boshlashda';
      const code = stage === 'alternate' ? 'AI-ALTERNATE' : stage === 'retry' ? 'AI-RETRY' : 'AI-PRIMARY';
      return failure('AI modeli ' + model + ' ' + phase + ' belgilangan vaqtdan oshdi. (' + code + ')', true);
    }
    if (!response.status) return failure('AI xizmatiga ulanishda xato yuz berdi.', true);
    const result = response.data;
    if (!response.ok) {
      const code = result?.error?.status;
      const details = Array.isArray(result?.error?.details) ? result.error.details : [];
      const keyRejected = details.some(item => ['API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED'].includes(item.reason));
      console.warn('AI provider request failed', { stage, model, status: response.status });
      if (transientStatus(response.status)) {
        return failure('AI xizmati vaqtincha band. Birozdan keyin savolni qayta yuboring.', true);
      }
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
    return failure(['TimeoutError', 'AbortError'].includes(error.name)
      ? 'AI belgilangan vaqtda javob bermadi.'
      : 'AI xizmatiga ulanishda xato yuz berdi.', true);
  }
}
