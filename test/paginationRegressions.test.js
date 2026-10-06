var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');

// SCOPE NOTE (per code review on PS-2072): these checks only confirm that
// interface.js *wires* the right function at the right call site, in the right
// order — they do not and cannot prove the decision logic itself is correct,
// because interface.js needs jQuery/Fliplet globals at load time and can't be
// required in a unit test. The actual decision logic has been extracted into
// pure functions so it CAN be executed and unit tested — the commit payload in
// entry-diff.js (entry-diff.test.js, ordering-properties.test.js) and the
// fetch-error recovery in pagination.js (pagination.test.js). This file only
// proves those tested functions are actually reached.

// Extracts the body of `function name(...) { ... }` by brace-counting from the
// source text.
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

describe('saveCurrentData wiring (PS-2072)', function() {
  it('builds the commit payload with EntryDiff, from the grid, before commit(), passing the real reorder and sort signals', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');
    var payloadBody = extractFunctionBody(interfaceSource, 'getCommitPayload');

    var getDataIndex = body.indexOf('table.getData(');
    var commitPayloadIndex = body.indexOf('getCommitPayload(entries)');
    var commitCallIndex = body.indexOf('currentDataSource.commit(');

    expect(getDataIndex).toBeGreaterThan(-1);
    expect(commitPayloadIndex).toBeGreaterThan(-1);
    expect(commitCallIndex).toBeGreaterThan(-1);
    // Order matters: the payload is computed from the grid as it is now, and
    // before commit() sends it, otherwise the save is a no-op.
    expect(getDataIndex).toBeLessThan(commitPayloadIndex);
    expect(commitPayloadIndex).toBeLessThan(commitCallIndex);

    // EntryDiff is the only save engine. Position is only written when the
    // user really dragged a row (Handsontable's own afterRowMove signal) and
    // the grid is not showing a column sort.
    expect(payloadBody.indexOf('EntryDiff.computeCommitPayload(entries, entryMap.original')).toBeGreaterThan(-1);
    expect(payloadBody.indexOf('table.hasRowsMoved()')).toBeGreaterThan(-1);
    expect(payloadBody.indexOf('table.isColumnSorted()')).toBeGreaterThan(-1);
    expect(interfaceSource.indexOf('Pagination.computeCommitPayload')).toBe(-1);
    expect(interfaceSource.indexOf('Pagination.resolveEntryOrder')).toBe(-1);
  });

  it('sends the renumber only when EntryDiff asks for it, and caches the orders the commit settled on', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');

    var normalizeGuardIndex = body.indexOf('if (payload.normalizeOrder)');
    var normalizeAssignIndex = body.indexOf('commitData.normalizeOrder = payload.normalizeOrder;');
    var commitCallIndex = body.indexOf('currentDataSource.commit(commitData)');
    var cacheIndex = body.indexOf('cacheOriginalEntries(entries, clientIdMap, payload.orders)');

    expect(normalizeGuardIndex).toBeGreaterThan(-1);
    expect(normalizeAssignIndex).toBeGreaterThan(normalizeGuardIndex);
    expect(commitCallIndex).toBeGreaterThan(normalizeAssignIndex);
    // The grid rows carry no order (getData() deliberately stamps none), so the
    // cache after a commit must take its orders from the payload, in the
    // commit's success handler.
    expect(cacheIndex).toBeGreaterThan(commitCallIndex);
  });

  it('clears the reorder signal only after a successful commit, not before', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');

    var commitCallIndex = body.indexOf('currentDataSource.commit(');
    var clearIndex = body.indexOf('table.clearRowsMoved()');

    expect(commitCallIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(-1);
    // Must be inside the commit's success handler, not before commit() is
    // even called — a failed save must leave the signal set for a retry.
    expect(clearIndex).toBeGreaterThan(commitCallIndex);
  });

  it('no longer calls the old, unsafe rank-only offset function', function() {
    expect(interfaceSource.indexOf('applyPageOrderOffset')).toBe(-1);
  });
});

