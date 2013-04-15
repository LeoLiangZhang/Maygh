// JavaScript Language extension.

/**
 * Return an array of given array_like object.
 * @param array_like {Object} Can be access by array_like[i], i in [start, end)
 * @param start {int} Inclusive start index.
 * @param end {int} Exclusive end index.
 */
toArray = function(array_like, start, end){
	var len = array_like.length;
	if(len < 0)
		throw new Error("Object does NOT have length property.");
	start = start >= 0 ? start : 0;
	end = end >= 0 ? end : len;
	var lst = [];

	for(var i = start; i < end; i++){
		lst.push(array_like[i]);
	}
	return lst;
};

// https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/forEach
// Production steps of ECMA-262, Edition 5, 15.4.4.18
// Reference: http://es5.github.com/#x15.4.4.18
if (!Array.prototype.forEach) {

	Array.prototype.forEach = function(callback, thisArg) {

		var T, k;

		if (this == null) {
			throw new TypeError(" this is null or not defined");
		}

		// 1. Let O be the result of calling ToObject passing the |this| value
		// as the argument.
		var O = Object(this);

		// 2. Let lenValue be the result of calling the Get internal method of O
		// with the argument "length".
		// 3. Let len be ToUint32(lenValue).
		var len = O.length >>> 0; // Hack to convert O.length to a UInt32

		// 4. If IsCallable(callback) is false, throw a TypeError exception.
		// See: http://es5.github.com/#x9.11
		if ({}.toString.call(callback) != "[object Function]") {
			throw new TypeError(callback + " is not a function");
		}

		// 5. If thisArg was supplied, let T be thisArg; else let T be
		// undefined.
		if (thisArg) {
			T = thisArg;
		}

		// 6. Let k be 0
		k = 0;

		// 7. Repeat, while k < len
		while (k < len) {

			var kValue;

			// a. Let Pk be ToString(k).
			// This is implicit for LHS operands of the in operator
			// b. Let kPresent be the result of calling the HasProperty internal
			// method of O with argument Pk.
			// This step can be combined with c
			// c. If kPresent is true, then
			if (k in O) {

				// i. Let kValue be the result of calling the Get internal
				// method of O with argument Pk.
				kValue = O[k];

				// ii. Call the Call internal method of callback with T as the
				// this value and
				// argument list containing kValue, k, and O.
				callback.call(T, kValue, k, O);
			}
			// d. Increase k by 1.
			k++;
		}
		// 8. return undefined
	};
}

if (!Object.keys) {
    Object.keys = (function () {
        var hasOwnProperty = Object.prototype.hasOwnProperty,
            hasDontEnumBug = !({
                toString: null
            }).propertyIsEnumerable('toString'),
            dontEnums = ['toString', 'toLocaleString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'constructor'],
            dontEnumsLength = dontEnums.length;

        return function (obj) {
            if (typeof obj !== 'object' && typeof obj !== 'function' || obj === null) throw new TypeError('Object.keys called on non-object')

            var result = [];

            for (var prop in obj) {
                if (hasOwnProperty.call(obj, prop)) result.push(prop);
            }

            if (hasDontEnumBug) {
                for (var i = 0; i < dontEnumsLength; i++) {
                    if (hasOwnProperty.call(obj, dontEnums[i])) result.push(dontEnums[i])
                }
            }
            return result;
        };
    })();
};

/**
 * Extend obj attributes with given args.
 *
 * @param obj {Object}
 * @param args {Object[]}
 * @returns
 */
extend = function(obj) {
	var len = arguments.length;
	for ( var i = 1; i < len; i++) {
		var source = arguments[i];
		for ( var prop in source) {
			obj[prop] = source[prop];
		}
	}
	return obj;
};

if (!Object.create) {
	Object.create = function(o) {
		function F() {};
		F.prototype = o;
		if (arguments.length > 1){
			var obj = F.prototype;
			var len = arguments.length;
			for ( var i = 1; i < len; i++) {
				extend(obj, arguments[i]);
			}
		}
		return new F();
	};
}

inherits = function(ctor, superCtor) {
	ctor.super_ = superCtor;
	ctor.prototype = Object.create(superCtor.prototype, {
		constructor : {
			value : ctor,
			enumerable : false,
			writable : true,
			configurable : true
		}
	});
};

