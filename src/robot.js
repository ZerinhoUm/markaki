require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { login } = require('./login');
const bookings = require('./bookings');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function screenshot(page, nome) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const arquivo = path.join(LOGS_DIR, `${timestamp()}-${nome}.png`);
  await page.screenshot({ path: arquivo, fullPage: true });
  console.log(`[robot] screenshot salvo: ${arquivo}`);
  return arquivo;
}

async function solicitarServicoExtra(page, booking) {
  // TODO (Fase 2): mapear o fluxo real de solicitacao de servico extra
  // apos o login — menus, campos de data/hora e botao de envio.
  throw new Error('Fluxo de servico extra ainda nao mapeado (Fase 2)');
}

async function main() {
  const modoExplorar = process.argv.includes('--explorar');
  const pendentes = bookings.load();

  if (!modoExplorar && pendentes.length === 0) {
    console.log('[robot] nenhuma solicitacao agendada, nada a fazer');
    return;
  }

  const browser = await chromium.launch({ headless: !modoExplorar });
  try {
    const page = await browser.newPage();
    await login(page);
    await screenshot(page, 'pos-login');

    if (modoExplorar) {
      const html = await page.content();
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      fs.writeFileSync(path.join(LOGS_DIR, `${timestamp()}-pos-login.html`), html);
      console.log('[robot] modo explorar: HTML da tela pos-login salvo em logs/');
      return;
    }

    for (const booking of pendentes) {
      console.log(`[robot] solicitando: ${booking.data} ${booking.horaInicio}-${booking.horaFim}`);
      await solicitarServicoExtra(page, booking);
      await screenshot(page, `extra-${booking.data}`);
    }

    bookings.clear();
    console.log('[robot] todas as solicitacoes enviadas');
  } catch (err) {
    console.error(`[robot] ERRO: ${err.message}`);
    try {
      const page = browser.contexts()[0]?.pages()[0];
      if (page) await screenshot(page, 'erro');
    } catch {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
