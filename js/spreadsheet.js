var hot;
var copyPastePlugin;
var spreadsheetData;
var colWidths = [];
var HistoryStack = Fliplet.Registry.get('history-stack');
var s = [1, 0, 1, 0]; // Stores current selection to use for toolbar

// eslint-disable-next-line no-unused-vars
function spreadsheet(options) {
  var rows = options.rows || [];
  var columns = options.columns || [];
  var dataLoaded = false;
  var dataHasChanges = false;
  var columnNameCounter = 1; // Counter to anonymous columns names
  var rendered = 0;

  /**
   * Given an array of data source entries it does return an array
   * of data prepared to be consumed by Handsontable
   * @param {Array} rows - Entries to be processed
   * @param {Array} columns - List of columns
   * @param {Boolean} isFirstRender - defines if it was first render to prepare the data for correct rendering without data changes after changes are made
   * @returns {Array} Data to be loaded into Handsontable
   */
  function prepareData(rows, columns) {
    var preparedData = rows.map(function(row) {
      var dataRow = columns.map(function(header) {
        var value = row.data[header];

        // Stringify values for rendering objects for the first rendering and when undoing changes to the table (Ctrl + Z in the table cell)
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }

        if (value === -0) {
          return 0;
        }

        if (Number.isNaN(value)) {
          return undefined;
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

  function onChange() {
    if (!dataLoaded) {
      return;
    }

    setChanges(true);

    $('.save-btn').removeClass('hidden');
    $('.data-save-status').addClass('hidden');
  }

  /**
   * We user this method to determine where is closest data is located from the selected cell
   *
   * @param {Array} selectedCell - array of the coordinate of the selected cell received throw the hot.getSelected() method
   *
   * @returns {Object} - object of the directions where data is placed according to the selected cell
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
    // If we selected first row it ID is 0 already and if we - 1 from it we will receive an error in the hot.getDataAtCell() method
    var top = row ? row - 1 : row;
    var bottom = row + 1;
    // Same as in top variable
    var left = col ? col - 1 : col;
    var right = col + 1;
    // At this block we receive the nearest cells value from the selected cell
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

    // If there is a data in the selected cell we should select data related to this cell
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
   * Method to get a coordinates which we need to select
   *
   * @param {Array} startAt - array of the selected coordinates
   * @param {Object} moveTo - object that returned from closestData() function
   *
   * @returns {Array} - coordinates that needs to be selected. Example of the returned data: [[startRow, startCol, endRow, endCol]]
   */
  function coordinatesToSelect(startAt, moveTo) {
    var firstCol;
    var lastCol;
    var firstRow;
    var lastRow;
    var allData;
    var i;

    // Returns array of the data from the table with handsontable API
    allData = hot.getData();
    startAt = startAt[0];

    if (moveTo.left) {
      // When data located on the left of the selected cell
      lastCol = startAt[1];

      // Looking for first col in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (i = lastCol - 1; i >= 0; i--) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          firstCol = i;
          break;
        }
      }

      firstCol = firstCol || 0;

      // Looking for the first row in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (i = startAt[0]; i >= 0; i--) {
        if (isCellEmpty(allData[i][firstCol])) {
          firstRow = i;
          break;
        }
      }

      firstRow = firstRow || 0;

      // Looking for the last row in the array of allData
      // When we got a null value in the cell it means that we reached the range borders
      for (i = firstRow; i < allData.length; i++) {
        if (isCellEmpty(allData[i][firstCol])) {
          lastRow = i;
          break;
        }
      }

      lastRow = _.max([lastRow - 1, 0]);
    } else if (moveTo.right) {
      // When data located on the right of the selected cell
      firstCol = startAt[1];

      for (i = firstCol + 1; i < allData.length; i++) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          lastCol = i - 1;
          break;
        }
      }

      for (i = startAt[0]; i > 0; i--) {
        if (isCellEmpty(allData[i][lastCol])) {
          firstRow = i ? i - 1 : i;
        }
      }

      firstRow = firstRow || 0;

      for (i = firstRow; i < allData.length; i++) {
        if (isCellEmpty(allData[i][lastCol])) {
          lastRow = i - 1;
          break;
        }
      }
    } else if (moveTo.top) {
      // When data located on the top of the selected cell
      lastRow = startAt[0];

      for (i = lastRow - 1; i > 0; i--) {
        if (isCellEmpty(allData[i][startAt[1]])) {
          firstRow = i;
          break;
        }
      }

      firstRow = firstRow || 0;

      for (i = startAt[1]; i > 0; i--) {
        if (isCellEmpty(allData[firstRow][i])) {
          firstCol = i ? i + 1 : i;
          break;
        }
      }

      firstCol = firstCol || 0;

      for (i = firstCol; i < allData.length; i++) {
        if (isCellEmpty(allData[firstRow][i])) {
          lastCol = i - 1;
          break;
        }
      }
    } else if (moveTo.bottom) {
      // When data located on the bottom of the selected cell
      firstRow = startAt[0];

      for (i = firstRow + 1; i < allData.length; i++) {
        if (isCellEmpty(allData[i][startAt[1]])) {
          lastRow = i - 1;
          break;
        }
      }

      for (i = startAt[1]; i > 0; i--) {
        if (isCellEmpty(allData[lastRow][i])) {
          firstCol = i + 1;
          break;
        }
      }

      firstCol = firstCol || 0;

      for (i = firstCol; i < allData.length; i++) {
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
        for (i = startAt[1]; i > 0; i--) {
          if (isCellEmpty(allData[startAt[0]][i])) {
            firstCol = i + 1;
            break;
          }
        }

        firstCol = firstCol || 0;
      }

      for (i = firstCol; i < allData.length; i++) {
        if (isCellEmpty(allData[startAt[0]][i])) {
          lastCol = i - 1;
          break;
        }
      }

      if (startAt[0] === 0) {
        firstRow = startAt[0];
      } else {
        for (i = startAt[0]; i > 0; i--) {
          if (isCellEmpty(allData[i][firstCol])) {
            firstRow = i + 1;
            break;
          }
        }

        firstRow = firstRow || 0;
      }

      for (i = firstRow; i < allData.length; i++) {
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
   * @returns {undefined}
   */
  function columnValueRenderer() {
    var td = arguments[1];
    var value = arguments[5];
    var escaped = Handsontable.helper.stringify(value);

    td.innerHTML = escaped;
    td.classList.add('column-header-cell');
  }

  function getColWidths() {
    return hot.getColHeader().map(function getColWithFromHeader(header, index) {
      return hot.getColWidth(index);
    });
  }

  // Reset history stack
  HistoryStack.reset();

  // Don't bind data to data source object
  // Data as an array
  spreadsheetData = prepareData(rows, columns);

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
    undo: false,
    sortIndicator: true,
    selectionMode: 'range',
    renderAllRows: true,
    cells: function(row) {
      if (row !== 0) {
        return;
      }

      return {
        renderer: columnValueRenderer
      };
    },
    data: spreadsheetData,
    renderer: addMaxHeightToCells,
    // Hooks
    beforeChange: function(changes) {
      onChange();

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
      var data = getData({ removeEmptyRows: false, useSourceData: true });
      var columns = getColumns();
      var preparedData = prepareData(data, columns);

      // Add current change to stack
      HistoryStack.add({
        data: preparedData,
        colWidths: colWidths
      });
    },
    afterRemoveRow: function() {
      onChange();
    },
    afterRemoveCol: function(index, amount, originalArr, source) {
      // Remove columns widths from the widths array
      colWidths.splice(index, amount);

      hot.getSettings().manualColumnResize = false;
      hot.updateSettings({ colWidths: colWidths });
      hot.getSettings().manualColumnResize = true;
      hot.updateSettings({});

      if (source !== 'removeEmptyColumn') {
        onChange();
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
    beforeRemoveCol: function() {
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
    beforeColumnMove: function(items, index) {
      colWidths = getColWidths();

      var length = items.length;
      var colsToMove = colWidths.splice(items[0], length);
      var i;

      if (index < items[0]) {
        for (i = 0; i < length; i++) {
          colWidths.splice(index + i, 0, colsToMove[i]);
        }
      } else {
        var newIndex = index - length;

        for (i = 0; i < length; i++) {
          colWidths.splice(newIndex + i, 0, colsToMove[i]);
        }
      }

      hot.updateSettings({ colWidths: colWidths });
    },
    afterColumnMove: function() {
      // TODO: Add similar checks to avoid column width screwing up
      onChange();
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
      onChange();
    },
    afterCreateRow: function() {
      onChange();
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

      onChange();
    },
    afterRender: function(isForced) {
      // isForced show as if render happened because of the load data or data change (true) or duo scroll (false).
      // rendered < 3 is show as that we do not need to access this if more than 3 times.
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
        var selectedRange = coordinatesToSelect(selectedCell, whereToLook);

        if (!selectedRange) {
          return;
        }

        event.stopImmediatePropagation();

        hot.deselectCell();
        hot.selectCells(selectedRange, false, false);

        return false;
      }
    }
  };

  if (currentDataSourceDefinition && Array.isArray(currentDataSourceDefinition.columnsWidths)) {
    hotSettings.colWidths = currentDataSourceDefinition.columnsWidths;
  }

  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  // Initialize colWidths if they wasn't stored locally
  if (!colWidths || !colWidths.length) {
    colWidths = getColWidths();
  }

  HistoryStack.add({
    data: spreadsheetData,
    colWidths: colWidths
  });

  copyPastePlugin = hot.getPlugin('copyPaste');

  function getColumns() {
    return hot.getDataAtRow(0);
  }

  /**
   * Generates a column name in the form
   * Column 1, Column 2, and so on...
   * @param {String} [name] - Custom name
   * @returns {String} Name of column
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
   * @param {String} name - Column name
   * @returns {Boolean} Validated name
   */
  function validateOrFixColumnName(name) {
    var headers = getColumns();

    if (headers.indexOf(name) > -1) {
      var newName = generateColumnName(name);

      return newName;
    }

    return name;
  }

  function addMaxHeightToCells(instance, td) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);

    var wrapper = document.createElement('div');

    wrapper.classList.add('cell-wrapper');
    wrapper.innerHTML = td.innerHTML;

    td.replaceChildren(wrapper);
  }

  /**
   * Check is a row is not empty. Empty means that all elements doesn't have a value
   * @param {Array} row - Row to be assessed
   * @returns {Boolean} Returns TRUE if the row isn't empty
   */
  function isNotEmpty(row) {
    return row.some(function(field) {
      return [null, undefined, ''].indexOf(field) === -1;
    });
  }

  function getData(options) {
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
    // For example moving rows doesn't keep the visual/source order in sync
    var source = options.useSourceData
      ? hot.getSourceData().slice(1)
      : HistoryStack.getCurrent().getData().slice(1);

    if (options.removeEmptyRows) {
      visual = visual.filter(isNotEmpty);
      source = source.filter(isNotEmpty);
    }

    // And finally we pick the IDs to visual from source
    visual.forEach(function findSourceEntry(visualRow, order) {
      // We need to sort both visual and source rows because
      // moving columns doesn't keep the source data in order
      var sortedVisual = _.clone(visualRow).sort();
      var sortedSource;
      var entry;

      // Loop through the source columns to get the ID
      for (var i = 0; i < source.length; i++) {
        sortedSource = _.clone(source[i]).sort();

        // If the visual and source rows aren't the same,
        if (!_.isEqual(_.compact(sortedVisual), _.compact(sortedSource))) {
          // Next loop
          continue;
        }

        // Assume the entry ID based on source and visual data being the same
        // QUESTION: What if there is more than 1 entry with the same data? Does the latter one not get written?
        entry = { id: source[i].id, data: {} };

        // Build entry data
        // eslint-disable-next-line no-loop-func
        headers.forEach(function buildDataEntry(header, index) {
          if (header === null) {
            return;
          }

          if (!_.isNil(visualRow[index])) {
            entry.data[header] = visualRow[index];
          }

          entry.order = order;

          // Only parse the column value when required
          if (options.parseJSON && typeof entry.data[header] === 'string') {
            entry.data[header] = parseColumnValue(entry.data[header]);
          }
        });

        entries.push(entry);

        // Entry is found. Remove it from source so the array
        // gets smaller through each iteration and shortens the loop
        source.splice(i, 1);

        // Stop the for-loop
        break;
      }
    });

    return entries;
  }

  function setData(options) {
    options = options || {};

    var rows = options.rows || [];
    var columns = options.columns || [];
    var preparedData = prepareData(rows, columns);

    dataLoaded = false;
    hot.loadData(preparedData);

    HistoryStack.getCurrent().setData(preparedData);
  }

  function parseColumnValue(str) {
    try {
      var parsedResult = JSON.parse(str);

      if (typeof parsedResult === 'object') {
        return parsedResult === null ? undefined : parsedResult;
      }

      return parsedResult === -0 ? 0 : getValue(parsedResult);
    } catch (e) {
      return getValue(str);
    }
  }

  function getValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    var str = value.trim();

    if (str === 'undefined' || str === '' || str === 'NaN') {
      return undefined;
    }

    return str;
  }

  function onSave() {
    $('.save-btn').addClass('hidden');
    $('.data-save-status').removeClass('hidden').html('Saving...');
  }

  function onSaveComplete() {
    // Update save status
    $('.data-save-status').html('All changes saved!');
  }

  function hasChanges() {
    return dataHasChanges;
  }

  function setChanges(value) {
    dataHasChanges = typeof value !== 'undefined' ? !!value : false;
  }

  function reset(resetHistory) {
    setChanges(false);

    $('.save-btn').addClass('hidden');
    $('.data-save-status').addClass('hidden');

    if (resetHistory) {
      HistoryStack.reset();
    }
  }

  return {
    getData: getData,
    setData: setData,
    getColumns: getColumns,
    getColWidths: getColWidths,
    destroy: function() {
      reset(true);

      return hot.destroy();
    },
    reset: reset,
    onSave: onSave,
    onSaveComplete: onSaveComplete,
    hasChanges: hasChanges,
    setChanges: setChanges,
    onChange: onChange
  };
}

// CHeck if user is on Apple MacOS system
function isMac() {
  return navigator.platform.indexOf('Mac') > -1;
}

function openOverlay() {
  var htmlContent = Fliplet.Widget.Templates['templates.overlay']();

  new Fliplet.Utils.Overlay(htmlContent, {
    title: 'Copying and pasting',
    size: 'small',
    classes: 'copy-cut-paste-overlay',
    showOnInit: true,
    beforeOpen: function() {
      // Reset (just in case)
      $('.mac').removeClass('active');
      $('.win').removeClass('active');

      // Change shortcut keys based on system (Win/Mac)
      if (isMac()) {
        $('.mac').addClass('active');

        return;
      }

      // Windows
      $('.win').addClass('active');
    }
  });
}

function getEventType(event) {
  var ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

  if (!ctrlDown) {
    return '';
  }

  if (event.keyCode === 89 || (event.shiftKey && event.keyCode === 90)) { // CTRL + Y or CTRL + SHIFT + Z
    return 'redo';
  }

  if (event.keyCode === 90) { // CTRL + Z
    return 'undo';
  }

  return '';
}

// Capture undo/redo shortcuts
document.addEventListener('keydown', function(event) {
  if (getEventType(event) === 'undo') {
    HistoryStack.back();
  }

  if (getEventType(event) === 'redo') {
    HistoryStack.forward();
  }
});

// Toolbar Feature hotSelection structure: [r, c, r2, c2];
$('#toolbar')
  .on('click', '[data-action="insert-row-before"]', function() {
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
  .on('click', '[data-action="undo"]', HistoryStack.back)
  .on('click', '[data-action="redo"]', HistoryStack.forward)
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

$('#entries [data-toggle="tooltip"]').tooltip({
  hide: false,
  show: false,
  container: 'body',
  trigger: 'hover'
});

$('#entries [data-toggle="tooltip"]').on('click', function() {
  try {
    // jQuery UI API
    $(this).tooltip('close');
  } catch (e) {
    // Bootstrap API
    $(this).tooltip('hide');
  }
});
