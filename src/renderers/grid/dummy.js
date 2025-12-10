// Imports {{{1

import _ from 'underscore';
import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import {
	deepDefaults,
	makeSubclass,
} from '../../util/misc.js';

import {GridRenderer} from '../../grid_renderer.js';

// GridRendererDummy {{{1
// Constructor {{{2

/**
 * A dummy grid renderer that can be useful for testing, or as an example of how to start writing a
 * new renderer.
 *
 * @class
 * @extends GridRenderer
 *
 * @property {Grid~Features} features
 *
 * @property {object} defn
 *
 * @property {ComputedView} view
 *
 * @property {Element} root
 *
 * @property {object} colConfig Map associating field name with the configuration of the
 * corresponding column in this grid table.
 *
 * @property {Timing} timing
 *
 * @property {boolean} needsRedraw True if the grid needs to redraw itself when the view is done
 * working.
 */

var GridRendererDummy = makeSubclass('GridRendererDummy', GridRenderer, function (grid, defn, view, features, opts, timing, id) {
	var self = this;

	opts = deepDefaults(opts, {
		msg: 'DUMMY'
	});

	self.super.ctor.apply(self, arguments);
});

// #canRender {{{2

GridRendererDummy.prototype.canRender = function (what) {
	return true;
};

// #draw {{{2

GridRendererDummy.prototype.draw = function (root, opts, cont) {
	var self = this
		, args = Array.prototype.slice.call(arguments);

	return self.super.draw(root, opts, function (ok, data, typeInfo, andThen) {
		if (!ok) {
			return cont();
		}

		root.append(jQuery('<h1>').text(self.opts.msg));
		return andThen(cont);
	});
};

// Registry {{{2

GridRenderer.registry.set('dummy', GridRendererDummy);

// Exports {{{1

export {
	GridRendererDummy,
};