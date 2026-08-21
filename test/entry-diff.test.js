/* eslint-env jest */

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

function commit(entries, originals, rowsMoved) {
  return EntryDiff.computeCommitPayload(entries, originals, {
    rowsMoved: !!rowsMoved,
    isEqual: isEqual,
    guid: guid
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

describe('PS-1781 — inserts must land last (review P1 #2)', function() {
  var sparse = [
    { id: 1, name: 'A', order: 0 },
    { id: 2, name: 'B', order: 10 },
    { id: 3, name: 'C', order: 20 }
  ];

  it('sends a new row without an order so it sorts last', function() {
    var d = build(sparse);

    d.entries.push({ data: { Name: 'NEW' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(1);
    // A dense index of 3 landed the row between 0 and 10, i.e. second
    expect(payload.entries[0].order).toBeUndefined();
    expect(payload.entries[0].clientId).toBe('guid-1');
  });

  it('gives every new row a client id and no order', function() {
    var d = build(sparse);

    d.entries.push({ data: { Name: 'NEW 1' } });
    d.entries.push({ data: { Name: 'NEW 2' } });

    var payload = commit(d.entries, d.originals);

    expect(payload.entries).toHaveLength(2);
    payload.entries.forEach(function(entry) {
      expect(entry.order).toBeUndefined();
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

    expect(payload.entries).toHaveLength(1);
    expect(payload.delete).toEqual([3]);
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

  it('falls back to a dense sequence when a row has no stored order', function() {
    var d = build([
      { id: 1, name: 'A', order: 0 },
      { id: 2, name: 'B', order: undefined },
      { id: 3, name: 'C', order: 20 }
    ]);
    var positions = EntryDiff.computeReorderedPositions(d.entries, d.originals);

    expect(positions).toEqual({ 1: 0, 2: 1, 3: 2 });
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
