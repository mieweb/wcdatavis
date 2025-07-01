// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../../../trans.js';
import {
	debug,
	deepCopy,
	determineColumns,
	each,
	every,
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
	map,
	mergeSort2,
	mixinEventHandling,
	objFromArray,
	onVisibilityChange,
	setPropDef,
	setTableCell,
	setElement,
} from '../../../util/misc.js';

import {AggregateInfo} from '../../../aggregates.js';
import {GridFilterSet} from '../../../grid_filter.js';
import {GridRenderer} from '../../../grid_renderer.js';
import {ComputedView} from '../../../computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from '../../../group_fun.js';

import handlebarsUtil from '../../../util/handlebars.js';
import GridTable from '../table.js';

// GridTablePivot {{{1
// Constructor {{{2

/**
 * A grid table used for showing data that's been pivotted by the view.
 *
 * @class
 * @extends GridTable
 */

var GridTablePivot = makeSubclass('GridTablePivot', GridTable, function (grid, defn, view, features, opts, timing, id) {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.features.limit = false;
	self.features.footer = false;

	console.debug('DataVis // ' + 'GRID TABLE - PIVOT', 'Constructing grid table; features = %O', features);

	setPropDef(['rowVals', 'cells', 'groupAggregates', 'addCols'], self.opts, 'displayOrder');
});

// #canRender {{{2

/**
 * Responds whether or not this grid table can render the type of data requested.
 *
 * @param {string} what
 * The kind of data the caller wants us to show.  Must be one of: plain, group, or pivot.
 *
 * @return {boolean}
 * True if this grid table can render that kind of data, false if it can't.
 */

GridTablePivot.prototype.canRender = function (what) {
	return ['pivot'].indexOf(what) >= 0;
};

// #drawHeader {{{2

