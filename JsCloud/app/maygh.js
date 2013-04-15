//#import cloud.js

// NOTE: Please also include swfobject.js in your page.

function Maygh(config){
  var self = this;
  
  // config
  var flobj_id = config.flobj_id || "flCloud";
  var fl_path = config.fl_path || "fl/flCloud.swf";
  var serverAddress = config.serverAddress || 'rtmfp://'+location.hostname+'/';
  
  var pl = null; // PeerLoader;
  
  self.ready = false;
  self.load = function(content_hash, dom_id, url){
    if(!self.ready){
      throw new Error("Maygh is not ready.");
    }
    self.load(new Loading(content_hash, url, function(loading){
      var elm = document.getElementById(dom_id);
      if(md5.hex_md5(loading.data) == content_hash){
        elm.src = loading.data;
      } else {
        console.error('Detected forged content.', content_hash);
      }
    }));
  };
  self.onready = function(){};

  function initPeerLoader(){
  	pl = new PeerLoader(bridge);
  	pl.pm.addEventListener('connected', function(connection){
      pl.ready = true;
      self.onready(); // TODO: use EventListenerMixin
    });
  	pl.connect(serverAddress);
    
  }

  var main = function(msg){
    // This function will be called when flash has inited. 
  	var jstrace = window.jstrace = function(){
  //		console.log(arguments);
  	}; // disable flash rawjstrace.

  	var bridge = new Bridge(flobj_id);

  	initPeerLoader();
  };

  function jsmain(){
  	var onflashinit = "__onFlashInit_" +getTime();
  	window[onflashinit] = main;
  	function onload_swfobjects(){
      if(!document.getElementById(flobj_id)){
        var div = document.createElement('div');
        div.id = flobj_id;
        document.body.append(div);
      }
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
}
