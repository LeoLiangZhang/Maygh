/**
 * Create a LRUStorage obj. This is a wrapper of original storage.
 * The storage is http://dev.w3.org/html5/webstorage/
 * @constructor
 * @param {Storage} storage The under hook storage obj.
 */
var WC_DEBUG = true;
function LRUStorage(storage) {
	if (!window.localStorage) {
		if (WC_DEBUG) log.error('localStorage not supported.');
	}

	this._storage = storage || window.localStorage;
};
LRUStorage.STORAGE_ITME_LIST_KEY = "LOCAL_LIST";
LRUStorage.prototype = {

		getItem: function (key) {
			var val = this._storage.getItem(key);
			if (!val) return val;

			// key exist
			var ilist = this._getItemList();
			var list = [];
			for (var i = 0, j = ilist.length; i < j; i++) {
				var it = ilist[i];
				if (it == key) continue;
				list.push(it);
			}
			list.push(key);
			this._updateItemList(list);
			return val;
		},

		setItem: function (key, data) {
			var ilist = this._getItemList();
			var list = [];
			for (var i = 0, j = ilist.length; i < j; i++) {
				var it = ilist[i];
				if (it == key) continue;
				list.push(it);
			}
			list.push(key);
			while (list) {
				try {
					this._storage.setItem(key, data);
					break;
				}
				catch (e) {
					// in Chrome e.name=='QUOTA_EXCEEDED_ERR'
					var di = list.shift();
					this._storage.removeItem(di);
					if (WC_DEBUG) log.log('QUOTA_EXCEEDED_ERR: ' + key + ", remove: " + di);
				}
			}
			this._updateItemList(list);
		},
		removeItem: function (key) {

			// key exist
			var ilist = this._getItemList();
			var list = [];
			for (var i = 0, j = ilist.length; i < j; i++) {
				var it = ilist[i];
				if (it == key) continue;
				list.push(it);
			}
			this._storage.removeItem(key);
			this._updateItemList(list);
		},
		itemList: function () {
			return this._getItemList();
		},
		_getItemList: function () {
			var itemlistkey = LRUStorage.STORAGE_ITME_LIST_KEY;
			var str = this._storage.getItem(itemlistkey);
			var itemlist = null;
			if (str === undefined || str == null) {
				itemlist = [];
				str = JSON.stringify(itemlist);
				this._storage.setItem(itemlistkey, str);
			} else {
				itemlist = JSON.parse(str);
			}
			return itemlist;
		},
		_updateItemList: function (itemlist) {
			var itemlistkey = LRUStorage.STORAGE_ITME_LIST_KEY;
			//var itemlist = this._storage.getItem(itemlistkey);
			var list = itemlist;
			while (list) {
				var str = JSON.stringify(list);
				try {
					this._storage.setItem(itemlistkey, str);
					break;
				}
				catch (e) {
					var ets = typeof e;
					if (ets == 'QUOTA_EXCEEDED_ERR') {
						var di = list.shift();
						this._storage.removeItem(di);
						if (WC_DEBUG) log.log('QUOTA_EXCEEDED_ERR: _updateItemList: remove: ' + di);
					} else {
						if (WC_DEBUG) log.error('LRUStorage: ' + e); // Something weird happen.
						break;
					}
				}
			}
		}
};
