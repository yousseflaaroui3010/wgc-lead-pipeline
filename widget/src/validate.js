// Validation rules (form v2, 2026-07-16). Mirrored verbatim in the WF-1
// intake code node (n8n/workflows/wf1-intake.json); the validation matrix
// runs the same fixtures against both sides to enforce parity.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP_RE = /^\d{5}$/;
const BEDROOMS_OPTIONS = ['2', '3', '4', '5+'];

export const RULES = {
  name: { min: 1, max: 120 },
  email: { max: 254 },
  sqft: { min: 300, max: 10000 },
  bedrooms: { options: BEDROOMS_OPTIONS },
};

// Single "Name" field (v2 merged first+last). Retained as a pure helper;
// no longer part of validateAll since estimate-first dropped the name field.
export function validateName(value) {
  const v = String(value == null ? '' : value).trim();
  if (v.length < RULES.name.min || v.length > RULES.name.max) return null;
  return v;
}

export function validateEmail(value) {
  const v = String(value == null ? '' : value).trim();
  if (v.length > RULES.email.max || !EMAIL_RE.test(v)) return null;
  return v;
}

// US-only (S2-D2). An explicit "+" declares a country code, so it must be
// +1; otherwise strip formatting and accept exactly 10 digits, or 11 with a
// leading 1. Everything else rejects (e.g. "+218..." is Libya, not US).
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

// Required, exactly 5 numeric digits. Returns the 5-digit string or null.
export function validateZip(value) {
  const v = String(value == null ? '' : value).trim();
  return ZIP_RE.test(v) ? v : null;
}

// Required, numeric, 300–10000 inclusive. Returns the integer or null.
export function validateSqft(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < RULES.sqft.min || n > RULES.sqft.max) return null;
  return n;
}

// Optional segmented select. Empty -> null (valid, skippable). A value must
// be one of the allowed options; anything else -> undefined (invalid).
export function validateBedrooms(value) {
  const v = String(value == null ? '' : value).trim();
  if (v === '') return null;
  return BEDROOMS_OPTIONS.indexOf(v) !== -1 ? v : undefined;
}

// Validates the raw field map from the form. Returns
// { ok: true, data } or { ok: false, errors: { field: message } }.
//
// Estimate-first (2026-07-22): the property fields alone (zip + sqft, beds
// optional) produce the instant estimate, so NAME and PHONE are no longer
// collected and are never required. Contact is opt-in: only when the visitor
// checks the ebook consent box (fields.ebook_opt_in) is EMAIL required. An
// un-checked submission carries no contact info by design.
export function validateAll(fields) {
  const errors = {};
  const data = {};

  data.zip = validateZip(fields.zip);
  if (data.zip === null) errors.zip = 'Enter a 5-digit ZIP code.';

  data.sqft = validateSqft(fields.sqft);
  if (data.sqft === null) errors.sqft = 'Enter square footage between 300 and 10,000.';

  data.bedrooms = validateBedrooms(fields.bedrooms);
  if (data.bedrooms === undefined) errors.bedrooms = 'Choose 2, 3, 4, or 5+.';

  data.ebook_opt_in = fields.ebook_opt_in === true;
  if (data.ebook_opt_in) {
    data.email = validateEmail(fields.email);
    if (data.email === null) errors.email = 'Enter a valid email address.';
  } else {
    data.email = null;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}