GridTablePivot.prototype.drawHeader = function (columns, data, typeInfo, opts) {
	var self = this,
		aggInfo,
		tr,
		span,
		headingThControls,
		headingThContainer,
		th;

	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           |
	// +---------------------------+------------+------------+------------+-----------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |                                      | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+
	//  ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

	var displayRowVals = function (tr) {
		each(data.groupFields, function (field, fieldIdx) {
			var fcc = self.colConfig.get(field) || {};
			span = jQuery('<span>').addClass('wcdv_heading_title').text(fcc.displayText || field);
			self.csv.addCol(fcc.displayText || field);

			headingThControls = jQuery('<div>');

			headingThContainer = jQuery('<div>')
				.addClass('wcdv_heading_container')
				.append(span, headingThControls);

			th = jQuery('<th>')
				.dvAttr({
					'gfi': fieldIdx,
					'field': field,
					'draggable-origin': 'GRID_TABLE_HEADER'
				})
				.append(headingThContainer)
				._makeDraggableField();

			self._addSortingToHeader(data, 'vertical', {groupFieldIndex: fieldIdx}, headingThControls.get(0), getPropDef([], data, 'agg', 'info', 'cell'));

			self.setCss(th, field);

			self.ui.thMap[field] = th;
			tr.append(th);
		});
	};

	//  ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           |
	// +---------------------------+------------+------------+------------+-----------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |                                      | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+

	var displayRowVals_padding = function (tr) {
		if (data.groupFields.length > 1) {
			tr.append(jQuery('<th>', { colspan: data.groupFields.length - 1 }));
			for (var i = 0; i < data.groupFields.length - 1; i += 1) {
				self.csv.addCol('');
			}
		}
	};

	//                ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
	// +-------------+-------------+--------------------------------------+-----------+
	// |             | PIVOT FIELD | COLVAL 1.1              | COLVAL 1.2 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// |             | PIVOT FIELD | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |                                      | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+

	var displayCells = function (tr, pivotFieldIdx, displayOrderIndex) {
		var colVal, colValIndex;
		var ai = self._getAggInfo(data);
		var df = self._getDisplayFormat();
		// Indicates that we're on the last pivot field, i.e. the last row of the table header.
		var isLastPivotField = pivotFieldIdx === data.pivotFields.length - 1;
		var pivotField = data.pivotFields[pivotFieldIdx];

		var fcc = self.colConfig.get(pivotField) || {};
		var pivotSpec = data.pivotSpec[pivotFieldIdx];
		var fti = self.typeInfo.get(pivotField);

		if (pivotSpec.fun != null) {
			fti = {
				type: GROUP_FUNCTION_REGISTRY.get(pivotSpec.fun).resultType
			};
		}

		//                ↓↓↓↓↓↓↓↓↓↓↓↓↓
		// +-------------+-------------+--------------------------------------+-----------+
		// |             | PIVOT FIELD | COLVAL 1.1              | COLVAL 1.2 |           |
		// +-------------+-------------+------------+------------+------------+-----------+

		var span = jQuery('<span>').addClass('wcdv_heading_title').text(fcc.displayText || pivotField);
		self.csv.addCol(fcc.displayText || pivotField);

		var headingThControls = jQuery('<div>');

		var headingThContainer = jQuery('<div>')
			.addClass('wcdv_heading_container')
			.append(span, headingThControls);

		var th = jQuery('<th>')
			.dvAttr({
				'field': pivotField,
				'draggable-origin': 'GRID_TABLE_HEADER'
			})
			.append(headingThContainer)
			._makeDraggableField();

		self._addSortingToHeader(data, 'horizontal', {pivotFieldIndex: pivotFieldIdx}, headingThControls.get(0), getPropDef([], data, 'agg', 'info', 'cell'));

		self.setCss(th, pivotField);

		self.ui.thMap[pivotField] = th;
		tr.append(th);


		//                              ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
		// +-------------+-------------+--------------------------------------+-----------+
		// |             | PIVOT FIELD | COLVAL 1.1              | COLVAL 1.2 |           |
		// +-------------+-------------+------------+------------+------------+-----------+

		// Create headers for the fields that we've pivotted by.  The headers are the column values for
		// those fields.
		//
		// +--------------------------------------------------+----------------+
		// | PIVOT COLVAL 1                                   | PIVOT COLVAL 2 | < PIVOT FIELD #1
		// +----------------+----------------+----------------+----------------+
		// | PIVOT COLVAL A | PIVOT COLVAL B | PIVOT COLVAL C | PIVOT COLVAL A | < PIVOT FIELD #2
		// +----------------+----------------+----------------+----------------+
		//
		// Col Vals = [[1,A], [1,B], [2,A]]
		//
		// When rendering the headers for Pivot Field #1, we go through the col vals and find that "1"
		// is repeated three times.  We don't make a cell for each one, instead we just increment
		// lastColValCount.  When the col val changes to "2", we set the colspan on the previous cell to
		// be however many of that col val we found.

		var lastColVal = null;
		var lastColValCount = 0;

		for (colValIndex = 0; colValIndex < data.colVals.length; colValIndex += 1) {
			colVal = data.colVals[colValIndex][pivotFieldIdx];
			colVal = format(self.colConfig.get(pivotField), fti, colVal);

			if (colVal !== lastColVal || isLastPivotField) {
				if (lastColVal !== null) {
					// The we've hit a different colVal so count up how many of the last one we had to
					// determine the column span.  In the above example, there are three "Kennedy" and two
					// "Roosevelt" so those are the colspans that we would set.

					var colSpan = lastColValCount;

					if ((df.cell.length || ai.cell.length) >= 2) {
						colSpan *= ai.cell.length;
					}

					th.attr('colspan', colSpan);
					tr.append(th);

					for (var i = 0; i < colSpan - 1; i += 1) {
						self.csv.addCol('');
					}
				}

				// Update the tracking information and reset the counter to one.

				lastColVal = colVal;
				lastColValCount = 1;

				span = jQuery('<span>').addClass('wcdv_heading_title');
				setElement(span, colVal, {
					field: pivotField,
					colConfig: fcc,
					typeInfo: fti
				});
				self.csv.addCol(span.text());

				headingThControls = jQuery('<div>');

				headingThContainer = jQuery('<div>')
					.addClass('wcdv_heading_container')
					.append(span, headingThControls);

				th = jQuery('<th>')
					.dvAttr('cvi', colValIndex)
					.append(headingThContainer);

				self.setCss(th, colVal);

				// We only allow sorting on the final

				if (isLastPivotField) {
					self._addSortingToHeader(data, 'vertical', {colVal: data.colVals[colValIndex], aggNum: 0}, headingThControls.get(0), getPropDef([], data, 'agg', 'info', 'cell'));
				}

				if ((df.cell.length || ai.cell.length) === 1) {
					aggInfo = data.agg.info.cell[0];
					self.setAlignment(th, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());
				}
				else if ((df.cell.length || ai.cell.length) > 1) {
					self.setAlignment(th, null, null, null, 'center');
				}

				if (self.opts.drawInternalBorders || (df.cell.length || ai.cell.length) > 1) {
					th.addClass('wcdv_pivot_colval_boundary');
				}
			}
			else {
				lastColValCount += 1;
			}
		}

		// Same logic as when the colVal changes.

		var colSpan = lastColValCount;

		if ((df.cell.length || ai.cell.length) >= 2) {
			colSpan *= (df.cell.length || ai.cell.length);
		}

		if (th != null) {
			th.attr('colspan', colSpan);
			tr.append(th);
		}

		for (i = 0; i < colSpan - 1; i += 1) {
			self.csv.addCol('');
		}
	};

	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           |
	// +---------------------------+------------+------------+------------+-----------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |  //  //  //  //  //  //  //  //  //  | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+
	//                              ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

	var displayCells_padding = function (tr) {
		var ai = self._getAggInfo(data);
		var df = self._getDisplayFormat();

		var numCols = df.cell.length || ai.cell.length;

		var hr = jQuery('<hr>', {
			class: 'wcdv_hr_gradient'
		});
		var div = jQuery('<div>&nbsp;</div>');
		var th = jQuery('<th>', {
			class: 'wcdv_pivot_colval_boundary wcdv_cell_empty',
			colspan: data.colVals.length * Math.max(numCols, 1)
		});
		div.appendTo(th);
		th.appendTo(tr);
		for (var i = 0; i < data.colVals.length * Math.max(numCols, 1); i += 1) {
			self.csv.addCol('');
		}
	};

	//                                                                     ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
	// +---------------------------+--------------------------------------+----------------------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |                      |
	// +---------------------------+------------+------------+------------+----------------------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |                      |
	// +-------------+-------------+------------+------------+------------+-----------+----------+
	// | GROUP FIELD | GROUP FIELD |  //  //  //  //  //  //  //  //  //  | GROUP AGG | ADD COLS |
	// +-------------+-------------+--------------------------------------+-----------+----------+

	var displayGroupAggregates_padding = function (tr, displayOrderIndex, displayOrderMax) {
		var ai = self._getAggInfo(data);

		var numCols = ai.group.length + getPropDef(0, self.opts, 'addCols', 'length');

		if (numCols > 0) {
			var th = jQuery('<th>', { colspan: numCols });
			if (displayOrderIndex > 0) {
				th.addClass('wcdv_bld'); // border-left: double
			}
			if (displayOrderIndex < displayOrderMax - 1) {
				th.addClass('wcdv_brd'); // border-right: double
			}
			tr.append(th);
		}
	};

	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           |
	// +---------------------------+------------+------------+------------+-----------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |  //  //  //  //  //  //  //  //  //  | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+
	//                                                                     ↑↑↑↑↑↑↑↑↑↑↑

	var displayGroupAggregates = function (tr, displayOrderIndex, displayOrderMax) {
			self.drawHeader_aggregates(data, tr, displayOrderIndex, displayOrderMax);
			self.drawHeader_addCols(tr, typeInfo, opts);
	};

	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           | ←---
	// +---------------------------+------------+------------+------------+-----------+ ←---
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           | ←---
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |  //  //  //  //  //  //  //  //  //  | GROUP AGG |
	// +-------------+-------------+--------------------------------------+-----------+

	for (var pivotFieldIdx = 0; pivotFieldIdx < data.pivotFields.length; pivotFieldIdx += 1) {
		self.csv.addRow();
		tr = jQuery('<tr>')
			.dvAttr('pfi', pivotFieldIdx);
		each(self.opts.displayOrder, function (what, displayOrderIndex) {
			if (typeof what === 'string') {
				switch (what) {
				case 'rowVals':
					displayRowVals_padding(tr);
					break;
				case 'cells':
					displayCells(tr, pivotFieldIdx);
					break;
				case 'groupAggregates':
					displayGroupAggregates_padding(tr, displayOrderIndex, self.opts.displayOrder.length);
					break;
				}
			}
		});
		tr.appendTo(self.ui.thead);
	}

	// +---------------------------+--------------------------------------+-----------+
	// |                           | COLVAL 1.1              | COLVAL 1.2 |           |
	// +---------------------------+------------+------------+------------+-----------+
	// |                           | COLVAL 2.1 | COLVAL 2.2 | COLVAL 2.1 |           |
	// +-------------+-------------+------------+------------+------------+-----------+
	// | GROUP FIELD | GROUP FIELD |  //  //  //  //  //  //  //  //  //  | GROUP AGG | ←---
	// +-------------+-------------+--------------------------------------+-----------+

	self.csv.addRow();
	tr = jQuery('<tr>');
	each(self.opts.displayOrder, function (what, displayOrderIndex) {
		if (typeof what === 'string') {
			switch (what) {
			case 'rowVals':
				displayRowVals(tr);
				break;
			case 'cells':
				displayCells_padding(tr);
				break;
			case 'groupAggregates':
				displayGroupAggregates(tr, displayOrderIndex, self.opts.displayOrder.length);
				break;
			}
		}
	});
	tr.appendTo(self.ui.thead);
};

