//#import flash.interop.js

function FlashURLRequest(bridge){
	bridge.shadow(this, "net.FlashURLRequest");
};

extend(FlashURLRequest.prototype,
		Binder.BindingMixin,
		Binder.shadowMethods(["getProperty", "setProperty"]));


function FlashURLLoader(bridge){
	bridge.shadow(this, "net.FlashURLLoader");
	// events: ["complete", "open", "progress", "securityError",
	//          "httpStatus", undefined, "ioError"]
};

extend(FlashURLLoader.prototype,
		EventListenerMixin,
		Binder.BindingMixin,
		Binder.shadowMethods(["getProperty", "setProperty"]),
		Binder.wrappedMethods(["close"]));

FlashURLLoader.prototype.load = function(request){
	var ref = request.binder.remote_ref;
	return this.binder.flapply("load", [ref]);
};

FlashURLLoader.prototype.getData = function(){
	return this.getProperty('data');
};

//FlashURLLoader.prototype.dispatchEvent = function(){
//	var args = toArray(arguments);
//	log.debug(args);
//	EventListenerMixin.dispatchEvent.apply(this, args);
//};


var FlashURL = {};

FlashURL.setBridge = function(bridge){
	FlashURL.bridge = bridge;
};

FlashURL.getBridge = function(){
	return FlashURL.bridge;
};

FlashURL.ajax = function(url, settings){
	settings = settings || {};
	if(typeof(url) === 'string'){
		settings.url = url;
	}

	var bridge = settings.bridge || FlashURL.getBridge();
	if(!bridge) throw new Error('Flash bridge not found.');

	var $j = jQuery || window.jQuery;
	if(!$j) throw new Error('jQuery not found.');
	var deferred = new $j.Deferred();

	var request = new FlashURLRequest(bridge);
	request.setProperty('url', settings.url);

	var loader = new FlashURLLoader(bridge);
	loader.load(request);

	// "complete", "open", "progress", "securityError",
	//          "httpStatus", undefined, "ioError"]

	loader.addEventListener("complete", function(evt){
		log.debug("FlashURL Ajax complete", evt);
		evt.loader = loader;
		deferred.resolve(evt);
	});
	loader.addEventListener("open", function(evt){
		log.debug("FlashURL Ajax open", evt);
		evt.loader = loader;
	});
	loader.addEventListener("progress", function(evt){
		log.debug("FlashURL Ajax progress", evt);
	});
	loader.addEventListener("securityError", function(evt){
		log.debug("FlashURL Ajax securityError", evt);
		evt.loader = loader;
		deferred.reject(evt);
	});
	loader.addEventListener("httpStatus", function(evt){
		log.debug("FlashURL Ajax httpStatus", evt);
	});
	loader.addEventListener("ioError", function(evt){
		log.debug("FlashURL Ajax ioError", evt);
		evt.loader = loader;
		deferred.reject(evt);
	});


	return deferred.promise();
};
