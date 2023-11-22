var hot;
var copyPastePlugin;
var spreadsheetData;
var colWidths = [];
var HistoryStack = Fliplet.Registry.get('history-stack');
var s = [1, 0, 1, 0]; // Stores current selection to use for toolbar

const hotHelpers = {
  getColumnWidths() {
    return hot.getColHeader().map((header, index) => hot.getColWidth(index));
  },
};

const columnsInfo = {
  original: [],
  array: [], // { id: number; data: string; width: number; }[]
  defaultWidth: 250,
  init(columns) {
    this.array = columns.map((data) => ({ data, id: Fliplet.guid(), width: this.defaultWidth }));
    this.original = structuredClone(this.array);
  },
  count() {
    return this.array.length;
  },
  headers() {
    return this.array.map(({ data }) => data);
  },
  widths() {
    return this.array.map(({ width }) => width);
  },
  updateWidths() {
    const widths = hotHelpers.getColumnWidths();
    this.array.forEach((column, index) => {
      column.width = widths[index];
    });
  },
  generateColumnName() {
    const lastGenericColumn = this.headers().filter(column => column.startsWith('Column')).sort().pop();
    const lastGenericColumnNumber = lastGenericColumn ? parseInt(lastGenericColumn.match(/\((\d+)\)/)[1]) : 0;
    return `Column (${lastGenericColumnNumber + 1})`;
  },
  add(at) {
    this.array.splice(at, 0, { data: this.generateColumnName(), id: Fliplet.guid(), width: this.defaultWidth });
    this.updateHot()
  },
  remove(at, count) {
    this.array.splice(at, count || 1);
    this.updateHot()
  },
  moveColumns(from, count, to) {
    const before = this.array;
    const columns = this.array.splice(from, count);
    this.array.splice(to, 0, ...columns);

    console.log({ before, after: this.array })
    this.updateHot()
  },
  changes() {
    return {
      removed: this.original.filter(({ id }) => !this.array.find(column => column.id === id)),
      renamed: this.original.filter(({ id, data }) => {
        const columnObj = this.array.find(column => column.id === id);
        return columnObj && columnObj.data !== data;
      }).map(({ id, data }) => ({
        before: data,
        after: this.array.find(column => column.id === id).data,
      })),
    }
  },
  updateHot() {
    hot.updateSettings({
      columns: columnsInfo.array,
      colHeaders: columnsInfo.headers(),
      colWidths: columnsInfo.widths(),
    });
  },
}

