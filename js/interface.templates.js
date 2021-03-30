this["Fliplet"] = this["Fliplet"] || {};
this["Fliplet"]["Widget"] = this["Fliplet"]["Widget"] || {};
this["Fliplet"]["Widget"]["Templates"] = this["Fliplet"]["Widget"]["Templates"] || {};

this["Fliplet"]["Widget"]["Templates"]["templates.accessRule"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    return "enabled";
},"3":function(container,depth0,helpers,partials,data) {
    return "disabled";
},"5":function(container,depth0,helpers,partials,data) {
    return "          <input class=\"switch-input\" type=\"checkbox\" checked />\n          <label class=\"toggle\"></label>\n          <label class=\"switch-label\">Enabled</label>\n";
},"7":function(container,depth0,helpers,partials,data) {
    return "          <input class=\"switch-input\" type=\"checkbox\" />\n          <label class=\"toggle\"></label>\n          <label class=\"switch-label\">Disabled</label>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<tr data-rule-index=\""
    + alias4(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"index","hash":{},"data":data}) : helper)))
    + "\" class=\""
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.enabled : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.program(3, data, 0),"data":data})) != null ? stack1 : "")
    + "\">\n  <td class=\"align-baseline\">\n    <a href=\"#\" data-toggle-status>\n        <div class=\"toggle-switch toggle-switch-sm\">\n"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.enabled : depth0),{"name":"if","hash":{},"fn":container.program(5, data, 0),"inverse":container.program(7, data, 0),"data":data})) != null ? stack1 : "")
    + "        </div>\n    </a>\n  </td>\n  <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.allow || (depth0 != null ? depth0.allow : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"allow","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\n  <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.type || (depth0 != null ? depth0.type : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"type","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\n  <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.require || (depth0 != null ? depth0.require : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"require","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\n  <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.exclude || (depth0 != null ? depth0.exclude : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"exclude","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\n  <td class=\"align-baseline\">"
    + alias4(((helper = (helper = helpers.apps || (depth0 != null ? depth0.apps : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"apps","hash":{},"data":data}) : helper)))
    + "</td>\n  <td class=\"align-baseline\">\n    <button class=\"btn btn-default btn-sm\" data-rule-edit>Edit</button>\n    <button class=\"btn btn-danger btn-sm\" data-rule-delete>Delete</button>\n  </td>\n</tr>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.checkbox"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<div class=\"checkbox checkbox-icon\">\n  <input type=\"checkbox\" id=\"chk-"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\" value=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\" "
    + alias4(((helper = (helper = helpers.checked || (depth0 != null ? depth0.checked : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"checked","hash":{},"data":data}) : helper)))
    + ">\n  <label for=\"chk-"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">\n    <span class=\"check\"><i class=\"fa fa-check\"></i></span> "
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\n  </label>\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.dataSource"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {});

  return " "
    + container.escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + " "
    + ((stack1 = helpers.unless.call(alias1,(data && data.last),{"name":"unless","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + " ";
},"2":function(container,depth0,helpers,partials,data) {
    return ",";
},"4":function(container,depth0,helpers,partials,data) {
    return "<i class=\"fa fa-check\"></i>";
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
    + "</td>\n    <td>"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.bundle : depth0),{"name":"if","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.updatedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\n    <td class=\"data-source-edit text-right\">\n        <div class=\"btn-group\">\n        <button type=\"button\" class=\"btn btn-default btn-round dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\n            Actions <span class=\"caret\"></span>\n        </button>\n        <ul class=\"dropdown-menu\">\n            <li data-browse-source><a href=\"#\">Edit</a></li>\n            <li role=\"separator\" class=\"divider\"></li>\n            <li data-delete-source><a href=\"#\" class=\"remove-item\">Delete</a></li>\n        </ul>\n        </div>\n    </td>\n</tr>\n";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.overlay"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<p>These actions are unavailable, but you can still use:</p>\n<div class=\"shortcut-holder\">\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + C</p>\n    <p>for copy</p>\n  </div>\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + X</p>\n    <p>for cut</p>\n  </div>\n  <div class=\"shortcut\">\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + V</p>\n    <p>for paste</p>\n  </div>\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.requiredField"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"required-field\">\n  <button class=\"btn\" data-remove-field><i class=\"fa fa-minus fa-fw\"></i></button>\n  <input name=\"field\" class=\"form-control\" type=\"text\" placeholder=\"Field name\"/>\n  <label class=\"select-proxy-display\">\n    <select class=\"hidden-select form-control\" name=\"required-field-type\">\n      <option value=\"required\">Is required</option>\n      <option value=\"equals\">Equals</option>\n      <option value=\"notequals\">Not equals</option>\n      <option value=\"contains\">Contains</option>\n    </select>\n    <span class=\"icon fa fa-chevron-down\"></span>\n  </label>\n  <input name=\"value\" class=\"form-control hidden\" type=\"text\" placeholder=\"Value\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"To reference user data, use {{&nbsp;user.[*]&nbsp;}} e.g. {{&nbsp;user.[Email]&nbsp;}},<br />{{&nbsp;user.[First&nbsp;name]&nbsp;}}\"/>\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.trashSource"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
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
    + "\" data-name=\""
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\">\n    <td class=\"data-source-id\">"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "</td>\n    <td class=\"data-source-name\">"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</td>\n    <td class=\"data-source-apps\">"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.updatedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.deletedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\n    <td class=\"data-source-edit text-right\">\n        <div class=\"btn-group\">\n        <button type=\"button\" class=\"btn btn-default btn-round dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\n            Actions <span class=\"caret\"></span>\n        </button>\n        <ul class=\"dropdown-menu\">\n            <li data-restore-source><a href=\"#\">Restore</a></li>\n            <li role=\"separator\" class=\"divider\"></li>\n            <li data-remove-source><a href=\"#\" class=\"remove-item\">Delete forever</a></li>\n        </ul>\n        </div>\n    </td>\n</tr>\n";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.userMatch"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"required-field\">\n  <button class=\"btn\" data-remove-field><i class=\"fa fa-minus fa-fw\"></i></button>\n  <input name=\"column\" class=\"form-control\" type=\"text\" placeholder=\"Field name\"/>\n  <label class=\"select-proxy-display\">\n    <select class=\"hidden-select form-control\" name=\"required-field-type\">\n      <option value=\"equals\">Equals</option>\n      <option value=\"notequals\">Not equals</option>\n      <option value=\"contains\">Contains</option>\n    </select>\n    <span class=\"icon fa fa-chevron-down\"></span>\n  </label>\n  <input name=\"value\" class=\"form-control\" type=\"text\" placeholder=\"Value\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"To reference user data, use {{&nbsp;user.[*]&nbsp;}} e.g. {{&nbsp;user.[Email]&nbsp;}},<br />{{&nbsp;user.[First&nbsp;name]&nbsp;}}\"/>\n</div>";
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

  return "            <div class=\"btn-group\" role=\"group\">\n              <button type=\"button\" class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\n                Actions\n                <span class=\"caret\"></span>\n              </button>\n              <ul class=\"dropdown-menu menu-right\">\n                <li><a href=\"#\" data-version-preview=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Preview data</a></li>\n                <li><a href=\"#\" data-version-restore=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Restore</a></li>\n                <li><a href=\"#\" data-version-copy=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Copy to new data source</a></li>\n              </ul>\n            </div>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<table class=\"table\">\n  <thead>\n    <th>Version</th>\n    <th>Modified by</th>\n    <th>Entries</th>\n    <th>Columns</th>\n    <th>Actions</th>\n  </thead>\n  <tbody>\n    <tr class=\"success\">\n      <td><span class=\"label label-success\">Current</span> modified "
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