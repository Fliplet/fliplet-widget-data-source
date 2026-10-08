// PS-2313: a grid showing server-side search matches is not a page of the
// stored sequence, so a save from it must not write row positions
var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

// Cuts the function that starts at `marker` out of the source by brace-counting,
// as interface.js needs Fliplet/jQuery globals and can't be required here
function extractFunction(source, marker) {
  var startIndex = source.indexOf(marker);

  if (startIndex === -1) {
    throw new Error('Could not find ' + marker + ' in source');
  }

  var depth = 0;

  for (var i = source.indexOf('{', startIndex); i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;

      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }

  throw new Error('Could not find the end of ' + marker);
}

/**
 * The real getCommitPayload with an EntryDiff that records what it was given
 * @param {String} searchTerm - The active server-side search term
 * @returns {Object} The options passed to EntryDiff.computeCommitPayload
 */
function commitOptions(searchTerm) {
  var received = null;

  var context = {
    EntryDiff: {
      computeCommitPayload: function(entries, original, options) {
        received = options;

        return {};
      }
    },
    entryMap: { original: {} },
    table: {
      hasRowsMoved: function() {
        return false;
      },
      isColumnSorted: function() {
        return false;
      }
    },
    searchTerm: searchTerm,
    pageEdges: null,
    totalEntries: 1500,
    _: { isEqual: function() {} },
    Fliplet: { guid: function() {} }
  };

  vm.createContext(context);
  vm.runInContext(extractFunction(interfaceSource, 'function getCommitPayload(') + '\ngetCommitPayload([]);', context);

  return received;
}

describe('getCommitPayload under a server-side search (PS-2313)', function() {
  it('tells EntryDiff the view is not the stored order while a term is active', function() {
    expect(commitOptions('smith').viewMatchesStoredOrder).toBe(false);
  });

  it('keeps the stored-order view when there is no term and no column sort', function() {
    expect(commitOptions('').viewMatchesStoredOrder).toBe(true);
  });
});
