/**
 * Column renames and deletions made in the grid, as the API applies them.
 *
 * On a paginated data source the grid holds one page. A save sends only that
 * page's rows, keyed by the header row, so renaming or deleting a column in
 * the grid used to change those rows only: every other page kept the old name,
 * and the column came back on the next page (PS-2204). The commit API takes
 * `renameColumns` and `deleteColumns` and applies them to every row in the data
 * source, so the save has to say which columns were renamed or deleted.
 *
 * A header row cannot say that by itself. "A, B" becoming "B" could be B
 * deleted, or B deleted and A renamed to B. So each grid column carries an id
 * from the moment it is loaded, and the save compares each id's current name
 * with the name it was saved under.
 *
 * Ids follow the grid's physical columns - the order of its data arrays - which
 * a column move does not change. Its visual order would not do: Handsontable
 * 0.38 keeps a column move's mapping when Undo reloads the grid, so the visual
 * position of a column after an Undo is not the one it was recorded at.
 *
 * Kept free of Handsontable and the DOM so the specs can run it.
 */

// eslint-disable-next-line no-unused-vars
var ColumnChanges = (function() {
  'use strict';

  // Prefix of the temporary name used to break a rename cycle (A to B, B to A)
  var TEMP_NAME_PREFIX = '__dsm_column_rename_';
  var lastId = 0;

  function newId() {
    lastId += 1;

    return 'column-' + lastId;
  }

  function isName(name) {
    return typeof name === 'string' && name !== '';
  }

  /**
   * Put renames in an order that is safe to apply one after the other, the way
   * the API applies them to each row: a column is renamed away before another
   * one takes its name, and a cycle goes through a temporary name.
   * @param {Array} renames - { column, newColumn }, all `column`s distinct and all
   *   `newColumn`s distinct
   * @param {Array} usedNames - Names a temporary name must not collide with
   * @returns {Array} The same renames, plus any temporary steps, in a safe order
   */
  function orderRenames(renames, usedNames) {
    var pending = renames.map(function(rename) {
      return { column: rename.column, newColumn: rename.newColumn };
    });
    var ordered = [];
    var tempCount = 0;

    function tempName() {
      var name;

      do {
        tempCount += 1;
        name = TEMP_NAME_PREFIX + tempCount;
      } while (usedNames.indexOf(name) !== -1);

      return name;
    }

    // A rename can run once no other pending rename still reads from its target
    function canRun(index) {
      var target = pending[index].newColumn;

      return !pending.some(function(other, otherIndex) {
        return otherIndex !== index && other.column === target;
      });
    }

    while (pending.length) {
      var index = -1;
      var i;

      for (i = 0; i < pending.length; i++) {
        if (canRun(i)) {
          index = i;
          break;
        }
      }

      if (index === -1) {
        // Every remaining rename targets a name still in use: a cycle. Move the
        // first one out of the way and let the rest of the cycle resolve.
        var temp = tempName();

        ordered.push({ column: pending[0].column, newColumn: temp });
        pending[0].column = temp;

        continue;
      }

      ordered.push(pending.splice(index, 1)[0]);
    }

    return ordered;
  }

  /**
   * Compare the grid's columns with the names they were saved under.
   * @param {Object} savedNames - Saved name by column id
   * @param {Array} ids - Column id of each physical column
   * @param {Array} names - Header of each physical column
   * @returns {Object} { renameColumns, deleteColumns }, ready for the commit API
   */
  function compare(savedNames, ids, names) {
    var currentNames = {};
    var renames = [];
    var deletes = [];
    var seen = {};
    var duplicate = false;

    ids.forEach(function(id, index) {
      if (index < names.length) {
        currentNames[id] = names[index];
      }
    });

    names.forEach(function(name) {
      if (!isName(name)) {
        return;
      }

      if (seen[name]) {
        duplicate = true;
      }

      seen[name] = true;
    });

    // The grid gives every column a unique name. If two share one, which data
    // belongs where cannot be told, so nothing is sent beyond the page's rows -
    // the behaviour before this change - rather than a guess applied to every
    // row in the data source.
    if (duplicate) {
      return { renameColumns: [], deleteColumns: [] };
    }

    Object.keys(savedNames).forEach(function(id) {
      var savedName = savedNames[id];

      if (!currentNames.hasOwnProperty(id)) {
        // An id past the end of the grid is a column this tracker lost sight of,
        // not one the user removed. Deleting it would drop data on every page,
        // so it is left alone.
        if (ids.indexOf(id) === -1) {
          deletes.push(savedName);
        }

        return;
      }

      var currentName = currentNames[id];

      if (!isName(currentName)) {
        deletes.push(savedName);

        return;
      }

      if (currentName !== savedName) {
        renames.push({ column: savedName, newColumn: currentName });
      }
    });

    var usedNames = Object.keys(savedNames).map(function(id) {
      return savedNames[id];
    }).concat(names.filter(isName));

    return {
      renameColumns: orderRenames(renames, usedNames),
      deleteColumns: deletes
    };
  }

  /**
   * Track the grid's columns from the header row it was loaded with.
   * @param {Array} names - Header row as loaded, in physical order
   * @param {Object} [options] - `demo: true` when the header row is the demo
   *   columns shown for an empty data source, which the data source does not have
   * @returns {Object} Tracker
   */
  function createTracker(names, options) {
    var ids = [];
    var savedNames = {};
    var savedOnServer = !(options && options.demo);

    function rememberSaved(columnIds, columnNames) {
      savedNames = {};

      columnIds.forEach(function(id, index) {
        if (isName(columnNames[index])) {
          savedNames[id] = columnNames[index];
        }
      });
    }

    // Grow to the grid's width with new columns at the end, which is where the
    // grid adds its spare columns
    function fit(length) {
      while (typeof length === 'number' && ids.length < length) {
        ids.push(newId());
      }
    }

    (names || []).forEach(function() {
      ids.push(newId());
    });

    rememberSaved(ids, names || []);

    return {
      /**
       * Columns were inserted at a physical index
       * @param {Number} index - Physical index of the first new column
       * @param {Number} amount - Columns inserted
       * @returns {undefined}
       */
      insert: function(index, amount) {
        var added = [];
        var i;

        for (i = 0; i < amount; i++) {
          added.push(newId());
        }

        if (typeof index !== 'number' || index < 0 || index > ids.length) {
          index = ids.length;
        }

        ids.splice.apply(ids, [index, 0].concat(added));
      },

      /**
       * Columns were removed
       * @param {Array} physicalIndexes - Physical indexes of the removed columns
       * @returns {undefined}
       */
      remove: function(physicalIndexes) {
        physicalIndexes.slice().sort(function(a, b) {
          return b - a;
        }).forEach(function(index) {
          if (index >= 0 && index < ids.length) {
            ids.splice(index, 1);
          }
        });
      },

      /**
       * Column ids in physical order
       * @param {Number} [length] - Width of the grid, to add ids for spare columns
       * @returns {Array} A copy of the ids
       */
      getIds: function(length) {
        fit(length);

        return ids.slice();
      },

      /**
       * Go back to the ids recorded with an undo/redo state. A state recorded
       * without a full set of ids is ignored: a missing id would read as a
       * deleted column, and a delete removes data from every page.
       * @param {Array} recordedIds - Ids in the order of the state's columns
       * @returns {undefined}
       */
      restore: function(recordedIds) {
        if (!Array.isArray(recordedIds) || !recordedIds.length) {
          return;
        }

        var complete = recordedIds.every(function(id) {
          return typeof id === 'string';
        });

        if (complete) {
          ids = recordedIds.slice();
        }
      },

      /**
       * Id of the column with this header, for recording a state built from names
       * @param {Array} columnNames - Headers in physical order
       * @param {String} name - Header to find
       * @returns {String|undefined} The id, if a column has that header
       */
      idOf: function(columnNames, name) {
        var index = columnNames.indexOf(name);

        return index === -1 ? undefined : ids[index];
      },

      /**
       * Renames and deletions since the last save
       * @param {Array} columnNames - Headers in physical order
       * @returns {Object} { renameColumns, deleteColumns, saved }, where `saved`
       *   is what to pass to markSaved once the commit succeeds
       */
      getChanges: function(columnNames) {
        fit(columnNames.length);

        var changes = compare(savedNames, ids, columnNames);

        changes.saved = {
          ids: ids.slice(0, columnNames.length),
          names: columnNames.slice()
        };

        // The names this grid's rows use. If one was renamed or deleted since in
        // another tab, the API refuses the save rather than write rows with the
        // old name back over that change (PS-2204).
        changes.expectColumns = savedOnServer
          ? Object.keys(savedNames).map(function(id) {
            return savedNames[id];
          })
          : [];

        return changes;
      },

      /**
       * The commit succeeded: the grid's columns are now what is saved
       * @param {Object} saved - The `saved` value from getChanges
       * @returns {undefined}
       */
      markSaved: function(saved) {
        rememberSaved(saved.ids, saved.names);
        savedOnServer = true;
      }
    };
  }

  return {
    createTracker: createTracker,
    orderRenames: orderRenames,
    compare: compare,
    TEMP_NAME_PREFIX: TEMP_NAME_PREFIX
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColumnChanges;
}
