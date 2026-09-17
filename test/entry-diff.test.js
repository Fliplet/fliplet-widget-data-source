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
 * Sort rows the way the platform reads a data source, with the id tie-break in
 * a given direction. The default is id DESC, which is what the manager and
 * every app get; reading the same either way proves the arrangement does not
 * rest on the tie-break.
 * @param {Number} idDirection - -1 for the platform default, 1 to reverse ties
 * @returns {Function} Comparator over { id, order }
 */
function readComparator(idDirection) {
  return function(a, b) {
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
  };
}

/**
 * Apply a payload the way the API does, in the order it does: the renumber
 * first, over every live entry, then the deletes, then the entries themselves.
 * Modelling the renumber here is the whole point - the client predicts it
 * rather than reading it back, so a test that skipped it would be asserting
 * against a data source the API never produces.
 * @param {Array} rows - Stored rows, [{ id, name, order }]
 * @param {Object} payload - Result of computeCommitPayload
 * @returns {Object} Stored rows by id, after the save
 */
function applyPayload(rows, payload) {
  var stored = {};

  rows.forEach(function(row) {
    stored[row.id] = { id: row.id, name: row.name, order: row.order };
  });

  if (payload.normalizeOrder) {
    Object.keys(stored).map(function(key) {
      return stored[key];
    }).sort(readComparator(-1)).forEach(function(row, index) {
      row.order = (index + 1) * payload.normalizeOrder.gap;
    });
  }

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

  return stored;
}

/**
 * Read rows back with the id tie-break in a given direction.
 * @param {Array} rows - Stored rows, [{ id, name, order }]
 * @param {Object} payload - Result of computeCommitPayload
 * @param {Number} idDirection - -1 for the platform default, 1 to reverse ties
 * @returns {String} Comma-separated names in read order
 */
function readAs(rows, payload, idDirection) {
  var stored = applyPayload(rows, payload);

  return Object.keys(stored).map(function(key) {
    return stored[key];
  }).sort(readComparator(idDirection)).map(function(row) {
    return row.name;
  }).join(',');
}

/**
 * Read a saved data source back the way the manager and every app see it.
 * @param {Array} rows - Stored rows, [{ id, name, order }]
 * @param {Object} payload - Result of computeCommitPayload
 * @returns {String} Comma-separated names in read order
 */
function applyAndRead(rows, payload) {
  return readAs(rows, payload, -1);
}

/**
 * Orders held by more than one row once the payload has been applied. Nothing
 * a save writes may collide with a row it never touched.
 * @param {Array} rows - Stored rows before the save
 * @param {Object} payload - Result of computeCommitPayload
 * @returns {Array} Duplicated order values
 */
