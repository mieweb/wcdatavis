// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../trans.js';
import {
	debug,
	deepCopy,
	determineColumns,
	fontAwesome,
	format,
	gensym,
	getElement,
	getProp,
	getPropDef,
	isElement,
	isVisible,
	log,
	makeOperationButton,
	makeSubclass,
	mergeSort2,
	mixinEventHandling,
	objFromArray,
	onVisibilityChange,
	setPropDef,
	setTableCell,
	setElement,
} from '../util/misc.js';

import {AggregateInfo} from '../aggregates.js';
import {GridFilterSet} from '../grid_filter.js';
import {GridRenderer} from '../grid_renderer.js';
import {ComputedView} from '../computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from '../group_fun.js';

import handlebarsUtil from '../util/handlebars.js';

// TableExport {{{1

var TableExport = makeSubclass('TableExport', Object, function (opts) {
	var self = this;
});

// #start {{{2

TableExport.prototype.start = function () {
};

// #addRow {{{2

TableExport.prototype.addRow = function () {
};

// #addCol {{{2

TableExport.prototype.addCol = function () {
};

// #finish {{{2

TableExport.prototype.finish = function () {
};

// Csv {{{1

/**
 * @typedef {object} Csv~Row
 *
 * @property {number} rowId
 * @property {boolean} hidden
 * @property {any[]} rowData
 */

/**
 * Represents the data that will be output by exporting the grid table to a spreadsheet format like
 * CSV.  This is used by grid table rendering functions to build the exported data while rendering
 * the HTML data shown onscreen.
 *
 * @property {number} lastRowId
 * The row ID of the last-added row.
 *
 * @property {Csv~Row} lastRow
 * The last-added row.
 *
 * @property {Csv~Row[]} data
 * All rows.
 *
 * @property {object} opts
 * Options for serializing the data to a string.
 *
 * @property {string} opts.separator
 * Column separator used when serializing.
 */

var Csv = makeSubclass('Csv', TableExport, function (opts) {
	var self = this;

	self.lastRowId = -2;
	self.opts = opts || {};

	// Set default options
	Object.assign(self.opts, {
		separator: ','
	}, self.opts);

	self.start();
});

// #start {{{2

/**
 * Reset the CSV data buffer.
 */

Csv.prototype.start = function () {
	var self = this;

	self.lastRowId = -2;
	self.data = [];
	self.lastRow = null;
	self.order = null;
};

// #addRow {{{2

/**
 * Add a row to the data set.
 *
 * @param {number} [rowId]
 * Row ID of the newly added row; if omitted, the last number is just incremented.
 */

Csv.prototype.addRow = function (rowId) {
	var self = this;

	if (rowId == null) {
		rowId = ++self.lastRowId;
	}

	self.lastRow = {
		rowId: rowId,
		rowData: [],
		hidden: false
	};
	self.data.push(self.lastRow);
};

// #addCol {{{2

/**
 * Add a column to the current row.
 *
 * @param {string} x
 * The value to add.
 */

Csv.prototype.addCol = function (x, opts) {
	var self = this;

	opts = opts || {};
	opts = Object.assign({
		prepend: false
	}, opts);

	if (x == null) {
		x = '';
	}
	else if (typeof x !== 'string') {
		x = x.toString();
	}

	// In case you didn't add a row before you added the first column.  Shame on you.

	if (self.lastRow == null) {
		self.addRow();
	}

	if (opts.prepend) {
		self.lastRow.rowData.unshift(x);
	}
	else {
		self.lastRow.rowData.push(x);
	}
};

// #toString {{{2

/**
 * Render the entire set of data accumulated to a string.
 */

Csv.prototype.toString = function () {
	var self = this;
	var i, row;

	var s = '';
	var sep = '"' + self.opts.separator + '"';
	var len = self.order != null ? self.order.length : self.data.length;

	var quoteRegexp = /"/g;

	for (i = 0; i < len; i += 1) {
		row = self.order != null ? self.getRowById(self.order[i]) : self.data[i];
		if (i > 0) {
			s += '\r\n';
		}
		s += '"' + row.rowData.map(function (s) {
			return s.replace(quoteRegexp, '""');
		}).join(sep) + '"';
	}

	return s;
};

// #getRowById {{{2

Csv.prototype.getRowById = function (rowId) {
	var self = this;

	return self.data[rowId].rowId === rowId
		? self.data[rowId]
		: self.data.find(function(item) { return item.rowId === rowId; });
};

// #updateVisibility {{{2

Csv.prototype.updateVisibility = function (rowId, hide) {
	var self = this;
	var row = self.getRowById(rowId);

	if (row != null) {
		row.hidden = hide;
	}
};

// #setOrder {{{2

Csv.prototype.setOrder = function (rowId, pos) {
	var self = this;

	if (self.order == null) {
		self.order = [];
	}

	self.order[pos] = rowId;
};

// #finish {{{2

Csv.prototype.finish = function (cb) {
	return cb();
};

// Exports {{{1

export {
	TableExport,
	Csv,
};
