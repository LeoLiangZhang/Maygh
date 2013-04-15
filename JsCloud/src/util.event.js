//#import util.lang.js
//#import util.logging.js

EventListenerMixin = {

	__getEventListeners : function(type) {
		if (!this.__eventListeners)
			this.__eventListeners = {};
		var listeners = this.__eventListeners[type];
		if (!listeners)
			listeners = this.__eventListeners[type] = [];
		return listeners;
	},

	addEventListener : function(type, listener) {
		if (!listener)
			return;
		var listeners = this.__getEventListeners(type);
		for ( var i = 0; i < listeners.length; i++) { // event cannot be added
														// repeatedly
			if (listeners[i] == listener)
				return;
		}
		listeners.push(listener);
	},

	removeEventListener : function(type, listener) {
		if (!listener)
			return;
		var listeners = this.__getEventListeners(type);
		var i = 0;
		while (i < listeners.length) {
			var l = listeners[i];
			if (l == listeners)
				listeners.splice(i, 1);
			else
				i++;
		}
	},

	dispatchEvent : function(type, evt) {
//		log.debug('dispatchEvent', type, evt);
		var listeners = this.__getEventListeners(type);
		var args = toArray(arguments, 1);
		listeners.forEach(function(l) {
			l.apply(this, args);
		}, this);
		var foo = null; // call on"eventname" callback
		if (foo = this["on" + type]){
			foo.apply(this, args);
		}
	}
};