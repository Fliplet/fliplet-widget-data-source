var spreadsheet = function(options) {
  ENTRY_ID_LABEL = '_id';
  var rows = options.rows || [];
  var columns = options.columns || [];
  var connection = options.connection;
  var dataLoaded = false;
  var hot;

  // Include id on columns
  columns.unshift(ENTRY_ID_LABEL);

  // Don't bind data to data source object
  // Data as an array
  var data = rows.map(function(row) {
    return columns.map(function(header, index) {
      return index === 0 ? row.id : row.data[header];
    });
  });

  // Add columns as first row
  data.unshift(columns);

  function onChanges() {
    if (dataLoaded) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('disabled');
    }
  }

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
    fixedRowsTop: 1,
    // Prevent cells from being selected on column header click 
    beforeOnCellMouseDown: function(event, coords, element) {
      if (coords.row < 0) {
        event.stopImmediatePropagation();
      }
    },
    // Make first column read only
    cells: function (row, col, prop) {
      var cellProperties = {};
      
      if (row === 0 && col !== 0) {
        cellProperties.renderer = columnValueRenderer;
      }

      if (col === 0) {
        cellProperties.readOnly = true;
      }

      return cellProperties;
    },
    contextMenu: ['row_above', 'row_below', 'col_left', 'col_right', 'remove_row', 'remove_col', 'undo', 'redo'],
    data: data,
    // Always have one empty row at the end
    minSpareRows: 2,
    // columns: We can't use this options for now as this set max cols
    rowHeaders: false,
    // Hooks
    afterChange: function(changes, source) {
      if (['edit','UndoRedo.undo','CopyPaste.paste'].indexOf(source) > -1) {
        onChanges();
      }
    },
    afterCreateRow: function(index, amount) {
      onChanges();
    },
    afterRemoveRow: function(index, amount) {
      onChanges();
    },
    afterCreateCol: function(index, amount) {
      onChanges();
    },
    beforeRemoveCol: function(index, amount) {
    },
    afterRemoveCol: function(index, amount) {
      onChanges();
    },
    afterLoadData: function(firstTime) {
      dataLoaded = true;
      $('.entries-message').html('');
    }
  };
  
  hot = new Handsontable(document.getElementById('hot'), hotSettings);

  function getColumns() {
    var random = (new Date()).getTime().toString().slice(10);
    var headers = [];
    var dataAtRow0 = hot.getDataAtRow(0);
    dataAtRow0.shift();
    dataAtRow0.forEach(function(header, index) {
      if (header === '') {
        header = 'Column ' + random + index;
      }

      if (headers.indexOf(header) > -1) {
        header = header + ' (1)'
      }
      
      headers.push(header);
    });
    
    return headers;
  }

  return {
    getData: function() {
      var headers = getColumns();
      // Clone data table
      var tableData = JSON.parse(JSON.stringify(data));
      // Remove entry columns from data table
      tableData.shift();

      return tableData.map(function(row) {
        // Row at position 0 will have entry id
        var entry = { id: row[0], data: {}};
        
        headers.forEach(function(header, index) {
          entry.data[header] = row[index + 1];
        });

        return entry;
      }).filter(function(entry) {
        var empty = true;
        // Remove empty lines
        headers.forEach(function(header) {
          if (entry.data[header]) {
            empty = false;
          }
        });
        
        return !empty;
      })
    },
    getColumns: function() {
      return getColumns();
    },
    destroy: function() {
      return hot.destroy();
    }
  }
};
