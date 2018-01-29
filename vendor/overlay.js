/**
 *  Overlay
 *
 *  Version: 2.1.1
 *  Date: 10 September 2015
 *  Author: twu@fliplet.com
 *
 */
var Overlay = (function() {
  function html_entity_decode(html) {
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
  }

  var pfx = ["webkit", "moz", "MS", "o", ""];
  function addPrefixedEventListener(element, type, callback) {
    for (var p = 0; p < pfx.length; p++) {
      if (!pfx[p]) type = type.toLowerCase();
      element.addEventListener(pfx[p]+type, callback, false);
    }
  }
  function removePrefixedEventListener(element, type, callback) {
    for (var p = 0; p < pfx.length; p++) {
      if (!pfx[p]) type = type.toLowerCase();
      element.removeEventListener(pfx[p]+type, callback, false);
    }
  }

  function Overlay(content, options, callback) {
    // Check arguments
    if (typeof (options) === 'function') {
      callback = options;
      options = {};
    }

    // Default options
    this.options = {
      showClose      : true,
      title          : '',
      closeText      : 'Close',
      closeAnywhere  : true,
      showOnInit     : false,
      actionText     : '',
      actionCallback : null,
      beforeClose    : null,
      afterClose     : null,
      beforeOpen     : null,
      afterOpen      : null,
      classes        : '',
      parallax       : false,
      entranceAnim   : 'fadeInDownBig',
      exitAnim       : 'fadeOutUpBig',
      size           : 'medium', // compact, small, medium, large, full
      uniqueId       : ''
    };

    // Extend options
    if (typeof options == 'object') {
      for (i in options) {
        this.options[i] = options[i];
      }
    }

    var self = this;

    this.init(function () {
      self.load(content);
      if (self.options.showClose === false) {
        self.hideClose();
      } else {
        self.showClose();
      }
      if (self.options.showOnInit) {
        self.open();
      }
      // The `flRenderApp` event is dispatched so that any JavaScript that needs to be
      // run can be executed through an event listener.
      // e.g. document.addEventListener( 'flRenderApp', function(){ // Run JavaScript code here } );
      try {
        var customEvent = new CustomEvent(
          'flRenderApp',
          {
            bubbles: true,
            cancelable: true
          }
        );
        document.dispatchEvent(customEvent);
      } catch (e) {
        // For IE9+
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent('flRenderApp', true, true);
        document.dispatchEvent(evt);
      }
      if (typeof (callback) === 'function') {
        callback(self);
      }
    });

    this.addToOverlaysList();

    return this;
  }

  Overlay.prototype = {

    handleEvent: function (event) {
      if (typeof (this[event.type]) === 'function') return this[event.type](event);
    },

    init: function (callback) {
      var self = this;
      this.requestId;
      this.opening = false;

      if (this.options.uniqueId !== '') {
        var oldOverlay;
        if (oldOverlay = document.getElementById('overlay-' + this.options.uniqueId)) {
          if (typeof (oldOverlay.remove) === 'function') oldOverlay.remove();
        }

        this.overlayId = 'overlay-' + this.options.uniqueId;
      } else {
        this.overlayId = 'overlay-' + new Date().getTime();
      }

      var actionStruct = '';
      if (this.options.actionText !== '') {
        actionStruct = '<div class="actionButton">' + this.options.actionText + '</div>';
      }

      var overlayStruct = [
        '<div class="overlayPanelScreen"></div>',
        '<div class="overlayPanel">',
        '  <div class="overlayNavbar">',
        '    <div class="closeButton">' + this.options.closeText + '</div>',
        '    ' + actionStruct,
        '    <div class="overlayTitle">' + this.options.title + '</div>',
        '  </div>',
        '  <div class="overlayPanelContent"></div>',
        '  <div class="closeButton">' + this.options.closeText + '</div>',
        '</div>'
      ].join('');

      var overlayDiv = document.createElement('div');
      overlayDiv.id = this.overlayId;
      overlayDiv.className = 'overlay hasNavbar ' + this.options.classes;
      switch (this.options.size) {
        case 'compact':
          overlayDiv.className += ' overlay-compact';
          break;
        case 'small':
          overlayDiv.className += ' overlay-sm';
          break;
        case 'medium':
        default:
          overlayDiv.className += ' overlay-md';
          break;
        case 'large':
          overlayDiv.className += ' overlay-lg';
          break;
        case 'full':
          overlayDiv.className += ' overlay-full';
          break;
      }
      overlayDiv.innerHTML = overlayStruct;

      document.body.appendChild(overlayDiv);

      this.overlay = document.getElementById(this.overlayId);
      this.overlayPanelScreen = this.overlay.querySelector('.overlayPanelScreen');
      this.overlayNavbar = this.overlay.querySelector('.overlayNavbar');
      this.closeButton = this.overlay.querySelector('.overlayNavbar .closeButton');
      this.closeButtonCompact = this.overlay.querySelector('.overlayPanel > .closeButton');
      this.overlayPanel = this.overlay.querySelector('.overlayPanel');
      this.overlayPanelContent = this.overlay.querySelector('.overlayPanelContent');
      if (this.options.actionText !== '' && typeof this.options.actionCallback === 'function') {
        this.actionButton = this.overlay.querySelector('.actionButton');
        this.actionButton.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.options.actionCallback();
        }, false);
      }

      this.closeButton.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.close();
      }, false);

      if (this.closeButtonCompact) {
        this.closeButtonCompact.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.close();
        }, false);
      }

      if (this.options.closeAnywhere) {
        this.overlayPanelScreen.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if ( !self.opening ) self.close();
        }, false);
      }

      if (typeof (callback) === 'function') {
        callback();
      }
    },

    addToOverlaysList: function () {
      window.flOverlays = window.flOverlays || [];
      window.flOverlays.push(this);
    },

    removeFromOverlaysList: function () {
      window.flOverlays = window.flOverlays || [];
      if ( window.flOverlays.length ) {
        for (var i = 0, l = flOverlays.length; i < l; i++) {
          if ( document.getElementById(flOverlays[i].overlayId) === null ) {
            flOverlays.splice(i,1);
            return;
          }
        }
      }
    },

    empty: function (callback) {
      this.overlay.innerHTML = '';
      if (typeof (callback) === 'function') {
        callback();
      }
    },

    load: function (content, callback) {
      this.overlayPanelContent.innerHTML = html_entity_decode(content);

      if (typeof (callback) === 'function') {
        callback();
      }
    },

    isOpen: function () {
      return this.overlay.classList.contains('active');
    },

    open: function () {
      var self = this;

      // Add event handler for when the animation ends, i.e. overlay is opened
      addPrefixedEventListener( this.overlayPanel, 'AnimationEnd', function(e){
        self.opening = false;
        removePrefixedEventListener( e.target, 'AnimationEnd', arguments.callee );
        self.overlayPanel.classList.remove('animated');
        self.overlayPanel.classList.remove(self.options.entranceAnim || 'fadeInDownBig');

        if ( self.options.parallax ) {
          setTimeout(function(){
            window.addEventListener('deviceorientation', self, false);
            window.requestAnimationFrame(self.translateOverlay_.bind(self));
          },16);
        }

        if (typeof (self.options.afterOpen) === 'function') {
          self.options.afterOpen(self);
        }
      } );

      if (typeof (this.options.beforeOpen) === 'function') {
        this.options.beforeOpen(self);
      }

      this.overlayPanel.classList.add(this.options.entranceAnim || 'fadeInDownBig');
      this.overlayPanel.classList.add('animated');
      this.opening = true;

      document.body.style.width = document.body.clientWidth + 'px';
      clearTimeout(this.overlayCloseTimeout);
      setTimeout(function(){
        self.overlay.classList.add('active');
        document.body.classList.add('overlayIsActive');
      }, 0);
    },

    close: function () {
      var self = this;

      if (document.activeElement.nodeName !== 'BODY') {
        document.activeElement.blur();
      }

      this.opening = false;

      // Add event handler for when the animation ends, i.e. overlay is closed
      addPrefixedEventListener( this.overlayPanel, 'AnimationEnd', function(e){
        removePrefixedEventListener( e.target, 'AnimationEnd', arguments.callee );
        self.closed();
      } );

      if (typeof (this.options.beforeClose) === 'function') {
        this.options.beforeClose(self);
      }

      if ( this.options.parallax ) {
        window.removeEventListener('deviceorientation', self, this);
        window.cancelAnimationFrame(this.requestId);
        this.overlayPanel.style.webkitTransform = '';
        this.defaultOrientation = undefined;
      }

      this.overlayPanel.classList.add(this.options.exitAnim || 'fadeOutUpBig');
      this.overlayPanel.classList.add('animated');
      this.overlay.classList.add('closing');

      // Set up a timeout to make sure it takes no longer than the timeout limit to close overlay preview
      this.overlayCloseTimeout = setTimeout(this.closed.bind(this), 1500);

      if ( this.closingLastOverlay() ) {
        document.body.classList.remove('overlayIsActive');
        document.body.style.width = '';
      }
    },

    closingLastOverlay : function () {
      if ( typeof window.flOverlays === "undefined" || window.flOverlays.length === 0 ) {
        return true;
      } else {
        var activeOverlays = [];
        for (var i = 0, l = flOverlays.length; i < l; i++) {
          // If another overlay is found to be active and not
          if ( flOverlays[i].overlayId !== this.overlayId
            && document.querySelector('#'+flOverlays[i].overlayId) !== null
            && document.querySelector('#'+flOverlays[i].overlayId).classList.contains('active')
            && !document.querySelector('#'+flOverlays[i].overlayId).classList.contains('closing') ) {
            return false;
          }
        }
        return true;
      }
    },

    closed: function () {
      if (!this.opening)  {
        this.overlay.classList.remove('active');
        this.overlayPanel.classList.remove('animated');
      }
      this.overlay.classList.remove('closing');
      this.overlayPanel.classList.remove(this.options.exitAnim || 'fadeOutUpBig');

      if (typeof (this.options.afterClose) === 'function') {
        this.options.afterClose(this);
      }

      if ((this.options.uniqueId === '')) {
        this.remove();
      }
    },

    hideClose: function () {
      this.closeButton.style.display = 'none';
      this.closeButtonCompact.style.display = 'none';
    },

    showClose: function () {
      this.closeButton.style.display = 'block';
      this.closeButtonCompact.style.display = 'block';
    },

    hideAction: function () {
      if (typeof this.actionButton !== 'undefined') {
        this.actionButton.style.display = 'none';
      }
    },

    showAction: function () {
      if (typeof this.actionButton !== 'undefined') {
        this.actionButton.style.display = 'block';
      }
    },

    deviceorientation: function (event) {
      if (typeof this.defaultOrientation === 'undefined') {
        this.defaultOrientation = {
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma
        };
      }

      var factor = 0.15;
      var yTilt = Math.round((this.defaultOrientation.beta-event.beta)*factor);
      var xTilt = Math.round((this.defaultOrientation.gamma-event.gamma)*factor);

      this.overlayTranslate = {
        x: xTilt,
        y: yTilt,
        z: 0
      };
    },

    translateOverlay_: function () {
      var self = this;
      if (typeof this.overlayTranslate !== 'undefined') {
        this.overlayPanel.style.webkitTransform = 'translate3d(' + this.overlayTranslate.x + 'px,' + this.overlayTranslate.y + 'px,' + this.overlayTranslate.z + 'px)';
      }
      this.requestId = window.requestAnimationFrame( this.translateOverlay_.bind(this) );
    },

    remove: function (callback) {
      var overlay;
      if (overlay = document.getElementById(this.overlayId)) {
        document.body.removeChild(overlay);
        setTimeout(this.removeFromOverlaysList,17);
      }
      if (typeof (callback) === 'function') {
        callback();
      }
    }

  };

  window.Fliplet = window.Fliplet || {};
  window.Fliplet.Utils = window.Fliplet.Utils || {};
  window.Fliplet.Utils.Overlay = Overlay;
})(window);
