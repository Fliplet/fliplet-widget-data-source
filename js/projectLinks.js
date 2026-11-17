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

  // The row's extra Actions, above "Move to trash"
  function menuItems(dataSource, context) {
    var items = [];

    if (context.askAi) {
      items.push('<li data-ask-ai-source><a href="#">Ask AI</a></li>');
    }

    // The list decides, whoever owns the data source: an app reads one it doesn't list
    // only in its draft, through ownership, never once published
    if (context.links) {
      items.push(context.links.linked().indexOf(dataSource.id) === -1
        ? '<li data-add-to-project><a href="#">Add to this ' + context.appLabel + '</a></li>'
        : '<li data-remove-from-project><a href="#">Remove from this ' + context.appLabel + '</a></li>');
    }

    return items.join('');
  }

  return {
    create: create,
    menuItems: menuItems
  };
})();

// Support CommonJS for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectLinks;
}
