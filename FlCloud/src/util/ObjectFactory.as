package util
{
	import flash.utils.getDefinitionByName;
	
	import net.FlashConnection; FlashConnection;
	import net.FlashStream; FlashStream;
	import net.FlashLocalConnection; FlashLocalConnection;
	import net.FlashURLRequest; FlashURLRequest;
	import net.FlashURLLoader; FlashURLLoader;
	
	public class ObjectFactory
	{
		public function ObjectFactory()
		{
			
		}
		
		public static function createObject(classname):Object
		{
			var Cls:Class = getDefinitionByName(classname) as Class;
			var obj = new Cls();
			return obj;
		}
	}
}