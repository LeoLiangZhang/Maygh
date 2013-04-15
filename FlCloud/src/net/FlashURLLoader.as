package net
{
	import flash.events.*;
	import flash.net.URLLoader;
	
	import util.ObjectWrapper;
	
	public class FlashURLLoader extends ObjectWrapper
	{
		private var loader:URLLoader;
		private var _responseURL:String;
		private var _responseHeaders:Array;
		private var _status = 0;
		
		public function FlashURLLoader()
		{
			super();
			
			loader = new URLLoader();
			configureListeners(loader);
			wrap(loader);
			
		}
		
//		public function readEventString(){
//			return [
//				Event.COMPLETE,
//				Event.OPEN,
//				ProgressEvent.PROGRESS,
//				SecurityErrorEvent.SECURITY_ERROR,
//				HTTPStatusEvent.HTTP_STATUS,
//				HTTPStatusEvent.HTTP_RESPONSE_STATUS,
//				IOErrorEvent.IO_ERROR,
//				];
//			// ["complete", "open", "progress", "securityError", "httpStatus", undefined, "ioError"]
//		}
		
		public function load(ref:String):void{
			var flrequest:FlashURLRequest = binder.bridge.getObject(ref);
			this.loader.load(flrequest.request);
		}
		
		private function configureListeners(dispatcher:IEventDispatcher):void {
			dispatcher.addEventListener(Event.COMPLETE, completeHandler);
			dispatcher.addEventListener(Event.OPEN, openHandler);
			dispatcher.addEventListener(ProgressEvent.PROGRESS, progressHandler);
			dispatcher.addEventListener(SecurityErrorEvent.SECURITY_ERROR, securityErrorHandler);
			dispatcher.addEventListener(HTTPStatusEvent.HTTP_STATUS, httpStatusHandler);
//			dispatcher.addEventListener(HTTPStatusEvent.HTTP_RESPONSE_STATUS, httpResponseStatusHandler);
			dispatcher.addEventListener(IOErrorEvent.IO_ERROR, ioErrorHandler);
		}
		
		private function completeHandler(event:Event):void {
//			var loader:URLLoader = URLLoader(event.target);
			trace("completeHandler: " + loader.data);
			binder.jscall("dispatchEvent", Event.COMPLETE, {});
		}
		
		private function openHandler(event:Event):void {
			trace("openHandler: " + event);
			binder.jscall("dispatchEvent", Event.OPEN, {});
		}
		
		private function progressHandler(event:ProgressEvent):void {
			trace("progressHandler loaded:" + event.bytesLoaded + " total: " + event.bytesTotal);
			binder.jscall("dispatchEvent", ProgressEvent.PROGRESS, {
				bytesLoaded		:event.bytesLoaded,
				bytesTotal		:event.bytesTotal
			});
		}
		
		private function securityErrorHandler(event:SecurityErrorEvent):void {
			trace("securityErrorHandler: " + event);
			binder.jscall("dispatchEvent", SecurityErrorEvent.SECURITY_ERROR, {
				text			:event.text
			});
		}
		
		private function httpStatusHandler(event:HTTPStatusEvent):void {
			trace("httpStatusHandler: " + event);
			_status = event.status;
			binder.jscall("dispatchEvent", HTTPStatusEvent.HTTP_STATUS, {
				status			:event.status
//				responseURL		:event.responseURL,
//				responseHeaders	:event.responseHeaders
			});
		}
		
		private function httpResponseStatusHandler(event:HTTPStatusEvent):void{
			trace("httpResponseStatusHandler: " + event);
			_responseURL = event.responseURL;
			_responseHeaders = event.responseHeaders;
			_status = event.status;
			binder.jscall("dispatchEvent", HTTPStatusEvent.HTTP_RESPONSE_STATUS, {
				responseURL		:event.responseURL,
				responseHeaders	:event.responseHeaders,
				status			:event.status
			});
		}
		
		private function ioErrorHandler(event:IOErrorEvent):void {
			trace("ioErrorHandler: " + event);
			binder.jscall("dispatchEvent", IOErrorEvent.IO_ERROR, {
				text			:event.text
			});
		}
	}
}