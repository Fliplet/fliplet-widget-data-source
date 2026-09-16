/* eslint-env jest */
var fs = require('fs');
var path = require('path');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

// Extracts the body of `function name(...) { ... }` by brace-counting from the
// source text, without needing to parse/require the file (interface.js relies
// on globals like Fliplet/jQuery that aren't available in this plain regression
// check). Same approach as renderSpreadsheetWiring.test.js.
function extractFunctionBody(source, functionName) {
  var startMarker = 'function ' + functionName + '(';
  var startIndex = source.indexOf(startMarker);

  if (startIndex === -1) {
    throw new Error('Could not find function ' + functionName + ' in source');
  }

  var openBraceIndex = source.indexOf('{', startIndex);
  var depth = 0;
  var i;

  for (i = openBraceIndex; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;

      if (depth === 0) {
        return source.slice(openBraceIndex, i + 1);
      }
    }
  }

  throw new Error('Could not find matching closing brace for function ' + functionName);
}

// Extracts the body of the `.catch(function onFetchError(error) { ... })` block
// inside fetchCurrentDataSourceEntries — it's a named function expression, not a
// top-level `function name(...)` declaration, so it needs its own start marker.
function extractOnFetchErrorBody(source) {
  var startMarker = 'function onFetchError(error) {';
  var startIndex = source.indexOf(startMarker);

  if (startIndex === -1) {
    throw new Error('Could not find onFetchError in source');
  }

  var openBraceIndex = source.indexOf('{', startIndex);
  var depth = 0;
  var i;

  for (i = openBraceIndex; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;

      if (depth === 0) {
        return source.slice(openBraceIndex, i + 1);
      }
    }
  }

  throw new Error('Could not find matching closing brace for onFetchError');
}

describe('saveCurrentData wiring (regression for the order-corruption fix, PS-20272)', function() {
  it('applies the pagination order offset to entries before building the commit payload', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');

    var offsetCallIndex = body.indexOf('Pagination.applyPageOrderOffset(entries, currentPage, PAGE_SIZE)');
    var commitPayloadIndex = body.indexOf('getCommitPayload(entries)');

    expect(offsetCallIndex).toBeGreaterThan(-1);
    expect(commitPayloadIndex).toBeGreaterThan(-1);
    // Order matters: the offset must be applied to `entries` before the commit
    // payload is computed from them, otherwise the fix is a no-op.
    expect(offsetCallIndex).toBeLessThan(commitPayloadIndex);
  });

  it('applies the offset before the commit() call reads entries off the payload', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');

    var offsetCallIndex = body.indexOf('Pagination.applyPageOrderOffset(');
    var commitCallIndex = body.indexOf('currentDataSource.commit(');

    expect(offsetCallIndex).toBeGreaterThan(-1);
    expect(commitCallIndex).toBeGreaterThan(-1);
    expect(offsetCallIndex).toBeLessThan(commitCallIndex);
  });
});

describe('currentDataSourceRowsCount wiring (regression for the Versions-tab total fix, PS-20272)', function() {
  it('assigns the true data-source-wide total, not the current page size', function() {
    expect(interfaceSource.indexOf('currentDataSourceRowsCount = totalEntries;')).toBeGreaterThan(-1);
    expect(interfaceSource.indexOf('currentDataSourceRowsCount = rows.length;')).toBe(-1);
  });
});

describe('onFetchError wiring (regression for the stuck-pagination-controls fix, PS-20272)', function() {
  it('rolls currentPage back to the page actually rendered on a real fetch error', function() {
    var body = extractOnFetchErrorBody(interfaceSource);

    expect(body.indexOf('currentPage = lastRenderedPage;')).toBeGreaterThan(-1);
  });

  it('recomputes pagination controls (re-enabling them) after a real fetch error', function() {
    var body = extractOnFetchErrorBody(interfaceSource);

    expect(body.indexOf('updatePaginationControls();')).toBeGreaterThan(-1);
  });

  it('still returns early for stale responses, before touching currentPage or controls', function() {
    var body = extractOnFetchErrorBody(interfaceSource);
    var staleGuardIndex = body.indexOf('if (error && error.stale)');
    var revertIndex = body.indexOf('currentPage = lastRenderedPage;');

    expect(staleGuardIndex).toBeGreaterThan(-1);
    expect(revertIndex).toBeGreaterThan(-1);
    expect(staleGuardIndex).toBeLessThan(revertIndex);
  });

  it('updates lastRenderedPage only on a genuinely successful, non-stale render', function() {
    // lastRenderedPage must be set inside the success .then(function(rows) {...})
    // handler, before any render happens, so onFetchError always has a valid
    // "actually on screen" page to roll back to.
    var successHandlerIndex = interfaceSource.indexOf('}).then(function(rows) {');
    var lastRenderedAssignIndex = interfaceSource.indexOf('lastRenderedPage = currentPage;');

    expect(successHandlerIndex).toBeGreaterThan(-1);
    expect(lastRenderedAssignIndex).toBeGreaterThan(-1);
    expect(lastRenderedAssignIndex).toBeGreaterThan(successHandlerIndex);
  });

  it('resets lastRenderedPage alongside currentPage when leaving a data source', function() {
    var resetBlockIndex = interfaceSource.indexOf('function resetAndGoBack()');
    var body = extractFunctionBody(interfaceSource.slice(resetBlockIndex), 'resetAndGoBack');

    expect(body.indexOf('currentPage = 0;')).toBeGreaterThan(-1);
    expect(body.indexOf('lastRenderedPage = 0;')).toBeGreaterThan(-1);
  });
});
