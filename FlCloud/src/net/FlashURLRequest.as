package net
{
	import flash.net.URLRequest;
	
	import util.Bridge;
	import util.ObjectWrapper;
	
	public class FlashURLRequest extends ObjectWrapper
	{
		public var request:URLRequest;
		
		public function FlashURLRequest()
		{
			super();
			request = new URLRequest();
			wrap(request);
		}
		
	}
}