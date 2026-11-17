/*
 * Adding a data source to the app the manager was opened for, or taking it off.
 * An app can read the data sources its screens use plus the ones listed in its
 * customDataSourcesInUse setting; this edits that list. The API replaces the
 * whole list on save, so each change rereads it first and changes wait for each other.
 */
var ProjectLinks = (function() {
  function create(options) {
    var appId = options.appId;
    var request = options.request;
    var linked = [];
    var appName = '';
    var loaded = false;
    var queue = Promise.resolve();

    function read() {
      return request({ url: 'v1/apps/' + appId }).then(function(response) {
        var app = (response && response.app) || {};

        linked = ((app.settings && app.settings.customDataSourcesInUse) || []).map(Number);
        appName = app.name || '';
        loaded = true;

        return linked;
      });
    }

    // change(list) returns the new list, or null when there is nothing to save
    function edit(change) {
      var run = queue.catch(function() {}).then(function() {
        return read().then(function(current) {
          var next = change(current);

          if (!next) {
            return current;
          }

          return request({
            url: 'v1/apps/' + appId + '/settings',
            method: 'POST',
            data: { customDataSourcesInUse: next }
          }).then(function() {
            linked = next;

            return next;
          });
        });
      });

      queue = run;

      return run;
    }

    return {
      appId: appId,
      load: read,
      loaded: function() {
        return loaded;
      },
      name: function() {
        return appName;
      },
      linked: function() {
        return linked;
      },
      add: function(id) {
        return edit(function(list) {
          return list.indexOf(id) === -1 ? list.concat(id) : null;
        });
      },
      remove: function(id) {
        return edit(function(list) {
          return list.indexOf(id) === -1 ? null : list.filter(function(linkedId) {
            return linkedId !== id;
          });
        });
      }
    };
  }

  // Used by the app: on its list, or read by one of its screens (the API's apps list)
  function isInProject(dataSource, appId, linked) {
    return linked.indexOf(dataSource.id) !== -1 || (dataSource.apps || []).some(function(app) {
      return app.id === appId;
    });
  }

  // Only what this list added can be taken off: a screen that reads it keeps it in use
  function canRemove(dataSource, linked) {
    return linked.indexOf(dataSource.id) !== -1;
  }

  // The row's extra Actions, above "Move to trash"
  function menuItems(dataSource, context) {
    var items = [];

    if (context.askAi) {
      items.push('<li data-ask-ai-source><a href="#">Ask AI</a></li>');
    }

    if (context.links) {
      if (!isInProject(dataSource, context.links.appId, context.links.linked())) {
        items.push('<li data-add-to-project><a href="#">Add to this ' + context.appLabel + '</a></li>');
      } else if (canRemove(dataSource, context.links.linked())) {
        items.push('<li data-remove-from-project><a href="#">Remove from this ' + context.appLabel + '</a></li>');
      }
    }

    return items.join('');
  }

  return {
    create: create,
    isInProject: isInProject,
    canRemove: canRemove,
    menuItems: menuItems
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectLinks;
}
