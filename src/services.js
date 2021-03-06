angularService("$window", bind(window, identity, window));
angularService("$document", function(window){
  return jqLite(window.document);
}, {inject:['$window']});

var URL_MATCH = /^(file|ftp|http|https):\/\/(\w+:{0,1}\w*@)?([\w\.]*)(:([0-9]+))?([^\?#]+)(\?([^#]*))?(#(.*))?$/;
var HASH_MATCH = /^([^\?]*)?(\?([^\?]*))?$/;
var DEFAULT_PORTS = {'http': 80, 'https': 443, 'ftp':21};
angularService("$location", function(browser){
  var scope = this, location = {parse:parseUrl, toString:toString};
  var lastHash, lastUrl;
  function parseUrl(url){
    if (isDefined(url)) {
      var match = URL_MATCH.exec(url);
      if (match) {
        location.href = url;
        location.protocol = match[1];
        location.host = match[3] || '';
        location.port = match[5] || DEFAULT_PORTS[location.href] || null;
        location.path = match[6];
        location.search = parseKeyValue(match[8]);
        location.hash = match[9] || '';
        if (location.hash)
          location.hash = location.hash.substr(1);
        parseHash(location.hash);
      }
    }
  }
  function parseHash(hash) {
    var match = HASH_MATCH.exec(hash);
    location.hashPath = match[1] || '';
    location.hashSearch = parseKeyValue(match[3]);
    lastHash = hash;
  }
  function toString() {
    if (lastHash === location.hash) {
      var hashKeyValue = toKeyValue(location.hashSearch),
          hash = (location.hashPath ? location.hashPath : '') + (hashKeyValue ? '?' + hashKeyValue : ''),
          url = location.href.split('#')[0] + '#' + (hash ? hash : '');
      if (url !== location.href) parseUrl(url);
      return url;
    } else {
      parseUrl(location.href.split('#')[0] + '#' + location.hash);
      return toString();
    }
  }
  browser.watchUrl(function(url){
    parseUrl(url);
    scope.$root.$eval();
  });
  parseUrl(browser.getUrl());
  this.$onEval(PRIORITY_FIRST, function(){
    if (location.hash != lastHash) {
      parseHash(location.hash);
    }
  });
  this.$onEval(PRIORITY_LAST, function(){
    var url = toString();
    if (lastUrl != url) {
      browser.setUrl(url);
      lastUrl = url;
    }
  });
  return location;
}, {inject: ['$browser']});

angularService("$hover", function(browser) {
  var tooltip, self = this, error, width = 300, arrowWidth = 10;
  browser.hover(function(element, show){
    if (show && (error = element.attr(NG_EXCEPTION) || element.attr(NG_VALIDATION_ERROR))) {
      if (!tooltip) {
        tooltip = {
            callout: jqLite('<div id="ng-callout"></div>'),
            arrow: jqLite('<div></div>'),
            title: jqLite('<div class="ng-title"></div>'),
            content: jqLite('<div class="ng-content"></div>')
        };
        tooltip.callout.append(tooltip.arrow);
        tooltip.callout.append(tooltip.title);
        tooltip.callout.append(tooltip.content);
        self.$browser.body.append(tooltip.callout);
      }
      var docRect = self.$browser.body[0].getBoundingClientRect(),
          elementRect = element[0].getBoundingClientRect(),
          leftSpace = docRect.right - elementRect.right - arrowWidth;
      tooltip.title.text(element.hasClass("ng-exception") ? "EXCEPTION:" : "Validation error...");
      tooltip.content.text(error);
      if (leftSpace < width) {
        tooltip.arrow.addClass('ng-arrow-right');
        tooltip.arrow.css({left: (width + 1)+'px'});
        tooltip.callout.css({
          position: 'fixed',
          left: (elementRect.left - arrowWidth - width - 4) + "px",
          top: (elementRect.top - 3) + "px",
          width: width + "px"
        });
      } else {
        tooltip.arrow.addClass('ng-arrow-left');
        tooltip.callout.css({
          position: 'fixed',
          left: (elementRect.right + arrowWidth) + "px",
          top: (elementRect.top - 3) + "px",
          width: width + "px"
        });
      }
    } else if (tooltip  && false) {
      tooltip.callout.remove();
      tooltip = null;
    }
  });
}, {inject:['$browser']});

angularService("$invalidWidgets", function(){
  var invalidWidgets = [];
  invalidWidgets.markValid = function(element){
    var index = indexOf(invalidWidgets, element);
    if (index != -1)
      invalidWidgets.splice(index, 1);
  };
  invalidWidgets.markInvalid = function(element){
    var index = indexOf(invalidWidgets, element);
    if (index === -1)
      invalidWidgets.push(element);
  };
  invalidWidgets.visible = function() {
    var count = 0;
    foreach(invalidWidgets, function(widget){
      count = count + (isVisible(widget) ? 1 : 0);
    });
    return count;
  };
  invalidWidgets.clearOrphans = function() {
    for(var i = 0; i < invalidWidgets.length;) {
      var widget = invalidWidgets[i];
      if (isOrphan(widget[0])) {
        invalidWidgets.splice(i, 1);
      } else {
        i++;
      }
    }
  };
  function isOrphan(widget) {
    if (widget == window.document) return false;
    var parent = widget.parentNode;
    return !parent || isOrphan(parent);
  }
  return invalidWidgets;
});

angularService('$route', function(location, params){
  var routes = {},
      onChange = [],
      matcher = angularWidget('NG:SWITCH').route,
      parentScope = this,
      $route = {
        routes: routes,
        onChange: bind(onChange, onChange.push),
        when:function (path, params){
          if (angular.isUndefined(path)) return routes;
          var route = routes[path];
          if (!route) route = routes[path] = {};
          if (params) angular.extend(route, params);
          if (matcher(location.hashPath, path)) updateRoute();
          return route;
        }
      };
  function updateRoute(){
    var childScope;
    $route.current = null;
    angular.foreach(routes, function(routeParams, route) {
      if (!childScope) {
        var pathParams = matcher(location.hashPath, route);
        if (pathParams) {
          childScope = angular.scope(parentScope);
          $route.current = angular.extend({}, routeParams, {
            scope: childScope,
            params: angular.extend({}, location.hashSearch, pathParams)
          });
        }
      }
    });
    angular.foreach(onChange, parentScope.$tryEval);
    if (childScope) {
      childScope.$become($route.current.controller);
      parentScope.$tryEval(childScope.init);
    }
  }
  this.$watch(function(){return location.hash;}, updateRoute);
  return $route;
}, {inject: ['$location']});

