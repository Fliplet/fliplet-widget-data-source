// A set of APIs for managing the UI history states
Fliplet.Registry.set('history-stack', (function() {
  var stack = [];
  var currentIndex = 0;

  function reset() {
    stack = [];
    currentIndex = 0;
  }

  // Clone data without losing the ID
  function cloneSpreadsheetData(data) {
    return _.map(data, function(row) {
      var entry = [];

      _.forEach(row, function(column) {
        entry.push(column);
      });

      entry.id = row.id;

      return entry;
    });
  }

  function add(state) {
    state = state || {};

    // Clear all after current index to reset redo
    if (currentIndex + 1 < stack.length) {
      stack.splice(currentIndex + 1);
    }

    // Add current change to stack
    stack.push({
      data: cloneSpreadsheetData(state.data),
      colWidths: state.colWidths,
      // Which saved column each column of `data` came from (PS-2204)
      columnIds: state.columnIds ? state.columnIds.slice() : undefined
    });

    // Don't increment current index for first insert
    if (stack.length > 1) {
      currentIndex++;
    }

    toggleUndoRedo();
  }

  function getCurrent(offset) {
    if (typeof offset === 'undefined') {
      offset = 0;
    }

    var index = currentIndex + offset;
    var currentState = stack[index];

    return {
      getData: function() {
        return currentState ? cloneSpreadsheetData(currentState.data) : undefined;
      },
      getColWidths: function() {
        return currentState ? currentState.colWidths : undefined;
      },
      getColumnIds: function() {
        return currentState && currentState.columnIds ? currentState.columnIds.slice() : undefined;
      },
      setData: function(newData, columnIds) {
        currentState.data = cloneSpreadsheetData(newData);

        if (columnIds) {
          currentState.columnIds = columnIds.slice();
        }
      }
    };
  }

  function loadCurrent() {
    var state = getCurrent();

    if (!state) {
      return;
    }

    // Load the rows with their IDs (PS-2204). getData() already returns a fresh
    // copy, so edits after this don't reach the stored state. Dropping the IDs
    // here made the next change record a state without them, and the save that
    // followed sent every row on the grid as new: each one re-inserted with a
    // new ID and the originals deleted - hard-deleted once the save held 500+.
    hot.loadData(state.getData());
    hot.updateSettings({ colWidths: state.getColWidths() });

    // The header row is back to this state's, so the column ids have to be too.
    // Otherwise, after undoing a column insert or delete, the ids would sit on
    // the wrong columns and the save would rename them (PS-2204).
    if (typeof table.restoreColumnIds === 'function') {
      table.restoreColumnIds(state.getColumnIds());
    }

    table.onChange();
  }

  function back() {
    currentIndex--;

    toggleUndoRedo();

    if (currentIndex < 0) {
      currentIndex = 0;

      return;
    }

    loadCurrent();
  }

  function forward() {
    currentIndex++;

    toggleUndoRedo();

    if (currentIndex >= stack.length) {
      currentIndex = Math.max(stack.length - 1, 0);

      return;
    }

    loadCurrent();
  }

  function canUndo() {
    return !!stack[currentIndex - 1];
  }

  function canRedo() {
    return !!stack[currentIndex + 1];
  }

  function toggleUndoRedo() {
    $('[data-action="undo"]').prop('disabled', !canUndo());
    $('[data-action="redo"]').prop('disabled', !canRedo());
  }

  return {
    reset: reset,
    add: add,
    back: back,
    forward: forward,
    getCurrent: getCurrent
  };
})());
