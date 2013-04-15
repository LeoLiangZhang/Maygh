package util
{
	public class Binder
	{
		public var local_ref:String;
		public var remote_ref:String;
		public var bridge:Bridge;
		
		public function Binder(bridge:Bridge, local_ref:String, remote_ref:String)
		{
			this.bridge = bridge;	
			this.local_ref = local_ref;
			this.remote_ref = remote_ref;
		}
		
		public function jscall(fun:String, ...arguments)
		{
			return this.bridge.jsapply(this.remote_ref, fun, arguments);
		}
		
		public function jsapply(fun:String, arguments)
		{
			return this.bridge.jsapply(this.remote_ref, fun, arguments);
		}
		
		public function destroy()
		{
			this.bridge.jscall(Bridge.SelfID, 'remove', this.remote_ref);
			this.bridge.remove(this.local_ref);
		};
		
	}
}