import jQuery from 'jquery';
import Handlebars from 'handlebars';

import {
	debug,
	deepCopy,
	getPropDef,
	I,
	log,
	makeSubclass,
	mixinEventHandling,
} from './util/misc.js';

import OrdMap from './util/ordmap.js';
import Lock from './util/lock.js';
import {ComputedView} from './computed_view.js';

// GridRenderer {{{1

// Constructor {{{2

/**
 * @param {Grid} grid
 *
 * @param {object} defn
 *
 * @param {ComputedView} view
 *
 * @param {object} features
 *
 * @param {object} opts
 *
 * @param {Timing} timing
 *
 * @param {string} id
 *
 * @class
 */

var GridRenderer = (function () {
	var UNIQUE_ID = 0;

	return makeSubclass('GridRenderer', Object, function (grid, defn, view, features, opts, timing, id, colConfig) {
		var self = this;

		self.UNIQUE_ID = UNIQUE_ID++;

		self.id = id;
		self.grid = grid;
		self.defn = defn;
		self.view = view;
		self.features = deepCopy(features);
		self.opts = opts;
		self.timing = timing;
		self.colConfig = colConfig;
		self.hasRendered = false;

		self._validateFeatures();

		self.drawLock = new Lock('GridRenderer/draw');

		self.grid.on('colConfigUpdate', function (newColConfig) {
			console.debug('[DataVis // GridRenderer // Handler(colConfigUpdate)] Received new colConfig: %O', newColConfig);
			self.colConfig = newColConfig;
			if (self.hasRendered) {
				console.debug('[DataVis // GridRenderer // Handler(colConfigUpdate)] Redrawing with new colConfig');
				self.draw(self.root, self.drawOpts);
			}
		}, { who: self });
	});
})();

// FIXME: We don't need all these, we only need "unableToRender."  However, mixinEventHandling()
// can't traverse the class hierarchy, so trying to subscribe to "unableToRender" from a GridTable
// will not work (because "unableToRender" isn't in the GridTable subclass' event list).  So for a
// quick workaround, we just put all the events that any subclass may use here.  But the real fix
// should be to make mixinEventHandling() traverse up the superclass chain.

mixinEventHandling(GridRenderer, [
		'columnResize'        // A column is resized.
	, 'unableToRender'      // A grid renderer can't render the data in the view it's bound to.
	, 'limited'             // The grid table isn't rendering all possible rows.
	, 'unlimited'           // The grid table is rendering all possible rows.
	, 'csvReady'            // CSV data has been generated.
	, 'generateCsvProgress' // CSV generation progress.
	, 'renderBegin'
	, 'renderEnd'
	, 'selectionChange'
]);

// #canRender {{{2

GridRenderer.prototype.canRender = function () {
	throw new Error('ABSTRACT');
};

// #draw {{{2

GridRenderer.prototype.draw = function (root, opts, cont1) {
	var self = this;
	var args = Array.prototype.slice.call(arguments);

	console.debug('[DataVis // GridRenderer // Draw] Beginning draw operation; opts = %O', opts);

	opts = opts || {};

	self.root = root;
	self.drawOpts = opts;

	if (self.drawLock.isLocked()) {
		return self.drawLock.onUnlock(function () {
			GridRenderer.prototype.draw.apply(self, args);
		});
	}

	self.drawLock.lock();

	self.clear();

	return self.view.getData(function (ok, data) {
		if (!ok) {
			return cont1(false);
		}

		console.debug('[DataVis // GridRenderer // Draw] Data = %O', data);

		return self.view.getTypeInfo(function (ok, typeInfo) {
			if (!ok) {
				return cont1(false);
			}

			if (data == null || typeInfo == null) {
				log.error('Provided data or typeInfo is null');
				return cont1(false);
			}

			console.debug('[DataVis // GridRenderer // Draw] TypeInfo = %O', typeInfo.asMap());

			if ((data.isPlain && !self.canRender('plain'))
					|| (data.isGroup && !self.canRender('group'))
					|| (data.isPivot && !self.canRender('pivot'))) {

				console.debug('[DataVis // GridRenderer // Draw] Unable to render data using current grid table: { isPlain = %s ; isGroup = %s ; isPivot = %s }', data.isPlain, data.isGroup, data.isPivot);

				return self.fire('unableToRender');
			}

			self.hasRendered = true;
			self.fire('renderBegin');

			self.data = data;
			self.typeInfo = typeInfo;

			self.timing.start(['Grid Renderer', 'Draw']);

			return cont1(true, data, typeInfo, function (cont2) {
				self.fire('renderEnd');
				if (self.drawLock._lockCount > 0) {
					self.drawLock.unlock();
				}

				if (typeof cont2 === 'function') {
					return cont2();
				}
			});
		});
	});
};

// #clear {{{2

/**
 * Remove the table from page.
 */

GridRenderer.prototype.clear = function () {
	var self = this;

	self.root.children().remove();
};

// #destroy {{{2

GridRenderer.prototype.destroy = function () {
	var self = this;

	self.clear();
	self.grid.off('*', self);
};

// #toString {{{2

GridRenderer.prototype.toString = function () {
	var self = this;

	return 'GridRenderer(' + self.UNIQUE_ID + ')';
};

// #_validateFeatures {{{2

GridRenderer.prototype._validateFeatures = function () {
	return true;
};

// #hasOperations {{{2

/**
 * Indicates if there are operations registered for the requested situation.
 *
 * @param {string} type
 * What type of operations we're checking for: "cell", "row", "all", "group", or "pivot".
 *
 * @param {string} [field]
 * When `type` is "cell", this is the field we want to know about.
 *
 * @example
 * hasOperations('all')
 * hasOperations('cell', 'Employee')
 */

GridRenderer.prototype.hasOperations = function (type, field) {
	var self = this;

	if (!self.features.operations) {
		return false;
	}

	switch (type) {
	case 'all':
		return getPropDef(0, self.defn, 'operations', 'all', 'length') > 0
	case 'row':
		return getPropDef(0, self.defn, 'operations', 'row', 'length') > 0
	case 'cell':
		return getPropDef(0, self.defn, 'operations', 'cell', field, 'length') > 0
	default:
		return false;
	}
};

GridRenderer.prototype.clearRenderCache = function (cols) {
	var self = this;

	if (self.data != null) {
		if (self.data.isPlain) {
			self.data.data.forEach(function (row) {
				if (cols != null) {
					cols.forEach(function (c) {
						row.rowData[c].cachedRender = null;
					});
				}
				else {
					Object.values(row.rowData).forEach(function (c) {
						c.cachedRender = null;
					});
				}
			});
		}
		else if (self.data.isGroup) {
			// do nothing
		}
		else if (self.data.isPivot) {
			// do nothing
		}
	}
};

// Registry {{{1

GridRenderer.registry = new OrdMap();

// Exports {{{1

export {
	GridRenderer
};