function sharedOrders(rows, payload) {
  var stored = applyPayload(rows, payload);
  var byOrder = {};

  Object.keys(stored).forEach(function(key) {
    var order = stored[key].order;

    if (typeof order !== 'number') {
      return;
    }

    byOrder[order] = (byOrder[order] || 0) + 1;
  });

  return Object.keys(byOrder).filter(function(order) {
    return byOrder[order] > 1;
  });
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
  // Rows with no order read newest first, so the ids descend down the grid -
  // the manager shows a data source in exactly the sequence the platform reads
  // it, and a fixture that does not is asserting against a view nobody has.
  var nulls = [
    { id: 3, name: 'A', order: null },
    { id: 2, name: 'B', order: null },
    { id: 1, name: 'C', order: null }
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

  it('rewrites only the span a drag crossed on an unordered data source', function() {
    var rows = [];
    var i;

    // Rows with no order read newest first, so that is the sequence the manager
    // shows and the baseline a drag is measured against
    for (i = 499; i >= 0; i--) {
      rows.push({ id: 1000 + i, name: 'U' + i, order: null });
    }

    var d = build(rows);
    var payload = commit(move(d.entries, 10, 20), d.originals, true);

    // Numbering the rows above the move is what used to make this cost the
    // depth of the drag. The renumber does that server-side over the sequence
    // the manager is already showing, so the commit is the span and no more.
    expect(payload.normalizeOrder.gap).toBe(1000);
    expect(payload.entries).toHaveLength(11);
    expect(applyAndRead(rows, payload)).toBe(move(rows, 10, 20).map(function(row) {
      return row.name;
    }).join(','));
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
    // row would otherwise carry the highest id and read first. The renumber
    // does the numbering, so the commit is the one row the user added.
    expect(readAs(rows, payload, -1)).toBe(expected);
    expect(readAs(rows, payload, 1)).toBe(expected);
    expect(payload.entries).toHaveLength(1);
    expect(payload.normalizeOrder.gap).toBe(1000);
  });

  it('places a row added to a large unordered data source without committing it', function() {
    var rows = unorderedRows(2000);
    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var expected = rows.map(function(row) {
      return row.name;
    }).concat('NEW').join(',');

    // Numbering 2,000 rows from here to hold one of them at the end is the
    // whole-dataset commit that times out (PS-1781). The renumber costs the
    // client nothing, so the row is placed exactly and one row is sent.
    expect(payload.entries).toHaveLength(1);
    expect(typeof payload.entries[0].order).toBe('number');
    expect(payload.normalizeOrder.gap).toBe(1000);
    expect(readAs(rows, payload, -1)).toBe(expected);
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

  it('places a mid-source insert exactly, and sends one row', function() {
    var rows = packedRows(200);
    var d = build(rows);

    d.entries.splice(100, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var read = readAs(rows, payload, -1).split(',');

    // Nothing fits between two consecutive integers, so the data source has to
    // be respaced. The renumber does it in one statement over the sequence
    // already on screen, so the row lands where the user dropped it and the
    // 100 rows that used to be rewritten to make room are not sent at all.
    expect(read[100]).toBe('NEW');
    expect(payload.entries).toHaveLength(1);
    expect(payload.normalizeOrder.gap).toBe(1000);
  });

  it('places a row in the middle of a large packed data source (PS1781-D-11)', function() {
    var rows = packedRows(15000);
    var d = build(rows);

    d.entries.splice(7500, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var read = readAs(rows, payload, -1).split(',');

    // QA's NO-GO: the row was committed with no order at all, which the API
    // stores as null and sorts after every numbered row - the very end of a
    // 15,000-row data source. Shifting a side to make room would have been
    // 7,501 entries, ~1.7 MB and ~7s, inside the window that 502s.
    expect(read[7500]).toBe('NEW');
    expect(payload.entries).toHaveLength(1);
    expect(typeof payload.entries[0].order).toBe('number');
    expect(payload.normalizeOrder.gap).toBe(1000);
  });

  it('costs one row wherever the row goes', function() {
    var rows = packedRows(4000);
    var positions = [0, 1, 400, 501, 2000, 3600, 3999, 4000];

    positions.forEach(function(at) {
      var d = build(rows);

      d.entries.splice(at, 0, { data: { Name: 'NEW' } });

      var payload = commit(d.entries, d.originals);

      // The cost is what the user typed, not where they typed it. The write
      // limit that used to bound this was a limit on rows the client renumbers,
      // and the client no longer renumbers anything.
      expect(payload.entries).toHaveLength(1);
      expect(readAs(rows, payload, -1).split(',')[at]).toBe('NEW');
    });
  });

  it('seats a paste too large for one gap by widening the renumber', function() {
    var rows = packedRows(600);
    var d = build(rows);
    var pasted = [];
    var i;

    for (i = 0; i < 1500; i++) {
      pasted.push({ data: { Name: 'P' + i } });
    }

    // A paste is a run: it has to fit between the orders of the two rows it
    // landed between, so the gap the renumber uses is chosen to hold it.
    d.entries.splice.apply(d.entries, [300, 0].concat(pasted));

    var payload = commit(d.entries, d.originals);
    var read = readAs(rows, payload, -1).split(',');

    expect(payload.normalizeOrder.gap).toBe(1501);
    expect(payload.entries).toHaveLength(1500);
    expect(read[299]).toBe('R299');
    expect(read[300]).toBe('P0');
    expect(read[1799]).toBe('P1499');
    expect(read[1800]).toBe('R300');
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

  it('does not leave a single added row held up by the id tie-break alone', function() {
    // One row added above a data source that carries no order reads correctly
    // today - it holds the newest id, and unnumbered rows read newest first.
    // But nothing about that is stored, so the arrangement rests on the tie-break
    // rather than on the data source. Numbering it costs no extra row in the
    // commit: the new row is being written anyway.
    var rows = [{ id: 1, name: 'A', order: null }];
    var d = build(rows);
    var entries = [{ data: { Name: 'NEW' } }, d.entries[0]];
    var payload = commit(entries, d.originals);

    expect(readAs(rows, payload, -1)).toBe('NEW,A');
    expect(readAs(rows, payload, 1)).toBe('NEW,A');
    expect(payload.entries).toHaveLength(1);
    expect(typeof payload.entries[0].order).toBe('number');
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

describe('PS-1781 — a drag must not commit the data source either', function() {
  /**
   * A data source whose rows carry no order at all - what the API stores for
   * every entry it did not receive an order for, so the shape of any data
   * source filled by a form, an import or the JS API.
   * @param {Number} n - How many rows
   * @returns {Array} Stored rows in read order, newest id first
   */
  function unorderedRows(n) {
    var rows = [];
    var i;

    for (i = 0; i < n; i++) {
      rows.push({ id: n - i, name: 'R' + (n - i), order: null });
    }

    return rows;
  }

  /**
   * Swap two neighbouring rows, the cheapest drag the grid can produce.
   * @param {Array} entries - Entries in visual order
   * @param {Number} at - Index of the upper row
   * @returns {Array} The same array, reordered
   */
  function swap(entries, at) {
    var moved = entries[at];

    entries[at] = entries[at + 1];
    entries[at + 1] = moved;

    return entries;
  }

  it('persists a drag deeper than the old write limit, and sends two rows', function() {
    // Holding a row among unnumbered ones means numbering every row above it,
    // so this used to cost the depth of the drag: one adjacent swap at index
    // 600 wrote 602 rows, and the same swap at 14,900 wrote 14,902 - the
    // payload and the 502 this whole change exists to remove. Past the limit
    // the drag was refused outright and the grid silently reverted on reload.
    var rows = unorderedRows(700);
    var d = build(rows);
    var expected = swap(rows.slice(), 600).map(function(row) {
      return row.name;
    }).join(',');
    var payload = commit(swap(d.entries, 600), d.originals, true);

    expect(payload.entries).toHaveLength(2);
    expect(payload.delete).toHaveLength(0);
    expect(sharedOrders(rows, payload)).toHaveLength(0);
    expect(readAs(rows, payload, -1)).toBe(expected);
  });

  it('still persists a shallow drag as cheaply', function() {
    var rows = unorderedRows(700);
    var d = build(rows);
    var payload = commit(swap(d.entries, 5), d.originals, true);

    expect(payload.entries).toHaveLength(2);
    expect(sharedOrders(rows, payload)).toHaveLength(0);
  });

  it('still persists a deep drag when the rows above are already numbered', function() {
    // The shape a real data source drifts into: numbered by an earlier save,
    // then rows added by a form or the API since, which carry no order. That
    // makes the whole source "incomplete", so a drag renumbers the prefix - but
    // onto the values those rows are already holding, so almost nothing is
    // committed. Bounding on the size of the prefix rather than on what it
    // actually writes stopped these drags persisting at all.
    var rows = [];
    var i;

    for (i = 0; i < 3000; i++) {
      rows.push({ id: 1000 + i, name: 'P' + i, order: i });
    }

    for (i = 0; i < 13; i++) {
      rows.push({ id: 900000 - i, name: 'N' + i, order: null });
    }

    var d = build(rows);
    var payload = commit(swap(d.entries, 2500), d.originals, true);

    expect(payload.entries).toHaveLength(2);
    expect(sharedOrders(rows, payload)).toHaveLength(0);
  });

  it('places a new row inside the span a drag disturbed', function() {
    // Both halves of one save: a drag the client cannot express against the
    // stored orders, and a new row dropped inside the span it disturbed. The
    // drag used to be refused, which left the grid showing a sequence the data
    // source did not hold, so the new row had to be left unplaced too. Both are
    // now decided against the same renumbering.
    var rows = [];
    var i;

    for (i = 0; i < 700; i++) {
      rows.push({ id: 1000 + i, name: 'M' + i, order: i * 3 });
    }

    for (i = 700; i < 1400; i++) {
      rows.push({ id: 20000 - i, name: 'U' + i, order: null });
    }

    var d = build(rows);
    var entries = swap(d.entries, 600);

    entries.splice(601, 0, { data: { Name: 'NEW' } });

    var payload = commit(entries, d.originals, true);
    var read = readAs(rows, payload, -1).split(',');

    expect(sharedOrders(rows, payload)).toHaveLength(0);
    expect(read[599]).toBe('M599');
    expect(read[600]).toBe('M601');
    expect(read[601]).toBe('NEW');
    expect(read[602]).toBe('M600');
  });
});

describe('PS-1781 — an order the column cannot hold is not a position', function() {
  // `order` is a 32-bit signed integer in the database. A value past either end
  // is not a row in the wrong place, it is a rejected write and a failed save -
  // the outcome this whole change exists to prevent - so every path that
  // invents a number declines instead.
  var INT_MAX = 2147483647;
  var INT_MIN = -2147483648;

  /**
   * Orders in a payload that the column could not store.
   * @param {Object} payload - Result of computeCommitPayload
   * @returns {Array} The offending values
   */
  function unstorable(payload) {
    return payload.entries.map(function(entry) {
      return entry.order;
    }).filter(function(order) {
      return typeof order === 'number' && (order > INT_MAX || order < INT_MIN);
    });
  }

  it('declines a row appended after the highest order the column holds', function() {
    var rows = [
      { id: 1, name: 'A', order: 10 },
      { id: 2, name: 'B', order: INT_MAX }
    ];
    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(unstorable(payload)).toHaveLength(0);
    expect(payload.entries[0].order).toBeUndefined();
    // Declined but not misplaced, so not reported: an unnumbered row sorts
    // after every numbered one, which is the bottom of the grid - where the
    // user put it. A notice here would be a warning about nothing.
    expect(payload.declined.rows).toBe(0);
    expect(applyAndRead(rows, payload)).toBe('A,B,NEW');
  });

  it('reports a run appended past the column, which does reverse', function() {
    var rows = [
      { id: 1, name: 'A', order: 10 },
      { id: 2, name: 'B', order: INT_MAX }
    ];
    var d = build(rows);

    d.entries.push({ data: { Name: 'N1' } });
    d.entries.push({ data: { Name: 'N2' } });

    var payload = commit(d.entries, d.originals);

    // Unnumbered rows are read newest id first, so two of them at the bottom
    // come back the other way round. That one is worth saying.
    expect(unstorable(payload)).toHaveLength(0);
    expect(payload.declined.rows).toBe(2);
    expect(applyAndRead(rows, payload)).toBe('A,B,N2,N1');
  });

  it('declines a row inserted before the lowest order the column holds', function() {
    var rows = [
      { id: 1, name: 'A', order: INT_MIN },
      { id: 2, name: 'B', order: 0 }
    ];
    var d = build(rows);

    d.entries.splice(0, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(unstorable(payload)).toHaveLength(0);
    expect(payload.entries[0].order).toBeUndefined();
    expect(payload.declined.rows).toBe(1);
  });

  it('persists a drag on rows parked at the bottom of the column', function() {
    // Rows sharing an order cannot be positioned against - they are separated
    // by id, which the manager and the platform read in opposite directions -
    // and with that order already at the bottom of the column there was nowhere
    // below it to number a prefix into either, so the drag was refused. The
    // renumber leaves neither problem: it moves the whole data source into the
    // middle of the column, away from both ends.
    // The rows are given in read order - shared orders are read by descending
    // id - because in any other order the drag looks like a different move.
    var rows = [
      { id: 3, name: 'C', order: INT_MIN },
      { id: 2, name: 'B', order: INT_MIN },
      { id: 1, name: 'A', order: INT_MIN }
    ];
    var d = build(rows);
    var moved = d.entries[0];

    d.entries[0] = d.entries[1];
    d.entries[1] = moved;

    var payload = commit(d.entries, d.originals, true);

    expect(unstorable(payload)).toHaveLength(0);
    expect(payload.normalizeOrder.gap).toBe(1000);
    expect(readAs(rows, payload, -1)).toBe('B,C,A');
    expect(readAs(rows, payload, 1)).toBe('B,C,A');
  });

  it('places a row that could only be held by numbering past the column', function() {
    // Nothing was numbered above the new row except a row already at the top of
    // the column, so the unnumbered rows between could not be given the values
    // that would hold it in place. After the renumber nothing sits at the top
    // of the column at all.
    var rows = [
      { id: 1, name: 'M', order: INT_MAX - 1 },
      { id: 20, name: 'U1', order: null },
      { id: 10, name: 'U2', order: null }
    ];
    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(unstorable(payload)).toHaveLength(0);
    expect(payload.declined.rows).toBe(0);
    expect(readAs(rows, payload, -1)).toBe('M,U1,U2,NEW');
  });

  it('keeps the gap it asks for inside the range the API will accept', function() {
    // The API rejects a commit whose gap * (live rows + 1) runs off the column
    // with a 400, and a rejected write is the failed save this exists to
    // prevent - so the two bounds have to be the same bound.
    var rows = [];
    var i;

    for (i = 0; i < 4000; i++) {
      rows.push({ id: 1000 + i, name: 'R' + i, order: i });
    }

    var d = build(rows);

    d.entries.splice(2000, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.normalizeOrder.gap).toBeGreaterThan(0);
    expect(payload.normalizeOrder.gap * (rows.length + 1)).toBeLessThanOrEqual(INT_MAX);
  });
});

describe('PS-1781 — a save must say what it declined', function() {
  it('reports nothing when everything was saved', function() {
    var rows = [
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 10 },
      { id: 3, name: 'C', order: 20 }
    ];
    var d = build(rows);

    d.entries.splice(1, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.declined.sorted).toBe(false);
    expect(payload.declined.rows).toBe(0);
  });

  it('reports nothing for a drag it used to refuse', function() {
    var rows = [];
    var i;

    for (i = 0; i < 700; i++) {
      rows.push({ id: 700 - i, name: 'R' + (700 - i), order: null });
    }

    var d = build(rows);
    var moved = d.entries[600];

    d.entries[600] = d.entries[601];
    d.entries[601] = moved;

    var payload = commit(d.entries, d.originals, true);

    expect(payload.entries).toHaveLength(2);
    expect(payload.declined.rows).toBe(0);
    expect(payload.declined.sorted).toBe(false);
  });

  it('places a new row deep in an unordered data source', function() {
    var rows = [];
    var i;

    for (i = 0; i < 700; i++) {
      rows.push({ id: 700 - i, name: 'R' + (700 - i), order: null });
    }

    var d = build(rows);

    // Far enough down that numbering the unnumbered rows above it - the only
    // thing that could hold it there - used to cost more than the write limit
    // allowed, so the row was committed with no order and reloaded at the top.
    d.entries.splice(600, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.declined.rows).toBe(0);
    expect(payload.entries).toHaveLength(1);
    expect(typeof payload.entries[0].order).toBe('number');
    expect(readAs(rows, payload, -1).split(',')[600]).toBe('NEW');
  });
});

describe('PS-1781 — the paths that skip placement must still report it', function() {
  it('reports a row added while a column is sorted', function() {
    // Nothing about a position can be read off a sorted grid, so the row keeps
    // whatever the API gives an unordered one. On a data source that carries no
    // order that is the very top, which is the opposite end from where the user
    // dropped it - and it was reported by nothing at all.
    var rows = [];
    var i;

    for (i = 0; i < 50; i++) {
      rows.push({ id: 50 - i, name: 'R' + (50 - i), order: null });
    }

    var d = build(rows);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals, false, false);

    expect(payload.declined.sorted).toBe(true);
    expect(payload.declined.rows).toBe(1);
    expect(readAs(rows, payload, -1).indexOf('NEW')).toBe(0);
  });

  it('persists a deep drag and the row added in the same save', function() {
    var rows = [];
    var i;

    for (i = 0; i < 600; i++) {
      rows.push({ id: 600 - i, name: 'R' + (600 - i), order: null });
    }

    var d = build(rows);
    var expected;

    d.entries.splice(580, 0, d.entries.splice(590, 1)[0]);
    d.entries.push({ data: { Name: 'NEW' } });

    expected = d.entries.map(function(entry) {
      return entry.data.Name;
    }).join(',');

    var payload = commit(d.entries, d.originals, true);

    expect(payload.declined.rows).toBe(0);
    expect(payload.declined.sorted).toBe(false);
    expect(readAs(rows, payload, -1)).toBe(expected);
  });

  it('reports nothing when a sorted save adds no rows', function() {
    var rows = [
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 10 }
    ];
    var d = build(rows);

    d.entries[0] = { id: 1, data: { Name: 'A edited' } };

    var payload = commit(d.entries, d.originals, false, false);

    expect(payload.declined.rows).toBe(0);
  });
});

describe('PS-1781 — a drag and an insert in the same save', function() {
  it('does not write a new row onto an order another row still holds', function() {
    // The collision this pins needs an exact shape: enough numbered rows that
    // the client could never have renumbered them itself, an unnumbered tail
    // that leaves the stored orders unable to express the arrangement, and a
    // new row inside the span the drag disturbed - so the row's neighbours are
    // decided by the drag rather than by anything stored.
    var rows = [];
    var i;

    for (i = 0; i < 502; i++) {
      rows.push({ id: i + 1, name: 'M' + i, order: i * 3 });
    }

    for (i = 0; i < 2; i++) {
      rows.push({ id: 500000 - i, name: 'U' + i, order: null });
    }

    var d = build(rows);
    var moved;
    var expected;

    d.entries.splice(501, 0, { data: { Name: 'NEW' } });
    moved = d.entries[500];
    d.entries[500] = d.entries[499];
    d.entries[499] = moved;

    expected = d.entries.map(function(entry) {
      return entry.data.Name;
    }).join(',');

    var payload = commit(d.entries, d.originals, true);

    expect(sharedOrders(rows, payload)).toHaveLength(0);
    expect(readAs(rows, payload, -1)).toBe(expected);
    expect(readAs(rows, payload, 1)).toBe(expected);
  });
});

describe('PS-1781 — two rows added in one save, far apart', function() {
  it('does not write an order a row nobody touched is still holding', function() {
    // The walk that used to make room for a new row stopped at the first row
    // with no settled order. A row inserted later in the same save reads
    // exactly like the end of the data source, so the walk stopped there and
    // wrote into space the rows past it still held: adding a row at index 505
    // and another at 512 of a packed 1,200-row source wrote order 511 onto the
    // row above while the row already holding 511 was never touched.
    var rows = [];
    var i;

    for (i = 0; i < 1200; i++) {
      rows.push({ id: 1000 + i, name: 'P' + i, order: i });
    }

    var d = build(rows);
    var entries = d.entries.slice();

    entries.splice(505, 0, { data: { Name: 'NEW-A' } });
    entries.splice(512, 0, { data: { Name: 'NEW-B' } });

    var payload = commit(entries, d.originals);
    var read = readAs(rows, payload, -1).split(',');

    expect(sharedOrders(rows, payload)).toHaveLength(0);
    expect(payload.entries).toHaveLength(2);
    expect(read[505]).toBe('NEW-A');
    expect(read[512]).toBe('NEW-B');
  });
});

describe('PS-1781 — the renumber the API is asked for', function() {
  var sparse = [
    { id: 1, name: 'A', order: 0 },
    { id: 2, name: 'B', order: 10 },
    { id: 3, name: 'C', order: 20 }
  ];

  it('is not asked for when the stored orders can already seat the row', function() {
    var d = build(sparse);

    d.entries.splice(1, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    // The common case has to stay byte-identical: a renumber rewrites every
    // row in the data source, and this one needs no room made for it.
    expect(payload.normalizeOrder).toBe(null);
    expect(applyAndRead(sparse, payload)).toBe('A,NEW,B,C');
  });

  it('is not asked for by a save that positions nothing', function() {
    var rows = [
      { id: 3, name: 'A', order: null },
      { id: 2, name: 'B', order: null },
      { id: 1, name: 'C', order: null }
    ];
    var d = build(rows);

    d.entries[1] = { id: 2, data: { Name: 'B edited' } };

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    expect(payload.normalizeOrder).toBe(null);
  });

  it('is not asked for by a drag that put every row back where it was', function() {
    // The drag flag says the user dragged something, not that anything ended up
    // somewhere new. A cell edited in the same save makes the commit non-empty,
    // so nothing else here would notice the renumber going out - and it would
    // rewrite every row in the data source to change nothing.
    var rows = [
      { id: 3, name: 'A', order: null },
      { id: 2, name: 'B', order: null },
      { id: 1, name: 'C', order: null }
    ];
    var d = build(rows);

    d.entries[1] = { id: 2, data: { Name: 'B edited' } };

    var payload = commit(d.entries, d.originals, true);

    expect(payload.entries).toHaveLength(1);
    expect(payload.normalizeOrder).toBe(null);
  });

  it('is never sent on its own, which the API reads as a full replace', function() {
    // An empty `entries` is how the commit endpoint is told to replace the
    // whole data source, so a renumber with nothing to apply is not a cheap
    // no-op - it deletes every row.
    //
    // Nothing can construct that shape: a renumber is only asked for by a save
    // that has a row to place, and every such row is in the commit. So this
    // pins the property rather than driving the guard that enforces it - the
    // guard at entry-diff.js is belt to this braces, on a data-loss path with a
    // public API on the other side of it.
    var rows = [
      { id: 3, name: 'A', order: null },
      { id: 2, name: 'B', order: null },
      { id: 1, name: 'C', order: null }
    ];
    var d = build(rows);
    var payload = commit(d.entries.slice(0, 2), d.originals, true);

    expect(payload.entries).toHaveLength(0);
    expect(payload.delete).toEqual([1]);
    expect(payload.normalizeOrder).toBe(null);
  });

  it('numbers the first row gap, not zero', function() {
    // ROW_NUMBER() is one-based, so the renumber writes gap, 2*gap, ... The
    // client predicts those values and sends its new rows into the space
    // between them; predicting a zero-based sequence would put every new row
    // one whole gap away from where the user dropped it.
    var rows = [
      { id: 3, name: 'A', order: null },
      { id: 2, name: 'B', order: null },
      { id: 1, name: 'C', order: null }
    ];
    var d = build(rows);

    d.entries.splice(1, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);
    var placed = payload.entries[0];

    expect(payload.normalizeOrder).toEqual({ gap: 1000 });
    // Between A at 1*1000 and B at 2*1000. A zero-based prediction would have
    // put it between 0 and 1000, i.e. above every row in the data source.
    expect(placed.order).toBeGreaterThan(1000);
    expect(placed.order).toBeLessThan(2000);
  });

  it('is visually a no-op: the same rows come back in the same sequence', function() {
    var rows = [
      { id: 10, name: 'A', order: 5 },
      { id: 11, name: 'B', order: 5 },
      { id: 12, name: 'C', order: null },
      { id: 13, name: 'D', order: -40 },
      { id: 14, name: 'E', order: null }
    ];
    // How the manager shows it: order ASC, nulls last, ties on descending id
    var d = build([rows[3], rows[1], rows[0], rows[4], rows[2]]);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.normalizeOrder).toEqual({ gap: 1000 });
    expect(readAs(rows, payload, -1)).toBe('D,B,A,E,C,NEW');
    expect(readAs(rows, payload, 1)).toBe('D,B,A,E,C,NEW');
  });

  it('places a row between two that share an order (PS1781-D-12)', function() {
    // QA's second NO-GO. Rows sharing an order are separated by id, which the
    // manager and the platform read in opposite directions, so there was no
    // position to read off the grid at all and the row was committed with none.
    var rows = [
      { id: 1, name: 'A', order: 7 },
      { id: 2, name: 'B', order: 7 },
      { id: 3, name: 'C', order: 9 }
    ];
    // Shared orders read by descending id, so B is above A
    var d = build([rows[1], rows[0], rows[2]]);

    d.entries.splice(1, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    expect(readAs(rows, payload, -1)).toBe('B,NEW,A,C');
    expect(readAs(rows, payload, 1)).toBe('B,NEW,A,C');
    expect(sharedOrders(rows, payload)).toHaveLength(0);
  });

  it('renumbers over the rows a save is about to delete as well', function() {
    // The renumber runs before the deletes, so the row being deleted still
    // takes a slot in the numbering the client is predicting.
    var rows = [
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: 1 },
      { id: 3, name: 'C', order: 2 },
      { id: 4, name: 'D', order: 3 }
    ];
    var d = build(rows);

    d.entries.splice(2, 1);
    d.entries.splice(1, 0, { data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.delete).toEqual([3]);
    expect(readAs(rows, payload, -1)).toBe('A,NEW,B,D');
    expect(sharedOrders(rows, payload)).toHaveLength(0);
  });
});
