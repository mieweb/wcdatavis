// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from './trans.js';
import {
	fontAwesome,
	makeSubclass,
	mixinDebugging,
} from './util/misc.js';

import { Grid } from './grid.js';

// OperationsPalette {{{1

var OperationsPalette = makeSubclass('OperationsPalette', Object, function (grid) {
	var self = this;

	self.ui = {
		root: null,
		title: null,
		palette: null
	};
	self.operations = [];

	if (!(grid instanceof Grid)) {
		throw new Error('Call Error: `grid` must be a Grid');
	}

	self.grid = grid;
	self.parent = null;
});

mixinDebugging(OperationsPalette);

// #draw {{{2

OperationsPalette.prototype.draw = function (parent) {
	var self = this;
	self.parent = parent;

	self.ui.root = jQuery('<div>', {
		'class': 'wcdv_control_pane'
	}).css({
		'display': 'block'
	}).appendTo(self.parent);
	self.ui.title = jQuery('<div>')
		.addClass('wcdv_control_title_bar')
		.appendTo(self.ui.root);
	jQuery('<span>', { 'class': 'wcdv_control_title' })
		.text(trans('GRID_CONTROL.OPERATIONS.TITLE'))
		.appendTo(self.ui.title);
	self.ui.palette = jQuery('<div>').css({
		'overflow-x': 'auto',
		'white-space': 'nowrap'
	}).appendTo(self.ui.root);

	self.autoReveal();

	self.ui.palette.on('click.wcdv_operation', 'button.wcdv_operation', function () {
		var btn = this;
		var opIndex = btn.getAttribute('data-operation-index');

		var op = self.operations[opIndex];
		if (typeof op.callback === 'function') {
			op.callback({
				rows: self.grid.getSelection().rows,
				opBtn: jQuery(btn)
			});
		}
	});
};

// #drawPalette {{{2

/**
 * Draw just the operation buttons themselves.
 */

OperationsPalette.prototype.drawPalette = function () {
	var self = this;

	// Remove the contents of the existing palette.
	self.ui.palette.children().remove();

	var groupedOps = self.operations.reduce(function(groups, op) {
		var category = op.category;
		if (!groups[category]) {
			groups[category] = [];
		}
		groups[category].push(op);
		return groups;
	}, {});
	
	Object.keys(groupedOps).forEach(function(c) {
		var ops = groupedOps[c];
		var catDiv = jQuery('<div>', {
			'class': 'wcdv_operations_category'
		}).appendTo(self.ui.palette);
		// Make a label for the category, assuming we have one.
		if (c !== 'undefined') {
			var catLabel = jQuery('<span>').text(c).appendTo(catDiv);
		}
		ops.forEach(function (op) {
			var btn = jQuery('<button>', {
				'type': 'button',
				'class': 'wcdv_operation',
				'data-operation-index': op.idx
			}).appendTo(catDiv);
			if (op.label == null) {
				btn.addClass('no_label');
			}
			if (op.icon) {
				btn.append(fontAwesome(op.icon));
			}
			if (op.label) {
				btn.append(op.label);
			}
		});
	});
};

// #autoReveal {{{2

OperationsPalette.prototype.autoReveal = function () {
	var self = this;
	if (self.operations.length > 0) {
		self.drawPalette();
		self.parent.show();
	}
	else {
		self.parent.hide();
	}
};

// #destroy {{{2

/**
 * Remove any event handlers on the palette and remove its container from the DOM.
 */

OperationsPalette.prototype.destroy = function () {
	var self = this;

	self.ui.palette.off('click.wcdv_operation');
	self.ui.root.remove();
};

// #setOperations {{{2

/**
 * Set the operations for the palette, after it has already been created.
 */

OperationsPalette.prototype.setOperations = function (ops) {
	var self = this;

	if (ops == null || ops.all == null) {
		// No "all" operations to worry about.
		return;
	}

	// Add a tracking index, which is used by the generic onClick handler to locate the operation that
	// was actually invoked.

	var i = 0;
	ops.all.forEach(function (o) {
		o.idx = i;
		i += 1;
	});

	self.operations = ops.all;

	self.debug('setOperations', 'New operations = %O', self.operations);

	if (self.ui.palette != null) {
		self.autoReveal();
	}
};

// Exports {{{1

export {
	OperationsPalette,
};
