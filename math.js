// Leverage Lens maths, in its own file so tests/math.test.js can run it in Node.
// Loaded before overlay.js; content scripts of one extension share these globals.

// A mini: price = |level − financing| / parity × fx. A 1× tracker: price = k × level, no stop.
const priceAt = (m, u) => (m.k ? u * m.k : Math.max(0, (m.long ? u - m.fin : m.fin - u) / m.parity * m.fx));
const levelAt = (m, p) => (m.k ? p / m.k : m.long ? m.fin + (p * m.parity) / m.fx : m.fin - (p * m.parity) / m.fx);
const stopped = (m, u) => (m.k ? false : m.long ? u <= m.stop : u >= m.stop);
// A mini's underlying level from Avanza's leverage: long L = u / (u − f), short L = u / (f − u). Null when unsolvable.
const ownLevel = (L, f, short) => (short ? (L * f) / (L + 1) : L > 1 ? (L * f) / (L - 1) : null);

if (typeof module !== 'undefined') module.exports = { priceAt, levelAt, stopped, ownLevel };