// eslint-disable-next-line no-unused-vars
function spreadsheet(options) {
  var rows = options.rows || [];
  var columns = options.columns || [];
  var pageSize = options.pageSize || 2;
  var pageOffset = options.pageOffset || 0;
  var sortConfig = options.sortConfig || {};
  var dataLoaded = false;
  var dataHasChanges = false;
  var rendered = 0;

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
   * Sort data source entries based on column
   * @param {Number} columnIndex - Index of column to be sorted by
   * @param {Boolean} [ascending] - Undefined if the column is not sorted
   * @returns {Promise} Resolves when the date source entries are updated
   */
  function sortDataSourceEntries(columnIndex, ascending) {
    $initialSpinnerLoading.addClass('animated');

    var currentSortOrder = _.clone(currentDataSourceDefinition.order);

    if (typeof ascending === 'undefined') {
      delete currentDataSourceDefinition.order;
    } else {
      currentDataSourceDefinition.order = [
        ['data.' + columns[columnIndex], ascending ? 'ASC' : 'DESC']
      ];
    }

    // Reset to first page
    resetPagination();

    // Fetch and render data source entries based on updated sort order
    return updateDataSourceEntries()
      .then(function (updated) {
        if (!updated) {
          // Revert cached definition
          currentDataSourceDefinition.order = currentSortOrder;

          // Revert UI state
          var columnHeader = hot.table.querySelectorAll('.colHeader.columnSorting')[columnIndex];

          if (columnHeader.classList.contains('ascending')) {
            columnHeader.classList.remove('ascending');
          } else if (columnHeader.classList.contains('descending')) {
            columnHeader.classList.replace('descending', 'ascending');
          } else {
            columnHeader.classList.add('descending');
          }

          return;
        }

        // Update data source definition in the background
        Fliplet.DataSources.update(currentDataSourceId, { definition: currentDataSourceDefinition });
      });
  }

  // Reset history stack
  HistoryStack.reset();
  columnsInfo.init(columns);

  var hotSettings = {
    stretchH: 'all',
    manualColumnResize: true,
    manualColumnMove: true,
    manualRowResize: true,
    manualRowMove: false,
    colWidths: columnsInfo.defaultWidth,
    colHeaders: columnsInfo.headers(),
    rowHeaders: function (rowIndex) {
      return pageOffset + rowIndex + 1;
    },
    afterGetColHeader: function (i, TH) {
      if (!sortConfig.column || !sortConfig.sortOrderClass) {
        return;
      }

      if (sortConfig.column === columns[i]) {
        TH.querySelector('.columnSorting').classList.add(sortConfig.sortOrderClass);
      }
    },
    copyPaste: {
      columnsLimit: 1000,
      rowsLimit: 1000000000
    },
    columnSorting: true,
    beforeColumnSort: function (columnIndex) {
      var columnClasslist = hot.table.querySelectorAll('.colHeader.columnSorting')[columnIndex].classList;
      // Get current sort order
      var ascending = !columnClasslist.contains('ascending') && !columnClasslist.contains('descending')
        ? undefined
        : columnClasslist.contains('ascending');

      // Toggle sort order
      if (ascending === false) {
        ascending = undefined;
      } else {
        ascending = !ascending;
      }

      // Sort data source entries
      sortDataSourceEntries(columnIndex, ascending);

      // Stops Handsontable from executing client-side sorting
      return false;
    },
    undo: false,
    sortIndicator: true,
    selectionMode: 'range',
    renderAllRows: true,
    data: rows.map(({ data, id }) => ({...data, _id: id})),
    columns: columnsInfo.array,
    renderer: addMaxHeightToCells,
    minRows: pageSize + 1,
    // Hooks
    beforeChange: function (changes) {
      onChange();

      // If users intend to remove value from the cells with Delete or Backspace buttons
      // We shouldn't add a column title
      // We should add column title when we editing the 0 row.
      if ((window.event.key === 'Delete' || window.event.key === 'Backspace') && changes[0][0] !== 0) {
        return;
      }
    },
    afterChangesObserved: function () {
      // Add current change to stack
      HistoryStack.add({
        data: getData({ removeEmptyRows: false, useSourceData: true }),
        columns: columnsInfo.array
      });
    },
    afterRemoveRow: function () {
      onChange();
    },
    beforePaste: function (data, coords) {
      var cellsToSelect = [];

      // Checks if the entire row is selected
      if (columnsInfo.count() === coords[0].endCol - coords[0].startCol + 1) {
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
    beforeCreateCol: function (index, amount, source) {
      // Set current widths to get them after column column is created
      // Source auto means that column was created by lib to add empty col at the end of the table
      // If we return false/undefined column will not be created
      if (source === 'auto') {
        return true;
      }
    },
    beforeColumnMove: function (items, index) {
      columnsInfo.moveColumns(items[0], items.length, index);
    },
    afterColumnMove: function () {
      // TODO: Add similar checks to avoid column width screwing up
      onChange();
    },
    afterColumnResize: function () {
      columnsInfo.updateWidths();

      // Update column sizes in background
      return Fliplet.DataSources.getById(currentDataSourceId).then(function (dataSource) {
        dataSource.definition = dataSource.definition || {};
        dataSource.definition.columnsWidths = colWidths;

        return Fliplet.DataSources.update(currentDataSourceId, { definition: dataSource.definition });
      }).catch(console.error);
    },
    beforeRowMove: function (movedRows) {
      // No rows moved. Cancel action.
      if (!movedRows || !movedRows.length) {
        return false;
      }

      // Column header row is moved. Cancel action.
      if (movedRows.indexOf(0) > -1) {
        console.info('Column header row cannot be moved');

        return false;
      }
    },
    afterRowMove: function () {
      onChange();
    },
    afterCreateRow: function () {
      onChange();
    },
    afterRender: function (isForced) {
      // isForced show as if render happened because of the load data or data change (true) or duo scroll (false).
      // rendered < 3 is show as that we do not need to access this if more than 3 times.
      // Because we trigger afterRender event 2 times before UI show as a table it self.
      if (isForced && rendered < 3) {
        var tabs = $sourceContents.find('ul.nav.nav-tabs li');

        tabs.each(function (index) {
          if (!tabs[index].classList[0]) {
            $(tabs[index]).show();
          }
        });
        $sourceContents.find('#toolbar').show();
        $initialSpinnerLoading.removeClass('animated');
        rendered += 1;
      }
    },
    afterLoadData: function () {
      dataLoaded = true;

      if (!options.initialLoad) {
        $('.entries-message').html('');
      }
    },
    afterSelectionEnd: function (r, c, r2, c2) {
      s = [r, c, r2, c2];
    },
    beforeKeyDown: function (event) {
      var editor = hot.getActiveEditor();

      if (editor && editor._opened) {
        return;
      }

      event = event || window.event;

      if ((event.ctrlKey || event.metaKey) && event.keyCode === 65) {
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

  HistoryStack.add({
    data: rows,
    columns: columnsInfo.array
  });

  copyPastePlugin = hot.getPlugin('copyPaste');

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
      data.forEach(function (elem) {
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

  function addMaxHeightToCells(instance, td) {
    Handsontable.renderers.TextRenderer.apply(this, arguments);

    var wrapper = document.createElement('div');

    wrapper.classList.add('cell-wrapper');
    wrapper.innerHTML = td.innerHTML;

    td.replaceChildren(wrapper);
  }

  /**
   * Check is a row is not empty. Empty means that all elements doesn't have a value
   * @param {Array | Object} row - Row to be assessed
   * @returns {Boolean} Returns TRUE if the row isn't empty
   */
  function isNotEmpty(row) {
    const testNotEmpty = (field) => ![null, undefined, ''].includes(field);

    if (Array.isArray(row)) {
      return row.some(testNotEmpty);
    }

    const rowData = row?.data;

    if (!rowData) {
      return false;
    }

    return Object.values(rowData).some(testNotEmpty);
  }

  function getData(options) {
    options = options || { removeEmptyRows: true };

    const headers = columnsInfo.headers();

    // Because source array doesn't keep in sync with visual array and
    // we need to have the row id's. Visual data give us data with correct order
    // but without the id's, and physical data give us data with id's but
    // might not be in the order visually presented. So we need this magic...

    let visual = hot.getData();
    const sourceRows = hot.getSourceData();

    // For example moving rows doesn't keep the visual/source order in sync
    let source = options.useSourceData
      ? sourceRows.map(data => ({ data, id: data._id }))
      : HistoryStack.getCurrent().getData();


    const filteredVisual = options.removeEmptyRows ? visual.filter(isNotEmpty) : visual;
    const filteredSource = options.removeEmptyRows ? source.filter(isNotEmpty) : source;

    const emptyRow = { data: headers.reduce((acc, header) => ({ ...acc, [header]: undefined }), {}) };

    // Get entries with the correct order
    return filteredVisual.map((visualRow, index) => {
      if (visualRow.length === 0) {
        return emptyRow;
      }
      const visualRowObj = visualRow.reduce((acc, value, index) => ({
        ...acc,
        [headers[index]]: parseCellValue(value),
      }), {});


      const row = filteredSource.find(({ data: sourceRowData }) => Object.entries(visualRowObj).every(([key, value]) => (!value && !sourceRowData[key]) || value === sourceRowData[key]));

      return { data: row.data, id: row.id, order: index };
    });
  }

  function setData(options) {
    options = options || {};

    const entries = options.entries || [];

    dataLoaded = false;
    hot.loadData(entries.map(({ data }) => data));

    HistoryStack.getCurrent().setData(entries);
  }

  /**
   * Cast the value of a cell to the expected type
   * @param {String} str - String value of a cell
   * @returns {*} Parsed value, possibly as a new type
   */
  function parseCellValue(str) {
    try {
      var parsedResult = JSON.parse(str);

      // Input represents a string or number, do not change it
      if (['string', 'number'].indexOf(typeof parsedResult) > -1) {
        return str;
      }

      if (typeof parsedResult === 'object') {
        return parsedResult === null ? undefined : parsedResult;
      }

      return parsedResult === -0 ? 0 : parseCellValueAsString(parsedResult);
    } catch (e) {
      return parseCellValueAsString(str);
    }
  }

  /**
   * Process a string value before it's saved in the data source
   * @param {String} value - String value to process
   * @returns {*} Processed value
   */
  function parseCellValueAsString(value) {
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

  function onSaveError() {
    // Update save status on error
    $('.data-save-status').addClass('hidden').html('');
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
    getData,
    setData: setData,
    destroy: function () {
      reset(true);

      return hot.destroy();
    },
    reset: reset,
    onSave: onSave,
    onSaveComplete: onSaveComplete,
    onSaveError: onSaveError,
    hasChanges: hasChanges,
    setChanges: setChanges,
    onChange: onChange,
    columnsInfo
  };
}

// CHeck if user is on Apple MacOS system
function isMac() {
  return navigator.platform.indexOf('Mac') > -1;
}

function openOverlay() {
  var htmlContent = Fliplet.Widget.Templates['templates.overlay']();

  new Fliplet.Utils.Overlay(htmlContent, {
    title: 'Keyboard shortcuts',
    size: 'small',
    classes: 'kb-shortcuts-overlay',
    showOnInit: true,
    beforeOpen: function () {
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
document.addEventListener('keydown', function (event) {
  if (getEventType(event) === 'undo') {
    HistoryStack.back();
  }

  if (getEventType(event) === 'redo') {
    HistoryStack.forward();
  }
});

// Toolbar Feature hotSelection structure: [r, c, r2, c2];
$('#toolbar')
  .on('click', '[data-action="insert-row-before"]', function () {
    hot.alter('insert_row', s[2], 1, 'Toolbar.rowBefore');
  })
  .on('click', '[data-action="insert-row-after"]', function () {
    hot.alter('insert_row', s[2] + 1, 1, 'Toolbar.rowAfter');
  })
  .on('click', '[data-action="insert-column-left"]', function () {
    columnsInfo.add(s[3]);
  })
  .on('click', '[data-action="insert-column-right"]', function () {
    columnsInfo.add(s[3] + 1);
  })
  .on('click', '[data-action="remove-row"]', function removeRow() {
    var index = Math.min(s[0], s[2]);
    var amount = Math.abs(s[0] - s[2]) + 1;

    hot.alter('remove_row', index, amount, 'Toolbar.removeRow');
  })
  .on('click', '[data-action="remove-column"]', function () {
    var index = Math.min(s[1], s[3]);
    var amount = Math.abs(s[1] - s[3]) + 1;

    columnsInfo.remove(index, amount);
  })
  .on('click', '[data-action="undo"]', HistoryStack.back)
  .on('click', '[data-action="redo"]', HistoryStack.forward)
  .on('click', '[data-action="copy"]', function () {
    try {
      hot.selectCell(s[0], s[1], s[2], s[3]);
      copyPastePlugin.copy();
    } catch (err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="cut"]', function () {
    try {
      hot.selectCell(s[0], s[1], s[2], s[3]);
      copyPastePlugin.cut();
    } catch (err) {
      openOverlay();
    }
  })
  .on('click', '[data-action="paste"], [data-action="find"]', function () {
    openOverlay();
  });

$('#entries [data-toggle="tooltip"]').tooltip({
  hide: false,
  show: false,
  container: 'body',
  trigger: 'hover'
});

$('#entries [data-toggle="tooltip"]').on('click', function () {
  try {
    // jQuery UI API
    $(this).tooltip('close');
  } catch (e) {
    // Bootstrap API
    $(this).tooltip('hide');
  }
});
