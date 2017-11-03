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

  var colHeaders = function (index) {
    return columns[index] === ENTRY_ID_LABEL
      ? columns[index]
      : '<input data-index="' + index + '" class="input-header" type="text" value="' + columns[index] + '" />';
  }
  
  function getColHeaders() {
    var headers = [];
    $('.ht_clone_top .input-header').each(function(index, el) {
      var header = $(el).val();
      if (headers.indexOf(header) > -1) {
        header = header + ' (1)';
      }
  
      headers.push(header);
    });
  
    return headers;
  }

  function onChanges() {
    if (dataLoaded) {
      dataSourceEntriesHasChanged = true;
      $('[data-save]').removeClass('disabled');
    }
  }

  var hotSettings = {
    // Prevent cells from being selected on column header click 
    beforeOnCellMouseDown: function(event, coords, element) {
      if (coords.row < 0) {
        event.stopImmediatePropagation();
      }
    },
    // Make first column read only
    cells: function (row, col, prop) {
      return col === 0 ? { readOnly: true } : {} 
    },
    contextMenu: ['row_above', 'row_below', 'remove_row', 'hsep1', 'col_left','col_right', 'remove_col'],
    data: data,
    // Always have one empty row at the end
    minSpareRows: 2,
    /*
    * Render custom header. With an input field so we can edit the header
    * Using this we need to make sure to update headers accordingly.
    */
    colHeaders: colHeaders,
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
    beforeCreateCol: function(index, amount, source) {
      var newColumns = [];
      var random = (new Date()).getTime().toString().slice(10);
      for (var i = 0; i < amount; i++) {
        newColumns.push('Column ' + random + i);
      }
      columns.splice.apply(columns, [index, 0].concat(newColumns));
      hot.updateSettings({
        colHeaders: colHeaders
      });
    },
    afterCreateCol: function(index, amount) {
      onChanges();
    },
    beforeRemoveCol: function(index, amount) {
      columns.splice(index, amount);
      hot.updateSettings({
        colHeaders: colHeaders
      });
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

  // Update headers when change the input fields 
  $('#entries')
    .on('change', '.input-header', function() {
      $('[data-save]').removeClass('disabled');
      columns = getColHeaders();
      columns.unshift(ENTRY_ID_LABEL);
      hot.updateSettings({
        colHeaders: colHeaders
      });
      dataSourceEntriesHasChanged = true;
    });

  return {
    getData: function() {
      return data.map(function(row) {
        var entry = { data: {}};
        columns.forEach(function(column, index) {
          if (index === 0) {
            return entry.id = row[index]
          }
          
          entry.data[column] = row[index];
        });

        return entry;
      }).filter(function(entry) {
        var empty = true;
        // Remove empty lines
        columns.forEach(function(column) {
          if (entry.data[column]) {
            empty = false;
          }
        });
        
        return !empty;
      })
    },
    destroy: function() {
      hot.destroy();
    }
  }
};