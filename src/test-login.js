// Teste de login semi-manual: extrai o captcha e aguarda o texto ser
// escrito em logs/captcha-resposta.txt (modo dev, sem 2Captcha).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LOGS = path.join(__dirname, '..', 'logs');
const RESPOSTA = path.join(LOGS, 'captcha-resposta.txt');
const IMAGEM = path.join(LOGS, 'captcha-agora.png');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function esperarResposta() {
  if (fs.existsSync(RESPOSTA)) fs.unlinkSync(RESPOSTA);
  console.log('[teste] aguardando logs/captcha-resposta.txt ...');
  while (!fs.existsSync(RESPOSTA)) await sleep(1000);
  const texto = fs.readFileSync(RESPOSTA, 'utf8').trim();
  fs.unlinkSync(RESPOSTA);
  return texto;
}

async function extrairCaptcha(page) {
  const html = await page.content();
  const m = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]{100,})/);
  if (!m) throw new Error('captcha nao encontrado');
  fs.writeFileSync(IMAGEM, Buffer.from(m[1], 'base64'));
  console.log('[teste] captcha salvo em logs/captcha-agora.png');
}

(async () => {
  fs.mkdirSync(LOGS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://proeis.rj.gov.br/', { waitUntil: 'domcontentloaded' });
  await page.selectOption('#ddlTipoAcesso', process.env.PROEIS_TIPO || 'ID');
  await page.waitForSelector('#txtLogin', { timeout: 15000 });

  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    console.log(`[teste] tentativa ${tentativa}/5`);
    await page.fill('#txtLogin', process.env.PROEIS_LOGIN);
    await page.fill('#txtSenha', process.env.PROEIS_SENHA);
    await extrairCaptcha(page);

    const texto = await esperarResposta();
    console.log(`[teste] captcha informado: "${texto}"`);
    await page.fill('#TextCaptcha', texto);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('#btnEntrar'),
    ]);

    const aindaNoLogin = await page.$('#txtLogin');
    if (!aindaNoLogin) {
      console.log('[teste] LOGIN OK!');
      await page.screenshot({ path: path.join(LOGS, 'pos-login.png'), fullPage: true });
      fs.writeFileSync(path.join(LOGS, 'pos-login.html'), await page.content());
      console.log('[teste] logs/pos-login.png e pos-login.html salvos');
      console.log('[teste] URL atual:', page.url());
      await browser.close();
      return;
    }
    console.log('[teste] recusado, gerando novo captcha...');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.click('#lnkNewCaptcha'),
    ]);
  }
  console.log('[teste] falhou apos 5 tentativas');
  await page.screenshot({ path: path.join(LOGS, 'login-falhou.png'), fullPage: true });
  await browser.close();
  process.exitCode = 1;
})();
