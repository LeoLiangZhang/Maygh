var proxy = require('./proxy.js');

proxy.start({port: 8080}, function(p){
	p.tamper(/\.html/, enableCloudCDN);
	p.tamper(/\/$/, enableCloudCDN);
	p.tamper(/CloudCDN/, function(request){
		console.log('hit', request);
		request.headers['port'] = 8000;
		request.headers['host'] = 'localhost';
	});
});

function enableCloudCDN(request){
	delete request.headers['if-none-match'];

	if(!request.req.connection.remoteAddress.match(/^129\.10/)){
        //      request.host = 'webcloud.ccs.neu.edu';
        request.headers.host = 'webcloud.ccs.neu.edu';
        request.url = 'http://webcloud.ccs.neu.edu/sorry.html';
        return;
    }

	request.onResponse(function (response){
		console.log('hit\n', request, response);
		var content = response.body;
		content = content.replace(/(<img [^<]*src)=/ig, "$12=");
		content = content.replace(/\<\/head\>/i,
				'<script type="text/javascript" src="/CloudCDN/flash/swfobject.js"></script>'+
				'<script type="text/javascript" src="/CloudCDN/md5.js"></script>'+
				'<script type="text/javascript" src="/CloudCDN/flCloudCDN.js"></script></head>');

//		if(response.statusCode == 304)
//			response.statusCode = 200;
		response.body = content;
		response.complete();
	});
}