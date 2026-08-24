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
    // The shapes were mutually exclusive, so a source could hold nulls or
    // negatives but never both - which is exactly the state that let a drag
    // write an order a later row already held. These combine them.
    else if (kind === 'mixed-negative') order = (i % 3 === 0) ? null : i - Math.floor(n / 2);
    else if (kind === 'negative-dupes') order = Math.floor(i / 2) - Math.floor(n / 4);
    else order = rnd() < 0.25 ? null : pick(2 * n) - n;
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

const kinds = ['dense', 'sparse', 'null', 'mixed', 'dupes', 'negative', 'mixed-negative', 'negative-dupes', 'random'];
const failures = [];
let runs = 0;

for (let iter = 0; iter < 4000; iter++) {
  const kind = kinds[pick(kinds.length)];
  const n = (iter % 8 === 0) ? 60 + pick(160) : 3 + pick(8);
  const rows = makeSource(kind, n);

  // What the manager shows. It asks for no sort at all, so this is the
  // platform default - order ASC, nulls last, ties broken on DESCENDING id.
  // Generating the baseline on ascending id modelled a query the manager no
  // longer makes, and made rows look moved when they had not been.
  const originals = {};

  rows.forEach((r) => { originals[r.id] = { id: r.id, data: { Name: r.name }, order: r.order }; });

  let visual = rows.slice().sort((a, b) => {
    const an = a.order === null; const bn = b.order === null;

    if (an && bn) return b.id - a.id;
    if (an) return 1;
    if (bn) return -1;
    if (a.order !== b.order) return a.order - b.order;

    return b.id - a.id;
  }).map((r) => ({ id: r.id, data: { Name: r.name } }));

  // random edits
  let rowsMoved = false;
  const ops = 1 + pick(3);

  for (let o = 0; o < ops; o++) {
    const op = pick(4);

    if (op === 0 && visual.length > 1) {              // delete
      visual.splice(pick(visual.length), 1);
    } else if (op === 1) {                             // insert one row, or a run
      // Runs matter on their own. Rows added next to each other are placed as a
      // group, and a group at the very top of a source that carries no order
      // reloaded in reverse - one row is fine there, several are not. Inserting
      // strictly one at a time made that a 3-in-4000 accident.
      const at = pick(visual.length + 1);
      const howMany = rnd() < 0.35 ? 2 + pick(2) : 1;

      for (let k = 0; k < howMany; k++) {
        visual.splice(at + k, 0, { data: { Name: 'NEW' + o + '_' + k + '_' + iter } });
      }
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
  // The manager and every app read the same way now, so `read` is what all of
  // them see. `flipped` is the same data with the tie-break reversed, kept only
  // to prove the arrangement does not depend on which way ties fall.
  const read = readStored(stored, -1);
  const flipped = readStored(stored, 1);

  runs++;

  // what the source looked like BEFORE the edit, so pre-existing pathology in
  // the generated data is not counted against the save
  const beforeStored = {};

  rows.forEach((r) => { beforeStored[r.id] = { id: r.id, name: r.name, order: r.order }; });

  const beforeAsc = readStored(beforeStored, -1).join(',');
  const beforeDesc = readStored(beforeStored, 1).join(',');
  const beforeOrders = rows.map((r) => r.order).filter((o) => o !== null && o !== undefined);
  const beforeHadDupes = new Set(beforeOrders).size !== beforeOrders.length;
  const beforeConsistent = beforeAsc === beforeDesc;

  // What a save guarantees, and what it does not.
  //
  // A data source whose rows all carry a distinct order can be positioned
  // exactly: the arrangement is honoured and reads the same for every consumer.
  //
  // One holding rows with no order, or with an order shared between rows,
  // cannot be. Numbered rows always sort before unnumbered ones, and unnumbered
  // rows are separated by id, which the manager and apps read in opposite
  // directions. Positioning such a data source means numbering all of it, which
  // is the whole-dataset commit this exists to prevent - so it is left as it is,
  // keeping whatever ambiguity it already had.
  //
  // Two things must hold either way: a save never commits the whole data source,
  // and never leaves two rows sharing an order.
  const usable = !beforeHadDupes && rows.every((r) => typeof r.order === 'number');

  // What the arrangement check used to be gated on. Only comparing the reload
  // against the intended sequence for fully numbered sources meant nothing
  // checked placement on the sources that carry no order - which is where two
  // inserts in one save stopped composing, each run ignoring what the last one
  // had placed. Placement is owed on any source small enough to renumber, and
  // every generated one is, so the gate is now only about ambiguity: orders
  // shared between rows leave the intended sequence undefined.
  const placeable = !beforeHadDupes && rows.length <= 500;

  const problems = [];

  if (placeable && read.join(',') !== intended.join(',')) problems.push('reload != what the user arranged');

  if (usable && beforeConsistent && read.join(',') !== flipped.join(',')) problems.push('save made the arrangement depend on the id tie-break');

  const orders = Object.values(stored).map((r) => r.order).filter((o) => o !== null && o !== undefined);

  if (!beforeHadDupes && new Set(orders).size !== orders.length) problems.push('save INTRODUCED duplicate orders');

  // The bound that matters, and the shape of it.
  //
  // Deleting or editing must never scale with the size of the data source -
  // that is the timeout this exists to prevent, and it holds whatever state the
  // orders are in. A reorder is different: it scales with how far the row
  // travelled, so dragging one to the far end of a data source that carries no
  // order does commit most of it. That is inherent, not a regression.
  //
  // On a handful of rows, writing all of them is not the pathology, so the
  // bound is only meaningful at scale - which is why the generator makes some
  // large data sources.
  // Positioning scales with distance moved, and on a data source that cannot
  // express order - rows with none, or orders shared between rows - there is
  // nowhere to put a row without renumbering. Inserting into one, or dragging
  // to its far end, does commit most of it. Inherent to the stored shape.
  var hasInserts = visual.some(function(e) { return typeof e.id === 'undefined'; });
  // Inserts used to be excluded here outright, which is how a mid-source insert
  // into a packed sequence went on committing half the data source unnoticed.
  // On a data source that can express order the bound now covers them: nothing
  // fits between two consecutive integers, so rows have to shift, but only ever
  // the shorter side and never past the write limit.
  //
  // It still cannot cover a data source that carries no usable order, where
  // holding a row in place means numbering the rows above it - that is the
  // trade the write limit governs, asserted directly in entry-diff.test.js.
  var boundApplies = rows.length >= 40 && (usable || (!rowsMoved && !hasInserts));

  if (boundApplies && payload.entries.length >= rows.length) {
    problems.push('commit covered the whole data source (' + payload.entries.length + ' of ' + rows.length + ')');
  }

  if (problems.length) {
    failures.push({ kind, n, rowsMoved, problems, intended: intended.join(','), asc: read.join(','), desc: flipped.join(','),
      before: rows.map((r) => r.name + ':' + r.order).join(' ') });
  }
}

it('holds the ordering invariants across ' + runs + ' random edits', function() {
  var detail = failures.slice(0, 3).map(function(f) {
    return [
      'kind=' + f.kind + ' moved=' + f.rowsMoved + ' :: ' + f.problems.join('; '),
      '  stored before : ' + f.before,
      '  intended      : ' + f.intended,
      '  reloads as    : ' + f.asc,
      '  ties reversed : ' + f.desc
    ].join('\n');
  }).join('\n\n');

  assert.strictEqual(failures.length, 0, failures.length + ' of ' + runs + ' scenarios failed\n\n' + detail);
});
