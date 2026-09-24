const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'bookings.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(bookings) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(bookings, null, 2));
}

function add(booking) {
  const bookings = load();
  const entry = {
    id: Date.now().toString(36),
    data: booking.data, // "YYYY-MM-DD"
    horaInicio: booking.horaInicio, // "HH:MM"
    horaFim: booking.horaFim, // "HH:MM"
    criadoEm: new Date().toISOString(),
  };
  bookings.push(entry);
  save(bookings);
  return entry;
}

function remove(id) {
  const bookings = load().filter((b) => b.id !== id);
  save(bookings);
}

function clear() {
  save([]);
}

module.exports = { load, save, add, remove, clear };