describe('page context wiring (PS-2204)', function() {
  it('fetches the page with the row either side of it, in the platform read order, and caches the edges with the rows', function() {
    var body = extractFunctionBody(interfaceSource, 'fetchCurrentDataSourceEntries');

    var windowIndex = body.indexOf('Pagination.computeFetchWindow(currentPage, PAGE_SIZE)');
    var limitIndex = body.indexOf('limit: fetchWindow.limit');
    var offsetIndex = body.indexOf('offset: fetchWindow.offset');
    var splitIndex = body.indexOf('Pagination.splitFetchWindow(queryResponse.entries, currentPage, PAGE_SIZE)');
    var cacheIndex = body.indexOf('cacheOriginalEntries(rows);');
    var edgesIndex = body.indexOf('pageEdges = fetchedEdges;');

    expect(windowIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeGreaterThan(windowIndex);
    expect(offsetIndex).toBeGreaterThan(windowIndex);
    expect(body.indexOf("order: [['order', 'ASC'], ['id', 'DESC']]")).toBeGreaterThan(-1);
    expect(splitIndex).toBeGreaterThan(offsetIndex);
    // The edges are cached in the same step as the rows, so a save never pairs
    // one page's rows with another page's edges
    expect(cacheIndex).toBeGreaterThan(-1);
    expect(edgesIndex).toBeGreaterThan(cacheIndex);
    expect(edgesIndex - cacheIndex).toBeLessThan(80);
  });

  it('gives EntryDiff the page offset, live count and edges', function() {
    var payloadBody = extractFunctionBody(interfaceSource, 'getCommitPayload');

    expect(payloadBody.indexOf('offset: pageEdges.offset')).toBeGreaterThan(-1);
    expect(payloadBody.indexOf('liveCount: totalEntries')).toBeGreaterThan(-1);
    expect(payloadBody.indexOf('before: pageEdges.before')).toBeGreaterThan(-1);
    expect(payloadBody.indexOf('after: pageEdges.after')).toBeGreaterThan(-1);
  });

  it('caches the settled edges after a commit, alongside the settled orders', function() {
    var body = extractFunctionBody(interfaceSource, 'saveCurrentData');

    var commitIndex = body.indexOf('currentDataSource.commit(commitData)');
    var cacheIndex = body.indexOf('cacheOriginalEntries(entries, clientIdMap, payload.orders)');
    var edgesIndex = body.indexOf('before: payload.pageEdges.before');

    expect(cacheIndex).toBeGreaterThan(commitIndex);
    expect(edgesIndex).toBeGreaterThan(cacheIndex);
  });

  it('clears the edges when leaving a data source', function() {
    var resetBlockIndex = interfaceSource.indexOf('function resetAndGoBack()');
    var body = extractFunctionBody(interfaceSource.slice(resetBlockIndex), 'resetAndGoBack');

    expect(body.indexOf('pageEdges = null;')).toBeGreaterThan(-1);
  });
});

describe('spreadsheet.js — real reorder signal wiring (PS-2072 follow-up)', function() {
  var spreadsheetSource = fs.readFileSync(path.join(__dirname, '../js/spreadsheet.js'), 'utf8');

  it('sets rowsMoved from the real Handsontable afterRowMove hook, not inferred from values', function() {
    var afterRowMoveIndex = spreadsheetSource.indexOf('afterRowMove: function()');
    var setIndex = spreadsheetSource.indexOf('rowsMoved = true;');

    expect(afterRowMoveIndex).toBeGreaterThan(-1);
    expect(setIndex).toBeGreaterThan(-1);
    expect(setIndex).toBeGreaterThan(afterRowMoveIndex);
  });

  it('exposes hasRowsMoved/clearRowsMoved and clears the flag on reset', function() {
    expect(spreadsheetSource.indexOf('hasRowsMoved: hasRowsMoved')).toBeGreaterThan(-1);
    expect(spreadsheetSource.indexOf('clearRowsMoved: clearRowsMoved')).toBeGreaterThan(-1);

    var resetBody = extractFunctionBody(spreadsheetSource.slice(spreadsheetSource.indexOf('function reset(')), 'reset');

    expect(resetBody.indexOf('clearRowsMoved()')).toBeGreaterThan(-1);
  });
});

describe('currentDataSourceRowsCount wiring (PS-2072)', function() {
  it('assigns the true data-source-wide total, not the current page size', function() {
    expect(interfaceSource.indexOf('currentDataSourceRowsCount = totalEntries;')).toBeGreaterThan(-1);
    expect(interfaceSource.indexOf('currentDataSourceRowsCount = rows.length;')).toBe(-1);
  });
});

describe('renderSpreadsheet wiring — lastRenderedPage timing (PS-2072)', function() {
  it('sets lastRenderedPage inside the waitUntilSized callback, after the stale-generation guard', function() {
    var body = extractFunctionBody(interfaceSource, 'renderSpreadsheet');
    var guardIndex = body.indexOf('fetchId !== fetchGeneration');
    var assignIndex = body.indexOf('lastRenderedPage = currentPage;');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(assignIndex).toBeGreaterThan(-1);
    // Must be past the guard: a render can still be discarded here (stale
    // generation), so setting it before this point would name a page that
    // was never actually painted as the fetch-error rollback target.
    expect(assignIndex).toBeGreaterThan(guardIndex);
  });

  it('does NOT set lastRenderedPage in the outer fetch .then() handler anymore', function() {
    // Regression guard for the exact bug the review caught: the render can
    // still be discarded (sizing wait, newer navigation) between the fetch
    // resolving and anything actually being painted, so this assignment
    // belongs only inside renderSpreadsheet's callback, not here.
    var thenIndex = interfaceSource.indexOf('}).then(function(rows) {');
    var nextFunctionIndex = interfaceSource.indexOf('function ', thenIndex);
    var thenHandlerSlice = interfaceSource.slice(thenIndex, nextFunctionIndex);

    expect(thenIndex).toBeGreaterThan(-1);
    expect(thenHandlerSlice.indexOf('lastRenderedPage = currentPage;')).toBe(-1);
  });
});

describe('onFetchError wiring (PS-2072)', function() {
  it('routes recovery through Pagination.resolveFetchErrorRecovery, applying its result', function() {
    var body = extractOnFetchErrorBody(interfaceSource);

    var resolveIndex = body.indexOf('Pagination.resolveFetchErrorRecovery(');
    var applyCurrentPageIndex = body.indexOf('currentPage = recovery.currentPage;');
    var applyControlsIndex = body.indexOf('updatePaginationControls();');

    expect(resolveIndex).toBeGreaterThan(-1);
    expect(applyCurrentPageIndex).toBeGreaterThan(-1);
    expect(applyControlsIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeLessThan(applyCurrentPageIndex);
    expect(applyCurrentPageIndex).toBeLessThan(applyControlsIndex);
  });

  it('still returns early for stale responses, before the recovery decision runs at all', function() {
    var body = extractOnFetchErrorBody(interfaceSource);
    var staleGuardIndex = body.indexOf('if (error && error.stale)');
    var resolveIndex = body.indexOf('Pagination.resolveFetchErrorRecovery(');

    expect(staleGuardIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(staleGuardIndex).toBeLessThan(resolveIndex);
  });

  it('no longer contains the old unconditional rollback (superseded by the tested pure function)', function() {
    var body = extractOnFetchErrorBody(interfaceSource);

    // The old fix wrote `currentPage = lastRenderedPage;` directly. It's now
    // sourced from the tested Pagination.resolveFetchErrorRecovery result.
    expect(body.indexOf('currentPage = lastRenderedPage;')).toBe(-1);
    expect(body.indexOf('currentPage = recovery.currentPage;')).toBeGreaterThan(-1);
    expect(body.indexOf('lastRenderedPage = recovery.lastRenderedPage;')).toBeGreaterThan(-1);
  });
});

describe('resetAndGoBack wiring (PS-2072)', function() {
  it('resets lastRenderedPage alongside currentPage when leaving a data source', function() {
    var resetBlockIndex = interfaceSource.indexOf('function resetAndGoBack()');
    var body = extractFunctionBody(interfaceSource.slice(resetBlockIndex), 'resetAndGoBack');

    expect(body.indexOf('currentPage = 0;')).toBeGreaterThan(-1);
    expect(body.indexOf('lastRenderedPage = 0;')).toBeGreaterThan(-1);
  });
});
