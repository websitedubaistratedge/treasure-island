import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, timingSafeEqual, randomString, CODE_ALPHABET, generatePassword, sha256Hex, hmacSha256Hex } from '../../src/lib/crypto.js';
import { dubaiToUtcIso, addDays, weekday, formatDubai } from '../../src/lib/time.js';
import { toFils, formatAed } from '../../src/lib/money.js';
import { phone, email, slugify, url } from '../../src/lib/validate.js';
import { verifyStripeSignature } from '../../src/lib/stripe.js';
import { HttpError } from '../../src/lib/http.js';
import { parseRange, partsForRange, sniffVideo, firstImage, firstVideo, posterUrl, PART_SIZE } from '../../src/lib/media.js';

test('password hashing verifies the right password and rejects others', async () => {
  const h = await hashPassword('correct horse battery staple');
  const stored = { password_hash: h.hash, password_salt: h.salt, password_iter: h.iterations };
  assert.equal(h.iterations, 100000);
  assert.equal(await verifyPassword('correct horse battery staple', stored), true);
  assert.equal(await verifyPassword('correct horse battery stapl', stored), false);
  const h2 = await hashPassword('correct horse battery staple');
  assert.notEqual(h.salt, h2.salt, 'every hash gets its own salt');
  assert.notEqual(h.hash, h2.hash);
});

test('timingSafeEqual', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true);
  assert.equal(timingSafeEqual('abc', 'abd'), false);
  assert.equal(timingSafeEqual('abc', 'abcd'), false);
  assert.equal(timingSafeEqual('abc', null), false);
});

test('codes only use the unambiguous alphabet', () => {
  const s = randomString(5000, CODE_ALPHABET);
  assert.equal(s.length, 5000);
  assert.ok([...s].every((c) => CODE_ALPHABET.includes(c)));
  for (const bad of ['0', 'O', '1', 'I', 'L']) assert.ok(!s.includes(bad), `no ${bad}`);
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;
  assert.equal(Object.keys(counts).length, CODE_ALPHABET.length, 'every symbol appears');
});

test('generated passwords are 24 chars with every character class', () => {
  for (let i = 0; i < 50; i++) {
    const p = generatePassword();
    assert.equal(p.length, 24);
    assert.match(p, /[A-Z]/); assert.match(p, /[a-z]/); assert.match(p, /[2-9]/); assert.match(p, /[!@#$%*?\-_+=]/);
  }
  assert.notEqual(generatePassword(), generatePassword());
});

test('sha256 and hmac match known vectors', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
});

test('Dubai local time converts to UTC', () => {
  assert.equal(dubaiToUtcIso('2026-09-20', '10:00'), '2026-09-20T06:00:00.000Z');
  assert.equal(dubaiToUtcIso('2026-01-01', '02:30'), '2025-12-31T22:30:00.000Z');
  assert.throws(() => dubaiToUtcIso('2026-02-30', '10:00'), HttpError);
  assert.throws(() => dubaiToUtcIso('2026-09-20', '25:00'), HttpError);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekday('2026-09-20'), 0);
  assert.equal(formatDubai('2026-09-20T06:00:00.000Z'), 'Sun 20 Sep, 10:00');
});

test('money in fils', () => {
  assert.equal(toFils('150'), 15000);
  assert.equal(toFils(99.99), 9999);
  assert.equal(toFils(''), null);
  assert.throws(() => toFils('-1'), HttpError);
  assert.throws(() => toFils('abc'), HttpError);
  assert.equal(formatAed(15000), '150 AED');
  assert.equal(formatAed(null), 'Ask for price');
});

test('phone and email normalisation', () => {
  assert.equal(phone('050 473 8452'), '+971504738452');
  assert.equal(phone('+971 50 473 8452'), '+971504738452');
  assert.equal(phone('00971504738452'), '+971504738452');
  assert.throws(() => phone('12'), HttpError);
  assert.equal(email('  Parent@Example.COM '), 'parent@example.com');
  assert.throws(() => email('nope@'), HttpError);
  assert.equal(slugify('Treasure Island Adventure!'), 'treasure-island-adventure');
  assert.equal(url('/play#shop', 'link'), '/play#shop');
  assert.throws(() => url('javascript:alert(1)', 'link'), HttpError);
});

