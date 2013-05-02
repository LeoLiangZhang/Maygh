# Maygh

Maygh is a system that builds a content distribution network from client web browsers, without the need for additional plugins or client-side software. 

A techniqical paper ([*Maygh: Building a CDN from client web browsers*](http://www.ccs.neu.edu/home/liang/paper/Maygh-EuroSys-13/Maygh-EuroSys.pdf)) is presented in EuroSys'13, at Prague. 

## Quick Start

### Preparation

There is no need to install, just copy the whole folder. In order to run the Maygh coordinator, you need to have [Node.js 0.5.2](http://nodejs.org/dist/v0.5.2/). Yes, it's a old version, I know, hopefully I will have time to upgrade it to the latest Node release.

### Run the coordinator

    cd Coordinator && node cloudcdn2.js

### Include Maygh script

You have to include the following two scripts in the page which you want to use Maygh.

* `Maygh.js`    (In JsCloud/out/)
* `swfobject.js`  (You might find this in JsCloud/lib/ or https://code.google.com/p/swfobject/)

And put `flCloud.swf` in your server, such as `fl/flCloud.swf`. 

### Load content

To load content via Maygh, first create a Maygh object, then load, such as:

    var maygh = new Maygh();
    maygh.load(content_hash, dom_id, url);

## Acknowledgements

We want to thank [ArcusNode](https://github.com/OpenRTMFP/ArcusNode), on which our coordinator is based. 

