package
{
	
	import flash.display.LoaderInfo;
	import flash.display.MovieClip;
	import flash.external.ExternalInterface;
	import flash.utils.getDefinitionByName;
	
	import util.Bridge;

	public class MainSprite extends MovieClip
	{
		private var bridge:Bridge;
		
		public function MainSprite()
		{			 
			super();
			this.init();
		}
		
		private function init():void
		{
			ExternalInterface.marshallExceptions = true;
			
			var params = LoaderInfo(this.root.loaderInfo).parameters;
			var main_callback:String = params.main_callback || "main";
			
			this.bridge = Bridge.Instance;		
			this.bridge.init();
		
			
			
			ExternalInterface.call.apply(null, [main_callback, 
				'FlCloud ver.0.1 rev.17.3']);
			
		}
	}
}