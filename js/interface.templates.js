this["Fliplet"] = this["Fliplet"] || {};
this["Fliplet"]["Widget"] = this["Fliplet"]["Widget"] || {};
this["Fliplet"]["Widget"]["Templates"] = this["Fliplet"]["Widget"]["Templates"] || {};

this["Fliplet"]["Widget"]["Templates"]["templates.accessRule"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    return "rule-enabled";
},"3":function(container,depth0,helpers,partials,data) {
    return "rule-disabled";
},"5":function(container,depth0,helpers,partials,data) {
    return "          <input class=\"switch-input\" type=\"checkbox\" checked />\r\n          <label class=\"toggle\"></label>\r\n          <label class=\"switch-label\">Enabled</label>\r\n";
},"7":function(container,depth0,helpers,partials,data) {
    return "          <input class=\"switch-input\" type=\"checkbox\" />\r\n          <label class=\"toggle\"></label>\r\n          <label class=\"switch-label\">Disabled</label>\r\n";
},"9":function(container,depth0,helpers,partials,data) {
    var helper;

  return "    <td colspan=\"5\" class=\"align-baseline\"><span class=\"label label-default\"><i class=\"fa fa-code\"></i> Custom rule</span> "
    + container.escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(depth0 != null ? depth0 : (container.nullContext || {}),{"name":"name","hash":{},"data":data}) : helper)))
    + "</td>\r\n";
},"11":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function";

  return "    <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.allow || (depth0 != null ? depth0.allow : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"allow","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.type || (depth0 != null ? depth0.type : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"type","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.require || (depth0 != null ? depth0.require : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"require","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"align-baseline\">"
    + ((stack1 = ((helper = (helper = helpers.include || (depth0 != null ? depth0.include : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"include","hash":{},"data":data}) : helper))) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"align-baseline\">"
    + container.escapeExpression(((helper = (helper = helpers.apps || (depth0 != null ? depth0.apps : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"apps","hash":{},"data":data}) : helper)))
    + "</td>\r\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {});

  return "<tr data-rule-index=\""
    + container.escapeExpression(((helper = (helper = helpers.index || (depth0 != null ? depth0.index : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"index","hash":{},"data":data}) : helper)))
    + "\" class=\""
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.enabled : depth0),{"name":"if","hash":{},"fn":container.program(1, data, 0),"inverse":container.program(3, data, 0),"data":data})) != null ? stack1 : "")
    + "\">\r\n  <td class=\"align-baseline opacity-full\">\r\n    <span class=\"fa-stack handle-sort\">\r\n      <i class=\"fa fa-ellipsis-v fa-stack-1x\"></i>\r\n      <i class=\"fa fa-ellipsis-v fa-stack-1x\"></i>\r\n    </span>\r\n    <a href=\"#\" class=\"toggle-status\" data-toggle-status>\r\n        <div class=\"toggle-switch toggle-switch-sm\">\r\n"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.enabled : depth0),{"name":"if","hash":{},"fn":container.program(5, data, 0),"inverse":container.program(7, data, 0),"data":data})) != null ? stack1 : "")
    + "      </div>\r\n    </a>\r\n  </td>\r\n"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.hasScript : depth0),{"name":"if","hash":{},"fn":container.program(9, data, 0),"inverse":container.program(11, data, 0),"data":data})) != null ? stack1 : "")
    + "  <td class=\"align-baseline opacity-full\">\r\n    <button class=\"btn btn-default btn-sm\" data-rule-edit>Edit</button>\r\n    <button class=\"btn btn-danger btn-sm\" data-rule-delete>Delete</button>\r\n  </td>\r\n</tr>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.apiTokenList"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {});

  return "    <optgroup label=\""
    + container.escapeExpression(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : helpers.helperMissing),(typeof helper === "function" ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\">\r\n"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.tokens : depth0),{"name":"each","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "    </optgroup>\r\n";
},"2":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "      <option value=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">ID#"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + " - "
    + alias4(((helper = (helper = helpers.fullName || (depth0 != null ? depth0.fullName : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"fullName","hash":{},"data":data}) : helper)))
    + "</option>\r\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "<div class=\"api-token-label control-label\">\r\n  <label for=\"apiToken\">Select your API Token</label>\r\n</div>\r\n<div class=\"tokenfield api-token-field\">\r\n  <select class=\"form-control\">\r\n    <option disabled=\"disabled\">Select API Token</option>\r\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </select>\r\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.checkbox"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<div class=\"checkbox checkbox-icon\">\r\n  <input type=\"checkbox\" id=\"chk-"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\" value=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\" "
    + alias4(((helper = (helper = helpers.checked || (depth0 != null ? depth0.checked : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"checked","hash":{},"data":data}) : helper)))
    + ">\r\n  <label for=\"chk-"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">\r\n    <span class=\"check\"><i class=\"fa fa-check\"></i></span> "
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "\r\n  </label>\r\n</div>";
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
    + "\">\r\n    <td class=\"data-source-id\">"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "</td>\r\n    <td class=\"data-source-name\"><span class=\"data-source-text\" data-browse-source>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</span></td>\r\n    <td class=\"data-source-apps\">"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\r\n    <td>"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.bundle : depth0),{"name":"if","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.updatedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\r\n    <td class=\"data-source-edit text-right\">\r\n        <div class=\"btn-group\">\r\n        <button type=\"button\" class=\"btn btn-default btn-round dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\r\n            Actions <span class=\"caret\"></span>\r\n        </button>\r\n        <ul class=\"dropdown-menu\">\r\n            <li data-browse-source><a href=\"#\">Edit</a></li>\r\n            <li role=\"separator\" class=\"divider\"></li>\r\n            <li data-delete-source><a href=\"#\" class=\"remove-item\">Move to trash</a></li>\r\n        </ul>\r\n        </div>\r\n    </td>\r\n</tr>\r\n";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.overlay"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<p>These actions are unavailable, but you can still use:</p>\r\n<div class=\"shortcut-holder\">\r\n  <div class=\"shortcut\">\r\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + C</p>\r\n    <p>for copy</p>\r\n  </div>\r\n  <div class=\"shortcut\">\r\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + X</p>\r\n    <p>for cut</p>\r\n  </div>\r\n  <div class=\"shortcut\">\r\n    <p><span class=\"win\">CTRL</span><span class=\"mac\">⌘</span> + V</p>\r\n    <p>for paste</p>\r\n  </div>\r\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.requiredField"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"required-field\">\r\n  <button class=\"btn\" data-remove-field><i class=\"fa fa-minus fa-fw\"></i></button>\r\n  <input name=\"field\" class=\"form-control\" type=\"text\" placeholder=\"Field name\"/>\r\n  <label class=\"select-proxy-display\">\r\n    <select class=\"hidden-select form-control\" name=\"required-field-type\">\r\n      <option value=\"required\">Is required</option>\r\n      <option value=\"equals\">Equals</option>\r\n      <option value=\"notequals\">Not equals</option>\r\n      <option value=\"contains\">Contains</option>\r\n    </select>\r\n    <span class=\"icon fa fa-chevron-down\"></span>\r\n  </label>\r\n  <input name=\"value\" class=\"form-control hidden\" type=\"text\" placeholder=\"Value\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"To reference user data, use {{&nbsp;user.[*]&nbsp;}} e.g. {{&nbsp;user.[Email]&nbsp;}},<br />{{&nbsp;user.[First&nbsp;name]&nbsp;}}\"/>\r\n</div>";
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
    + "\">\r\n    <td class=\"data-source-id\">"
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "</td>\r\n    <td class=\"data-source-name\">"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</td>\r\n    <td class=\"data-source-apps\">"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\r\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.updatedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\r\n    <td class=\"data-source-apps\">"
    + alias4((helpers.momentCalendar || (depth0 && depth0.momentCalendar) || alias2).call(alias1,(depth0 != null ? depth0.deletedAt : depth0),{"name":"momentCalendar","hash":{},"data":data}))
    + "</td>\r\n    <td class=\"data-source-edit text-right\">\r\n        <div class=\"btn-group\">\r\n        <button type=\"button\" class=\"btn btn-default btn-round dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\r\n            Actions <span class=\"caret\"></span>\r\n        </button>\r\n        <ul class=\"dropdown-menu\">\r\n            <li data-restore-source><a href=\"#\">Restore</a></li>\r\n            <li role=\"separator\" class=\"divider\"></li>\r\n            <li data-remove-source><a href=\"#\" class=\"remove-item\">Delete forever</a></li>\r\n        </ul>\r\n        </div>\r\n    </td>\r\n</tr>\r\n";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.userMatch"] = Handlebars.template({"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    return "<div class=\"required-field\">\r\n  <button class=\"btn\" data-remove-field><i class=\"fa fa-minus fa-fw\"></i></button>\r\n  <input name=\"column\" class=\"form-control\" type=\"text\" placeholder=\"Field name\"/>\r\n  <label class=\"select-proxy-display\">\r\n    <select class=\"hidden-select form-control\" name=\"required-field-type\">\r\n      <option value=\"equals\">Equals</option>\r\n      <option value=\"notequals\">Not equals</option>\r\n      <option value=\"contains\">Contains</option>\r\n    </select>\r\n    <span class=\"icon fa fa-chevron-down\"></span>\r\n  </label>\r\n  <input name=\"value\" class=\"form-control\" type=\"text\" placeholder=\"Value\" data-toggle=\"tooltip\" data-placement=\"top\" title=\"To reference user data, use {{&nbsp;user.[*]&nbsp;}} e.g. {{&nbsp;user.[Email]&nbsp;}}, {{&nbsp;user.[First&nbsp;name]&nbsp;}}\"/>\r\n</div>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.users"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression, alias5=container.lambda;

  return "      <tr>\r\n        <td>"
    + alias4(((helper = (helper = helpers.fullName || (depth0 != null ? depth0.fullName : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"fullName","hash":{},"data":data}) : helper)))
    + "</td>\r\n        <td>"
    + alias4(((helper = (helper = helpers.email || (depth0 != null ? depth0.email : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"email","hash":{},"data":data}) : helper)))
    + "</td>\r\n        <td><code>"
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.permissions : stack1), depth0))
    + "</code></td>\r\n        <td>\r\n          <button class=\"btn btn-danger\" data-revoke-role=\""
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.userId : stack1), depth0))
    + "\">Delete permission</button>\r\n        </td>\r\n      </tr>\r\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "<table class=\"table\">\r\n  <thead>\r\n    <th>Full name</th>\r\n    <th>Email</th>\r\n    <th>Permissions</th>\r\n    <th>Actions</th>\r\n  </thead>\r\n  <tbody>\r\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? depth0.users : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\r\n</table>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.version"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    return "      <th>"
    + container.escapeExpression(container.lambda(depth0, depth0))
    + "</th>\r\n";
},"3":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "      <tr>\r\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),depth0,{"name":"each","hash":{},"fn":container.program(4, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "      </tr>\r\n";
},"4":function(container,depth0,helpers,partials,data) {
    return "            <td>"
    + container.escapeExpression(container.lambda(depth0, depth0))
    + "</td>\r\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, alias1=container.lambda, alias2=container.escapeExpression, alias3=depth0 != null ? depth0 : (container.nullContext || {});

  return "<a href=\"#\" data-back-to-versions class=\"btn btn-primary\">Back to versions list</a>\r\n<a href=\"#\" data-version-restore=\""
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.version : depth0)) != null ? stack1.id : stack1), depth0))
    + "\" class=\"btn btn-secondary\">Restore</a>\r\n<a href=\"#\" data-version-copy=\""
    + alias2(alias1(((stack1 = (depth0 != null ? depth0.version : depth0)) != null ? stack1.id : stack1), depth0))
    + "\" class=\"btn btn-secondary\">Copy to new data source</a>\r\n<br />\r\n\r\n<h3>Version preview</h3>\r\n<table class=\"table\">\r\n  <thead>\r\n"
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.columns : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </thead>\r\n  <tbody>\r\n"
    + ((stack1 = helpers.each.call(alias3,(depth0 != null ? depth0.entries : depth0),{"name":"each","hash":{},"fn":container.program(3, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\r\n</table>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.versions"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "      <tr>\r\n        <td><span class=\"label label-info\" title=\"Version "
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">"
    + alias4(((helper = (helper = helpers.createdAt || (depth0 != null ? depth0.createdAt : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"createdAt","hash":{},"data":data}) : helper)))
    + "</span></td>\r\n        <td>"
    + alias4(((helper = (helper = helpers.action || (depth0 != null ? depth0.action : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"action","hash":{},"data":data}) : helper)))
    + "</td>\r\n        <td>"
    + alias4(((helper = (helper = helpers.entriesCount || (depth0 != null ? depth0.entriesCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"entriesCount","hash":{},"data":data}) : helper)))
    + "</td>\r\n      <td>"
    + alias4(((helper = (helper = helpers.columnsCount || (depth0 != null ? depth0.columnsCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"columnsCount","hash":{},"data":data}) : helper)))
    + "</td>\r\n        <td>\r\n"
    + ((stack1 = helpers["if"].call(alias1,(depth0 != null ? depth0.hasEntries : depth0),{"name":"if","hash":{},"fn":container.program(2, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "        </td>\r\n      </tr>\r\n";
},"2":function(container,depth0,helpers,partials,data) {
    var helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "            <div class=\"btn-group\" role=\"group\">\r\n              <button type=\"button\" class=\"btn btn-default dropdown-toggle\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"false\">\r\n                Actions\r\n                <span class=\"caret\"></span>\r\n              </button>\r\n              <ul class=\"dropdown-menu menu-right\">\r\n                <li><a href=\"#\" data-version-preview=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Preview data</a></li>\r\n                <li><a href=\"#\" data-version-restore=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Restore</a></li>\r\n                <li><a href=\"#\" data-version-copy=\""
    + alias4(((helper = (helper = helpers.id || (depth0 != null ? depth0.id : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"id","hash":{},"data":data}) : helper)))
    + "\">Copy to new data source</a></li>\r\n              </ul>\r\n            </div>\r\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression;

  return "<table class=\"table\">\r\n  <thead>\r\n    <th>Saved at</th>\r\n    <th>Description</th>\r\n    <th>Entries</th>\r\n    <th>Columns</th>\r\n    <th>Actions</th>\r\n  </thead>\r\n  <tbody>\r\n    <tr class=\"success\">\r\n      <td><span class=\"label label-success\" title=\"This is the current version of the Data Source\">"
    + alias4(((helper = (helper = helpers.updatedAt || (depth0 != null ? depth0.updatedAt : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"updatedAt","hash":{},"data":data}) : helper)))
    + "</span></td>\r\n      <td>"
    + alias4(((helper = (helper = helpers.action || (depth0 != null ? depth0.action : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"action","hash":{},"data":data}) : helper)))
    + "</td>\r\n      <td>"
    + alias4(((helper = (helper = helpers.entriesCount || (depth0 != null ? depth0.entriesCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"entriesCount","hash":{},"data":data}) : helper)))
    + "</td>\r\n      <td>"
    + alias4(((helper = (helper = helpers.columnsCount || (depth0 != null ? depth0.columnsCount : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"columnsCount","hash":{},"data":data}) : helper)))
    + "</td>\r\n      <td>-</td>\r\n    </tr>\r\n"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.versions : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "  </tbody>\r\n</table>\r\n<br />\r\n";
},"useData":true});