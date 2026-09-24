// Debug: descobrir a assinatura de "captcha errado" no filtro de eventos.
// 1) Filtra com captcha propositalmente errado -> observa lblAvisoEventos e DOM
// 2) Filtra com captcha correto (2Captcha) -> compara
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./login');
const { solveImageCaptcha } = require('./captcha');

const LOGS = path.join(__dirname, '..', 'logs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function estado(page) {
  return page.evaluate(() => {
    const av = document.getElementById('lblAvisoEventos');
    const ac = document.getElementById('accordionConvenio');
    const cap = document.getElementById('TextCaptcha');
    const html = document.documentElement.innerHTML;
    const m = html.match(/background:\s*url\('data:image\/png;base64,([^']{0,60})/);
    return {
      aviso: av ? av.innerText.trim() : '(sem label)',
      accordionChars: ac ? ac.innerHTML.length : -1,
      participar: document.querySelectorAll('.btnParticipar').length,
      captchaField: cap ? cap.value : '(sem campo)',
      captchaImgInicio: m ? m[1] : '(sem img)',
    };
  });
}

async function filtrar(page, textoCaptcha) {
  await page.fill('#TextCaptcha', textoCaptcha);
  await page.click('#btnConsultar');
  await sleep(6000); // async postback
  return estado(page);
}

(async () => {
  fs.mkdirSync(LOGS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await login(page);
  await page.click('#btnEscala');
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);
  await page.click('#btnNovaInscricao');
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);
  await page.selectOption('#ddlConvenios', '42');
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);

  // SEM filtro de data nem CPA — deve trazer tudo da semana
  const antes = await estado(page);
  console.log('[debug] antes:', JSON.stringify(antes));

  console.log('[debug] --- teste 1: captcha ERRADO de proposito ---');
  const errado = await filtrar(page, 'XXXXX');
  console.log('[debug] depois(errado):', JSON.stringify(errado));

  console.log('[debug] --- teste 2: captcha correto via 2Captcha ---');
  const html = await page.content();
  const m = html.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/);
  if (!m) throw new Error('sem captcha');
  fs.writeFileSync(path.join(LOGS, 'captcha-debug.png'), Buffer.from(m[1], 'base64'));
  const texto = await solveImageCaptcha(m[1]);
  console.log('[debug] 2Captcha:', JSON.stringify(texto));
  const certo = await filtrar(page, texto);
  console.log('[debug] depois(certo):', JSON.stringify(certo));

  await page.screenshot({ path: path.join(LOGS, 'debug-filtro.png'), fullPage: true });
  fs.writeFileSync(path.join(LOGS, 'debug-filtro.html'), await page.content());
  await browser.close();
  console.log('[debug] fim');
})().catch((e) => {
  console.error('[debug] ERRO:', e.message);
  process.exit(1);
});
