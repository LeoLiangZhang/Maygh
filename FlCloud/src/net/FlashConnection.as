package net
{
	import flash.events.AsyncErrorEvent;
	import flash.events.IOErrorEvent;
	import flash.events.NetStatusEvent;
	import flash.events.SecurityErrorEvent;
	import flash.net.NetConnection;
	import flash.net.NetStream;
	import flash.net.Responder;
	import flash.utils.Dictionary;
	
	import util.Binder;
	import util.Bridge;
	import util.ObjectWrapper;
	
	public class FlashConnection extends ObjectWrapper
	{
		public var connection:NetConnection;
		
		public function FlashConnection()
		{
			connection = new NetConnection();
			wrap(connection);
			connection.addEventListener(NetStatusEvent.NET_STATUS, 
				function(evt:NetStatusEvent){
					binder.jscall("dispatchEvent", NetStatusEvent.NET_STATUS, 
						evt.info);
				});
//			connection.addEventListener(AsyncErrorEvent.ASYNC_ERROR, 
//				function(evt:AsyncErrorEvent){
//					binder.jscall("dispatchEvent", AsyncErrorEvent.ASYNC_ERROR, 
//						evt.text);
//				});
//			connection.addEventListener(IOErrorEvent.IO_ERROR, 
//				function(evt:IOErrorEvent){
//					binder.jscall("dispatchEvent", IOErrorEvent.IO_ERROR, 
//						evt.text);
//				});
//			connection.addEventListener(SecurityErrorEvent.SECURITY_ERROR, 
//				function(evt:SecurityErrorEvent){
//					binder.jscall("dispatchEvent", SecurityErrorEvent.SECURITY_ERROR, 
//						evt.text);
//				});
			
		}
		
		public function remoteCall(command:String, responder:String, args:Array) :void
		{
			var rsp = null;
			var ref = responder;
			if(responder){
				rsp = new Responder(
					function(...arguments){ // result
//						Bridge.rawjstrace('RESPONDER result', arguments);
						binder.bridge.jsapply(ref, 'result', arguments);
						binder.bridge.jscall(Bridge.SelfID, 'remove', ref);
					},function(...arguments){ // status
//						Bridge.rawjstrace('RESPONDER status', arguments);
						binder.bridge.jsapply(ref, 'status', arguments);
						binder.bridge.jscall(Bridge.SelfID, 'remove', ref);
					});
			}
			args.unshift(rsp);
			args.unshift(command);
//			Bridge.rawjstrace('REMOTE_CALL_START', args);
			connection.call.apply(connection, args);
//			Bridge.rawjstrace('REMOTE_CALL_END', args);
		}
		
	}
}