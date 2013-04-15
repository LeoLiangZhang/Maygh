package util
{
	import flash.external.ExternalInterface;
	import flash.utils.getDefinitionByName;
	import flash.utils.getQualifiedClassName;
	
	import net.FlashConnection;
	
	/**
	 * Connect JS Bridge class. See JS Bridge class.
	 */
	public class Bridge
	{
		public static const SelfID = "bridge";
		
		private var jsobj:String;
		private var objs:Object;
		private var statics:Object;
		private var counter:int;
		
		public function Bridge()
		{
			this.objs = {};
			this.statics = {};
			this.objs[SelfID] = this;
		}
		
		public function dispatch(invoke)
		{
			rawjstrace("Flash-dispatching", invoke);
			var ref:String = invoke.ref;
			var fun:String = invoke.fun;
			var args = invoke.args;
			
			var foo = null;
			var msg = '';
			var obj = null;
			if(ref){
				var o = this.objs[ref];
				if(!o){
					msg = "FlBridge: '" + ref + "' object has not found.";
					this.jstrace(msg);
					throw new Error(msg);
				}
				foo = o[fun]; 
				if(!foo){
					msg = "FlBridge: Function '" + fun + "' in '" +
						ref + "'object has not found.";
					this.jstrace(msg);
					throw new Error(msg);
				}
				obj = o;
			} else {
				foo = this.statics[fun];
				if(!foo){
					msg = "FlBridge: Function '" + fun + "' has not found.";
					this.jstrace(msg);
					throw new Error(msg);
				}
			};
			var ret = null;
			try{
				var result = foo.apply(obj, args);
				ret = {result: result};
			} catch (e:Error) {
				ret = {error: e.message};
				Bridge.rawjstrace("FL_Dispatcher error", e.message, invoke);
			}
			return ret;
		}
		
		public function test(...arguments):void
		{
			this.jstrace("This is a test function.", arguments);
			this.jscall(arguments[0], arguments[1], arguments[2]);
		}
		
		public function jscall(ref, fun:String, ...arguments)
		{
			return this.jsapply(ref, fun, arguments);
		}
		
		public function jsapply(ref, fun:String, arguments:Array)
		{
			rawjstrace("jsapply", ref, fun, arguments);
			// ref should be String or null
			var invoke = {ref: ref, fun: fun, args: arguments}; 
			var ret = ExternalInterface.call(this.jsobj, invoke);
			if(ret["error"]){
				throw new Error(ret["error"].toString())
			} else {
				return ret["result"];
			}
		}
		
		public function jstrace(...arguments):void
		{
			this.jsapply(null, "jstrace", arguments);
		}
		
		/**
		 * This function is desgined to debug this the bridge class.
		 * It does not depend on anything other than the JS object "console"
		 */
		public static function rawjstrace(...arguments):void
		{
			arguments.unshift("rawjstrace");
			arguments.unshift("jstrace");
			ExternalInterface.call.apply(null, arguments);
		}
		
		public function init()
		{
			ExternalInterface.addCallback("dispatch", this.dispatch);
		}
		
		public function initJS(jsobj:String)
		{
			this.jsobj = jsobj;
//			this.jstrace("Flash Bridge Init with name", jsobj);
		}
		
		/**
		 * Construct a new object of given class name and store it in
		 * *this.objs*, then return its reference key.
		 * 
		 * NOTE: The class should accept bridge as its first argument. 
		 */
		public function shadow(remote_ref:String, classname:String):String
		{
			var obj = ObjectFactory.createObject(classname);
			if(!obj) throw new Error("Object of "+classname+" creates fail.");
			var ref:String = this.register(obj);
			var binder:Binder = new Binder(this, ref, remote_ref);
			obj.binding(binder);
			return ref;
		}
		
		public function register(obj, is_static:Boolean=false):String
		{
			var ref = "obj_" + this.counter ++;
			if (is_static)
				this.statics[ref] = obj;
			else
				this.objs[ref] = obj;
			return ref;
		}
		
		public function remove(ref:String, is_static:Boolean=false)
		{
			if (is_static)
				delete this.statics[ref];
			else
				delete this.objs[ref];
		}
		
		public function exist(ref:String, is_static:Boolean=false):Boolean
		{
			if (is_static)
				return ref in this.statics;
			else
				return ref in this.objs;
		}
		
		public function getObject(ref:String)
		{
			return this.objs[ref];
		}
		
		private static var _instance:Bridge;
		public static function get Instance():Bridge
		{
			if (_instance == null){
				_instance = new Bridge();
			}
			return _instance; 
		}
	}
}