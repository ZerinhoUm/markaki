// Explorar 2: varre as datas da semana ate achar um grid populado,
// para mapear a estrutura dos eventos e o botao Participar.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./login');
const { solveImageCaptcha } = require('./captcha');

const LOGS = path.join(__dirname, '..', 'logs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolverCaptchaFiltro(page, tag) {
  const html = await page.content();
  const m = html.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/);
  if (!m) throw new Error('captcha do filtro nao encontrado');
  fs.writeFileSync(path.join(LOGS, `captcha-${tag}.png`), Buffer.from(m[1], 'base64'));
  const texto = await solveImageCaptcha(m[1]);
  console.log(`[exp2] captcha ${tag}: "${texto}"`);
  return texto;
}

async function estadoResultados(page) {
  return page.evaluate(() => {
    const av = document.getElementById('lblAvisoEventos');
    return {
      aviso: av ? av.innerText.trim() : '',
      participar: document.querySelectorAll('.btnParticipar').length,
    };
  });
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

  const datas = await page.evaluate(() =>
    [...document.querySelectorAll('#ddlDataEvento option')]
      .filter((o) => o.value !== '0')
      .map((o) => ({ value: o.value, label: o.textContent.trim() }))
  );
  console.log('[exp2] datas disponiveis:', datas.map((d) => d.label).join(', '));

  for (const data of datas) {
    console.log(`[exp2] --- filtrando ${data.label} ---`);
    await page.selectOption('#ddlDataEvento', data.value);
    await page.waitForLoadState('domcontentloaded');
    await sleep(1200);

    const texto = await resolverCaptchaFiltro(page, `data-${data.label}`);
    await page.fill('#TextCaptcha', texto);
    await page.click('#btnConsultar');
    await sleep(5000);

    const info = await estadoResultados(page);
    console.log(`[exp2] ${data.label}:`, JSON.stringify(info));
    if (info.participar > 0) {
      console.log('[exp2] ACHOU EVENTOS! salvando...');
      await page.screenshot({ path: path.join(LOGS, 'exp-grid.png'), fullPage: true });
      fs.writeFileSync(path.join(LOGS, 'exp-grid.html'), await page.content());
      break;
    }
  }

  await browser.close();
  console.log('[exp2] fim');
})().catch((e) => {
  console.error('[exp2] ERRO:', e.message);
  process.exit(1);
});
