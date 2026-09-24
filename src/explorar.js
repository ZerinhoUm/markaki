// Exploracao autenticada: login automatico (2Captcha) -> clica em "Escala"
// e salva HTML + screenshot de cada etapa em logs/.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./login');

const LOGS = path.join(__dirname, '..', 'logs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function salvar(page, nome) {
  await page.waitForLoadState('load').catch(() => {});
  await sleep(1000);
  await page.screenshot({ path: path.join(LOGS, `${nome}.png`), fullPage: true });
  fs.writeFileSync(path.join(LOGS, `${nome}.html`), await page.content());
  console.log(`[explorar] salvo logs/${nome}.png/.html | URL: ${page.url()}`);
}

(async () => {
  fs.mkdirSync(LOGS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await login(page);
  await salvar(page, 'exp-1-menu');

  // Botao "Escala" (Inscricoes)
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#btnEscala'),
  ]);
  await sleep(1500);
  await salvar(page, 'exp-2-escala');

  // Botao "Nova Inscricao"
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#btnNovaInscricao'),
  ]);
  await sleep(1500);
  await salvar(page, 'exp-3-nova-inscricao');

  // Filtros: Convenio -> Data -> CPA (cada select dispara postback)
  await page.selectOption('#ddlConvenios', '42'); // 40 BPM - RAS
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);
  await salvar(page, 'exp-4-apos-convenio');

  await page.selectOption('#ddlDataEvento', { label: '2026-09-29' });
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);

  await salvar(page, 'exp-5-apos-filtros');

  // Captcha do filtro + botao Filtrar, com retry (SEM clicar em Participar)
  const { solveImageCaptcha } = require('./captcha');
  for (let tent = 1; tent <= 3; tent++) {
    const html = await page.content();
    const m = html.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/);
    if (!m) throw new Error('captcha do filtro nao encontrado');
    fs.writeFileSync(path.join(LOGS, `captcha-filtro-${tent}.png`), Buffer.from(m[1], 'base64'));
    const texto = await solveImageCaptcha(m[1]);
    console.log(`[explorar] captcha do filtro ${tent}/3: "${texto}"`);
    await page.fill('#TextCaptcha', texto);
    await page.click('#btnConsultar');
    // btnConsultar e async postback (UpdatePanel): espera o overlay #aguarde sumir
    await page.waitForFunction(() => {
      const ag = document.getElementById('aguarde');
      return !ag || ag.style.display === 'none' || ag.offsetParent === null;
    }, { timeout: 20000 }).catch(() => console.log('[explorar] timeout esperando #aguarde'));
    await sleep(2000);

    const info = await page.evaluate(() => {
      const av = document.getElementById('lblAvisoEventos');
      const ac = document.getElementById('accordionConvenio');
      return {
        aviso: av ? av.innerText.trim() : '(sem label)',
        accordionChars: ac ? ac.innerHTML.length : -1,
        participar: document.querySelectorAll('.btnParticipar').length,
      };
    });
    console.log('[explorar] resultado:', JSON.stringify(info));
    if (info.participar > 0 || info.accordionChars > 200) break;
    if (info.aviso && info.aviso !== '(sem label)') break; // erro real, nao adianta retentar
    await page.click('#lnkCaptchaNew');
    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);
  }
  await salvar(page, 'exp-6-resultados');

  await browser.close();
  console.log('[explorar] fim');
})().catch(async (e) => {
  console.error('[explorar] ERRO:', e.message);
  process.exit(1);
});
