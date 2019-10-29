// Used for undo/redo feature
var dataStack;
var currentDataStackIndex;

var hot,
    copyPastePlugin,
    data,
    colWidths = [],
    s = [1, 0, 1, 0]; // Stores current selection to use for toolbar

var spreadsheet = function(options) {
  ENTRY_ID_LABEL = 'ID';
  var rows = options.rows || [];
  var columns = options.columns || [];
  var connection = options.connection;
  var dataLoaded = false;
  var arrayColumns = [];
  var columnNameCounter = 1; // Counter to anonymous columns names

  dataStack = [];
  currentDataStackIndex = 0;

  // Don't bind data to data source object
  // Data as an array
  data = prepareData(rows, columns);

  /**
   * Given an array of data source entries it does return an array
   * of data prepared to be consumed by Handsontable
   * @param {Array} rows
   */
  function prepareData(rows, columns) {
    var preparedData = rows.map(function(row) {
      var dataRow = columns.map(function(header, index) {
        var value = row.data[header];

        if (Array.isArray(value)) {
          if (arrayColumns.indexOf(header) === -1) {
            arrayColumns.push(header);
          }

          // Add double quotes to the string if it contains a comma
          value = value.map(function (val) {
            return typeof val === 'string' && val.indexOf(',') !== -1 ? '"' + val + '"' : val;
          }).join(', ');
        }

        return value;
      });
      dataRow.id = row.id;
      return dataRow;
    });

    // Add columns as first row
    preparedData.unshift(columns);

    return preparedData;
  }

  function onChanges() {
    if (dataLoaded) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('hidden');
      $('.data-save-updated').addClass('hidden');
      $('.name-wrapper').removeClass('saved');
    }
  }

  /**
   * Style the first row (columns headings)
   */
  function columnValueRenderer(instance, td, row, col, prop, value, cellProperties) {
    var escaped = Handsontable.helper.stringify(value);
    td.innerHTML = escaped;
    $(td).css({
      'font-weight': 'bold',
      'background-color': '#e4e4e4'
    });
  }

  var hotSettings = {
    stretchH: 'all',
    manualColumnResize: true,
    manualColumnMove: true,
    manualRowMove: true,
    colWidths: 250,
    minColsNumber: 1,
    minRowsNumber: 40,
    fixedRowsTop: 1,
    colHeaders: true,
    rowHeaders: true,
    copyPaste: {
      columnsLimit: 1000,
      rowsLimit: 1000000000
    },
    columnSorting: true,
    search: true,
    undo: false,
    sortIndicator: true,
    cells: function (row, col, prop) {
      var cellProperties = {};

      if (row === 0) {
        cellProperties.renderer = columnValueRenderer;
      }

      return cellProperties;
    },
    data: data,
    // Always have one empty row at the end
    minSpareRows: 40,
    // Hooks
    beforeChange: function(changes, source) {
      // Check if the change was on columns row and validate
      changes.forEach(function(change) {
        if (change[0] === 0) {
          if (change[3] === change[2]) {
            return;
          }
          if (change[3] === '') {
            change[3] = generateColumnName();
          }
          change[3] = validateOrFixColumnName(change[3]);
        }
      });

      onChanges();
    },
    afterChangesObserved: function() {
      // Deal with the undo/redo stack
      var data = getData({ removeEmptyRows: false });
      var columns = getColumns();
      var preparedData = prepareData(data, columns);

      // Clear all aftr current index to reset redo
      if (currentDataStackIndex + 1 < dataStack.length) {
        dataStack.splice(currentDataStackIndex + 1);
      }

      // Add current change to stack
      dataStack.push({ data: preparedData });
      currentDataStackIndex = currentDataStackIndex + 1;

      undoRedoToggle();
    },
    afterRemoveRow: function(index, amount) {
      onChanges();
    },
    afterRemoveCol: function(index, amount) {
      // Remove columns widths from the widths array
      //
      colWidths.splice(index, amount);
      onChanges();
    },
    beforeRemoveCol: function(index, amount) {
      // Set current widths to get them after column column is removed
      colWidths = getColWidths();
    },
    beforeCreateCol: function() {
      // Set current widths to get them after column column is created
      colWidths = getColWidths();
    },
    afterColumnMove: function() {
      onChanges();
    },
    afterColumnResize: function () {
      colWidths = getColWidths();

      // Update column sizes in background
      return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
        dataSource.definition = dataSource.definition || {};
        dataSource.definition.columnsWidths = colWidths;

        return Fliplet.DataSources.update(currentDataSourceId, { definition: dataSource.definition });
      }).catch(console.error);
    },
    afterRowMove: function() {
      onChanges();
    },
    afterCreateRow: function(index, amount) {
      onChanges();
    },
    afterCreateCol: function(index, amount, source) {
      // Column name
      for (var i = 0; i < amount; i++) {
        var columnName = generateColumnName();
        hot.setDataAtCell(0, index + i, columnName);
      }

      // Add this new width before set the widths again
      colWidths.splice(index, 0, 50);
      hot.updateSettings({ colWidths: colWidths })

      onChanges();
    },
    afterLoadData: function(firstTime) {
      dataLoaded = true;
      $('.entries-message').html('');
    },
    afterSelectionEnd: function(r, c, r2, c2) {
      s = [r, c, r2, c2];
    }
  };

  if (currentDataSourceDefinition && Array.isArray(currentDataSourceDefinition.columnsWidths)) {
    hotSettings.colWidths = currentDataSourceDefinition.columnsWidths;
  }

  dataStack.push({ data: _.cloneDeep(data) });
  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  // Set a sort function using Handsontable columnSorting plugin
  hot.updateSettings({
    colWidths: hotSettings.colWidths,
    sortFunction: function(sortOrder, columnMeta) {
      return function(a, b) {
        var plugin = hot.getPlugin('columnSorting');
        var sortFunction;

        if (a[0] === 0) {
          return -1;
        }

        switch (columnMeta.type) {
          case 'date':
            sortFunction = plugin.dateSort;
            break;
          case 'numeric':
            sortFunction = plugin.numericSort;
            break;
          default:
            sortFunction = plugin.defaultSort;
        }

        return sortFunction(sortOrder, columnMeta)(a, b);
      };
    }
  });

  // Initialize colWidths if they wasn't stored locally
  if (!colWidths) {
    colWidths = getColWidths();
  }

  copyPastePlugin = hot.getPlugin('copyPaste');

  function getColumns() {
    var random = (new Date()).getTime().toString().slice(10);
    var headers = hot.getDataAtRow(0);

    return headers;
  }

  /**
   * Generates a column name in the form
   * Column 1, Column 2, and so on...
   */
  function generateColumnName(name) {
    name = name || 'Column ';
    var headers = getColumns();
    var columnName = name + '(' + columnNameCounter + ')';
    columnNameCounter = columnNameCounter + 1;
    return headers.indexOf(columnName) > -1
    ? generateColumnName()
    : columnName;
  }

  /**
   * Fixes column name for the user
   * There can't be duplicated column names
   */
  function validateOrFixColumnName(name) {
    var headers = getColumns();
    if (headers.indexOf(name) > -1) {
      var newName = generateColumnName(name);
      return newName;
    }

    return name;
  }

  /**
   * Check is a row is not empty. Empty means that all elements doesn't have a value
   * @param {Array} row
   */
  function isNotEmpty(row) {
    var isEmpty = true;
    row.forEach(function(field) {
      if (field) {
        isEmpty = false;
      }
    });

    return !isEmpty;
  }

  var getColWidths = function() {
    return hot.getColHeader().map(function(header, index) {
      return hot.getColWidth(index);
    });
  };

  var getData = function(options) {
    options = options || { removeEmptyRows: true };
    var headers = getColumns();
    var entries = [];

    // Because source array doesn't keep in sync with visual array and
    // we need to have the row id's. Visual data give us data with correct order
    // but without the id's, and physical data give us data with id's but
    // might not be in the order visually presented. So we need this magic...

    // Get data like we see it and exclude columns row.
    var visual = hot.getData().slice(1);

    // Get data from the source and exclude columns row.
    // For example moving rows doesn't keep the visual/physical order in sync
    var physical = hot.getSourceData().slice(1);

    if (options.removeEmptyRows) {
      visual = visual.filter(isNotEmpty);
      physical = physical.filter(isNotEmpty);
    }

    // And finally we pick the id's to visual from physical
    visual.forEach(function(visualRow, order) {
      // We need to sort bot visual and physical because column
      // move also doesn't keep the physical data in order
      var sortedVisual = _.clone(visualRow).sort();
      // Loop through the physical items to get the id
      for (i = 0; i < physical.length; i++) {
        var sortedPhysical = _.clone(physical[i]).sort();
        if (_.isEqual(sortedVisual, sortedPhysical)) {
          var entry = { id: physical[i].id, data: {} };
          headers.forEach(function(header, index) {
            entry.data[header] = visualRow[index];
            entry.order = order;

            // Cast CSV to String
            if (arrayColumns.indexOf(header) !== -1 && typeof entry.data[header] === 'string') {
              try {
                entry.data[header] = Papa.parse(entry.data[header]).data[0];
                entry.data[header] = entry.data[header].map(function (val) {
                  return typeof val === 'string' ? val.trim() : val;
                });
              } catch (e) {
                // nothing
              }
            }
          });

          entries.push(entry);

          // We found our entry, we may now remove it from physical so the array
          // Keeps getting smaller for each iteraction and get off the loop
          physical.splice(i, 1);
          break;
        }
      }
    });

    return entries;
  };

  return {
    getData: getData,
    getColumns: getColumns,
    getColWidths: getColWidths,
    destroy: function() {
      return hot.destroy();
    }
  }
};

