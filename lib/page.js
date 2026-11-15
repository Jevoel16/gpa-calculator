// Offset pagination for list endpoints: ?limit= (1–100, default 50) and ?offset= (0 or more)
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function readPage(query = {}) {
  const limit = Number.parseInt(query.limit, 10);
  const offset = Number.parseInt(query.offset, 10);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  };
}

// Queries fetch one extra row; its presence means another page exists
function toPage(rows, { limit, offset }) {
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

module.exports = { readPage, toPage, MAX_LIMIT };
