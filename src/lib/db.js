export const nowIso = () => new Date().toISOString();

// D1 rejects undefined outright; an absent optional field means NULL.
const clean = (params) => params.map((v) => (v === undefined ? null : v));

export async function one(db, sql, ...params) {
  return (await db.prepare(sql).bind(...clean(params)).first()) || null;
}

export async function all(db, sql, ...params) {
  const { results } = await db.prepare(sql).bind(...clean(params)).all();
  return results || [];
}

export async function run(db, sql, ...params) {
  return db.prepare(sql).bind(...clean(params)).run();
}

export function parseJson(text, fallback) {
  if (text == null) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

// Builds "col = ?" fragments for a PATCH from an allow-listed set of fields,
// so a request can never write a column it was not meant to.
export function patchSet(input, allowed) {
  const cols = [];
  const vals = [];
  for (const [key, transform] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      cols.push(`${key} = ?`);
      vals.push(transform(input[key]));
    }
  }
  return { cols, vals };
}
