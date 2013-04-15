package net
{
	import flash.events.NetStatusEvent;
	import flash.net.NetStream;
	
	import util.Binder;
	import util.Bridge;
	import util.ObjectWrapper;
	
	public class FlashStream extends ObjectWrapper
	{
		private var stream:NetStream;
		private var clientHandlers:Object;
		
		public function FlashStream()
		{
			clientHandlers = {};
			clientHandlers.onPeerConnect = function(subscriber:NetStream):Boolean
			{
				var ref:String = binder.jscall("_createStream");
				var fs:FlashStream = binder.bridge.getObject(ref);
				fs.initStream(subscriber);
				var accept:Boolean = binder.jscall('_onPeerConnect', fs.binder.remote_ref);
				Bridge.rawjstrace("Should accept?", accept);
				if(!accept)
					fs.binder.destroy();
				return accept;
			}
		}
		
		public function initConnection(ref_connection:String, peerID:String):void
		{
//			Bridge.rawjstrace("initConnection", ref_connection, peerID);
			var fconn:FlashConnection = binder.bridge.getObject(ref_connection) as FlashConnection;
//			Bridge.rawjstrace(fconn != null);
			try{
				Bridge.rawjstrace("new NetStream");
				this.stream = new NetStream(fconn.connection, peerID);
			} catch (e){
				Bridge.rawjstrace(e.message, e.name);
				throw e;
			}
//			Bridge.rawjstrace("NetStream Created");
			this.init();
		}
		
		public function initStream(_ns:NetStream):void
		{
			this.stream = _ns;
			this.init();
		}

		private function init():void
		{
			wrap(stream);
			stream.addEventListener(NetStatusEvent.NET_STATUS, 
				function(evt:NetStatusEvent){
					binder.jscall("dispatchEvent", NetStatusEvent.NET_STATUS, 
						evt.info);
				});
//			stream.onPeerConnect = this.clientHandlers.onPeerConnect;
			stream.client = clientHandlers;
			Bridge.rawjstrace("NetStream done init.");
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