/**
 * A very small expect() over node:assert.
 *
 * The specs run on Node's built-in test runner, so the widget keeps zero test
 * dependencies and package-lock.json stays in step with package.json. This
 * exists only so the assertions still read the way they do elsewhere in the
 * codebase; it is not a general-purpose matcher library.
 */

var assert = require('assert');

module.exports = function expect(actual) {
  return {
    toBe: function(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual: function(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toHaveLength: function(expected) {
      assert.strictEqual(
        actual.length,
        expected,
        'expected length ' + expected + ', got ' + actual.length
      );
    },
    toBeUndefined: function() {
      assert.strictEqual(actual, undefined);
    },
    toBeDefined: function() {
      assert.notStrictEqual(actual, undefined);
    },
    toBeLessThan: function(expected) {
      assert.ok(actual < expected, actual + ' is not less than ' + expected);
    },
    toBeLessThanOrEqual: function(expected) {
      assert.ok(actual <= expected, actual + ' is not at most ' + expected);
    },
    toBeGreaterThan: function(expected) {
      assert.ok(actual > expected, actual + ' is not greater than ' + expected);
    }
  };
};
