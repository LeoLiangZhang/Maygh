package util
{
	public class ObjectWrapper
	{
		protected var wrap_obj:Object;
		protected var binder:Binder;
		
		public function ObjectWrapper()
		{
		}
		
		protected function wrap(wrap_obj:Object)
		{
			this.wrap_obj = wrap_obj;
		}
		
		public function binding(binder:Binder):void
		{
			this.binder = binder;
		}
		
		public function getProperty(name:String)
		{
			return this.wrap_obj[name];
		}
		
		public function setProperty(name:String, value)
		{
			return this.wrap_obj[name] = value;
		}
		
		public function wrappedApply(method:String, args:Array)
		{
			Bridge.rawjstrace("wrapped Apply test2", method, args);
			var foo:Function = this.wrap_obj[method] as Function;
			return foo.apply(this.wrap_obj, args);
		}
		
		public function wrappedCall(method:String, ...arguments)
		{
			return wrappedApply(method, arguments);
		}
	}
}