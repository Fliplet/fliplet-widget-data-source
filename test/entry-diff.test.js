var test = require('node:test');
var describe = test.describe;
var it = test.it;
var beforeEach = test.beforeEach;
var expect = require('./expect');

var EntryDiff = require('../js/entry-diff');

// Stand-ins for the collaborators interface.js injects
var guidCounter;
var guid = function() {
  return 'guid-' + (++guidCounter);
};
var isEqual = function(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
};

beforeEach(function() {
  guidCounter = 0;
});

/**
 * Build entries and their cached originals from a compact description.
 * @param {Array} rows - [{ id, name, order }]
 * @returns {Object} { entries, originals }
 */
function build(rows) {
  var entries = rows.map(function(row) {
    return { id: row.id, data: { Name: row.name } };
  });
  var originals = {};

  rows.forEach(function(row) {
    originals[row.id] = { id: row.id, data: { Name: row.name }, order: row.order };
  });

  return { entries: entries, originals: originals };
}

function commit(entries, originals, rowsMoved, viewMatchesStoredOrder) {
  return EntryDiff.computeCommitPayload(entries, originals, {
    rowsMoved: !!rowsMoved,
    viewMatchesStoredOrder: viewMatchesStoredOrder !== false,
    isEqual: isEqual,
    guid: guid
  });
}

/**
 * Apply a payload the way the API would, then read the rows back the way the
 * platform sorts: order ASC with nulls last, ties on id DESC. The manager asks
 * for no sort of its own, so this is what the user sees and what every app
 * sees. Lets a test assert the sequence rather than the payload's shape.
 * @param {Array} rows - Stored rows, [{ id, name, order }]
 * @param {Object} payload - Result of computeCommitPayload
 * @returns {String} Comma-separated names in read order
 */
function applyAndRead(rows, payload) {
  var stored = {};

  rows.forEach(function(row) {
    stored[row.id] = { id: row.id, name: row.name, order: row.order };
  });

  payload.delete.forEach(function(id) {
    delete stored[id];
  });

  var nextId = 900000;

  payload.entries.forEach(function(entry) {
    if (typeof entry.id === 'undefined') {
      nextId += 1;
      stored[nextId] = {
        id: nextId,
        name: entry.data.Name,
        order: typeof entry.order === 'undefined' ? null : entry.order
      };

      return;
    }

    if (!stored[entry.id]) {
      return;
    }

    stored[entry.id].name = entry.data.Name;

    if (typeof entry.order !== 'undefined') {
      stored[entry.id].order = entry.order;
    }
  });

  return Object.keys(stored).map(function(key) {
    return stored[key];
  }).sort(function(a, b) {
    var aNull = a.order === null || typeof a.order === 'undefined';
    var bNull = b.order === null || typeof b.order === 'undefined';

    if (aNull && bNull) {
      return b.id - a.id;
    }

    if (aNull) {
      return 1;
    }

    if (bNull) {
      return -1;
    }

    return a.order !== b.order ? a.order - b.order : b.id - a.id;
  }).map(function(row) {
    return row.name;
  }).join(',');
}

/**
 * Read rows back with the id tie-break in a given direction. The platform
 * default is id DESC, which is what the manager and every app get; reading the
 * same either way proves the arrangement does not rest on the tie-break.
 * @param {Array} rows - Stored rows, [{ id, name, order }]
 * @param {Object} payload - Result of computeCommitPayload
 * @param {Number} idDirection - -1 for the platform default, 1 to reverse ties
 * @returns {String} Comma-separated names in read order
 */
function readAs(rows, payload, idDirection) {
  var stored = {};

  rows.forEach(function(row) {
    stored[row.id] = { id: row.id, name: row.name, order: row.order };
  });

  payload.delete.forEach(function(id) {
    delete stored[id];
  });

  var nextId = 900000;

  payload.entries.forEach(function(entry) {
    if (typeof entry.id === 'undefined') {
      nextId += 1;
      stored[nextId] = {
        id: nextId,
        name: entry.data.Name,
        order: typeof entry.order === 'undefined' ? null : entry.order
      };

      return;
    }

    if (!stored[entry.id]) {
      return;
    }

    stored[entry.id].name = entry.data.Name;

    if (typeof entry.order !== 'undefined') {
      stored[entry.id].order = entry.order;
    }
  });

  return Object.keys(stored).map(function(key) {
    return stored[key];
  }).sort(function(a, b) {
    var aNull = a.order === null || typeof a.order === 'undefined';
    var bNull = b.order === null || typeof b.order === 'undefined';

    if (aNull && bNull) {
      return idDirection * (a.id - b.id);
    }

    if (aNull) {
      return 1;
    }

    if (bNull) {
      return -1;
    }

    return a.order !== b.order ? a.order - b.order : idDirection * (a.id - b.id);
  }).map(function(row) {
    return row.name;
  }).join(',');
}

