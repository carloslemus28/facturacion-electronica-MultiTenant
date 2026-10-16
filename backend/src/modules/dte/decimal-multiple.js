'use strict';

// Validate the decimal value that JSON actually serializes, not a floating-point
// division (e.g. 1.15 / 1e-8 becomes 114999999.99999999 in JavaScript).
const decimalParts = value => {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
};
const isDecimalMultiple = (value, divisor) => {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      typeof divisor !== 'number' || !Number.isFinite(divisor) || divisor <= 0) return false;
  const a = decimalParts(value), b = decimalParts(divisor);
  const shift = a.exponent - b.exponent;
  return shift >= 0
    ? (a.coefficient * 10n ** BigInt(shift)) % b.coefficient === 0n
    : a.coefficient % (b.coefficient * 10n ** BigInt(-shift)) === 0n;
};
const installDecimalMultiple = ajv => {
  // Keep the official keyword and schema unchanged; only its arithmetic changes.
  ajv.removeKeyword('multipleOf');
  ajv.addKeyword({
    keyword: 'multipleOf', type: 'number', schemaType: 'number',
    metaSchema: { type: 'number', exclusiveMinimum: 0 }, errors: true,
    compile(divisor) {
      function validate(value) {
        const valid = isDecimalMultiple(value, divisor);
        validate.errors = valid ? null : [{ keyword: 'multipleOf',
          params: { multipleOf: divisor }, message: `must be multiple of ${divisor}` }];
        return valid;
      }
      return validate;
    }
  });
  return ajv;
};
module.exports = { isDecimalMultiple, installDecimalMultiple };
