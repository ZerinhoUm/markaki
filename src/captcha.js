const API_BASE = 'https://2captcha.com';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiPost(path, params) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (data.status === 0) {
    throw new Error(`2Captcha erro: ${data.errorText || JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Resolve um captcha de imagem via 2Captcha.
 * @param {string} base64Png - imagem PNG em base64 (sem prefixo data:)
 * @returns {Promise<string>} texto do captcha
 */
async function solveImageCaptcha(base64Png) {
  const key = process.env.CAPTCHA_API_KEY;
  if (!key) throw new Error('CAPTCHA_API_KEY nao configurada no .env');

  const created = await apiPost('/createTask', {
    clientKey: key,
    task: {
      type: 'ImageToTextTask',
      body: base64Png,
    },
  });

  const taskId = created.taskId;
  const deadline = Date.now() + 120_000;

  await sleep(5000);
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/getTaskResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key, taskId }),
    });
    const data = await res.json();
    if (data.status === 'ready') return data.solution.text;
    if (data.status === 'processing') {
      await sleep(3000);
      continue;
    }
    throw new Error(`2Captcha erro: ${data.errorText || JSON.stringify(data)}`);
  }
  throw new Error('2Captcha: tempo esgotado aguardando solucao');
}

module.exports = { solveImageCaptcha };
