// Robo principal: roda quinta 06:00 (via cron na VPS).
// Login -> Escala -> Nova Inscricao -> para cada booking: filtra a data,
// acha o evento pelo horario e clica em Participar.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./login');
const { solveImageCaptcha } = require('./captcha');
const bookings = require('./bookings');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const CONVENIO = process.env.PROEIS_CONVENIO || '42'; // 40 BPM - RAS
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function screenshot(page, nome) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const arquivo = path.join(LOGS_DIR, `${timestamp()}-${nome}.png`);
  await page.screenshot({ path: arquivo, fullPage: true });
  return arquivo;
}

async function captchaDoFiltro(page) {
  const html = await page.content();
  const m = html.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/);
  if (!m) throw new Error('captcha do filtro nao encontrado');
  return m[1];
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

// Filtra uma data, resolvendo captcha com retry.
// Retorna 'ok' (grid carregado), 'sem-evento' ou lanca erro.
async function filtrarData(page, dataISO) {
  const selecionou = await page.evaluate((data) => {
    const sel = document.getElementById('ddlDataEvento');
    const op = [...sel.options].find((o) => o.textContent.trim() === data);
    if (!op) return false;
    sel.value = op.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, dataISO);
  if (!selecionou) {
    console.log(`[robot] data ${dataISO} nao esta no dropdown (fora da semana aberta)`);
    return 'sem-evento';
  }
  await page.waitForLoadState('domcontentloaded');
  await sleep(1500);

  for (let tent = 1; tent <= 5; tent++) {
    const b64 = await captchaDoFiltro(page);
    fs.writeFileSync(path.join(LOGS_DIR, `${timestamp()}-filtro-${dataISO}-${tent}.png`), Buffer.from(b64, 'base64'));
    const texto = await solveImageCaptcha(b64);
    console.log(`[robot] captcha filtro ${dataISO} (${tent}/5): "${texto}"`);
    await page.fill('#TextCaptcha', texto);
    await page.click('#btnConsultar');
    await sleep(5000);

    const info = await estadoResultados(page);
    if (info.participar > 0) return 'ok';
    if (info.aviso) {
      console.log(`[robot] sistema: "${info.aviso}"`);
      return 'sem-evento';
    }
    console.log('[robot] captcha recusado (aviso vazio), tentando de novo...');
    await sleep(1000);
  }
  throw new Error(`Captcha do filtro falhou 5x para ${dataISO}`);
}

// Clica em Participar no evento cujo texto bate com a hora de inicio.
async function participar(page, booking, data) {
  const alvo = await page.evaluate((horaInicio) => {
    const botoes = [...document.querySelectorAll('.btnParticipar')];
    const candidatos = botoes.map((b) => {
      const linha = b.closest('tr') || b.closest('div');
      return { texto: (linha ? linha.innerText : '').replace(/\s+/g, ' '), indice: botoes.indexOf(b) };
    });
    const achou = candidatos.find((c) => c.texto.includes(horaInicio));
    return { achou: achou ? achou.indice : -1, candidatos: candidatos.map((c) => c.texto.slice(0, 120)) };
  }, booking.horaInicio);

  console.log('[robot] eventos no grid:', JSON.stringify(alvo.candidatos));
  if (alvo.achou < 0) {
    await screenshot(page, `sem-horario-${data}`);
    console.log(`[robot] nenhum evento as ${booking.horaInicio} em ${data}`);
    return false;
  }

  const botoes = await page.$$('.btnParticipar');
  await botoes[alvo.achou].click();
  await sleep(4000);
  await screenshot(page, `participar-${data}`);
  console.log(`[robot] Participar clicado: ${data} ${booking.horaInicio}`);
  return true;
}

async function main() {
  const pendentes = bookings.load();
  if (pendentes.length === 0) {
    console.log('[robot] nenhuma solicitacao agendada, nada a fazer');
    return;
  }
  console.log(`[robot] ${pendentes.length} solicitacao(oes) para enviar`);

  const browser = await chromium.launch({ headless: true });
  const enviados = [];
  try {
    const page = await browser.newPage();
    await login(page);
    await screenshot(page, 'pos-login');

    await page.click('#btnEscala');
    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);
    await page.click('#btnNovaInscricao');
    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);
    await page.selectOption('#ddlConvenios', CONVENIO);
    await page.waitForLoadState('domcontentloaded');
    await sleep(1500);

    for (const booking of pendentes) {
      const datas = booking.datas || [booking.data];
      console.log(`[robot] === ${datas.join(' -> ')} | ${booking.horaInicio}-${booking.horaFim} ===`);
      for (const data of datas) {
        try {
          const status = await filtrarData(page, data);
          if (status === 'ok' && (await participar(page, booking, data))) {
            enviados.push(booking.id);
            break;
          }
          console.log(`[robot] sem vaga em ${data}, tentando proxima data...`);
        } catch (err) {
          console.error(`[robot] falha em ${data}: ${err.message}`);
          await screenshot(page, `erro-${data}`);
        }
      }
    }

    if (enviados.length) {
      const restantes = pendentes.filter((b) => !enviados.includes(b.id));
      bookings.save(restantes);
    }
    console.log(`[robot] fim: ${enviados.length}/${pendentes.length} enviadas`);
    if (enviados.length < pendentes.length) process.exitCode = 1;
  } catch (err) {
    console.error(`[robot] ERRO GERAL: ${err.message}`);
    try {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) await screenshot(page, 'erro-geral');
    } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
