var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var fs = require('fs');
var path = require('path');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');
var widgetJson = fs.readFileSync(path.join(__dirname, '../widget.json'), 'utf8');
var spreadsheetSource = fs.readFileSync(path.join(__dirname, '../js/spreadsheet.js'), 'utf8');

// Extracts the body of `function renderSpreadsheet(...) { ... }` by
// brace-counting from the source text, without needing to parse/require
// the file (interface.js relies on globals like Fliplet/jQuery that
// aren't available in this plain regression check).
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

describe('renderSpreadsheet wiring (regression for the render-race fix)', function() {
  it('calls renderSpreadsheet( from both render branches', function() {
    var callSites = interfaceSource
      .split('\n')
      .filter(function(line) {
        return line.indexOf('renderSpreadsheet(') !== -1
          && line.indexOf('function renderSpreadsheet(') === -1;
      });

    // At least two: the initial-load branch and the subsequent-load branch
    expect(callSites.length).toBeGreaterThan(1);
  });

  it('has renderSpreadsheet call WaitUntilSized.waitUntilSized', function() {
    var body = extractFunctionBody(interfaceSource, 'renderSpreadsheet');

    expect(body.indexOf('WaitUntilSized.waitUntilSized(')).toBeGreaterThan(-1);
  });

  it('lists js/waitUntilSized.js before js/interface.js in widget.json', function() {
    var waitUntilSizedIndex = widgetJson.indexOf('js/waitUntilSized.js');
    var interfaceIndex = widgetJson.indexOf('js/interface.js');

    expect(waitUntilSizedIndex).toBeGreaterThan(-1);
    expect(interfaceIndex).toBeGreaterThan(-1);
    expect(waitUntilSizedIndex).toBeLessThan(interfaceIndex);
  });

  // PS-2204: the demo columns of an empty data source are not the data source's,
  // so a save must not send them as the columns it expects the API to have
  it('tells the column tracker when the grid shows demo columns', function() {
    var body = extractFunctionBody(interfaceSource, 'renderSpreadsheet');

    expect(body.indexOf('demoColumns: demoColumns')).toBeGreaterThan(-1);
    expect(spreadsheetSource.indexOf('ColumnChanges.createTracker(spreadsheetData[0], { demo: !!options.demoColumns })')).toBeGreaterThan(-1);
  });
});

// PS-2314: the pagination bar sits after the grid in the flow, so the grid
// height must leave room for it or the bar lands below the viewport
describe('pagination bar sizing (PS-2314)', function() {
  it('has windowResized subtract the visible pagination bar from .table-entries', function() {
    var body = extractFunctionBody(interfaceSource, 'windowResized');

    expect(body.indexOf("$('.pagination-controls')")).toBeGreaterThan(-1);
    expect(body.indexOf("hasClass('hidden') ? 0 :")).toBeGreaterThan(-1);
    expect(body.indexOf("$('.table-entries').height($('.tab-content').height() - paginationHeight)")).toBeGreaterThan(-1);
  });

  it('has updatePaginationControls resize the grid after toggling the bar', function() {
    var body = extractFunctionBody(interfaceSource, 'updatePaginationControls');
    var toggleIndex = body.indexOf("$pagination.toggleClass('hidden',");
    var resizeIndex = body.indexOf('windowResized()');

    expect(toggleIndex).toBeGreaterThan(-1);
    expect(resizeIndex).toBeGreaterThan(toggleIndex);
  });

  it('has renderSpreadsheet size the container before building the grid', function() {
    var body = extractFunctionBody(interfaceSource, 'renderSpreadsheet');
    var paginationIndex = body.indexOf('updatePaginationControls()');
    var buildIndex = body.indexOf('table = spreadsheet(');

    expect(paginationIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(paginationIndex).toBeLessThan(buildIndex);
  });
});
