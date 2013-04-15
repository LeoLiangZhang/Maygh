//#import util.js

// For rawjstrace function in Flash.
window.jstrace = function(){
	var arr = toArray(arguments);
	log.debug.apply(log, arr);
};

/**
 * JS Bridge class that connect FL Bridge class so they both can
 * exchange data by invocation of functions.
 *
 * This class is a foundation of many Flash interpolate classes.
 * @constructor {Brdige}
 */
function Bridge(flobj) {
	this.flobj;
	this.objs = {};
	this.statics = {};
	this.counter = 0;
	this.bridge_name = "__js_fl_bridge__" + getTime();
	var self = this;

	// Init
	this.objs[Bridge.SelfID] = self;
	this.statics['jstrace'] = self.jstrace;
	window[this.bridge_name] = function(invoke){
		return self.dispatch(invoke);
	};

	if(!flobj) return;
	// Init the Bridge
	if(typeof flobj === 'string'){ // init by Flash Object id
		var flobj_id = flobj;
		this.flobj = document.getElementById(flobj_id);
		if(!this.flobj) throw new Error('Flash object not found.');
	} else {
		// assume flobj is the real flash object
		this.flobj = flobj;
	}
	this.init(this.flobj);

};

Bridge.SelfID = 'bridge';

Bridge.prototype.init = function(flobj){
	this.flobj = flobj;

	// Init flash bridge object with *this.bridge_name*, so that
	// flash object can call back.
	this.flcall('bridge', "initJS", this.bridge_name);
};

Bridge.prototype.jstrace = function(){
	log.info.apply(log, arguments);
};

/**
 * Return result of calling *fun* of flash *ref*.
 * @param ref {String/null} null for static method.
 * @param fun {String} Function name.
 * @param *args
 * @returns
 */
Bridge.prototype.flcall = function(ref, fun){
	var args = toArray(arguments, 2);
	return this.flapply(ref, fun, args);
};

/**
 * Return result of applying *fun* of flash *ref*.
 * @param ref {String/null} null for static method.
 * @param fun {String} Function name.
 * @param *args {Array} An Array of arguemnts.
 * @returns
 */
Bridge.prototype.flapply = function(ref, fun, args){
	var invoke = {ref: ref, fun: fun, args: args};
	// Assume flash side handler is called dispatch
	log_time('INVOKE_FLASH_START', ref, fun);
	var ret = this.flobj.dispatch(invoke);
	log_time('INVOKE_FLASH_END', ref, fun);
	if(ret["error"]){
		throw new Error(ret["error"]);
	} else {
		return ret["result"];
	}
};

/**
 * Dispatch an invoke object to target method.
 * An invoke object should contain these fields:
 *  - ref:String // name of the target object, null to look for static function.
 *  - fun:String // method name
 *  - args:Array // an array of arguments.
 * @param invoke {Object}
 * @returns {Object} return what target function return.
 */
Bridge.prototype.dispatch = function(invoke) {
	var ref = invoke.ref;
	var fun = invoke.fun;
	var args = invoke.args;

	log_time('DISPATCH_FLASH_START', ref, fun);

	var foo = null; // a function pointer
	var msg = '';
	var obj = null;
	if(ref){
		var o = this.objs[ref];
		if(!o){
			msg = "Bridge: '" + ref + "' object has not found.";
			log.error(msg);
			throw new Error(msg);
		}
		foo = o[fun];
		if(!foo){
			msg = "Bridge: Function '" + fun + "' in '" +
						ref + "' object has not found.";
			log.error(msg);
			throw new Error(msg);
		}
		obj = o;

	} else {
		foo = this.statics[fun];
		if(!foo){
			msg = "Bridge: Function '" + fun + "' has not found.";
			log.error(msg);
			throw new Error(msg);
		}

	};
	var ret = null;
	try{
		var result = foo.apply(obj, args);
		ret = {result: result};
	} catch (e){
		ret = {error: ""+e};
		log.error("JS_Dispatcher error", e, invoke);
	}

	log_time('DISPATCH_FLASH_END', ref, fun);
	return ret;

};

// To test this, run the following in JS console,
// bridge.flcall('bridge', 'test', 'bridge', 'test', 123)
// It will call flash side bridge object's test function, and the test will
// call back this js test method, passing 123 back.
Bridge.prototype.test = function(){
	log.info.apply(log, arguments);
};

/**
 * Register an object with given ref.
 * @param ref {String}
 * @param obj {Object}
 * @param is_static {Boolean}
 */
Bridge.prototype.register = function(obj, is_static){
	var ref = "obj_" + this.counter ++;
	if (is_static)
		this.statics[ref] = obj;
	else
		this.objs[ref] = obj;
	return ref;
};

/**
 * Remove an object with given ref.
 * @param ref {String}
 * @param is_static {Boolean}
 */
Bridge.prototype.remove = function(ref, is_static){
	if (is_static)
		delete this.statics[ref];
	else
		delete this.objs[ref];
};

/**
 * Check if given ref exists in either this.statics or this.objs
 * @param ref {String}
 * @param is_static {Boolean}
 * @returns {Boolean}
 */
Bridge.prototype.exist = function(ref, is_static)
{
	if (is_static)
		return ref in this.statics;
	else
		return ref in this.objs;
};

Bridge.prototype.getObject = function(ref)
{
	return this.objs[ref];
};



Bridge.prototype.shadow = function(obj, classname){
	if(!obj) throw new Error("Shadow object cannot be null.");
	var ref = this.register(obj);
	var remote_ref = this.flcall(Bridge.SelfID, 'shadow', ref, classname);
	var binder = new Binder(this, ref, remote_ref);
	obj.binding(binder);
	return ref;
};

/**
 * Binding object between JS and FL.
 * @param bridge {Bridge}
 * @param local_ref {String}
 * @param remote_ref {String}
 * @returns
 */
function Binder(bridge, local_ref, remote_ref)
{
	this.bridge = bridge;
	this.local_ref = local_ref;
	this.remote_ref = remote_ref;
}

Binder.prototype.flcall = function(fun){
	var args = toArray(arguments, 1);
	return this.bridge.flapply(this.remote_ref, fun, args);
};

Binder.prototype.flapply = function(fun, args){
	return this.bridge.flapply(this.remote_ref, fun, args);
};

Binder.prototype.destroy = function(){
	this.bridge.flcall(Bridge.SelfID, 'remove', this.remote_ref);
	this.bridge.remove(this.local_ref);
};

Binder.shadowMethods = function(names){
	methods = {};
	names.forEach(function(name){
		methods[name] = (function(){
			var _name = name;
			return function(){
				args = toArray(arguments);
				return this.binder.flapply(_name, args);
			};
		})();
	});
	return methods;
};

Binder.wrappedMethods = function(names){
	methods = {};
	names.forEach(function(name){
		methods[name] = (function(){
			var _name = name;
			return function(){
				args = toArray(arguments);
				return this.binder.flapply('wrappedApply', [_name, args]);
			};
		})();
	});
	return methods;
};

Binder.BindingMixin = {
		binder : null,
		binding : function(binder){
			this.binder = binder;
		}
};


