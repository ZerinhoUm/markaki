require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bookings = require('./bookings');

const app = express();
const PORT = process.env.PORT || 3000;
const PIN = process.env.PANEL_PIN || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function autenticado(req) {
  return PIN && req.headers['x-pin'] === PIN;
}

function exigirPin(req, res, next) {
  if (!autenticado(req)) {
    return res.status(401).json({ erro: 'PIN invalido' });
  }
  next();
}

app.get('/api/bookings', exigirPin, (req, res) => {
  res.json(bookings.load());
});

const TURNOS_VALIDOS = new Set(['06:00-18:00', '07:00-19:00']);

app.post('/api/bookings', exigirPin, (req, res) => {
  const { datas, horaInicio, horaFim } = req.body || {};
  const lista = Array.isArray(datas) ? datas.filter(Boolean).slice(0, 3) : [];
  if (!lista.length || !lista.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return res.status(400).json({ erro: 'Informe de 1 a 3 datas no formato YYYY-MM-DD' });
  }
  if (new Set(lista).size !== lista.length) {
    return res.status(400).json({ erro: 'As datas precisam ser diferentes' });
  }
  if (!TURNOS_VALIDOS.has(`${horaInicio}-${horaFim}`)) {
    return res.status(400).json({ erro: 'Horario invalido. Use 06:00-18:00 ou 07:00-19:00' });
  }
  const entry = bookings.add({ datas: lista, horaInicio, horaFim });
  res.status(201).json(entry);
});

app.delete('/api/bookings/:id', exigirPin, (req, res) => {
  bookings.remove(req.params.id);
  res.status(204).end();
});

app.get('/api/status', exigirPin, (req, res) => {
  const logsDir = path.join(__dirname, '..', 'logs');
  let ultima = null;
  try {
    const arquivos = fs.readdirSync(logsDir)
      .filter((f) => f.endsWith('.png') && !f.startsWith('captcha'))
      .sort();
    if (arquivos.length) ultima = arquivos[arquivos.length - 1];
  } catch {}
  res.json({ ultimaExecucao: ultima });
});

app.listen(PORT, () => {
  console.log(`[painel] rodando em http://localhost:${PORT}`);
  if (!PIN) console.log('[painel] AVISO: PANEL_PIN nao configurado no .env!');
});
