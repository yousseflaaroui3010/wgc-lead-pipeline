// S4 validation matrix (boundary cases per S2 rules) against the client-side
// validator. WF-1 runs the same fixture set manually at import time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateName,
  validateEmail,
  normalizePhone,
  validateAddress,
  validateBeds,
  validateBaths,
  validateMessage,
  validateAll,
} from '../src/validate.js';

test('names: 1-60 chars, trimmed', () => {
  assert.equal(validateName('J'), 'J');
  assert.equal(validateName('  Ada '), 'Ada');
  assert.equal(validateName('x'.repeat(60)), 'x'.repeat(60));
  assert.equal(validateName('x'.repeat(61)), null);
  assert.equal(validateName(''), null);
  assert.equal(validateName('   '), null);
  assert.equal(validateName(null), null);
});

test('email: RFC-basic, max 254', () => {
  assert.equal(validateEmail('jon@westromgroup.com'), 'jon@westromgroup.com');
  assert.equal(validateEmail('a@b.co'), 'a@b.co');
  assert.equal(validateEmail('no-at-sign.com'), null);
  assert.equal(validateEmail('a@b'), null);
  assert.equal(validateEmail('a b@c.com'), null);
  const local254 = 'a'.repeat(242) + '@example.com'; // exactly 254
  assert.equal(validateEmail(local254), local254);
  assert.equal(validateEmail('a'.repeat(243) + '@example.com'), null); // 255
});

test('phone: S4 fixture set, US-only E.164 (S2-D2)', () => {
  assert.equal(normalizePhone('(817) 445-1108'), '+18174451108');
  assert.equal(normalizePhone('817-445-110'), null); // 9 digits
  assert.equal(normalizePhone('+2181744511'), null); // non-US
  assert.equal(normalizePhone('+218174451108'), null); // non-US 12 digits
  assert.equal(normalizePhone('18174451108'), '+18174451108'); // 11 w/ leading 1
  assert.equal(normalizePhone('+1 (817) 445-1108'), '+18174451108');
  assert.equal(normalizePhone('28174451108'), null); // 11 not starting 1
  assert.equal(normalizePhone(''), null);
});

test('address: 5-120 chars', () => {
  assert.equal(validateAddress('5 Elm'), '5 Elm');
  assert.equal(validateAddress('1234'), null);
  assert.equal(validateAddress('x'.repeat(120)), 'x'.repeat(120));
  assert.equal(validateAddress('x'.repeat(121)), null);
});

test('beds: optional int 0-20', () => {
  assert.equal(validateBeds(''), null);
  assert.equal(validateBeds('0'), 0);
  assert.equal(validateBeds('20'), 20);
  assert.equal(validateBeds('21'), undefined);
  assert.equal(validateBeds('2.5'), undefined);
  assert.equal(validateBeds('-1'), undefined);
  assert.equal(validateBeds('abc'), undefined);
});

test('baths: optional 0.5 steps 0-20', () => {
  assert.equal(validateBaths(''), null);
  assert.equal(validateBaths('1.5'), 1.5);
  assert.equal(validateBaths('0'), 0);
  assert.equal(validateBaths('20'), 20);
  assert.equal(validateBaths('20.5'), undefined);
  assert.equal(validateBaths('1.25'), undefined);
  assert.equal(validateBaths('-0.5'), undefined);
});

test('message: optional, max 1000', () => {
  assert.equal(validateMessage(''), null);
  assert.equal(validateMessage('hi'), 'hi');
  assert.equal(validateMessage('x'.repeat(1000)), 'x'.repeat(1000));
  assert.equal(validateMessage('x'.repeat(1001)), undefined); // S4: 1,001 chars
});

test('validateAll: happy path normalizes and passes', () => {
  const res = validateAll({
    first_name: 'Jon', last_name: 'Westrom',
    email: 'jon@westromgroup.com', phone: '(817) 445-1108',
    property_address: '100 Main St, Haslet, TX', beds: '3', baths: '2.5',
    message: '',
  });
  assert.equal(res.ok, true);
  assert.equal(res.data.phone, '+18174451108');
  assert.equal(res.data.beds, 3);
  assert.equal(res.data.baths, 2.5);
  assert.equal(res.data.message, null);
});

test('validateAll: collects every field error', () => {
  const res = validateAll({
    first_name: '', last_name: '', email: 'bad', phone: '123',
    property_address: 'abc', beds: '99', baths: '1.3', message: 'x'.repeat(1001),
  });
  assert.equal(res.ok, false);
  assert.deepEqual(
    Object.keys(res.errors).sort(),
    ['baths', 'beds', 'email', 'first_name', 'last_name', 'message', 'phone', 'property_address']
  );
});