// Search
var searchField = document.getElementById('search-field');

var queryResultIndex;
var queryResult = [];
var resultsCount = 0;

function setSearchMessage(msg) {
  if (msg) {
    $('.find-results').html(msg);
    return;
  }

  var value = searchField.value;
  var foundMessage = resultsCount + ' found';
  if (resultsCount) {
    foundMessage = (queryResultIndex + 1) + ' of ' + foundMessage;
  }
  $('.find-results').html(value !== '' ? foundMessage : '');
}

function searchSpinner() {
  setSearchMessage('<i class="fa fa-spinner fa-pulse"></i>');
}

/**
 * This will make a search
 * @param {string} action next | prev | find | clear
 */
var previousSearchValue = '';
function search(action) {
  if (action === 'clear') {
    searchField.value = '';
    searchSpinner();
    setTimeout(function(){
      search('find');
    }, 50); // 50ms for spinner to render
    return;
  }

  var value = searchField.value;
  //  Don't run search again if the value hasn't changed
  if (action === 'find' && previousSearchValue === value) {
    setSearchMessage();
    return;
  }
  previousSearchValue = value;

  if (value !== '') {
    $('.filter-form .find-controls').removeClass('disabled');
  } else {
    $('.filter-form .find-controls').addClass('disabled');
    $('.find-controls .find-prev, .find-controls .find-next').removeClass('disabled');
  }

  if (action === 'find') {
    queryResultIndex = 0;
    queryResult = hot.search.query(value);
    resultsCount = queryResult.length;
    if (resultsCount) {
      $('.find-controls .find-prev, .find-controls .find-next').removeClass('disabled');
      hot.selectCell(queryResult[0].row, queryResult[0].col, queryResult[0].row, queryResult[0].col, true, false);
    } else {
      $('.find-controls .find-prev, .find-controls .find-next').addClass('disabled');
    }

    hot.render();
  }

  if (action === 'next' || action === 'prev') {
    if (action === 'next') {
      queryResultIndex++;
      if (queryResultIndex >= queryResult.length) {
        queryResultIndex = 0;
      }
    }

    if (action === 'prev') {
      queryResultIndex--;
      if (queryResultIndex < 0) {
        queryResultIndex = queryResult.length - 1;
      }
    }

    if (queryResult[queryResultIndex]) {
      hot.selectCell(
        queryResult[queryResultIndex].row, queryResult[queryResultIndex].col, queryResult[queryResultIndex].row, queryResult[queryResultIndex].col, true, false);
    }
  }

  // Update message
  setSearchMessage();

  // Focus back to the search field
  searchField.focus();
}

