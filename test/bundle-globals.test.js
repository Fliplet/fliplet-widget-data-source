// Publishing concatenates the interface JS assets into one plain script, with
// no wrapper around each file, so every top-level `var` and `function` shares
// one global scope. Two files declaring the same name silently collide: the
// later `var` assignment overwrites the earlier hoisted function. That is how
// the save lock's grid guard became an always-false stub (PS-2251).
var test = require('node:test');
var fs = require('fs');
var path = require('path');
var describe = test.describe;
var it = test.it;

var expect = require('./expect');

var ROOT = path.join(__dirname, '..');

// Names already declared in more than one asset before PS-2251. Listed here so
// this spec guards against new clashes without rewriting unrelated code.
var KNOWN_DUPLICATES = [];

/**
 * The interface JS assets, in the order publishing concatenates them
 * @returns {Array} Asset paths relative to the widget root
 */
function interfaceScripts() {
  var widget = JSON.parse(fs.readFileSync(path.join(ROOT, 'widget.json'), 'utf8'));

  return widget.interface.assets.filter(function(asset) {
    return /\.js$/.test(asset);
  });
}

/**
 * Names declared at column 0 of a script: `var`/`let`/`const` (including
 * comma lists on the same line), `function` and `class`
 * @param {String} source - Script source
 * @returns {Array} Declared names, in order
 */
function topLevelNames(source) {
  var names = [];

  source.split('\n').forEach(function(line) {
    var declaration = line.match(/^(?:var|let|const)\s+(.*)$/);
    var fn = line.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/);
    var cls = line.match(/^class\s+([A-Za-z_$][\w$]*)/);

    if (declaration) {
      // A comma list is only split when no brackets could hold the commas
      var declarators = /[([{]/.test(declaration[1])
        ? [declaration[1]]
        : declaration[1].split(',');

      declarators.forEach(function(part) {
        var name = part.match(/^\s*([A-Za-z_$][\w$]*)/);

        if (name) {
          names.push(name[1]);
        }
      });
    }

    if (fn) {
      names.push(fn[1]);
    }

    if (cls) {
      names.push(cls[1]);
    }
  });

  return names;
}

describe('published interface bundle', function() {
  it('lists interface scripts that exist', function() {
    var scripts = interfaceScripts();

    expect(scripts.length > 0).toBe(true);
    scripts.forEach(function(script) {
      expect(fs.existsSync(path.join(ROOT, script))).toBe(true);
    });
  });

  it('finds the declarations the scan relies on', function() {
    expect(topLevelNames('var a = 1, b;\nfunction c() {}\n  var nested;')).toEqual(['a', 'b', 'c']);
  });

  it('declares no top-level name in more than one script', function() {
    var owners = {};

    interfaceScripts().forEach(function(script) {
      var source = fs.readFileSync(path.join(ROOT, script), 'utf8');

      topLevelNames(source).forEach(function(name) {
        owners[name] = owners[name] || [];

        if (owners[name].indexOf(script) === -1) {
          owners[name].push(script);
        }
      });
    });

    var clashes = Object.keys(owners).filter(function(name) {
      return owners[name].length > 1 && KNOWN_DUPLICATES.indexOf(name) === -1;
    }).map(function(name) {
      return name + ' (' + owners[name].join(', ') + ')';
    });

    expect(clashes).toEqual([]);
  });
});
