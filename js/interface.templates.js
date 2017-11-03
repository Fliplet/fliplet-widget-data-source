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
    + "\">\n    <td class=\"data-source-name\"><a href=\"#\" data-browse-source>"
    + alias4(((helper = (helper = helpers.name || (depth0 != null ? depth0.name : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"name","hash":{},"data":data}) : helper)))
    + "</a></td>\n    <td class=\"data-source-apps\">"
    + ((stack1 = helpers.each.call(alias1,(depth0 != null ? depth0.apps : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "</td>\n    <td class=\"text-right\"><button class=\"btn btn-default\" data-browse-source>Edit</button></td>\n</tr>";
},"useData":true});

this["Fliplet"]["Widget"]["Templates"]["templates.users"] = Handlebars.template({"1":function(container,depth0,helpers,partials,data) {
    var stack1, helper, alias1=depth0 != null ? depth0 : (container.nullContext || {}), alias2=helpers.helperMissing, alias3="function", alias4=container.escapeExpression, alias5=container.lambda;

  return "        <tr>\n          <td>"
    + alias4(((helper = (helper = helpers.fullName || (depth0 != null ? depth0.fullName : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"fullName","hash":{},"data":data}) : helper)))
    + "</td>\n          <td>"
    + alias4(((helper = (helper = helpers.email || (depth0 != null ? depth0.email : depth0)) != null ? helper : alias2),(typeof helper === alias3 ? helper.call(alias1,{"name":"email","hash":{},"data":data}) : helper)))
    + "</td>\n          <td><code>"
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.permissions : stack1), depth0))
    + "</code></td>\n          <td>\n            <button class=\"btn btn-danger\" data-revoke-role=\""
    + alias4(alias5(((stack1 = (depth0 != null ? depth0.dataSourceRole : depth0)) != null ? stack1.userId : stack1), depth0))
    + "\">Revoke role</button>\n          </td>\n        </tr>\n";
},"compiler":[7,">= 4.0.0"],"main":function(container,depth0,helpers,partials,data) {
    var stack1;

  return "<table class=\"table\">\n    <thead>\n      <th>Full name</th>\n      <th>Email</th>\n      <th>Permissions</th>\n      <th>Actions</th>\n    </thead>\n    <tbody>\n"
    + ((stack1 = helpers.each.call(depth0 != null ? depth0 : (container.nullContext || {}),(depth0 != null ? depth0.users : depth0),{"name":"each","hash":{},"fn":container.program(1, data, 0),"inverse":container.noop,"data":data})) != null ? stack1 : "")
    + "    </tbody>\n</table>";
},"useData":true});