$('.find-prev, .find-next').on('click', function() {
  // Simulate prev/next keys press on the search field
  if ($(this).hasClass('find-prev')) {
    search('prev');
  }

  if ($(this).hasClass('find-next')) {
    search('next');
  }
});

// Clear search field
$('.reset-find').on('click', function() {
  search('clear');
});

Handsontable.dom.addEvent(searchField, 'keydown', function onKeyDown(event) {
  // Just the modifiers
  if ([16, 17, 18, 91, 93].indexOf(event.keyCode) > -1) {
    return;
  }

  var ctrlDown = (event.ctrlKey || event.metaKey);

  // Enter & Shift + Enter
  if (event.keyCode === 13 && !ctrlDown && !event.altKey) {
    search(event.shiftKey ? 'prev' : 'next');
    return;
  }

  // Esc
  if (!ctrlDown && !event.altKey && !event.shiftKey && event.keyCode === 27) {
    search('clear');
    return;
  }

  // Cmd/Ctrl (+ Shift) + G
  if (ctrlDown && !event.altKey && event.keyCode === 71) {
    search(event.shiftKey ? 'prev' : 'next');
    event.preventDefault();
    return;
  }

  // Any other keys, but with Ctrl/Cmd modifier
  if (ctrlDown) {
    return;
  }

  // Typing
  searchSpinner();
  var debouncedFind = _.debounce(function(){
    search('find');
  }, 500);
  debouncedFind();
});

