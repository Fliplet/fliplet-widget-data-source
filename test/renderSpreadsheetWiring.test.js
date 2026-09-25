var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

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
});
