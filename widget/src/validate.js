// Validation rules per S2-A1. These rules are mirrored verbatim in the
// WF-1 intake code node (n8n/workflows/wf1-intake.json); the S4 validation
// matrix runs the same fixtures against both sides to enforce parity.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const RULES = {
  first_name: { min: 1, max: 60 },
  last_name: { min: 1, max: 60 },
  email: { max: 254 },
  property_address: { min: 5, max: 120 },
  message: { max: 1000 },
  beds: { min: 0, max: 20 },
  baths: { min: 0, max: 20, step: 0.5 },
};

export function validateName(value) {
  const v = String(value == null ? '' : value).trim();
  if (v.length < RULES.first_name.min || v.length > RULES.first_name.max) return null;
  return v;
}

export function validateEmail(value) {
  const v = String(value == null ? '' : value).trim();
  if (v.length > RULES.email.max || !EMAIL_RE.test(v)) return null;
  return v;
}

// US-only in v1 (S2-D2). An explicit "+" declares a country code, so it must
// be +1; otherwise strip formatting and accept exactly 10 digits, or 11 with
// a leading 1. Everything else rejects (e.g. "+218..." is Libya, not US).
export function normalizePhone(value) {
  const raw = String(value == null ? '' : value).trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !raw.startsWith('+1')) return null;
  if (raw.startsWith('+')) {
    return digits.length === 11 ? '+' + digits : null;
  }
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return null;
}

export function validateAddress(value) {
  const v = String(value == null ? '' : value).trim();
  const { min, max } = RULES.property_address;
  if (v.length < min || v.length > max) return null;
  return v;
}

// Optional integer 0-20; empty input -> null (valid), bad input -> undefined (invalid).
export function validateBeds(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < RULES.beds.min || n > RULES.beds.max) return undefined;
  return n;
}

// Optional, 0.5 steps, 0-20; empty -> null, bad -> undefined.
export function validateBaths(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n) || n < RULES.baths.min || n > RULES.baths.max) return undefined;
  if (Math.round(n * 2) !== n * 2) return undefined;
  return n;
}

export function validateMessage(value) {
  const v = String(value == null ? '' : value).trim();
  if (v.length > RULES.message.max) return undefined;
  return v === '' ? null : v;
}

// Validates the raw field map from the form. Returns
// { ok: true, data } or { ok: false, errors: { field: message } }.
export function validateAll(fields) {
  const errors = {};
  const data = {};

  data.first_name = validateName(fields.first_name);
  if (data.first_name === null) errors.first_name = 'Enter your first name (1–60 characters).';

  data.last_name = validateName(fields.last_name);
  if (data.last_name === null) errors.last_name = 'Enter your last name (1–60 characters).';

  data.email = validateEmail(fields.email);
  if (data.email === null) errors.email = 'Enter a valid email address.';

  data.phone = normalizePhone(fields.phone);
  if (data.phone === null) errors.phone = 'Enter a valid US phone number (10 digits).';

  data.property_address = validateAddress(fields.property_address);
  if (data.property_address === null) errors.property_address = 'Enter the property address (5–120 characters).';

  data.beds = validateBeds(fields.beds);
  if (data.beds === undefined) errors.beds = 'Beds must be a whole number from 0 to 20.';

  data.baths = validateBaths(fields.baths);
  if (data.baths === undefined) errors.baths = 'Baths must be between 0 and 20 in half steps.';

  data.message = validateMessage(fields.message);
  if (data.message === undefined) errors.message = 'Message must be 1,000 characters or fewer.';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