// CHeck if user is on Apple MacOS system
function isMac() {
  return navigator.platform.indexOf('Mac') > -1
}

function openOverlay() {
  var htmlContent = Fliplet.Widget.Templates['templates.overlay']();
  var copyCutPasteOverlay = new Fliplet.Utils.Overlay(htmlContent, {
    title: 'Copying and pasting',
    size: 'small',
    classes: 'copy-cut-paste-overlay',
    showOnInit: true,
    beforeOpen: function() {
      // Reset (just in case)
      $('.mac').removeClass('active');
      $('.win').removeClass('active');

      // Change shorcut keys based on system (Win/Mac)
      if (isMac()) {
        $('.mac').addClass('active');
        return;
      }
      // Windows
      $('.win').addClass('active');
    }
  });
}

function undoRedoToggle() {
  // Change undo/redo state buttons
  var disableUndo = dataStack[currentDataStackIndex - 1] ? false : true;
  var disableRedo = dataStack[currentDataStackIndex + 1] ? false : true;
  $('[data-action="undo"]').prop('disabled', disableUndo);
  $('[data-action="redo"]').prop('disabled', disableRedo);
}

// Capture undo/redo shortcuts
document.addEventListener('keydown', function(event) {
  if (isUndo(event)) {
    undo();
  }

  if (isRedo(event)) {
    redo();
  }
})

function redo() {
  if (!dataStack[currentDataStackIndex + 1]) {
    return;
  }

  hot.loadData(_.cloneDeep(dataStack[currentDataStackIndex + 1].data));
  currentDataStackIndex = currentDataStackIndex + 1;
  undoRedoToggle();
}

function undo() {
  if (!dataStack[currentDataStackIndex - 1]) {
    return;
  }


  hot.loadData(_.cloneDeep(dataStack[currentDataStackIndex - 1].data));
  currentDataStackIndex = currentDataStackIndex - 1;
  undoRedoToggle();
}

// Toolbar Feature hotSelection sturcture: [r, c, r2, c2];
$("#toolbar")
  .on('click', '[data-action="insert-row-before"]', function(e) {
    hot.alter('insert_row', s[2], 1, 'Toolbar.rowBefore');
  })
  .on('click', '[data-action="insert-row-after"]', function() {
    hot.alter('insert_row', s[2]+1, 1, 'Toolbar.rowAfter');
  })
  .on('click', '[data-action="insert-column-left"]', function() {
    hot.alter('insert_col', s[3], 1, 'Toolbar.columnLeft');
  })
  .on('click', '[data-action="insert-column-right"]', function() {
    hot.alter('insert_col', s[3]+1, 1, 'Toolbar.columnRight');
  })
  .on('click', '[data-action="remove-row"]', function removeRow() {
    var index = s[0] < s[2] ? s[0] : s[2];
    var amount = Math.abs(s[0] - s[2]) + 1;
    hot.alter('remove_row', index, amount, 'Toolbar.removeRow');
  })
  .on('click', '[data-action="remove-column"]', function removeColumn() {
    var index = s[1] < s[3] ? s[1] : s[3];
    var amount = Math.abs(s[1] - s[3]) + 1;
    hot.alter('remove_col', index, amount, 'Toolbar.removeColumn');
  })
  .on('click', '[data-action="undo"]', undo)
  .on('click', '[data-action="redo"]', redo)
  .on('click', '[data-action="copy"]', function() {
    try {
      hot.selectCell(s[0], s[1], s[2], s[3]);
      copyPastePlugin.copy();
    } catch(err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="cut"]', function() {
    try {
      hot.selectCell(s[0], s[1], s[2], s[3]);
      copyPastePlugin.cut();
    } catch(err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="paste"]', function(){
    openOverlay();
  });

$('[data-toggle="tooltip"]').tooltip({
  container: 'body',
  trigger: 'hover'
});

$('[data-toggle="tooltip"]').on('click', function () {
  $(this).tooltip('hide');
})