// #drawBody {{{2

GridTablePivot.prototype.drawBody = function (data, typeInfo, columns, cont, opts) {
	var self = this;

	var aggType
		, aggInfo;

	opts = opts || {};
	opts.pivotConfig = opts.pivotConfig || {};

	var ai = self._getAggInfo(data);
	var df = self._getDisplayFormat();

	if (data.groupFields.length === 0) {
		if (typeof cont === 'function') {
			return cont();
		}
		else {
			return;
		}
	}

	self._setupFullValueWin(data);

	// Setup the handlebars environment to reference our data.

	var handlebarsEnv = handlebarsUtil.makeEnv();
	handlebarsUtil.addHelpers(handlebarsEnv, self.data);

	// Compile all templates; if there's an error then the template can still be used, it just
	// produces the error message instead of doing something useful.

	var templates = {};

	each(df, function (tmplStrs, type) {
		templates[type] = map(tmplStrs, function (str) {
			var t;
			try {
				t = handlebarsEnv.compile(str);
			}
			catch (e) {
				t = function () {
					return e.message;
				};
			}
			return t;
		});
	});

	// ===========================================================================
	//  DATA AND GROUP AGGREGATES
	// ===========================================================================


	each(data.data, function (rowGroup, groupNum) {
		self.csv.addRow();

		var tr = document.createElement('tr');
		tr.setAttribute('data-wcdv-rvi', groupNum);

		each(self.opts.displayOrder, function (what, displayOrderIndex) {
			if (typeof what === 'string') {
				switch (what) {
				case 'rowVals':
					self.drawBody_rowVals(data, tr, groupNum);
					break;
				case 'cells':
					var rowAgg = [];

					// Create the cells that show the result of the aggregate function for all rows matching the
					// column values at the same index.
					//
					// EXAMPLE
					// -------
					//
					//   pivotFields = ["State"]
					//   colVals = ["IL", "IN", "MI", "OH"]
					//
					// Column #1: agg(rowGroup[0]) - rows in the group w/ State = "IL"
					// Column #2: agg(rowGroup[1]) - rows in the group w/ State = "IN"
					// Column #3: agg(rowGroup[2]) - rows in the group w/ State = "MI"
					// Column #4: agg(rowGroup[3]) - rows in the group w/ State = "OH"

					each(rowGroup, function (colGroup, pivotNum) {
						if (df.cell.length > 0) {
							each(df.cell, function (dispFmt, dfCellIndex) {
								var td = document.createElement('td');
								td.classList.add('wcdv_pivot_cell');
								td.setAttribute('data-wcdv-rvi', groupNum);
								td.setAttribute('data-wcdv-cvi', pivotNum);

								td.innerHTML = templates.cell[dfCellIndex]({
									rowValIdx: groupNum,
									colValIdx: pivotNum
								});

								if (every(data.groupSpec, function (gs) { return gs.fun == null; })
										&& every(data.pivotSpec, function (ps) { return ps.fun == null; })) {
									self._addDrillDownClass(td);
								}

								if (self.opts.drawInternalBorders) {
									td.classList.add('wcdv_pivot_colval_boundary');
								}

								tr.appendChild(td);
							});
						}
						else if (ai.cell.length > 0) {
							// Every cell aggregate function is going to make a separate cell.
							each(ai.cell, function (aggInfo, aiCellIndex) {
								var aggNum = aggInfo.aggNum;
								var aggType = aggInfo.instance.getType();
								var agg = data.agg.results.cell[aggNum];
								var aggResult = agg[groupNum][pivotNum];

								var td = document.createElement('td');
								td.classList.add('wcdv_pivot_cell');
								td.setAttribute('data-wcdv-rvi', groupNum);
								td.setAttribute('data-wcdv-cvi', pivotNum);
								td.setAttribute('data-wcdv-agg-scope', 'cell');
								td.setAttribute('data-wcdv-agg-num', aggInfo.aggNum);

								rowAgg.push(aggResult);

								var text;

								if (aggResult instanceof jQuery) {
									aggResult = aggResult.get(0);
								}

								if (aggResult instanceof Element) {
									td.appendChild(aggResult);
									self.csv.addCol(aggResult.innerText);
								}
								else if (self.opts.hideBottomValueAggResults && aggResult === aggInfo.instance.bottomValue) {
									td.innerHTML = '&nbsp;';
									self.csv.addCol('');
								}
								else {
									if (aggInfo.instance.inheritFormatting) {
										text = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
											overrideType: aggType
										});
										setTableCell(td, text, {
											field: aggInfo.fields[0],
											colConfig: aggInfo.colConfig[0],
											typeInfo: aggInfo.typeInfo[0]
										});
									}
									else {
										text = format(null, null, aggResult, {
											overrideType: aggType,
											decode: false
										});
										setTableCell(td, text);
									}
									self.csv.addCol(td.innerText);
								}

								if (every(data.groupSpec, function (gs) { return gs.fun == null; })
										&& every(data.pivotSpec, function (ps) { return ps.fun == null; })) {
									self._addDrillDownClass(td);
								}

								if ((self.opts.drawInternalBorders || ai.cell.length > 1) && aiCellIndex === 0) {
									td.classList.add('wcdv_pivot_colval_boundary');
								}

								// REMOVED: How do we let the user set sizes &c. when doing a pivot table?
								// self.setCss(td, col);

								self.setAlignment(td, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggType);

								tr.appendChild(td);
							});
						}
						else {
							// There's no cell aggregate functions, so there isn't anything to put in the cell.
							tr.appendChild(document.createElement('td'));
						}
					});
					break;
				case 'groupAggregates':
					self.drawBody_groupAggregates(data, tr, groupNum, displayOrderIndex, self.opts.displayOrder.length);
					break;
				case 'addCols':
					// Generate the user's custom-defined additional columns.  If the `value` function returns an
					// Element or jQuery instance, we just put that in the <TD> that we make.  Otherwise (e.g. it
					// returns a string or number) we format it according to the type of the field that the pivot
					// function was operating on.
					//
					// EXAMPLE:
					//
					// Aggregate Function = sum
					// Aggregate Field    = Amount : number -> $0,0.00
					//
					// If the `value` function adds up the sums, yielding a grand total of them all, then we format
					// that using Numeral exactly as specified for the "Amount" field.

					each(self.opts.addCols, function (addCol) {
						var addColResult = addCol.value(data.data, groupNum, rowAgg, aggType);
						var td = document.createElement('td');
						var addColText;

						if (addColResult instanceof jQuery) {
							addColResult = addColResult.get(0);
						}

						if (addColResult instanceof Element) {
							td.appendChild(addColResult);
							self.csv.addCol(addColResult.innerText);
						}
						else {
							if (false && aggInfo.instance.inheritFormatting) {
								addColText = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], addColResult, {
									alwaysFormat: true
								});
							}
							else {
								addColText = format(null, null, addColResult, {
									alwaysFormat: true,
									decode: false
								});
							}
							td.innerText = addColText;
							self.csv.addCol(addColText);
						}

						if (getProp(opts, 'pivotConfig', 'aggField')) {
							self.setAlignment(td, self.colConfig.get(opts.pivotConfig.aggField), typeInfo.get(opts.pivotConfig.aggField));
						}

						tr.appendChild(td);
					});
					break;
				}
			}
		});

		self.ui.tbody.append(tr);
	});

	// ===========================================================================
	//  PIVOT AGGREGATES
	// ===========================================================================

	each(ai.pivot, function (aggInfo, aiPivotIndex) {
		var span,
			text,
			aggNum = aggInfo.aggNum,
			aggResult,
			headingThControls,
			headingThContainer,
			th,
			tr,
			i,
			td;

		tr = jQuery('<tr>');
		self.csv.addRow();

		// Add a class to the first row so it gets the double-bar outline.

		if (aiPivotIndex === 0) {
			tr.addClass('wcdv_btd'); // border-top: double
		}

		each(self.opts.displayOrder, function (what) {
			if (typeof what === 'string') {
				switch (what) {
				case 'rowVals':

					// Insert the name of the aggregate function in the header.  This will take up as many columns
					// as there are group fields.

					if (data.groupFields.length > 1) {
						for (i = 0; i < data.groupFields.length - 1; i += 1) {
							self.csv.addCol('');
						}
					}

					self.csv.addCol(aggInfo.instance.getFullName());
					span = jQuery('<span>').addClass('wcdv_heading_title').text(aggInfo.instance.getFullName());

					headingThControls = jQuery('<div>');

					headingThContainer = jQuery('<div>')
						.addClass('wcdv_heading_container')
						.append(span, headingThControls);

					th = jQuery('<th>')
						.attr({'colspan': data.groupFields.length})
						.append(headingThContainer)
						.appendTo(tr);

					// Add sorting to the header we just created.

					self._addSortingToHeader(data, 'horizontal', {aggType: 'pivot', aggNum: aggNum}, headingThControls.get(0), getPropDef([], data, 'agg', 'info', 'cell'));

					break;
				case 'cells':
					each(data.colVals, function (colVal, colValIdx) {
						// Add padding cells in the CSV output so that the pivot aggregates appear staggered.  Since
						// we can't do rowspan in CSV like we can in HTML.

						for (var i = 0; i < aiPivotIndex; i += 1) {
							self.csv.addCol('');
						}

						var td = jQuery('<td>').dvAttr({
							'cvi': colValIdx,
							'agg-scope': 'pivot',
							'agg-num': aggInfo.aggNum
						});
						var aggResult = data.agg.results.pivot[aggNum][colValIdx];

						if (isElement(aggResult)) {
							td.append(aggResult);
							self.csv.addCol(getElement(aggResult).innerText);
						}
						else {
							if (aggInfo.instance.inheritFormatting) {
								text = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
									overrideType: aggInfo.instance.getType()
								});
								setTableCell(td, text, {
									field: aggInfo.fields[0],
									colConfig: aggInfo.colConfig[0],
									typeInfo: aggInfo.typeInfo[0]
								});
							}
							else {
								text = format(null, null, aggResult, {
									overrideType: aggInfo.instance.getType(),
									decode: false
								});
								setTableCell(td, text);
							}
							self.csv.addCol(td.text());
						}

						if (every(data.pivotSpec, function (ps) { return ps.fun == null; })) {
							self._addDrillDownClass(td.get(0));
						}

						if ((df.cell.length || ai.cell.length) > 1) {
							td.attr('colspan', (df.cell.length || ai.cell.length));
						}

						if (self.opts.drawInternalBorders || ai.cell.length > 1) {
							td.addClass('wcdv_pivot_colval_boundary');
						}

						self.setAlignment(td, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());
						td.appendTo(tr);

						// Add padding cells in the CSV output so that the pivot aggregates appear staggered.  Since
						// we can't do rowspan in CSV like we can in HTML.

						for (i = aiPivotIndex + 1; i < ai.pivot.length; i += 1) {
							self.csv.addCol('');
						}
					});
					break;
				case 'groupAggregates':

					// =========================================================================
					//  ALL AGGREGATES
					// =========================================================================

					if (getProp(data, 'agg', 'info', 'all', aggNum)) {
						for (i = 0; i < aiPivotIndex; i += 1) {
							td = jQuery('<td><div>&nbsp;</div></td>');
							if (self.opts.drawInternalBorders || ai.cell.length > 1) {
								td.addClass(i === 0 ? 'wcdv_pivot_aggregate_boundary' : 'wcdv_pivot_colval_boundary');
							}
							td.addClass('wcdv_cell_empty');
							self.csv.addCol('');
							td.appendTo(tr);
						}

						aggInfo = data.agg.info.all[aggNum];
						aggResult = data.agg.results.all[aggNum];
						td = jQuery('<td>');
						td.attr('data-wcdv-agg-scope', 'all');
						td.attr('data-wcdv-agg-num', aggInfo.aggNum);

						if (isElement(aggResult)) {
							td.append(aggResult);
							self.csv.addCol(getElement(aggResult).innerText);
						}
						else {
							if (aggInfo.instance.inheritFormatting) {
								text = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
									overrideType: aggInfo.instance.getType()
								});
								setTableCell(td, text, {
									field: aggInfo.fields[0],
									colConfig: aggInfo.colConfig[0],
									typeInfo: aggInfo.typeInfo[0]
								});
							}
							else {
								text = format(null, null, aggResult, {
									overrideType: aggInfo.instance.getType(),
									decode: false
								});
								setTableCell(td, text);
							}
							self.csv.addCol(td.text());
						}

						if (self.opts.drawInternalBorders || ai.cell.length > 1) {
							td.addClass(aiPivotIndex === 0 ? 'wcdv_pivot_aggregate_boundary' : 'wcdv_pivot_colval_boundary');
						}

						self.setAlignment(td, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());
						td.appendTo(tr);

						for (var i = aiPivotIndex + 1; i < ai.cell.length; i += 1) {
							td = jQuery('<td><div>&nbsp;</div></td>');
							if (self.opts.drawInternalBorders || ai.cell.length > 1) {
								td.addClass('wcdv_pivot_colval_boundary');
							}
							td.addClass('wcdv_cell_empty');
							self.csv.addCol('');
							td.appendTo(tr);
						}
					}
					break;
				}
			}
		});

		tr.appendTo(self.ui.tbody);
	});

	self.csv.finish(function () {
		console.debug('[DataVis // %s // Generate CSV] Finished generating CSV file', self.toString());
		self.csvLock.unlock();
		self.fire('generateCsvProgress', null, 100);
		self.fire('csvReady');
	});

	if (typeof cont === 'function') {
		return cont();
	}
};

// #addWorkHandler {{{2

GridTablePivot.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on(ComputedView.events.workEnd, function (info, ops) {
		console.debug('DataVis // ' + self.toString() + ' // HANDLER (ComputedView.workEnd)', 'ComputedView has finished doing work');

		if (!ops.pivot) {
			console.debug('DataVis // ' + self.toString() + ' // HANDLER (ComputedView.workEnd)', 'Unable to render this data: %O', ops);
			self.fire('unableToRender', null, ops);
			return;
		}

		console.debug('DataVis // ' + self.toString() + ' // HANDLER (ComputedView.workEnd)', 'Redrawing because the view has done work');
		self.draw(self.root);
	}, { who: self });
};

// Registry {{{1

GridRenderer.registry.set('table_pivot', GridTablePivot);

// Exports {{{1

export {
	GridTablePivot
};
