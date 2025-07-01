import jQuery from 'jquery';
import * as Sqrl from 'squirrelly/dist/browser/squirrelly.min.js';

import {
	debug,
	deepCopy,
	each,
	format,
	makeSubclass,
	outerHtml,
} from '../../util/misc.js';

import sqUtil from '../../util/squirrelly.js';

import {GridRenderer} from '../../grid_renderer.js';

// GridRendererSquirrelly {{{1

var GridRendererSquirrelly = makeSubclass('GridRendererSquirrelly', GridRenderer, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.config = deepCopy(Sqrl.defaultConfig);
	self.config.useWith = true;
});

// #_validateFeatures {{{2

GridRendererSquirrelly.prototype._validateFeatures = function () {
	var self = this;
	self.features.limit = false;
};


// #canRender {{{2

GridRendererSquirrelly.prototype.canRender = function (what) {
	return true;
};

// #_draw_plain {{{2

GridRendererSquirrelly.prototype._draw_plain = function (root, data, typeInfo, opts) {
	var self = this;
	var html = '';

	if (data.data.length === 0) {
		if (self.empty != null) {
			html += self.empty({}, self.config);
		}
	}
	else {
		if (self.before != null) {
			html += self.before({}, self.config);
		}

		if (self.item != null) {
			each(data.data, function (row) {
				var context = {};
				each(row.rowData, function (cell, field) {
					var fcc = self.colConfig.get(field) || {};
					var value = format(fcc, typeInfo.get(field), cell);
					if (value instanceof Element || value instanceof jQuery) {
						value = outerHtml(value);
					}
					context[field] = value;
				});
				html += self.item(context, self.config);
			});
		}

		if (self.after != null) {
			html += self.after({}, self.config);
		}
	}

	root.html(html);
};

// #_draw_group {{{2

GridRendererSquirrelly.prototype._draw_group = function (root, data, typeInfo, opts) {
	var self = this;
	var html = '';

	if (data.data.length === 0) {
		if (self.empty != null) {
			html += self.empty();
		}
	}
	else {
		if (self.before != null) {
			html += self.before();
		}

		if (self.item != null) {
			each(data.data, function (group, rowValIdx) {
				var context = {
					rowValIdx: rowValIdx
				};
				html += self.item(context, self.config);
			});
		}

		if (self.after != null) {
			html += self.after();
		}
	}

	root.html(html);
};

// #_draw_pivot {{{2

GridRendererSquirrelly.prototype._draw_pivot = function (root, data, typeInfo, opts) {
	var self = this;
	var html = '';

	if (data.data.length === 0) {
		if (self.empty != null) {
			html += self.empty();
		}
	}
	else {
		if (self.before != null) {
			html += self.before();
		}

		if (self.item != null) {
			each(data.data, function (group, rowValIdx) {
				if (self.beforeGroup != null) {
					html += self.beforeGroup();
				}
				each(group, function (pivot, colValIdx) {
					var div = jQuery('<div>').appendTo(root);
					var context = {
						rowValIdx: rowValIdx,
						colValIdx: colValIdx
					};
					html += self.item(context, self.config);
				});
				if (self.afterGroup != null) {
					html += self.afterGroup();
				}
			});
		}

		if (self.after != null) {
			html += self.after();
		}
	}

	root.html(html);
};

// #draw {{{2

GridRendererSquirrelly.prototype.draw = function (root, cont, opts) {
	var self = this;

	if (cont != null && typeof cont !== 'function') {
		throw new Error('Call Error: `cont` must be null or a function');
	}

	return self.super.draw(root, opts, function (ok, data, typeInfo) {
		if (!ok) {
			return cont();
		}

		sqUtil.addHelpers(Sqrl.helpers, data);

		var k1 = data.isPlain ? 'plain'
			: data.isGroup ? 'group'
			: data.isPivot ? 'pivot'
			: null;

		var configKey = data.isPlain ? 'whenPlain'
			: data.isGroup ? 'whenGroup'
			: data.isPivot ? 'whenPivot'
			: null;

		var config = self.opts[configKey] || {};

		each(['empty', 'before', 'beforeGroup', 'item', 'afterGroup', 'after'], function (x) {
			if (config[x] != null) {
				self[x] = Sqrl.compile(config[x], self.config);
			}
		});

		self['_draw_' + k1](root, data, typeInfo, opts);

		self.addWorkHandler();

		self.fire('renderEnd');
		self.drawLock.unlock();

		if (typeof cont === 'function') {
			return cont();
		}
	});
};

// #addWorkHandler {{{2

GridRendererSquirrelly.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on('workEnd', function (info, ops) {
		self.draw(self.root, null, self.drawOpts);
	}, { who: self, limit: 1 });
};

// Registry {{{1

GridRenderer.registry.set('squirrelly', GridRendererSquirrelly);