function dense(count) {
  var rows = [];

  for (var i = 0; i < count; i++) {
    rows.push({ id: 1000 + i, name: 'User ' + i, order: i });
  }

  return build(rows);
}

function move(list, from, to) {
  var copy = list.slice();
  var row = copy.splice(from, 1)[0];

  copy.splice(to, 0, row);

  return copy;
}

describe('PS-1781 — the 502: saving must not resend unchanged rows', function() {
  it('sends nothing when nothing was edited', function() {
    var d = dense(15000);
    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(0);
  });

  it('sends only the delete when a row near the top is removed', function() {
    var d = dense(15000);
    var kept = d.entries.filter(function(e, i) {
      return i !== 5;
    });
    var payload = commit(kept, d.originals);

    // Before the fix every row below the delete was resent - 14,994 of them
    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toEqual([1005]);
  });

  it('sends only the deletes when rows are removed from the middle', function() {
    var d = dense(15000);
    var drop = [5, 100, 900, 2000, 7500, 14000];
    var kept = d.entries.filter(function(e, i) {
      return drop.indexOf(i) === -1;
    });
    var payload = commit(kept, d.originals);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(drop.length);
  });

  it('sends exactly the row whose cell changed', function() {
    var d = dense(500);

    d.entries[42].data.Name = 'CHANGED';

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBe(1042);
  });

  it('sends one entry per edited row, not one per row in the source', function() {
    var d = dense(500);

    [1, 7, 300].forEach(function(i) {
      d.entries[i].data.Name = 'CHANGED ' + i;
    });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(3);
  });
});

describe('PS-1781 — data-only edits must not move rows (review P1 #1)', function() {
  // A sparse data source: imported, or one that has had rows deleted before
  var sparse = [
    { id: 1, name: 'A', order: 0 },
    { id: 2, name: 'B', order: 10 },
    { id: 3, name: 'C', order: 20 }
  ];

  it('does not attach an order when only the data changed', function() {
    var d = build(sparse);

    d.entries[2].data.Name = 'C edited';

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    // Attaching a dense index here wrote order 2 over order 20, which moved the
    // row to second place on the next read
    expect(payload.entries[0].order).toBeUndefined();
  });

  it('leaves every stored order untouched across an edit', function() {
    var d = build(sparse);

    d.entries[0].data.Name = 'A edited';

    var payload = commit(d.entries, d.originals);

    payload.entries.forEach(function(entry) {
      expect(entry.order).toBeUndefined();
    });
  });

  it('does not attach an order on a dense source either', function() {
    var d = dense(10);

    d.entries[3].data.Name = 'CHANGED';

    var payload = commit(d.entries, d.originals);

    expect(payload.entries[0].order).toBeUndefined();
  });
});

