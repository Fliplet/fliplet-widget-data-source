var $dataSourcesList = $('#datasources-list');
var templates = {
  dataSource: template('dataSource')
};
var currentFolderId;
var currentFiles;

function getDataSources(folderId) {
  Fliplet.DataSources.get().then(function (response) {
    response.dataSources.forEach(addDataSource);
  });
}

function addDataSource(dataSource) {
  $dataSourcesList.append(templates.dataSource(dataSource));
}

function addFile(file) {
  currentFiles.push(file);
  $dataSourcesList.append(templates.file(file));
}

function template(name) {
  return Handlebars.compile($('#template-' + name).html());
}

// events
$('#app')
  .on('click', '[data-browse-source]', function (event) {
    event.preventDefault();
    browseDataSource($(this).closest('li').data('id'));
  })
  .on('click', '[data-delete-source]', function (event) {
    event.preventDefault();
    var $item = $(this).closest('li');

    Fliplet.DataSources.delete($item.data('id')).then(function () {
      $item.remove();
    });
  })
  .on('click', '[data-create-source]', function (event) {
    event.preventDefault();
    var sourceName = prompt('Type data source name');

    if (!sourceName) {
      return;
    }

    Fliplet.DataSources.create({
      name: sourceName
    }).then(addDataSource);
  });

// init
getDataSources();
