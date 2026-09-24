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

app.post('/api/bookings', exigirPin, (req, res) => {
  const { data, horaInicio, horaFim } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || !/^\d{2}:\d{2}$/.test(horaInicio || '') || !/^\d{2}:\d{2}$/.test(horaFim || '')) {
    return res.status(400).json({ erro: 'Formato invalido. Use data YYYY-MM-DD e horas HH:MM' });
  }
  if (horaFim <= horaInicio) {
    return res.status(400).json({ erro: 'Hora fim precisa ser depois da hora inicio' });
  }
  const entry = bookings.add({ data, horaInicio, horaFim });
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
