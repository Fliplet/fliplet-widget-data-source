// Used for undo/redo feature
var dataStack;
var currentDataStackIndex;

var hot,
    copyPastePlugin,
    data,
    colWidths = [], 
    s; // Stores current selection to use for toolbar
          
var spreadsheet = function(options) {
  ENTRY_ID_LABEL = 'ID';
  var rows = options.rows || [];
  var columns = options.columns || [];
  var connection = options.connection;
  var dataLoaded = false;
  var columnNameCounter = 0; // Counter to anonymous columns names

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
        return row.data[header];
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
   * Style firt row. First row is the columns names
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
    minColsNumber: 1,
    minRowsNumber: 40,
    fixedRowsTop: 1,
    colHeaders: true,
    rowHeaders: true,
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
      var headers = getColumns();
      // Check if the change was on columns row and validate
      changes.forEach(function(change) {
        if (change[0] === 0) {
          if (change[3] === '') {
            change[3] = generateColumnName();
          }
    
          if (headers.indexOf(change[3]) > -1) {
            change[3] = fixColumnName(change[3]);
          }
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

  // Let's try to get previously stored col widths
  var storedWidths = localStorage.getItem('hotWidths_'  + currentDataSourceId);
  if (storedWidths) {
    try {
      colWidths = JSON.parse(storedWidths);
      hotSettings.colWidths = colWidths;
    } catch (e) {
    }
  }
  
  dataStack.push({ data: _.cloneDeep(data) });
  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  // Set a sort function using Handsontable columnSorting plugin
  hot.updateSettings({
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

  function getColumns(options) {
    options = options || {};
    var random = (new Date()).getTime().toString().slice(10);
    var headers = [];
    var dataAtRow0 = hot.getDataAtRow(0);
    if (options.raw) {
      return dataAtRow0;
    }

    // At this point columns should all have name
    // But just in case
    dataAtRow0.forEach(function(header, index) {
      if (headers.indexOf(header) > -1) {
        header = header + ' (1)'
      }
      
      headers.push(header);
    });
    
    return headers;
  }

  /**
   * Generates a column name in the form 
   * Column 1, Column 2, and so on...
   */
  function generateColumnName() {
    var headers = getColumns();
    columnNameCounter = columnNameCounter + 1;
    var columnName = 'Column '+ columnNameCounter;
    return headers.indexOf(columnName) > -1
    ? generateColumnName()
    : columnName;
  }

  /**
   * Fixes column name for the user
   * There can't be duplicated column names
   */
  function fixColumnName(name, j) {
    var j = j + 1 || 1;
    var headers = getColumns();
    var columnName = name + ' (' + j + ')';
    return headers.indexOf(columnName) > -1
    ? fixColumnName(name, j)
    : columnName;
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
    getData,
    getColumns: getColumns,
    getColWidths: getColWidths,
    destroy: function() {
      return hot.destroy();
    }
  }
};

// Search
var searchField = document.getElementById('search-field');

// Prevent cmd+f default behaviour and use our find
window.addEventListener("keydown", function (event) {
  var ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

  if (!ctrlDown) {
    return;
  }

  if (event.keyCode === 114 || (ctrlDown && event.keyCode === 70)) { 
    event.preventDefault();
    hot.deselectCell();
    searchField.focus();
  }
});

var queryResultIndex;
var queryResult = [];
var resultsCount = 0;


/**
 * This will make a search
 * It's used on keyup event on search field or on click prev/next icons
 * passing a custom event object
 * @param {*} event 
 */
function search (event) {
  var value = this.value;
  if (value !== '') {
    $('.filter-form .find-controls').removeClass('disabled');
  } else {
    $('.filter-form .find-controls').addClass('disabled');
    $('.find-controls .find-prev, .find-controls .find-next').removeClass('disabled');
  }

  // Previous result
  if (event.keyCode === 13 && event.shiftKey && queryResultIndex > 0) {
    queryResultIndex = queryResultIndex - 1;
  }

  // Next result
  if (event.keyCode === 13 && !event.shiftKey && queryResultIndex < queryResult.length - 1) { 
    queryResultIndex = queryResultIndex + 1;
  }

  if (event.keyCode === 13) { 
    hot.selectCell(queryResult[queryResultIndex].row, queryResult[queryResultIndex].col, queryResult[queryResultIndex].row, queryResult[queryResultIndex].col, true, false);
  }

  if (event.keyCode !== 13) {
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

  // Update message
  var foundMessage = resultsCount + ' found';
  if (resultsCount) {
    foundMessage = (queryResultIndex + 1) + ' of ' + foundMessage;
  }
  $('.find-results').html(foundMessage);
  
  // Focus back to the search field
  searchField.focus();
}

search.bind(searchField);

$('.find-prev, .find-next').on('click', function() {
  // Simulate prev/next keys press on the search field
  var event = {
    keyCode: 13,
    shiftKey: $(this).attr("class").indexOf('prev') > -1 ? true : false
  };
  search(event);
});

// Clear search field
$('.reset-find').on('click', function() {
  searchField.value='';
  searchField.focus();
  hot.search.query('');
  hot.render();
});

Handsontable.dom.addEvent(searchField, 'keyup', search);

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
