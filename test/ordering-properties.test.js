// Property checks over EntryDiff.
//
// Every round of review on PS-1781 turned up a case where an order was correct
// in the Data Source Manager but not to anything else reading the data source.
// Hand-written cases kept missing them, so this generates random data sources -
// dense, sparse, unordered, mixed, duplicated, negative - applies random edits,
// and asserts three things about the result:
//
//   the manager shows what the user arranged
//   every other consumer reads the same sequence
//   no two rows end up sharing an order
//
// Pre-existing pathology in the generated source is not counted against the
// save; only defects the save itself introduces.
var test = require('node:test');
var it = test.it;
var assert = require('assert');

var EntryDiff = require('../js/entry-diff');

let seed = 12345;

function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;

  return seed / 0x7fffffff;
}

function pick(n) { return Math.floor(rnd() * n); }

function makeSource(kind, n) {
  const rows = [];

  for (let i = 0; i < n; i++) {
    let order;

    if (kind === 'dense') order = i;
    else if (kind === 'sparse') order = i * 10;
    else if (kind === 'null') order = null;
    else if (kind === 'mixed') order = (i % 3 === 0) ? null : i;
    else if (kind === 'dupes') order = Math.floor(i / 2);
    else if (kind === 'negative') order = i - Math.floor(n / 2);
    // ids deliberately not in order-order, so id tie-breaks are exposed
    rows.push({ id: 1000 + ((i * 7) % (n * 3)), name: 'R' + i, order });
  }

  // guarantee unique ids
  const seen = new Set(); let bump = 50000;

  rows.forEach((r) => {
    while (seen.has(r.id)) { r.id = ++bump; }

    seen.add(r.id);
  });

  return rows;
}

// read the stored rows the way a consumer with the given id tie-break would
function readStored(stored, idDir) {
  return Object.values(stored).slice().sort((a, b) => {
    const an = a.order === null || a.order === undefined;
    const bn = b.order === null || b.order === undefined;

    if (an && bn) return idDir * (a.id - b.id);
    if (an) return 1;
    if (bn) return -1;
    if (a.order !== b.order) return a.order - b.order;

    return idDir * (a.id - b.id);
  }).map((r) => r.name);
}

function apply(rows, payload) {
  const stored = {};

  rows.forEach((r) => { stored[r.id] = { id: r.id, name: r.name, order: r.order }; });
  payload.delete.forEach((id) => delete stored[id]);

  let nextId = 800000;

  payload.entries.forEach((e) => {
    if (typeof e.id === 'undefined') {
      nextId += 1;
      stored[nextId] = { id: nextId, name: e.data.Name, order: typeof e.order === 'undefined' ? null : e.order };

      return;
    }

    if (!stored[e.id]) return;
    stored[e.id].name = e.data.Name;
    if (typeof e.order !== 'undefined') stored[e.id].order = e.order;
  });

  return stored;
}

let guidN = 0;

function commit(entries, originals, rowsMoved) {
  return EntryDiff.computeCommitPayload(entries, originals, {
    rowsMoved: !!rowsMoved,
    isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    guid: () => 'g' + (++guidN)
  });
}

const kinds = ['dense', 'sparse', 'null', 'mixed', 'dupes', 'negative'];
const failures = [];
let runs = 0;

for (let iter = 0; iter < 4000; iter++) {
  const kind = kinds[pick(kinds.length)];
  const n = 3 + pick(8);
  const rows = makeSource(kind, n);

  // what the manager shows: order ASC nulls last, id ASC
  const originals = {};

  rows.forEach((r) => { originals[r.id] = { id: r.id, data: { Name: r.name }, order: r.order }; });

  let visual = rows.slice().sort((a, b) => {
    const an = a.order === null; const bn = b.order === null;

    if (an && bn) return a.id - b.id;
    if (an) return 1;
    if (bn) return -1;
    if (a.order !== b.order) return a.order - b.order;

    return a.id - b.id;
  }).map((r) => ({ id: r.id, data: { Name: r.name } }));

  // random edits
  let rowsMoved = false;
  const ops = 1 + pick(3);

  for (let o = 0; o < ops; o++) {
    const op = pick(4);

    if (op === 0 && visual.length > 1) {              // delete
      visual.splice(pick(visual.length), 1);
    } else if (op === 1) {                             // insert
      visual.splice(pick(visual.length + 1), 0, { data: { Name: 'NEW' + o + '_' + iter } });
    } else if (op === 2 && visual.length > 1) {        // drag
      const from = pick(visual.length);
      const to = pick(visual.length);

      if (from !== to) { visual.splice(to, 0, visual.splice(from, 1)[0]); rowsMoved = true; }
    } else if (visual.length) {                        // edit a cell
      const i = pick(visual.length);

      visual[i] = { id: visual[i].id, data: { Name: visual[i].data.Name + '*' } };
    }
  }

  const intended = visual.map((e) => e.data.Name);
  const payload = commit(visual.map((e) => ({ id: e.id, data: { Name: e.data.Name } })), originals, rowsMoved);
  const stored = apply(rows, payload);
  const asc = readStored(stored, 1);
  const desc = readStored(stored, -1);

  runs++;

  // what the source looked like BEFORE the edit, so pre-existing pathology in
  // the generated data is not counted against the save
  const beforeStored = {};

  rows.forEach((r) => { beforeStored[r.id] = { id: r.id, name: r.name, order: r.order }; });

  const beforeAsc = readStored(beforeStored, 1).join(',');
  const beforeDesc = readStored(beforeStored, -1).join(',');
  const beforeOrders = rows.map((r) => r.order).filter((o) => o !== null && o !== undefined);
  const beforeHadDupes = new Set(beforeOrders).size !== beforeOrders.length;
  const beforeConsistent = beforeAsc === beforeDesc;

  const problems = [];

  if (asc.join(',') !== intended.join(',')) problems.push('manager view != intended');
  if (beforeConsistent && asc.join(',') !== desc.join(',')) problems.push('save INTRODUCED a manager/consumer disagreement');
  const orders = Object.values(stored).map((r) => r.order).filter((o) => o !== null && o !== undefined);

  if (!beforeHadDupes && new Set(orders).size !== orders.length) problems.push('save INTRODUCED duplicate orders');

  if (problems.length) {
    failures.push({ kind, n, rowsMoved, problems, intended: intended.join(','), asc: asc.join(','), desc: desc.join(','),
      before: rows.map((r) => r.name + ':' + r.order).join(' ') });
  }
}

it('holds the ordering invariants across ' + runs + ' random edits', function() {
  var detail = failures.slice(0, 3).map(function(f) {
    return [
      'kind=' + f.kind + ' moved=' + f.rowsMoved + ' :: ' + f.problems.join('; '),
      '  stored before : ' + f.before,
      '  intended      : ' + f.intended,
      '  manager reads : ' + f.asc,
      '  consumers read: ' + f.desc
    ].join('\n');
  }).join('\n\n');

  assert.strictEqual(failures.length, 0, failures.length + ' of ' + runs + ' scenarios failed\n\n' + detail);
});
