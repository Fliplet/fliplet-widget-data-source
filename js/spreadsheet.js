// Used for undo/redo feature
var dataStack;
var currentDataStackIndex;

var hot;
var copyPastePlugin;
var data;
var colWidths = [];
var s = [1, 0, 1, 0]; // Stores current selection to use for toolbar

var jsonObjRegExp = /^[\s]*({|\[).*(}|\])[\s]*$/;

var spreadsheet = function(options) {
  ENTRY_ID_LABEL = 'ID';

  var rows = options.rows || [];
  var columns = options.columns || [];
  var connection = options.connection;
  var dataLoaded = false;
  var arrayColumns = [];
  var objColumns = [];
  var columnNameCounter = 1; // Counter to anonymous columns names
  var rendered = 0;

  dataStack = [];
  currentDataStackIndex = 0;

  // Don't bind data to data source object
  // Data as an array
  data = prepareData(rows, columns, true);

  /**
   * Given an array of data source entries it does return an array
   * of data prepared to be consumed by Handsontable
   * @param {Array} rows
   * @param {Array} columns
   * @param {Boolean} isFirstRender - defines if it was first render to prepare the data for correct rendering without data changes after changes are made
   */

  function prepareData(rows, columns, isFirstRender) {
    var preparedData = rows.map(function(row) {
      var dataRow = columns.map(function(header, index) {
        var value = row.data[header];

        if (Array.isArray(value)) {
          if (arrayColumns.indexOf(header) === -1) {
            arrayColumns.push(header);
          }

          // Add double quotes to the string if it contains a comma
          value = value.map(function(val) {
            // Stringify value only for the first render for nested arrays
            if (isFirstRender && value && typeof val !== 'string') {
              return JSON.stringify(val);
            }

            return typeof val === 'string' && val.indexOf(',') !== -1 ? '"' + val + '"' : val;
          }).join(', ');
        // Stringify value only for the first render for nested objects
        } else if (isFirstRender && value && typeof value === 'object') {
          if (objColumns.indexOf(header) === -1) {
            objColumns.push(header);
          }

          value = JSON.stringify(value);
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
   * We user this method to determine where is closest data is lokated from the selected cell
   *
   * @param {Array} selectedCell - array of the coordinat of the selected cell reacived throw the hot.getSelected() method
   *
   * @returns {Object} - object of the directions where data is placed occording to the selected cell
   */
  function closestData(selectedCell) {
    selectedCell = selectedCell[0];

    if (!Array.isArray(selectedCell)) {
      console.error('We must pass an array of the cell coordinates to the closestData function. First element is cell' +
        'row and second element is cell col. In this case script will act as if there was a value in the cell. ' +
        'Value that was passed - ',
      selectedCell);

      return false;
    }

    var col = selectedCell[1];
    var row = selectedCell[0];
    var selectedCellData = hot.getDataAtCell(row, col);
    // At this block we getting an index of the nearest cells from the selected cell
    // If we selected first row it ID is 0 already and if we - 1 from it we will reacive an error in the hot.getDataAtCell() method
    var top = row ? row - 1 : row;
    var bottom = row + 1;
    // Same as in top variable
    var left = col ? col - 1 : col;
    var right = col + 1;
    // At this block we reacive the nearest cells value from the selected cell
    var leftValue = hot.getDataAtCell(row, left);
    var rightValue = hot.getDataAtCell(row, right);
    var topValue = hot.getDataAtCell(top, col);
    var bottomValue = hot.getDataAtCell(bottom, col);
    var dataAt = {
      left: false,
      right: false,
      top: false,
      bottom: false,
      all: false,
      hasData: false
    };

    // If there is a data in the selected cell we should select data releated to this cell
    if (selectedCellData !== null) {
      dataAt.hasData = true;

      return dataAt;
    }

    // If no value near the selected cell we should select all table, also fires when we just load data source
    // and clicked ctrl+a combination
    if (leftValue === null && rightValue === null && topValue === null && bottomValue === null) {
      dataAt.all = true;

      return dataAt;
    }

    // Showing where is data position from the selected cell
    dataAt.left = leftValue !== null;
    dataAt.right = rightValue !== null;
    dataAt.top = topValue !== null;
    dataAt.bottom = bottomValue !== null;

    return dataAt;
  }

  function isCellEmpty(cellContent) {
    return cellContent === null || typeof cellContent === 'undefined';
  }

  /**
   * Method to get a coordinats which we need to select
   *
   * @param {Array} startAt - array of the selected coordinats
   * @param {Object} moveTo - object that returned from closestData() function
   *
   * @returns {Array} - coordinats that needs to be selected. Example of the returned data: [[startRow, startCol, endRow, endCol]]
   */
  function coordinatsToSelect(startAt, moveTo) {
    var firstCol; var lastCol; var firstRow; var lastRow; var allData;

    // Returns array of the data from the table with handsontable API
    allData = hot.getData();
    startAt = startAt[0];

    if (moveTo.left) {
      // When data located on the left of the selected cell
      lastCol = startAt[1];

      // Looking for first col in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (var i = lastCol - 1; i >= 0; i--) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          firstCol = i;
          break;
        }
      }

      firstCol = firstCol || 0;

      // Looking for the first row in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (var i = startAt[0]; i >= 0; i--) {
        if (isCellEmpty(allData[i][firstCol])) {
          firstRow = i;
          break;
        }
      }

      firstRow = firstRow || 0;

      // Looking for the last row in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (var i = firstRow; i < allData.length; i++) {
        if (isCellEmpty(allData[i][firstCol])) {
          lastRow = i;
          break;
        }
      }

      lastRow = _.max([lastRow - 1, 0]);
    } else if (moveTo.right) {
      // When data located on the right of the selected cell
      firstCol = startAt[1];

      for (var i = firstCol + 1; i < allData.length; i++) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          lastCol = i - 1;
          break;
        }
      }

      for (var i = startAt[0]; i > 0; i--) {
        if (isCellEmpty(allData[i][lastCol])) {
          firstRow = i ? i - 1 : i;
        }
      }

      firstRow = firstRow || 0;

      for (var i = firstRow; i < allData.length; i++) {
        if (isCellEmpty(allData[i][lastCol])) {
          lastRow = i - 1;
          break;
        }
      }
    } else if (moveTo.top) {
      // When data located on the top of the selected cell
      lastRow = startAt[0];

      for (var i = lastRow - 1; i > 0; i--) {
        if (isCellEmpty(allData[i][startAt[1]])) {
          firstRow = i;
          break;
        }
      }

      firstRow = firstRow || 0;

      for (var i = startAt[1]; i > 0; i--) {
        if (isCellEmpty(allData[firstRow][i])) {
          firstCol = i ? i + 1 : i;
          break;
        }
      }

      firstCol = firstCol || 0;

      for (var i = firstCol; i < allData.length; i++) {
        if (isCellEmpty(allData[firstRow][i])) {
          lastCol = i - 1;
          break;
        }
      }
    } else if (moveTo.bottom) {
      // When data located on the bottom of the selected cell
      firstRow = startAt[0];

      for (var i = firstRow + 1; i < allData.length; i++) {
        if (isCellEmpty(allData[i][startAt[1]])) {
          lastRow = i - 1;
          break;
        }
      }

      for (var i = startAt[1]; i > 0; i--) {
        if (isCellEmpty(allData[lastRow][i])) {
          firstCol = i + 1;
          break;
        }
      }

      firstCol = firstCol || 0;

      for (var i = firstCol; i < allData.length; i++) {
        if (isCellEmpty(allData[lastRow][i])) {
          lastCol = i - 1;
          break;
        }
      }
    } else if (moveTo.hasData) {
      // When selected cell has data in it
      if (startAt[1] === 0) {
        firstCol = 0;
      } else {
        for (var i = startAt[1]; i > 0; i--) {
          if (isCellEmpty(allData[startAt[0]][i])) {
            firstCol = i + 1;
            break;
          }
        }

        firstCol = firstCol || 0;
      }

      for (var i = firstCol; i < allData.length; i++) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          lastCol = i - 1;
          break;
        }
      }

      if (startAt[0] === 0) {
        firstRow = startAt[0];
      } else {
        for (var i = startAt[0]; i > 0; i--) {
          if (isCellEmpty(allData[i][firstCol])) {
            firstRow = i + 1;
            break;
          }
        }

        firstRow = firstRow || 0;
      }

      for (var i = firstRow; i < allData.length; i++) {
        if (isCellEmpty(allData[i][firstCol])) {
          lastRow = i - 1;
          break;
        }
      }
    } else if (moveTo.all) {
      // When selected cell doesn't have a data in it and no data in cells around it
      return false;
    }

    return [
      [firstRow, firstCol, lastRow, lastCol]
    ];
  }

  /**
   * Style the first row (columns headings)
   */
  function columnValueRenderer(instance, td, row, col, prop, value, cellProperties) {
    var escaped = Handsontable.helper.stringify(value);

    td.innerHTML = escaped;
    td.classList.add('column-header-cell');
  }

  var getColWidths = function() {
    return hot.getColHeader().map(function(header, index) {
      return hot.getColWidth(index);
    });
  };

  var hotSettings = {
    stretchH: 'all',
    manualColumnResize: true,
    manualColumnMove: true,
    manualRowResize: true,
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
    sortFunction: function sortData(sortOrder, columnMeta) {
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
    },
    afterColumnSort: function() {
      // Applies fix from https://github.com/handsontable/handsontable/pull/5134 for Handsontable 4.0.0
      setTimeout(function() {
        hot.view.wt.draw(true);
      }, 0);
    },
    search: true,
    undo: false,
    sortIndicator: true,
    selectionMode: 'range',
    cells: function(row, col, prop) {
      if (row !== 0) {
        return;
      }

      return {
        renderer: columnValueRenderer
      };
    },
    data: data,
    renderer: addMaxHeightToCells,
    minSpareRows: 40,
    minSpareCols: 10,
    // Hooks
    beforeChange: function(changes, source) {
      onChanges();

      // If users intend to remove value from the cells with Delete or Backspace buttons
      // We shouldn't add a column title
      // We should add column title when we editing the 0 row.
      if ((window.event.key === 'Delete' || window.event.key === 'Backspace') && changes[0][0] !== 0) {
        return;
      }

      // Check if the change was on columns row and validate
      // If we change row without header we put header for this row
      // In this case user won't lose his data if he forgot to input header
      changes.forEach(function(change) {
        if (change[0] === 0) {
          if (change[3] === change[2]) {
            return;
          }

          if (change[3] === '') {
            change[3] = generateColumnName();
          }

          change[3] = validateOrFixColumnName(change[3]);
        } else {
          var header = getColumns()[change[1]];

          if (!header) {
            var newHeader = generateColumnName();

            newHeader = validateOrFixColumnName(newHeader);
            hot.setDataAtCell(0, change[1], newHeader);
          }
        }
      });
    },
    afterChangesObserved: function() {
      // Deal with the undo/redo stack
      var data = getData({ removeEmptyRows: false });
      var columns = getColumns();
      var preparedData = prepareData(data, columns);

      // Clear all after current index to reset redo
      if (currentDataStackIndex + 1 < dataStack.length) {
        dataStack.splice(currentDataStackIndex + 1);
      }

      // Add current change to stack
      dataStack.push({ data: preparedData });
      currentDataStackIndex = currentDataStackIndex + 1;

      // Re-execute search without changing cell selection
      search('find', {
        selectCell: false,
        force: true,
        focusSearch: false
      });

      undoRedoToggle();
    },
    afterRemoveRow: function(index, amount) {
      onChanges();
    },
    afterRemoveCol: function(index, amount, originalArr, source) {
      // Remove columns widths from the widths array
      colWidths.splice(index, amount);

      hot.getSettings().manualColumnResize = false;
      hot.updateSettings({ colWidths: colWidths });
      hot.getSettings().manualColumnResize = true;
      hot.updateSettings({});

      if (source !== 'removeEmptyColumn') {
        onChanges();
      }
    },
    beforePaste: function(data, coords) {
      var cellsToSelect = [];

      // Checks if the entire row is selected
      if (getColWidths().length === coords[0].endCol - coords[0].startCol + 1) {
        // Changes selection to first cell of each selected row
        // to prevent populating with duplicates of the entire row
        for (var i = 0; i < coords[0].endRow - coords[0].startRow + 1; i++) {
          cellsToSelect.push([
            coords[0].startRow,
            coords[0].startCol,
            coords[0].endRow,
            coords[0].startCol
          ]);
        }

        hot.selectCells(cellsToSelect);
      }

      removeLastEmptyColumn(data);
      removeLastEmptyRow(data);
    },
    beforeRemoveCol: function(index, amount) {
      // Set current widths to get them after column column is removed
      colWidths = getColWidths();
    },
    beforeCreateCol: function(index, amount, source) {
      // Set current widths to get them after column column is created
      // Source auto means that column was created by lib to add empty col at the end of the table
      // If we return false/undefined column will not be created
      if (source === 'auto') {
        return true;
      }

      colWidths = getColWidths();
    },
    afterColumnMove: function() {
      onChanges();
    },
    afterColumnResize: function() {
      colWidths = getColWidths();

      // Update column sizes in background
      return Fliplet.DataSources.getById(currentDataSourceId).then(function(dataSource) {
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
      // Source auto means that column was created by lib to add empty col at the end of the table
      if (source === 'auto') {
        return true;
      }

      // Column name
      for (var i = 0; i < amount; i++) {
        var columnName = generateColumnName();

        hot.setDataAtCell(0, index + i, columnName);
      }

      // Add this new width before set the widths again
      colWidths.splice(index, 0, 50);
      hot.updateSettings({ colWidths: colWidths });

      onChanges();
    },
    afterRender: function(isForced) {
      // isForced show as if render happened because of the load data or data change (true) or duo scroll (false).
      // rendered < 3 is show as that we do not need to acesses this if more than 3 times.
      // Because we trigger afterRender event 2 times before UI show as a table it self.
      if (isForced && rendered < 3 ) {
        var tabs = $sourceContents.find('ul.nav.nav-tabs li');

        tabs.each(function(index) {
          if (!tabs[index].classList[0]) {
            $(tabs[index]).show();
          }
        });
        $sourceContents.find('#toolbar').show();
        $initialSpinnerLoading.removeClass('animated');
        rendered += 1;
      }
    },
    afterLoadData: function(firstTime) {
      dataLoaded = true;

      if (!options.initialLoad) {
        $('.entries-message').html('');
      }

      // Clear search in initial load
      if (firstTime) {
        search('clear');
      } else {
        // Re-execute search without changing cell selection
        search('find', {
          selectCell: false,
          force: true,
          focusSearch: false
        });
      }
    },
    afterSelectionEnd: function(r, c, r2, c2) {
      s = [r, c, r2, c2];
    },
    beforeKeyDown: function(event) {
      var editor = hot.getActiveEditor();

      if (editor && editor._opened) {
        return;
      }

      event = event || window.event;

      if ((event.ctrlKey || event.metaKey) && event.keyCode === 65 ) {
        var selectedCell = hot.getSelected();
        var whereToLook = closestData(selectedCell);
        var selectedRange = coordinatsToSelect(selectedCell, whereToLook);

        if (!selectedRange) {
          return;
        }

        event.stopImmediatePropagation();

        var cols = getColumns().filter(function(column) {
          return column;
        }).length;

        hot.deselectCell();
        hot.selectCells(selectedRange, false, false);

        return false;
      }
    }
  };

  if (currentDataSourceDefinition && Array.isArray(currentDataSourceDefinition.columnsWidths)) {
    hotSettings.colWidths = currentDataSourceDefinition.columnsWidths;
  }

  dataStack.push({ data: _.cloneDeep(data) });
  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  // Initialize colWidths if they wasn't stored locally
  if (!colWidths || !colWidths.length) {
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

  function removeLastEmptyColumn(data) {
    var dataLength = data.length;
    var columnLength = data[0].length;
    var lastColumnLength = dataLength;

    if (!columnLength) {
      return;
    }

    for (var i = 0; i < dataLength; i += 1) {
      if (!data[i][columnLength - 1]) {
        lastColumnLength -= 1;
      }
    }

    if (lastColumnLength === 0) {
      data.forEach(function(elem) {
        elem.pop();
      });
      removeLastEmptyColumn(data);
    }
  }

  function removeLastEmptyRow(data) {
    if (data.length <= 1) {
      return;
    }

    var rowLength = data[data.length - 1];
    var lastRowLength = rowLength.length;

    for (var i = 0; i < rowLength.length; i += 1) {
      if (!rowLength[i]) {
        lastRowLength -= 1;
      }
    }

    if (lastRowLength === 0) {
      data.pop();
      removeLastEmptyRow(data);
    }
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

  function addMaxHeightToCells(instance, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);

    var wrapper = document.createElement('div');

    wrapper.classList.add('cell-wrapper');
    wrapper.innerHTML = td.innerHTML;

    td.replaceChildren(wrapper);
  }

  /**
   * Check is a row is not empty. Empty means that all elements doesn't have a value
   * @param {Array} row
   */
  function isNotEmpty(row) {
    return row.some(function(field) {
      return field;
    });
  }

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
            if (arrayColumns.indexOf(header) === -1 || header === null) {
              return;
            }

            entry.data[header] = visualRow[index];
            entry.order = order;

            if (typeof entry.data[header] === 'string') {
              entry.data[header] = getColumnValue(entry.data[header]);
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

  function getColumnValue(str) {
    try {
      var parsingResult = JSON.parse('[' + str + ']');
      if (typeof parsingResult[0] === 'object') {
        return parsingResult;
      }

      return getString(str);
    } catch (e) {
      return getString(str);
    }
  }

  // Cast CSV to String
  function getString(str) {
    try {
      str = Papa.parse(str).data[0];
      str = str.map(function(val) {
        return typeof val === 'string' ? val.trim() : val;
      });
      return str;
    } catch (e) {
      return str;
    }
  }

  return {
    getData: getData,
    getColumns: getColumns,
    getColWidths: getColWidths,
    destroy: function() {
      search('clear');

      return hot.destroy();
    }
  };
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

  var value = searchField.value.trim();
  var foundMessage = resultsCount + ' found';

  if (resultsCount) {
    foundMessage = (queryResultIndex + 1) + ' of ' + foundMessage;
  }

  $('.find-results').html(value !== '' ? foundMessage : '');
}

function searchSpinner() {
  setSearchMessage('<i class="fa fa-spinner fa-pulse"></i>');
}

var previousSearchValue = '';

/**
 * This will make a search
 * @param {String} action next | prev | find | clear
 * @param {Object} options a map of options for the function
 * @param {Boolean} [options.selectCell=true] If false, the search won't take the user to the search result
 * @param {Boolean} [options.force=false] If true, a new search will be executed, even if the search term has not changed
 * @return {void}
 */
function search(action, options) {
  options = options || {};

  if (action === 'clear') {
    searchField.value = '';
    searchSpinner();
    setTimeout(function() {
      search('find', options);
    }, 50); // 50ms for spinner to render

    return;
  }

  var value = searchField.value.trim();

  //  Don't run search again if the value hasn't changed
  if (action === 'find' && previousSearchValue === value && !options.force) {
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

  if (!hot || !hot.search) {
    return;
  }

  var row;
  var col;

  if (action === 'find') {
    queryResult = hot.search.query(value);
    resultsCount = queryResult.length;
    queryResultIndex = 0;

    if (resultsCount) {
      $('.find-controls .find-prev, .find-controls .find-next').removeClass('disabled');

      if (options.selectCell !== false) {
        row = queryResult[queryResultIndex].row;
        col = queryResult[queryResultIndex].col;

        hot.selectCell(row, col, row, col, true, false);
        // HACK: Select the cell twice to scroll the viewport to show the cell
        // in case it was out of view and couldn't be rendered in time
        hot.selectCell(row, col, row, col, true, false);
      }
    } else {
      $('.find-controls .find-prev, .find-controls .find-next').addClass('disabled');
    }

    hot.render();
  } else if (action === 'next' || action === 'prev') {
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

    if (queryResult[queryResultIndex] && options.selectCell !== false) {
      row = queryResult[queryResultIndex].row;
      col = queryResult[queryResultIndex].col;

      hot.selectCell(row, col, row, col, true, false);
      // HACK: Select the cell twice to scroll the viewport to show the cell
      // in case it was out of view and couldn't be rendered in time
      hot.selectCell(row, col, row, col, true, false);
    }
  }

  // Update message
  setSearchMessage();

  if (options.focusSearch !== false) {
    // Focus back to the search field
    searchField.focus();
  }
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

var debouncedFind = _.debounce(function() {
  search('find');
}, 500);

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
});

Handsontable.dom.addEvent(searchField, 'input', function onInput() {
  // Typing
  searchSpinner();
  debouncedFind();
});

// CHeck if user is on Apple MacOS system
function isMac() {
  return navigator.platform.indexOf('Mac') > -1;
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
});

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
$('#toolbar')
  .on('click', '[data-action="insert-row-before"]', function(e) {
    hot.alter('insert_row', s[2], 1, 'Toolbar.rowBefore');
  })
  .on('click', '[data-action="insert-row-after"]', function() {
    hot.alter('insert_row', s[2] + 1, 1, 'Toolbar.rowAfter');
  })
  .on('click', '[data-action="insert-column-left"]', function() {
    hot.alter('insert_col', s[3], 1, 'Toolbar.columnLeft');
  })
  .on('click', '[data-action="insert-column-right"]', function() {
    hot.alter('insert_col', s[3] + 1, 1, 'Toolbar.columnRight');
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
    } catch (err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="cut"]', function() {
    try {
      hot.selectCell(s[0], s[1], s[2], s[3]);
      copyPastePlugin.cut();
    } catch (err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="paste"]', function() {
    openOverlay();
  });

$('[data-toggle="tooltip"]').tooltip({
  container: 'body',
  trigger: 'hover'
});

$('[data-toggle="tooltip"]').on('click', function() {
  $(this).tooltip('hide');
});
