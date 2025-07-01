import moment from 'moment';
import numeral from 'numeral';

import {
	dataURItoBlob,
	debug,
	deepCopy,
	deepDefaults,
	getProp,
	loadScript,
	log,
	makeSubclass,
	mixinEventHandling,
	setProp,
} from './util/misc.js';
import {AggregateInfo} from './aggregates';
import {GROUP_FUNCTION_REGISTRY} from './group_fun.js';

// GraphRenderer {{{1

var GraphRenderer = makeSubclass('GraphRenderer', Object, function (graph, elt, view, opts) {
	var self = this;

	self.graph = graph;
	self.elt = elt;
	self.view = view;
	self.opts = opts;
});

mixinEventHandling(GraphRenderer, [
'draw'
]);

// #toString {{{2

GraphRenderer.prototype.toString = function () {
	var self = this;

	return '#<GraphRenderer "' + self.graph.id + '">';
};

// #_validateConfig {{{2

GraphRenderer.prototype._validateConfig = function () {

	['Plain', 'Group', 'Pivot'].forEach(function (kind) {
		var propName = 'when' + kind;

		if (config[propName] == null) {
			return; // It's OK to be undefined.
		}

		var config = config[propName];

		if (typeof config !== 'function' && typeof config !== 'object') {
			//self.error(kind + ' configuration must be a function or an object');
			config[propName] = null;
			return;
		}
	});
};

// #addRedrawHandlers {{{2

GraphRenderer.prototype.addRedrawHandlers = function () {
	var self = this;

	debug.info('GRAPH // RENDER', 'Adding redraw handlers');

	self.view.off('workEnd', self);
	self.view.on('workEnd', function () {
		debug.info('GRAPH RENDERER // HANDLER (View.dataUpdated)',
			'Redrawing graph because the view has finished doing work');
		self.draw();
	}, { who: self });
};

// Exports {{{1

export {
	GraphRenderer,
};
