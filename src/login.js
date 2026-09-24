const { solveImageCaptcha } = require('./captcha');

const BASE_URL = 'https://proeis.rj.gov.br/';
const MAX_CAPTCHA_TENTATIVAS = 5;

async function extrairCaptchaBase64(page) {
  const html = await page.content();
  const match = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]{100,})/);
  if (!match) throw new Error('Imagem de captcha nao encontrada na pagina');
  return match[1];
}

async function selecionarTipoAcesso(page, tipo) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.selectOption('#ddlTipoAcesso', tipo);
  // ASP.NET postback: aguarda o formulario de login aparecer
  await page.waitForSelector('#txtLogin', { timeout: 15000 });
}

async function tentarLoginUmaVez(page, login, senha) {
  await page.fill('#txtLogin', login);
  await page.fill('#txtSenha', senha);

  const captchaB64 = await extrairCaptchaBase64(page);
  const textoCaptcha = await solveImageCaptcha(captchaB64);
  console.log(`[login] captcha resolvido: "${textoCaptcha}"`);

  await page.fill('#TextCaptcha', textoCaptcha);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#btnEntrar'),
  ]);

  // Se o captcha estava errado, o sistema volta para a tela de login
  const aindaNoLogin = await page.$('#txtLogin');
  return !aindaNoLogin;
}

/**
 * Faz login no CPROEIS, resolvendo captcha automaticamente com retries.
 * Deixa a `page` na primeira tela autenticada.
 */
async function login(page) {
  const tipo = process.env.PROEIS_TIPO || 'ID';
  const usuario = process.env.PROEIS_LOGIN;
  const senha = process.env.PROEIS_SENHA;
  if (!usuario || !senha) {
    throw new Error('PROEIS_LOGIN / PROEIS_SENHA nao configurados no .env');
  }

  await selecionarTipoAcesso(page, tipo);

  for (let tentativa = 1; tentativa <= MAX_CAPTCHA_TENTATIVAS; tentativa++) {
    console.log(`[login] tentativa ${tentativa}/${MAX_CAPTCHA_TENTATIVAS}`);
    const ok = await tentarLoginUmaVez(page, usuario, senha);
    if (ok) {
      console.log('[login] autenticado com sucesso');
      return;
    }
    console.log('[login] captcha recusado, gerando nova imagem...');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('#lnkNewCaptcha'),
    ]);
  }
  throw new Error(`Login falhou apos ${MAX_CAPTCHA_TENTATIVAS} tentativas de captcha`);
}

module.exports = { login };
