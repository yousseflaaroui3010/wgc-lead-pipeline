// Validation matrix (form v2). Mirrors the WF-1 intake rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName,
  validateEmail,
  normalizePhone,
  validateZip,
  validateSqft,
  validateBedrooms,
  validateAll,
} from '../src/validate.js';

test('name: single field, 1-120 chars, trimmed', () => {
  assert.equal(validateName('Ada Lovelace'), 'Ada Lovelace');
  assert.equal(validateName('  Jon '), 'Jon');
  assert.equal(validateName('x'.repeat(120)), 'x'.repeat(120));
  assert.equal(validateName('x'.repeat(121)), null);
  assert.equal(validateName(''), null);
  assert.equal(validateName('   '), null);
  assert.equal(validateName(null), null);
});

test('email: RFC-basic, max 254', () => {
  assert.equal(validateEmail('jon@westromgroup.com'), 'jon@westromgroup.com');
  assert.equal(validateEmail('no-at-sign.com'), null);
  assert.equal(validateEmail('a@b'), null);
  const local254 = 'a'.repeat(242) + '@example.com';
  assert.equal(validateEmail(local254), local254);
  assert.equal(validateEmail('a'.repeat(243) + '@example.com'), null);
});

test('phone: US-only E.164 normalization', () => {
  assert.equal(normalizePhone('(817) 445-1108'), '+18174451108');
  assert.equal(normalizePhone('817-445-110'), null);
  assert.equal(normalizePhone('+218174451108'), null);
  assert.equal(normalizePhone('18174451108'), '+18174451108');
  assert.equal(normalizePhone(''), null);
});

test('zip: required, exactly 5 digits', () => {
  assert.equal(validateZip('76052'), '76052');
  assert.equal(validateZip(' 76052 '), '76052');
  assert.equal(validateZip('7605'), null);   // 4 digits
  assert.equal(validateZip('760521'), null);  // 6 digits
  assert.equal(validateZip('7605a'), null);   // non-numeric
  assert.equal(validateZip('abcde'), null);
  assert.equal(validateZip(''), null);
});

test('sqft: required numeric, 300-10000 inclusive', () => {
  assert.equal(validateSqft('300'), 300);     // lower bound
  assert.equal(validateSqft('10000'), 10000); // upper bound
  assert.equal(validateSqft('1850'), 1850);
  assert.equal(validateSqft('299'), null);    // below
  assert.equal(validateSqft('10001'), null);  // above
  assert.equal(validateSqft('1850.5'), null); // non-integer
  assert.equal(validateSqft('abc'), null);
  assert.equal(validateSqft(''), null);       // required
});

test('bedrooms: optional segmented enum 2/3/4/5+', () => {
  assert.equal(validateBedrooms(''), null);   // skippable
  assert.equal(validateBedrooms('2'), '2');
  assert.equal(validateBedrooms('5+'), '5+');
  assert.equal(validateBedrooms('1'), undefined);   // not an option
  assert.equal(validateBedrooms('6'), undefined);
  assert.equal(validateBedrooms('three'), undefined);
});

test('validateAll: happy path normalizes and passes (bedrooms optional)', () => {
  const res = validateAll({
    name: 'Jon Westrom', email: 'jon@westromgroup.com',
    phone: '(817) 445-1108', zip: '76052', sqft: '1850', bedrooms: '',
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.phone, '+18174451108');
  assert.equal(res.data.zip, '76052');
  assert.equal(res.data.sqft, 1850);
  assert.equal(res.data.bedrooms, null);
});

test('validateAll: collects required-field errors, ignores skipped bedrooms', () => {
  const res = validateAll({
    name: '', email: 'bad', phone: '123', zip: '7', sqft: '50', bedrooms: '',
  });
  assert.equal(res.ok, false);
  assert.deepEqual(
    Object.keys(res.errors).sort(),
    ['email', 'name', 'phone', 'sqft', 'zip']
  );
});
