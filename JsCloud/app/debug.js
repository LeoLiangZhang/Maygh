//#import cloud.js

//var bridge = new Bridge();
var flobj_id = "flCloud";
var fl_path = "fl/flCloud.swf";
var serverAddress = 'rtmfp://'+location.hostname+'/';

var lc, pm, bridge, msgr, pl;
function test_LocalConnection(){
	lc = new FlashLocalConnection(bridge);
	lc.message = function(){log.debug('lc message', arguments);};
	lc.addClientHandler('message');
	lc.addEventListener('status', function(evt){log.debug('lc status', evt);});
}

function test_LocalMessenger(){
	msgr = new FlashLocalMessenger(bridge);
	msgr.addEventListener('message', function(evt){
		log.debug('msgr message', evt);
	});
}

var verbose = function(){
	log.debug(arguments);
};

function test_peer(){


	pm = new FlashPeerManager(bridge);
	pm.addEventListener('connected', function(connection){
		log.info('Connected to server', pm.nearID);
	});

	messenger = new FlashPeerMessenger(pm);
	messenger.addEventListener('message', function(evt){
		log.info(evt.farID, "sent", evt.msg);
	});
	pm.connectServer(serverAddress);

}

function test_PeerLoader(){
	pl = new PeerLoader(bridge);
	pl.pm.addEventListener('connected', function(connection){
		pl.load(new Loading(img_key, img_key, load_callback));
	});
	pl.connect(serverAddress);

}

function load_callback(){
	log.debug('load_callback', arguments);
}

var img_key = 'data/1.data';

function main(msg){
	log.debug(msg);
	jstrace = function(){
//		console.log(arguments);
	}; // disable flash rawjstrace.

	bridge = new Bridge(flobj_id);
//	test_peer();
//	test_LocalConnection();
//	test_LocalMessenger();

	test_PeerLoader();

}

function jsmain(){
	function onload_flash(e){
		// NOTE: the swf file loaded does NOT mean that the script
		// is init.
	};

	var onflashinit = "__onFlashInit_" +getTime();
	window[onflashinit] = main;
	function onload_swfobjects(){
		swfobject.embedSWF(fl_path, flobj_id,
				"100%", "400px", "10.1.0", "playerProductInstall.swf",
				{main_callback: onflashinit}, //Flash Vars
				{allowscriptaccess: "always"}, {},
				onload_flash);
	};

	window.addEventListener('load', function(){
		onload_swfobjects();
	}, false);
}

jsmain();