const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;

async function getAll(query, pageSize = DEFAULT_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new TypeError('pageSize must be an integer between 1 and 100');
  }

  const rows = [];
  const seenIds = new Set();
  let offset = 0;

  while (true) {
    const result = await query.skip(offset).limit(pageSize).get();
    const page = result.data || [];
    let added = 0;

    for (const row of page) {
      if (row && row._id) {
        if (seenIds.has(row._id)) continue;
        seenIds.add(row._id);
      }
      rows.push(row);
      added += 1;
    }

    if (page.length < pageSize) break;
    if (added === 0) break;
    offset += page.length;
  }

  return rows;
}

module.exports = { getAll };