describe('PS-1781 — inserts must land where the user put them (review P1 #2)', function() {
  var sparse = [
    { id: 1, name: 'A', order: 0 },
    { id: 2, name: 'B', order: 10 },
    { id: 3, name: 'C', order: 20 }
  ];
  var nulls = [
    { id: 1, name: 'A', order: null },
    { id: 2, name: 'B', order: null },
    { id: 3, name: 'C', order: null }
  ];

  function withInsertAt(rows, index, name) {
    var d = build(rows);

    d.entries.splice(index, 0, { data: { Name: name } });

    return d;
  }

  it('appends to the end of a sparse data source', function() {
    var d = withInsertAt(sparse, 3, 'NEW');
    var payload = commit(d.entries, d.originals);

    expect(applyAndRead(sparse, payload)).toBe('A,B,C,NEW');
  });

  it('keeps a middle insert in the middle', function() {
    var d = withInsertAt(sparse, 1, 'NEW');
    var payload = commit(d.entries, d.originals);

    // A dense visual index would have written order 1 over order 10 and moved
    // the row; omitting order entirely would have sent it to the end
    expect(applyAndRead(sparse, payload)).toBe('A,NEW,B,C');
  });

  it('keeps an insert at the very top at the top', function() {
    var d = withInsertAt(sparse, 0, 'NEW');
    var payload = commit(d.entries, d.originals);

    expect(applyAndRead(sparse, payload)).toBe('NEW,A,B,C');
  });

  it('places a middle insert even when the neighbours leave no gap', function() {
    var packed = [
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 1 },
      { id: 3, name: 'C', order: 2 }
    ];
    var d = withInsertAt(packed, 1, 'NEW');
    var payload = commit(d.entries, d.originals);

    expect(applyAndRead(packed, payload)).toBe('A,NEW,B,C');
  });

  it('keeps two appends in the order they were added', function() {
    var d = build(sparse);

    d.entries.push({ data: { Name: 'N1' } });
    d.entries.push({ data: { Name: 'N2' } });

    var payload = commit(d.entries, d.originals);

    expect(applyAndRead(sparse, payload)).toBe('A,B,C,N1,N2');
  });

  it('appends to the end of a data source that has no stored order', function() {
    var d = build(nulls);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    // The rows read back on their ids, so a new row must not be numbered here -
    // any number would sort it ahead of every existing row
    expect(applyAndRead(nulls, payload)).toBe('A,B,C,NEW');
  });

  it('keeps two appends in order on a data source with no stored order', function() {
    var d = build(nulls);

    d.entries.push({ data: { Name: 'N1' } });
    d.entries.push({ data: { Name: 'N2' } });

    var payload = commit(d.entries, d.originals);

    expect(applyAndRead(nulls, payload)).toBe('A,B,C,N1,N2');
  });

  it('gives every new row a client id', function() {
    var d = build(sparse);

    d.entries.push({ data: { Name: 'N1' } });
    d.entries.push({ data: { Name: 'N2' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(2);
    payload.entries.forEach(function(entry) {
      expect(entry.clientId).toBeDefined();
    });
  });

  it('treats an entry whose id is no longer known as an insert', function() {
    var d = build(sparse);

    d.entries.push({ id: 999, data: { Name: 'Recovered' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].id).toBeUndefined();
    expect(payload.entries[0].clientId).toBeDefined();
  });

  it('handles an insert alongside a delete', function() {
    var d = build(sparse);
    var entries = d.entries.slice(0, 2).concat([{ data: { Name: 'NEW' } }]);
    var payload = commit(entries, d.originals);

    expect(payload.delete).toEqual([3]);
    expect(applyAndRead(sparse, payload)).toBe('A,B,NEW');
  });
});

describe('PS-1781 — reordering (review P2 #3)', function() {
  it('rewrites only the span a drag crossed', function() {
    var d = dense(15000);
    var payload = commit(move(d.entries, 10, 20), d.originals, true);

    expect(payload.entries).toHaveLength(11);
  });

  it('stays bounded when a delete and a drag happen in the same save', function() {
    var d = dense(15000);
    var kept = d.entries.filter(function(e, i) {
      return i !== 5;
    });
    var payload = commit(move(kept, 9, 20), d.originals, true);

    // Renumbering from zero made every row below the delete look moved: 14,994
    expect(payload.entries.length).toBeLessThan(20);
    expect(payload.delete).toEqual([1005]);
  });

  it('sends nothing when the reorder flag is set but no row actually moved', function() {
    var d = dense(1000);
    var payload = commit(d.entries, d.originals, true);

    expect(payload.entries).toHaveLength(0);
  });

  it('reuses the sparse order values a data source already had', function() {
    var d = build([
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 10 },
      { id: 3, name: 'C', order: 20 }
    ]);
    var payload = commit(move(d.entries, 0, 2), d.originals, true);
    var byId = {};

    payload.entries.forEach(function(entry) {
      byId[entry.id] = entry.order;
    });

    // B, C, A - the 0/10/20 pool is redistributed, the gaps survive
    expect(byId[2]).toBe(0);
    expect(byId[3]).toBe(10);
    expect(byId[1]).toBe(20);
  });

  it('keeps the resulting order strictly ascending', function() {
    var d = dense(50);
    var reordered = move(d.entries, 5, 40);
    var payload = commit(reordered, d.originals, true);
    var written = {};

    payload.entries.forEach(function(entry) {
      written[entry.id] = entry.order;
    });

    var sequence = reordered.map(function(entry) {
      return Object.prototype.hasOwnProperty.call(written, entry.id)
        ? written[entry.id]
        : d.originals[entry.id].order;
    });

    for (var i = 1; i < sequence.length; i++) {
      expect(sequence[i]).toBeGreaterThan(sequence[i - 1]);
    }
  });

  it('numbers only up to the last row that moved on an unordered data source', function() {
    var rows = [];
    var i;

    // Rows with no order read newest first, so that is the sequence the manager
    // shows and the baseline a drag is measured against
    for (i = 499; i >= 0; i--) {
      rows.push({ id: 1000 + i, name: 'U' + i, order: null });
    }

    var d = build(rows);
    var payload = commit(move(d.entries, 10, 20), d.originals, true);

    // The rows past the move still read correctly on their ids, and they read
    // that way for every consumer - numbering them would commit the whole data
    // source for one drag
    expect(payload.entries).toHaveLength(21);
  });

  it('writes nothing on an unordered data source when no row actually moved', function() {
    var rows = [];
    var i;

    for (i = 199; i >= 0; i--) {
      rows.push({ id: 1000 + i, name: 'U' + i, order: null });
    }

    var d = build(rows);
    var payload = commit(d.entries, d.originals, true);

    expect(payload.entries).toHaveLength(0);
  });

  it('does not attach an order to rows a drag did not move', function() {
    var d = dense(100);
    var payload = commit(move(d.entries, 10, 12), d.originals, true);

    expect(payload.entries.length).toBeLessThanOrEqual(3);
    payload.entries.forEach(function(entry) {
      expect(typeof entry.order).toBe('number');
    });
  });
});

describe('PS-1781 - grid type round-trip must not look like an edit', function() {
  // Every cell is rendered as text and re-parsed by parseCellValue(), so a
  // number stored as 30 comes back as the string "30" and a blank comes back
  // as "" or undefined. Comparing the raw values re-sent the whole data source.
  function original(data) {
    return { 1: { id: 1, data: data, order: 0 } };
  }

  function afterGrid(data) {
    return [{ id: 1, data: data }];
  }

  it('does not flag a number that came back as a string', function() {
    var payload = commit(afterGrid({ Name: 'A', Num: '30' }), original({ Name: 'A', Num: 30 }));

    expect(payload.entries).toHaveLength(0);
  });

  it('does not flag zero or a negative number', function() {
    var payload = commit(afterGrid({ N: '0', M: '-1' }), original({ N: 0, M: -1 }));

    expect(payload.entries).toHaveLength(0);
  });

  it('does not flag a decimal', function() {
    var payload = commit(afterGrid({ N: '3.5' }), original({ N: 3.5 }));

    expect(payload.entries).toHaveLength(0);
  });

  it('treats a blank cell and an absent column as the same', function() {
    var payload = commit(afterGrid({ Name: 'A', Blank: '' }), original({ Name: 'A' }));

    expect(payload.entries).toHaveLength(0);
  });

  it('treats null and undefined as blank', function() {
    var payload = commit(afterGrid({ Name: 'A', X: undefined }), original({ Name: 'A', X: null }));

    expect(payload.entries).toHaveLength(0);
  });

  it('does not flag a JSON cell whose keys came back in a different order', function() {
    var payload = commit(
      afterGrid({ Meta: { b: 2, a: 1 } }),
      original({ Meta: { a: 1, b: 2 } })
    );

    expect(payload.entries).toHaveLength(0);
  });

  it('still detects a real change to a numeric cell', function() {
    var payload = commit(afterGrid({ Name: 'A', Num: '31' }), original({ Name: 'A', Num: 30 }));

    expect(payload.entries).toHaveLength(1);
  });

  it('still detects a cell being cleared', function() {
    var payload = commit(afterGrid({ Name: '' }), original({ Name: 'A' }));

    expect(payload.entries).toHaveLength(1);
  });

  it('still detects a value being added to a blank cell', function() {
    var payload = commit(afterGrid({ Name: 'A', Blank: 'now set' }), original({ Name: 'A', Blank: '' }));

    expect(payload.entries).toHaveLength(1);
  });

  it('does not flag a boolean round-trip', function() {
    var payload = commit(afterGrid({ Flag: true, Off: false }), original({ Flag: true, Off: false }));

    expect(payload.entries).toHaveLength(0);
  });
});

describe('PS-1781 — a saved order must read the same for every consumer', function() {
  it('keeps assigned orders unique when the neighbours are packed', function() {
    // B and C carry ids that disagree with their order, so a duplicate order
    // would be resolved by id and silently reorder the rows
    var rows = [
      { id: 100, name: 'A', order: 0 },
      { id: 300, name: 'B', order: 1 },
      { id: 200, name: 'C', order: 2 }
    ];
    var originals = {};

    rows.forEach(function(row) {
      originals[row.id] = { id: row.id, data: { Name: row.name }, order: row.order };
    });

    var entries = [
      { id: 100, data: { Name: 'A' } },
      { data: { Name: 'NEW' } },
      { id: 300, data: { Name: 'B' } },
      { id: 200, data: { Name: 'C' } }
    ];
    var payload = commit(entries, originals);
    var assigned = payload.entries.map(function(entry) {
      return entry.order;
    });

    expect(assigned.length).toBe(new Set(assigned).size);
    expect(readAs(rows, payload, 1)).toBe('A,NEW,B,C');
    expect(readAs(rows, payload, -1)).toBe('A,NEW,B,C');
  });

  /**
   * Build an unordered data source of n rows, in the sequence it reads back:
   * nothing carries an order, so the newest row comes first.
   * @param {Number} n - How many rows
   * @returns {Array} Stored rows, newest first
   */
  function unorderedRows(n) {
    var rows = [];
    var i;

    for (i = n - 1; i >= 0; i--) {
      rows.push({ id: 1000 + i, name: 'U' + i, order: null });
    }

    return rows;
  }

  it('pins a row added to the end of an unordered data source', function() {
    var rows = unorderedRows(20);
    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var expected = rows.map(function(row) {
      return row.name;
    }).concat('NEW').join(',');

    // An unnumbered row always sorts after a numbered one, so the only thing
    // that holds the new row at the end is numbering what is above it. The new
    // row would otherwise carry the highest id and read first.
    expect(readAs(rows, payload, -1)).toBe(expected);
    expect(payload.entries).toHaveLength(21);
  });

  it('does not commit a large unordered data source to place an added row', function() {
    var rows = unorderedRows(2000);
    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    // Past the anchor limit the trade goes the other way: numbering 2,000 rows
    // to hold one of them at the end is the whole-dataset commit that times out
    // (PS-1781), so the row is left unnumbered and reads where every other
    // unnumbered row in this data source reads - by id, newest first.
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBeUndefined();
    expect(readAs(rows, payload, -1).indexOf('NEW')).toBe(0);
  });

  it('does not renumber a moved row onto an order a later row still holds', function() {
    // Inserting above order 0 creates negative orders, so a data source can
    // hold -1, 0, 1 and a null at once. Numbering the moved prefix from zero
    // wrote 1 over the row already sitting at 1.
    var rows = [
      { id: 1, name: 'A', order: -1 },
      { id: 2, name: 'B', order: 0 },
      { id: 3, name: 'C', order: 1 },
      { id: 4, name: 'D', order: null }
    ];
    var d = build(rows);
    var entries = [d.entries[1], d.entries[0], d.entries[2], d.entries[3]];
    var payload = commit(entries, d.originals, true);
    var stored = rows.map(function(row) {
      var written = payload.entries.filter(function(entry) {
        return entry.id === row.id;
      })[0];

      return written && typeof written.order === 'number' ? written.order : row.order;
    }).filter(function(order) {
      return typeof order === 'number';
    });

    expect(readAs(rows, payload, -1)).toBe('B,A,C,D');
    expect(stored.length).toBe(new Set(stored).size);
    expect(payload.entries).toHaveLength(2);
  });

  it('writes nothing for a no-op drag on a data source that mixes both', function() {
    // Numbered rows carry higher ids than the unnumbered ones, so a baseline
    // built on id alone made every row look moved
    var originals = {};
    var entries = [];
    var i;

    for (i = 0; i < 10; i++) {
      originals[100 + i] = { id: 100 + i, data: { Name: 'N' + i }, order: null };
    }

    for (i = 0; i < 10; i++) {
      originals[900 + i] = { id: 900 + i, data: { Name: 'M' + i }, order: i };
    }

    for (i = 0; i < 10; i++) {
      entries.push({ id: 900 + i, data: { Name: 'M' + i } });
    }

    // unnumbered rows read newest first
    for (i = 9; i >= 0; i--) {
      entries.push({ id: 100 + i, data: { Name: 'N' + i } });
    }

    var payload = commit(entries, originals, true);

    expect(payload.entries).toHaveLength(0);
  });
});

describe('EntryDiff.computeReorderedPositions', function() {
  it('hands every row back its own value when nothing moved', function() {
    var d = build([
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 10 },
      { id: 3, name: 'C', order: 20 }
    ]);

    expect(EntryDiff.computeReorderedPositions(d.entries, d.originals))
      .toEqual({ 1: 0, 2: 10, 3: 20 });
  });

  it('ignores rows that have no cached original', function() {
    var d = build([{ id: 1, name: 'A', order: 0 }]);

    d.entries.push({ data: { Name: 'NEW' } });

    expect(EntryDiff.computeReorderedPositions(d.entries, d.originals)).toEqual({ 1: 0 });
  });

  it('survives an empty list', function() {
    expect(EntryDiff.computeReorderedPositions([], {})).toEqual({});
  });
});

describe('EntryDiff.computeCommitPayload — edge cases', function() {
  it('handles a null entry list', function() {
    var payload = commit(null, {});

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(0);
  });

  it('deletes every row when the table is emptied', function() {
    var d = dense(3);
    var payload = commit([], d.originals);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toHaveLength(3);
  });

  it('reports an edit and a delete together', function() {
    var d = dense(3);

    d.entries[0].data.Name = 'CHANGED';

    var payload = commit(d.entries.slice(0, 2), d.originals);

    expect(payload.entries).toHaveLength(1);
    expect(payload.delete).toEqual([1002]);
  });
});

describe('PS-1781 — placing a row must not commit the data source', function() {
  /**
   * A data source numbered 0..n-1 with no gaps - the shape the manager itself
   * produced before this change, since every save stamped a dense visual index.
   * @param {Number} n - How many rows
   * @returns {Array} Stored rows in read order
   */
  function packedRows(n) {
    var rows = [];
    var i;

    for (i = 0; i < n; i++) {
      rows.push({ id: 1000 + i, name: 'R' + i, order: i });
    }

    return rows;
  }

  it('places a mid-source insert exactly while it stays cheap', function() {
    var rows = packedRows(200);
    var d = build(rows);

    d.entries.splice(100, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var read = readAs(rows, payload, -1).split(',');

    // Nothing fits between two consecutive integers, so one side has to shift.
    // The shorter side is the 100 rows above, not the 100 below - and either
    // way the row lands where the user dropped it.
    expect(read[100]).toBe('NEW');
    expect(payload.entries).toHaveLength(101);
  });

  it('appends rather than commit half a large packed data source', function() {
    var rows = packedRows(15000);
    var d = build(rows);

    d.entries.splice(7500, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    // 7,501 entries is ~1.7 MB and ~7s - inside the window the ticket reports
    // as a 502. Neither side is cheap enough, so the row keeps its place in the
    // grid for this session and reloads at the end.
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBeUndefined();
  });

  it('costs no more than the write limit wherever the row goes', function() {
    var rows = packedRows(4000);
    var positions = [0, 1, 400, 501, 2000, 3600, 3999, 4000];

    positions.forEach(function(at) {
      var d = build(rows);

      d.entries.splice(at, 0, { data: { Name: 'NEW' } });

      var payload = commit(d.entries, d.originals);

      expect(payload.entries.length).toBeLessThanOrEqual(501);
    });
  });
});

describe('PS-1781 — a sorted grid is not an arrangement', function() {
  it('writes no positions when the grid is showing a column sort', function() {
    var rows = [
      { id: 1, name: 'C', order: 0 },
      { id: 2, name: 'A', order: 1 },
      { id: 3, name: 'B', order: 2 }
    ];
    var d = build(rows);
    // sorted by name, then a row dragged within the sorted view
    var entries = [d.entries[1], d.entries[2], d.entries[0]];
    var payload = commit(entries, d.originals, true, false);

    // Persisting this would write the sort into the data source - on a
    // 15,000-row one, all of it
    expect(payload.entries).toHaveLength(0);
  });

  it('does not read a new row position off a sorted grid', function() {
    var rows = [
      { id: 1, name: 'C', order: 0 },
      { id: 2, name: 'A', order: 1 },
      { id: 3, name: 'B', order: 2 }
    ];
    var d = build(rows);
    var entries = [d.entries[1], { data: { Name: 'NEW' } }, d.entries[2], d.entries[0]];
    var payload = commit(entries, d.originals, false, false);

    // The row above a new one in a sorted grid is not the row it will reload
    // after, so no position can be read off it
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].order).toBeUndefined();
  });

  it('still writes positions once the sort is cleared', function() {
    var rows = [
      { id: 1, name: 'C', order: 0 },
      { id: 2, name: 'A', order: 1 },
      { id: 3, name: 'B', order: 2 }
    ];
    var d = build(rows);
    var entries = [d.entries[1], d.entries[0], d.entries[2]];
    var payload = commit(entries, d.originals, true, true);

    expect(payload.entries).toHaveLength(2);
    expect(readAs(rows, payload, -1)).toBe('A,C,B');
  });
});

describe('EntryDiff.hasEntryChanged', function() {
  it('compares the data only', function() {
    var entry = { id: 1, data: { Name: 'A' } };

    expect(EntryDiff.hasEntryChanged(entry, { id: 1, data: { Name: 'A' }, order: 4 }, isEqual)).toBe(false);
    expect(EntryDiff.hasEntryChanged(entry, { id: 1, data: { Name: 'B' }, order: 4 }, isEqual)).toBe(true);
  });

  it('ignores a value that only changed shape in the grid', function() {
    var entry = { id: 1, data: { Num: '30', Blank: '' } };
    var original = { id: 1, data: { Num: 30 }, order: 0 };

    expect(EntryDiff.hasEntryChanged(entry, original, isEqual)).toBe(false);
  });
});
describe('PS-1781 — several rows added in one save', function() {
  // A data source carrying no order at all, in the sequence it reads back:
  // nothing is numbered, so the newest row comes first.
  function unordered() {
    return [
      { id: 3, name: 'C', order: null },
      { id: 2, name: 'B', order: null },
      { id: 1, name: 'A', order: null }
    ];
  }

  it('keeps two inserts in place when they are separated by existing rows', function() {
    var rows = unordered();
    var d = build(rows);
    var entries = [
      d.entries[0],
      { data: { Name: 'N1' } },
      d.entries[1],
      { data: { Name: 'N2' } },
      d.entries[2]
    ];
    var payload = commit(entries, d.originals);

    // The second insertion has to see where the first one landed. While each
    // run was placed as if it were the only one, the second stayed unnumbered
    // and its newer id carried it back above the row it was dropped under.
    expect(readAs(rows, payload, -1)).toBe('C,N1,B,N2,A');
  });

  it('keeps a run of rows added at the very top in the order they were typed', function() {
    var rows = unordered();
    var d = build(rows);
    var entries = [
      { data: { Name: 'N1' } },
      { data: { Name: 'N2' } },
      d.entries[0],
      d.entries[1],
      d.entries[2]
    ];
    var payload = commit(entries, d.originals);

    // One row added at the top of an unordered data source can be left
    // unnumbered - it holds the newest id, and unnumbered rows read newest
    // first, so it already reads first. Two cannot: they would swap.
    expect(readAs(rows, payload, -1)).toBe('N1,N2,C,B,A');
  });

  it('keeps a run added in the middle in the order it was typed', function() {
    var rows = unordered();
    var d = build(rows);
    var entries = [
      d.entries[0],
      { data: { Name: 'N1' } },
      { data: { Name: 'N2' } },
      { data: { Name: 'N3' } },
      d.entries[1],
      d.entries[2]
    ];
    var payload = commit(entries, d.originals);

    expect(readAs(rows, payload, -1)).toBe('C,N1,N2,N3,B,A');
  });

  it('keeps three separate inserts in place in one save', function() {
    var rows = unordered();
    var d = build(rows);
    var entries = [
      { data: { Name: 'N1' } },
      d.entries[0],
      { data: { Name: 'N2' } },
      d.entries[1],
      { data: { Name: 'N3' } },
      d.entries[2]
    ];
    var payload = commit(entries, d.originals);

    expect(readAs(rows, payload, -1)).toBe('N1,C,N2,B,N3,A');
  });

  it('keeps inserts in place on a numbered data source too', function() {
    var rows = [
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 10 },
      { id: 3, name: 'C', order: 20 }
    ];
    var d = build(rows);
    var entries = [
      d.entries[0],
      { data: { Name: 'N1' } },
      d.entries[1],
      { data: { Name: 'N2' } },
      d.entries[2]
    ];
    var payload = commit(entries, d.originals);

    expect(readAs(rows, payload, -1)).toBe('A,N1,B,N2,C');
    expect(readAs(rows, payload, 1)).toBe('A,N1,B,N2,C');
  });
});
