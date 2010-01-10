// Copyright (C) 2008,2009 BRAT Tech LLC

// IE compatibility

if (typeof document.getAttribute == 'undefined')
  document.getAttribute = function() {
  };
if (typeof Node == 'undefined') {
  Node = {
    ELEMENT_NODE : 1,
    ATTRIBUTE_NODE : 2,
    TEXT_NODE : 3,
    CDATA_SECTION_NODE : 4,
    ENTITY_REFERENCE_NODE : 5,
    ENTITY_NODE : 6,
    PROCESSING_INSTRUCTION_NODE : 7,
    COMMENT_NODE : 8,
    DOCUMENT_NODE : 9,
    DOCUMENT_TYPE_NODE : 10,
    DOCUMENT_FRAGMENT_NODE : 11,
    NOTATION_NODE : 12
  };
}

var callbacks = {};
var jQuery = window['jQuery'];
var msie = jQuery['browser']['msie'];

if (!window.angular){   angular = {}; window['angular'] = angular; }
if (!angular.validator) angular.validator = {};
if (!angular.filter)    angular.filter = {};
if (!window.console)
  window.console = {
    log:function() {},
    error:function() {}
  };
if (!angular.alert) {
  angular.alert = function(){console.log(arguments); window.alert.apply(window, arguments); };
}

var consoleNode;

consoleLog = function(level, objs) {
  var log = document.createElement("div");
  log.className = level;
  var msg = "";
  var sep = "";
  for ( var i = 0; i < objs.length; i++) {
    var obj = objs[i];
    msg += sep + (typeof obj == 'string' ? obj : toJson(obj));
    sep = " ";
  }
  log.appendChild(document.createTextNode(msg));
  consoleNode.appendChild(log);
};

isNode = function(inp) {
  return inp &&
      inp.tagName &&
      inp.nodeName &&
      inp.ownerDocument &&
      inp.removeAttribute;
};

isLeafNode = function(node) {
  switch (node.nodeName) {
  case "OPTION":
  case "PRE":
  case "TITLE":
    return true;
  default:
    return false;
  }
};

noop = function() {
};
setHtml = function(node, html) {
  if (isLeafNode(node)) {
    if (msie) {
      node.innerText = html;
    } else {
      node.textContent = html;
    }
  } else {
    node.innerHTML = html;
  }
};

escapeHtml = function(html) {
  if (!html || !html.replace)
    return html;
  return html.
      replace(/&/g, '&amp;').
      replace(/</g, '&lt;').
      replace(/>/g, '&gt;');
};

escapeAttr = function(html) {
  if (!html || !html.replace)
    return html;
  return html.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g,
      '&quot;');
};

bind = function(_this, _function) {
  if (!_this)
    throw "Missing this";
  if (!_.isFunction(_function))
    throw "Missing function";
  return function() {
    return _function.apply(_this, arguments);
  };
};

