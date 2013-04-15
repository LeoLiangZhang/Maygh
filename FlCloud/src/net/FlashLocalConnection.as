package net
{
	import flash.events.StatusEvent;
	import flash.net.LocalConnection;
	
	import util.ObjectWrapper;
	import util.Bridge;
	
	public class FlashLocalConnection extends ObjectWrapper
	{
		private var connection:LocalConnection
		private var clientHandlers:Object;
		
		public function FlashLocalConnection()
		{
			super(); // don't put it at the end of the constructor, it will reset fields to null
			clientHandlers = {};
			connection = new LocalConnection();
			connection.client = clientHandlers;
			wrap(connection);
			connection.addEventListener(StatusEvent.STATUS,
				function(evt:StatusEvent){
					binder.jscall("dispatchEvent", StatusEvent.STATUS, 
						{level:evt.level, code: evt.code});
				});
			
		}
		
		public function addClientHandler(fname:String):void
		{
			clientHandlers[fname] = (function(){
				var name = fname;
				return function(...arguments){
					binder.jsapply(name, arguments);
				};
			})();
		}
	}
}