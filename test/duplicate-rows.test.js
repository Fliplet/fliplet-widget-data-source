var test = require('node:test');
var describe = test.describe;
var it = test.it;
var expect = require('./expect');

var DuplicateRows = require('../js/duplicate-rows');

describe('DuplicateRows.find', function() {
  it('flags an id-less copy of an existing row', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice', Age: '30' } },
      { id: 2, data: { Name: 'Bob', Age: '40' } },
      { data: { Name: 'Alice', Age: '30' } }
    ]);

    expect(result).toEqual({ count: 1, rows: [4] });
  });

  it('flags both of two identical id-less rows', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice' } },
      { data: { Name: 'Carol' } },
      { data: { Name: 'Carol' } }
    ]);

    expect(result).toEqual({ count: 2, rows: [3, 4] });
  });

  it('does not flag an id-less unique row', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice' } },
      { data: { Name: 'Dave' } }
    ]);

    expect(result).toEqual({ count: 0, rows: [] });
  });

  it('never flags rows that have an id, even when identical', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice' } },
      { id: 2, data: { Name: 'Alice' } },
      { id: 3, data: { Name: 'Alice' } }
    ]);

    expect(result).toEqual({ count: 0, rows: [] });
  });

  it('ignores rows whose data is empty', function() {
    var result = DuplicateRows.find([
      { id: 1, data: {} },
      { data: {} },
      { data: { Name: '', Age: null } },
      { data: { Name: undefined } }
    ]);

    expect(result).toEqual({ count: 0, rows: [] });
  });

  it('treats key order and scalar type differences as equal', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { a: '1', b: 'x' } },
      { data: { b: 'x', a: 1 } }
    ]);

    expect(result).toEqual({ count: 1, rows: [3] });
  });

  it('treats a blank field and an absent field as equal', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { a: '1', b: '' } },
      { data: { a: '1' } }
    ]);

    expect(result).toEqual({ count: 1, rows: [3] });
  });

  it('matches object values regardless of key order', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { tags: { x: 1, y: [1, 2] } } },
      { data: { tags: { y: [1, 2], x: 1 } } }
    ]);

    expect(result).toEqual({ count: 1, rows: [3] });
  });

  it('does not flag a row with a different value', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { a: '1', b: 'x' } },
      { data: { a: '1', b: 'y' } },
      { data: { a: '1', b: 'x', c: 'z' } }
    ]);

    expect(result).toEqual({ count: 0, rows: [] });
  });

  it('reports 1-based grid row numbers starting at 2', function() {
    var result = DuplicateRows.find([
      { data: { Name: 'Same' } },
      { data: { Name: 'Same' } }
    ]);

    expect(result.rows).toEqual([2, 3]);
  });

  it('maps flagged entries to the grid rows they came from', function() {
    // Grid: row 2 Alice, row 3 blank, row 4 Bob, row 5 blank, row 6 Alice copy
    var visual = [['Alice'], [null], ['Bob'], [''], ['Alice'], [null], [null]];
    var gridRows = DuplicateRows.gridRowNumbers(visual);
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice' } },
      { id: 2, data: { Name: 'Bob' } },
      { data: { Name: 'Alice' } }
    ], gridRows);

    expect(gridRows).toEqual([2, 4, 6]);
    expect(result).toEqual({ count: 1, rows: [6] });
  });

  it('reports no row numbers when the grid rows do not line up', function() {
    var result = DuplicateRows.find([
      { id: 1, data: { Name: 'Alice' } },
      { data: { Name: 'Alice' } }
    ], [2, 3, 4]);

    expect(result).toEqual({ count: 1, rows: [] });
  });

  it('handles missing or empty input', function() {
    expect(DuplicateRows.find([])).toEqual({ count: 0, rows: [] });
    expect(DuplicateRows.find()).toEqual({ count: 0, rows: [] });
  });

  it('runs in linear time on 20k entries', function() {
    var entries = [];
    var i;

    for (i = 0; i < 10000; i++) {
      entries.push({ id: i + 1, data: { Name: 'Row ' + i, Value: String(i), Extra: 'x' } });
    }

    for (i = 0; i < 10000; i++) {
      entries.push({ data: { Extra: 'x', Value: i, Name: 'Row ' + i } });
    }

    var start = Date.now();
    var result = DuplicateRows.find(entries);
    var elapsed = Date.now() - start;

    expect(result.count).toBe(10000);
    expect(result.rows[0]).toBe(10002);
    expect(elapsed).toBeLessThan(500);
  });
});

describe('DuplicateRows.gridRowNumbers', function() {
  it('treats null, undefined and empty strings as blank, like the grid', function() {
    expect(DuplicateRows.gridRowNumbers([
      [null, undefined, ''],
      [0],
      [false],
      ['', 'x'],
      []
    ])).toEqual([3, 4, 5]);
  });

  it('handles missing input', function() {
    expect(DuplicateRows.gridRowNumbers()).toEqual([]);
  });
});

describe('DuplicateRows.message', function() {
  it('describes a single copy', function() {
    expect(DuplicateRows.message({ count: 1, rows: [7] }))
      .toBe('1 new row is an exact copy of other rows (row 7). Save it anyway?');
  });

  it('lists at most 10 rows', function() {
    expect(DuplicateRows.message({ count: 12, rows: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] }))
      .toBe('12 new rows are exact copies of other rows (rows 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, …). Save them anyway?');
  });

  it('leaves out the row list when positions are unknown', function() {
    expect(DuplicateRows.message({ count: 2, rows: [] }))
      .toBe('2 new rows are exact copies of other rows. Save them anyway?');
  });
});
