this["Fliplet"] = this["Fliplet"] || {};
this["Fliplet"]["Widget"] = this["Fliplet"]["Widget"] || {};
this["Fliplet"]["Widget"]["Templates"] = this["Fliplet"]["Widget"]["Templates"] || {};

this["Fliplet"]["Widget"]["Templates"]["templates.dataSource"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {});

  return " "
    + container.escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + " "
    + ((stack1 = helpers.unless.call(alias1,(data && data.last),{"name":"unless","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + " ";
},"2":function(container,depth0,helpers,partials,data) {
    return ",";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<tr class=\"data-source\" data-id=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">\n    <td class=\"data-source-id\">"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "</td>\n    <td class=\"data-source-name\"><span class=\"data-source-text\" data-browse-source>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</span></td>\n    <td class=\"data-source-apps\">"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.updatedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\n    <td class=\"data-source-edit text-right\"><button class=\"btn btn-default\" data-browse-source>Edit</button></td>\n</tr>\n";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.overlay"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<p>These actions are unavailable, but you can still use:</p>\n<div class=\"shortcut-holder\">\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + C</p>\n    <p>for copy</p>\n  </div>\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + X</p>\n    <p>for cut</p>\n  </div>\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + V</p>\n    <p>for paste</p>\n  </div>\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.users"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression, alias5=container.lambda;

  return "      <tr>\n        <td>"
    + alias4(((helper = (helper = helpers.fullName || (depth0 != null ? depth0.fullName : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"fullName","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.email || (depth0 != null ? depth0.email : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"email","hash":{},"data":data}) : helper)))
    + "</td>\n        <td><code>"
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.permissions : stack1), depth0))
    + "</code></td>\n        <td>\n          <button class=\"btn btn-danger\" data-revoke-role=\""
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.userId : stack1), depth0))
    + "\">Delete permission</button>\n        </td>\n      </tr>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "<table class=\"table\">\n  <thead>\n    <th>Full name</th>\n    <th>Email</th>\n    <th>Permissions</th>\n    <th>Actions</th>\n  </thead>\n  <tbody>\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? depth0.users : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\n</table>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.version"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    return "      <th>"
    + container.escapeExpression(container.lambda(depth0, depth0))
    + "</th>\n";
},"3":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "      <tr>\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),depth0,{"name":"each","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "      </tr>\n";
},"4":function(container,depth0,helpers,partials,data) {
    return "            <td>"
    + container.escapeExpression(container.lambda(depth0, depth0))
    + "</td>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=container.lambda, alias2=container.escapeExpression, alias3=depth0 != null ? depth0 : (container.nullContext || {});

  return "<a href=\"#\" data-back-to-versions class=\"btn btn-primary\">Back to versions list</a>\n<a href=\"#\" data-version-restore=\""
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.version : depth0)) != null ? stack1.id : stack1), depth0))
    + "\" class=\"btn btn-secondary\">Restore</a>\n<a href=\"#\" data-version-copy=\""
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.version : depth0)) != null ? stack1.id : stack1), depth0))
    + "\" class=\"btn btn-secondary\">Copy to new data source</a>\n<br />\n\n<h3>Version preview</h3>\n<table class=\"table\">\n  <thead>\n"
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.columns : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </thead>\n  <tbody>\n"
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.entries : depth0),{"name":"each","hash":{},"fn":container.program(3, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\n</table>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.versions"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "      <tr>\n        <td><span class=\"label label-default\">Version "
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "</span> saved "
    + alias4(((helper = (helper = helpers.createdAt || (depth0 != null ? depth0.createdAt : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"createdAt","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.action || (depth0 != null ? depth0.action : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"action","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>"
    + alias4(((helper = (helper = helpers.entriesCount || (depth0 != null ? depth0.entriesCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"entriesCount","hash":{},"data":data}) : helper)))
    + "</td>\n      <td>"
    + alias4(((helper = (helper = helpers.columnsCount || (depth0 != null ? depth0.columnsCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"columnsCount","hash":{},"data":data}) : helper)))
    + "</td>\n        <td>\n"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.hasEntries : depth0),{"name":"if","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "        </td>\n      </tr>\n";
},"2":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "            <div class=\"btn-group\" role=\"group\">\n              <button type=\"button\" class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\n                Actions\n                <span class=\"caret\"></span>\n              </button>\n              <ul class=\"dropdown-menu\">\n                <li><a href=\"#\" data-version-preview=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Preview data</a></li>\n                <li><a href=\"#\" data-version-restore=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Restore</a></li>\n                <li><a href=\"#\" data-version-copy=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Copy to new data source</a></li>\n              </ul>\n            </div>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<table class=\"table\">\n  <thead>\n    <th>Version</th>\n    <th>Modified by</th>\n    <th>Entries</th>\n    <th>Columns</th>\n    <th style=\"width:230px\">Actions</th>\n  </thead>\n  <tbody>\n    <tr class=\"success\">\n      <td><span class=\"label label-success\">Current</span> modified "
    + alias4(((helper = (helper = helpers.updatedAt || (depth0 != null ? depth0.updatedAt : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"updatedAt","hash":{},"data":data}) : helper)))
    + "</td>\n      <td>"
    + alias4(((helper = (helper = helpers.action || (depth0 != null ? depth0.action : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"action","hash":{},"data":data}) : helper)))
    + "</td>\n      <td>"
    + alias4(((helper = (helper = helpers.entriesCount || (depth0 != null ? depth0.entriesCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"entriesCount","hash":{},"data":data}) : helper)))
    + "</td>\n      <td>"
    + alias4(((helper = (helper = helpers.columnsCount || (depth0 != null ? depth0.columnsCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"columnsCount","hash":{},"data":data}) : helper)))
    + "</td>\n      <td>-</td>\n    </tr>\n"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.versions : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\n</table>";
},"useData":true});