test('Stripe webhook signature verification', async () => {
  const secret = 'whsec_test_secret';
  const body = '{"id":"evt_1","type":"checkout.session.completed"}';
  const t = 1_800_000_000;
  const sig = await hmacSha256Hex(secret, `${t}.${body}`);
  assert.equal(await verifyStripeSignature(secret, body, `t=${t},v1=${sig}`, 300, t + 10), true);
  assert.equal(await verifyStripeSignature(secret, body + ' ', `t=${t},v1=${sig}`, 300, t + 10), false, 'body tampered');
  assert.equal(await verifyStripeSignature(secret, body, `t=${t},v1=${sig}`, 300, t + 1000), false, 'too old');
  assert.equal(await verifyStripeSignature('wrong', body, `t=${t},v1=${sig}`, 300, t), false, 'wrong secret');
  assert.equal(await verifyStripeSignature(secret, body, `t=${t},v0=${sig}`, 300, t), false, 'no v1');
});

test('JSON embedded in a <script> tag cannot break out of it', async () => {
  const { scriptJson } = await import('../../src/lib/html.js');
  const ls = String.fromCharCode(0x2028);
  const ps = String.fromCharCode(0x2029);
  const out = scriptJson({ a: '</script><script>alert(1)</script>', b: `x${ls}y${ps}z` });
  assert.ok(!out.includes('</'), 'no raw closing tag');
  assert.ok(!out.includes(ls) && !out.includes(ps), 'no raw line/paragraph separators');
  assert.deepEqual(JSON.parse(out), { a: '</script><script>alert(1)</script>', b: `x${ls}y${ps}z` }, 'still round-trips to the same data');
});

test('byte ranges: what a video player asks for maps to the right stored parts', () => {
  const total = 1_300_000; // three parts of 512 KB
  assert.deepEqual(parseRange('bytes=0-', total), { start: 0, end: total - 1 });
  assert.deepEqual(parseRange('bytes=100-199', total), { start: 100, end: 199 });
  assert.deepEqual(parseRange('bytes=-500', total), { start: total - 500, end: total - 1 });
  // past the end is clamped, not an error
  assert.deepEqual(parseRange('bytes=1000-99999999', total), { start: 1000, end: total - 1 });
  // a start beyond the file is refused, which browsers expect as a 416
  assert.deepEqual(parseRange(`bytes=${total}-`, total), { unsatisfiable: true });
  assert.equal(parseRange('', total), null);
  assert.equal(parseRange('parts=1-2', total), null);

  assert.deepEqual(partsForRange(0, 10), { first: 0, last: 0, offset: 0 });
  assert.deepEqual(partsForRange(PART_SIZE - 1, PART_SIZE), { first: 0, last: 1, offset: PART_SIZE - 1 });
  assert.deepEqual(partsForRange(PART_SIZE * 2 + 5, PART_SIZE * 2 + 9), { first: 2, last: 2, offset: 5 });
});

test('videos are checked by their own bytes, not the name they arrive with', () => {
  const mp4 = new Uint8Array(16); mp4.set([0x66, 0x74, 0x79, 0x70], 4);
  const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(sniffVideo(mp4), 'video/mp4');
  assert.equal(sniffVideo(webm), 'video/webm');
  assert.equal(sniffVideo(new Uint8Array(16)), null);
  assert.equal(sniffVideo(Uint8Array.from([0x1a, 0x45])), null); // too short to tell
});

test('a gallery picks the first photo and the first video, in the admin order', () => {
  const items = [
    { id: 'a', kind: 'image' },
    { id: 'b', kind: 'video', poster_id: 'p1' },
    { id: 'c', kind: 'video' },
  ];
  assert.equal(firstImage(items).id, 'a');
  assert.equal(firstVideo(items).id, 'b');
  assert.equal(posterUrl(firstVideo(items)), '/media/p1');
  assert.equal(posterUrl({ kind: 'video', poster_id: null }), null);
  assert.equal(posterUrl({ kind: 'image', id: 'a' }), '/media/a');
  assert.equal(firstVideo([]), null);
});