shiftBind = function(_this, _function) {
  return function() {
    var args = [ this ];
    for ( var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    return _function.apply(_this, args);
  };
};

outerHTML = function(node) {
  var temp = document.createElement('div');
  temp.appendChild(node);
  var outerHTML = temp.innerHTML;
  temp.removeChild(node);
  return outerHTML;
};

trim = function(str) {
  return str.replace(/^ */, '').replace(/ *$/, '');
};

toBoolean = function(value) {
  var v = ("" + value).toLowerCase();
  if (v == 'f' || v == '0' || v == 'false' || v == 'no')
    value = false;
  return !!value;
};

merge = function(src, dst) {
  for ( var key in src) {
    var value = dst[key];
    var type = typeof value;
    if (type == 'undefined') {
      dst[key] = fromJson(toJson(src[key]));
    } else if (type == 'object' && value.constructor != array &&
        key.substring(0, 1) != "$") {
      merge(src[key], value);
    }
  }
};

// ////////////////////////////
// Loader
// ////////////////////////////

Loader = function(document, head, config) {
  this.document = jQuery(document);
  this.head = jQuery(head);
  this.config = config;
  this.location = window.location;
};

Loader.prototype.load = function() {
  this.configureLogging();
  this.loadCss('/stylesheets/jquery-ui/smoothness/jquery-ui-1.7.1.css');
  this.loadCss('/stylesheets/css');
  console.log("Server: " + this.config.server);
  this.configureJQueryPlugins();
  this.computeConfiguration();
  this.bindHtml();
};

Loader.prototype.configureJQueryPlugins = function() {
  console.log('Loader.configureJQueryPlugins()');
  jQuery['fn']['scope'] = function() {
    var element = this;
    while (element && element.get(0)) {
      var scope = element.data("scope");
      if (scope)
        return scope;
      element = element.parent();
    }
    return null;
  };
  jQuery['fn']['controller'] = function() {
    return this.data('controller') || NullController.instance;
  };
};

Loader.prototype.uid = function() {
  return "" + new Date().getTime();
};

Loader.prototype.computeConfiguration = function() {
  var config = this.config;
  if (!config.database) {
    var match = config.server.match(/https?:\/\/([\w]*)/);
    config.database = match ? match[1] : "$MEMORY";
  }
};

Loader.prototype.bindHtml = function() {
  console.log('Loader.bindHtml()');
  var watcher = new UrlWatcher(this.location);
  var document = this.document;
  var widgetFactory = new WidgetFactory(this.config.server, this.config.database);
  var binder = new Binder(document[0], widgetFactory, watcher, this.config);
  widgetFactory.onChangeListener = shiftBind(binder, binder.updateModel);
  var controlBar = new ControlBar(document.find('body'), this.config.server);
  var onUpdate = function(){binder.updateView();};
  var server = this.config.database=="$MEMORY" ?
      new FrameServer(this.window) :
      new Server(this.config.server, jQuery.getScript);
  server = new VisualServer(server, new Status(jQuery(document.body)), onUpdate);
  var users = new Users(server, controlBar);
  var databasePath = '/data/' + this.config.database;
  var post = function(request, callback){
    server.request("POST", databasePath, request, callback);
  };
  var datastore = new DataStore(post, users, binder.anchor);
  binder.updateListeners.push(function(){datastore.flush();});
  var scope = new Scope( {
    '$anchor' : binder.anchor,
    '$binder' : binder,
    '$config' : this.config,
    '$console' : window.console,
    '$datastore' : datastore,
    '$save' : function(callback) {
      datastore.saveScope(scope.state, callback, binder.anchor);
    },
    '$window' : window,
    '$uid' : this.uid,
    '$users' : users
  }, "ROOT");

  document.data('scope', scope);
  console.log('$binder.entity()');
  binder.entity(scope);

  console.log('$binder.compile()');
  binder.compile();

  console.log('ControlBar.bind()');
  controlBar.bind();

  console.log('$users.fetchCurrentUser()');
  function fetchCurrentUser() {
    users.fetchCurrentUser(function(u) {
      if (!u && document.find("[ng-auth=eager]").length) {
        users.login();
      }
    });
  }
  fetchCurrentUser();

  console.log('PopUp.bind()');
  new PopUp(document).bind();

  console.log('$binder.parseAnchor()');
  binder.parseAnchor();

  console.log('$binder.executeInit()');
  binder.executeInit();

  console.log('$binder.updateView()');
  binder.updateView();

  watcher.listener = bind(binder, binder.onUrlChange, watcher);
  watcher.onUpdate = function(){alert("update");};
  watcher.watch();
  document.find("body").show();
  console.log('ready()');
};

Loader.prototype.visualPost = function(delegate) {
  var status = new Status(jQuery(document.body));
  return function(request, delegateCallback) {
    status.beginRequest(request);
    var callback = function() {
      status.endRequest();
      try {
        delegateCallback.apply(this, arguments);
      } catch (e) {
        alert(toJson(e));
      }
    };
    delegate(request, callback);
  };
};

Loader.prototype.configureLogging = function() {
  var url = window.location.href + '#';
  url = url.split('#')[1];
  var config = {
    debug : null
  };
  var configs = url.split('&');
  for ( var i = 0; i < configs.length; i++) {
    var part = (configs[i] + '=').split('=');
    config[part[0]] = part[1];
  }
  if (config.debug == 'console') {
    consoleNode = document.createElement("div");
    consoleNode.id = 'ng-console';
    document.getElementsByTagName('body')[0].appendChild(consoleNode);
    console.log = function() {
      consoleLog('ng-console-info', arguments);
    };
    console.error = function() {
      consoleLog('ng-console-error', arguments);
    };
  }
};

Loader.prototype.loadCss = function(css) {
  var cssTag = document.createElement('link');
  cssTag.rel = "stylesheet";
  cssTag.type = "text/css";
  if (!css.match(/^http:/))
    css = this.config.server + css;
  cssTag.href = css;
  this.head[0].appendChild(cssTag);
};

UrlWatcher = function(location) {
  this.location = location;
  this.delay = 25;
  this.setTimeout = function(fn, delay) {
    window.setTimeout(fn, delay);
  };
  this.listener = function(url) {
    return url;
  };
  this.expectedUrl = location.href;
};

UrlWatcher.prototype.watch = function() {
  var self = this;
  var pull = function() {
    if (self.expectedUrl !== self.location.href) {
      var notify = self.location.hash.match(/^#\$iframe_notify=(.*)$/);
      if (notify) {
        if (!self.expectedUrl.match(/#/)) {
          self.expectedUrl += "#";
        }
        self.location.href = self.expectedUrl;
        var id = '_iframe_notify_' + notify[1];
        var notifyFn = callbacks[id];
        delete callbacks[id];
        try {
          (notifyFn||noop)();
        } catch (e) {
          alert(e);
        }
      } else {
        self.listener(self.location.href);
        self.expectedUrl = self.location.href;
      }
    }
    self.setTimeout(pull, self.delay);
  };
  pull();
};

UrlWatcher.prototype.setUrl = function(url) {
  var existingURL = window.location.href;
  if (!existingURL.match(/#/))
    existingURL += '#';
  if (existingURL != url)
    window.location.href = url;
  this.existingURL = url;
};

UrlWatcher.prototype.getUrl = function() {
  return window.location.href;
};

angular['compile'] = function(root, config) {
  config = config || {};
  var defaults = {
    server: ""
  };
  //todo: don't load stylesheet by default
  //todo: don't start watcher
  var loader = new Loader(root, jQuery("head"), _(defaults).extend(config));
  loader.load();
  var scope = jQuery(root).scope();
  //TODO: cleanup
  return {
    'updateView':function(){return scope.updateView.apply(scope, arguments);},
    'set':function(){return scope.set.apply(scope, arguments);},
    'get':function(){return scope.get.apply(scope, arguments);}
  };
};
