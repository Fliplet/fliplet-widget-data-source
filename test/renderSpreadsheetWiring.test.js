/* eslint-env jest */
var fs = require('fs');
var path = require('path');

var interfaceSource = fs.readFileSync(path.join(__dirname, '../js/interface.js'), 'utf8');
var widgetJson = fs.readFileSync(path.join(__dirname, '../widget.json'), 'utf8');

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

    expect(callSites.length).toBeGreaterThanOrEqual(2);
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

  // Regression check: fetchGeneration/thisFetch are read at four call sites
  // (renderSpreadsheet's fetchId check, and the two renderSpreadsheet(rows,
  // thisFetch) calls) but were never declared on a branch built without
  // pagination, which is where fetchGeneration originally lived. Reading an
  // undeclared identifier throws uncaught inside the requestAnimationFrame
  // callback, so the grid never renders - this is a plain source-text check
  // (not a running function) precisely because that failure mode is a
  // ReferenceError, not a wrong return value.
  it('declares fetchGeneration and thisFetch rather than leaving them as bare reads', function() {
    expect(interfaceSource.indexOf('var fetchGeneration')).toBeGreaterThan(-1);
    expect(interfaceSource.indexOf('var thisFetch = ++fetchGeneration;')).toBeGreaterThan(-1);
  });

  it('passes thisFetch to renderSpreadsheet from both render branches', function() {
    var callSites = interfaceSource
      .split('\n')
      .filter(function(line) {
        return line.indexOf('renderSpreadsheet(') !== -1
          && line.indexOf('function renderSpreadsheet(') === -1;
      });

    expect(callSites.length).toBeGreaterThanOrEqual(2);

    callSites.forEach(function(line) {
      expect(line.indexOf('renderSpreadsheet(rows, thisFetch)')).toBeGreaterThan(-1);
    });
  });
});
