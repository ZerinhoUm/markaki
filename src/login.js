const fs = require('fs');
const path = require('path');
const { solveImageCaptcha } = require('./captcha');

const BASE_URL = 'https://proeis.rj.gov.br/';
const MAX_CAPTCHA_TENTATIVAS = 5;
const LOGS = path.join(__dirname, '..', 'logs');

async function extrairCaptchaBase64(page) {
  const html = await page.content();
  // Pega especificamente o div do captcha — apos postbacks o __VIEWSTATE
  // pode conter a imagem ANTIGA embutida, entao nao usar match generico.
  const match = html.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/);
  if (!match) throw new Error('Imagem de captcha nao encontrada na pagina');
  return match[1];
}

async function selecionarTipoAcesso(page, tipo) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.selectOption('#ddlTipoAcesso', tipo);
  // ASP.NET postback: aguarda o formulario de login aparecer
  await page.waitForSelector('#txtLogin', { timeout: 15000 });
}

async function mensagemDeErro(page) {
  const partes = [];
  for (const sel of ['#lblMsg', '#lblLoginMsg']) {
    const el = await page.$(sel);
    if (el) {
      const texto = (await el.innerText()).trim();
      if (texto) partes.push(texto);
    }
  }
  return partes.join(' | ');
}

async function tentarLoginUmaVez(page, login, senha, tentativa) {
  await page.fill('#txtLogin', login);
  await page.fill('#txtSenha', senha);

  const captchaB64 = await extrairCaptchaBase64(page);
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(path.join(LOGS, `captcha-tentativa-${tentativa}.png`), Buffer.from(captchaB64, 'base64'));

  const textoCaptcha = await solveImageCaptcha(captchaB64);
  console.log(`[login] captcha resolvido: "${textoCaptcha}" (imagem: logs/captcha-tentativa-${tentativa}.png)`);

  await page.fill('#TextCaptcha', textoCaptcha);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#btnEntrar'),
  ]);

  const aindaNoLogin = await page.$('#txtLogin');
  if (aindaNoLogin) {
    const erro = await mensagemDeErro(page);
    console.log(`[login] mensagem do sistema: "${erro || '(vazia)'}"`);
  }
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
    const ok = await tentarLoginUmaVez(page, usuario, senha, tentativa);
    if (ok) {
      console.log('[login] autenticado com sucesso');
      return;
    }
    console.log('[login] tentativa recusada, gerando nova imagem...');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('#lnkNewCaptcha'),
    ]);
    await page.waitForTimeout(1000);
  }
  throw new Error(`Login falhou apos ${MAX_CAPTCHA_TENTATIVAS} tentativas de captcha`);
}

module.exports = { login };
