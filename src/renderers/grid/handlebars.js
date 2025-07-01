import Handlebars from 'handlebars';

import jQuery from 'jquery';

import {
	debug,
	deepCopy,
	each,
	format,
	makeSubclass,
	outerHtml,
} from '../../util/misc.js';

import hbUtil from '../../util/handlebars.js';

import {GridRenderer} from '../../grid_renderer.js';

// GridRendererHandlebars {{{1

var GridRendererHandlebars = makeSubclass('GridRendererHandlebars', GridRenderer, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.hbEnv = hbUtil.makeEnv();
});

// #_validateFeatures {{{2

GridRendererHandlebars.prototype._validateFeatures = function () {
	var self = this;
	self.features.limit = false;
};


// #canRender {{{2

GridRendererHandlebars.prototype.canRender = function (what) {
	return true;
};

// #_draw_plain {{{2

GridRendererHandlebars.prototype._draw_plain = function (root, data, typeInfo, opts) {
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
				html += self.item(context);
			});
		}

		if (self.after != null) {
			html += self.after();
		}
	}

	root.html(html);
};

// #_draw_group {{{2

GridRendererHandlebars.prototype._draw_group = function (root, data, typeInfo, opts) {
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
				html += self.item(context);
			});
		}

		if (self.after != null) {
			html += self.after();
		}
	}

	root.html(html);
};

// #_draw_pivot {{{2

GridRendererHandlebars.prototype._draw_pivot = function (root, data, typeInfo, opts) {
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
				each(group, function (pivot, colValIdx) {
					var div = jQuery('<div>').appendTo(root);
					var context = {
						rowValIdx: rowValIdx,
						colValIdx: colValIdx
					};
					html += self.item(context);
				});
			});
		}

		if (self.after != null) {
			html += self.after();
		}
	}

	root.html(html);
};

// #draw {{{2

GridRendererHandlebars.prototype.draw = function (root, cont, opts) {
	var self = this;

	if (cont != null && typeof cont !== 'function') {
		throw new Error('Call Error: `cont` must be null or a function');
	}

	return self.super.draw(root, opts, function (ok, data, typeInfo) {
		if (!ok) {
			return cont();
		}

		hbUtil.addHelpers(self.hbEnv, data);

		var k1 = data.isPlain ? 'plain'
			: data.isGroup ? 'group'
			: data.isPivot ? 'pivot'
			: null;

		var configKey = data.isPlain ? 'whenPlain'
			: data.isGroup ? 'whenGroup'
			: data.isPivot ? 'whenPivot'
			: null;

		var config = self.opts[configKey] || {};

		if (config.empty != null) {
			self.empty = self.hbEnv.compile(config.empty);
		}

		if (config.before != null) {
			self.before = self.hbEnv.compile(config.before);
		}

		if (config.item != null) {
			self.item = self.hbEnv.compile(config.item);
		}

		if (config.after != null) {
			self.after = self.hbEnv.compile(config.after);
		}

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

GridRendererHandlebars.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on('workEnd', function (info, ops) {
		self.draw(self.root, null, self.drawOpts);
	}, { who: self, limit: 1 });
};

// Registry

GridRenderer.registry.set('handlebars', GridRendererHandlebars);
