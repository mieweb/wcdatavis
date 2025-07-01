// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../../../trans.js';
import {
	debug,
	deepCopy,
	determineColumns,
	each,
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
} from '../../../util/misc.js';

import {AggregateInfo} from '../../../aggregates.js';
import {GridFilterSet} from '../../../grid_filter.js';
import {GridRenderer} from '../../../grid_renderer.js';
import {ComputedView} from '../../../computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from '../../../group_fun.js';

import handlebarsUtil from '../../../util/handlebars.js';
import GridTable from '../table.js';

// GridTableGroupSummary {{{1
// Constructor {{{2

/**
 * @class
 * @extends GridTable
 */

var GridTableGroupSummary = makeSubclass('GridTableGroupSummary', GridTable, function (grid, defn, view, features, opts, timing, id) {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.features.limit = false;
	self.features.rowSelect = false;
	self.features.footer = false;

	console.debug('DataVis // ' + 'GRID TABLE - GROUP - SUMMARY', 'Constructing grid table; features = %O', features);

	setPropDef(['rowVals', 'addCols', 'groupAggregates'], self.opts, 'displayOrder');
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

GridTableGroupSummary.prototype.canRender = function (what) {
	return ['group'].indexOf(what) >= 0;
};

// #drawHeader {{{2

GridTableGroupSummary.prototype.drawHeader = function (columns, data, typeInfo, opts) {
	var self = this,
		tr = jQuery('<tr>'),
		headingSpan,
		headingTh,
		headingThControls,
		headingThContainer;

	self.csv.addRow();

	each(self.opts.displayOrder, function (what, displayOrderIndex) {
		if (typeof what === 'string') {
			if (what === 'rowVals') {
				each(data.groupFields, function (field, fieldIdx) {
					var fcc = self.colConfig.get(field) || {};
					var headingText = fcc.displayText || field;

					// headingTh <TH>
					//   headingThContainer <DIV>
					//     headingThSpan <SPAN>
					//     headingThControls <DIV>

					headingSpan = jQuery('<span>', {
						'class': 'wcdv_heading_title',
						'data-wcdv-field': field,
						'data-wcdv-draggable-origin': 'GRID_TABLE_HEADER',
					})
						.text(headingText)
						._makeDraggableField();

					headingThControls = jQuery('<div>');

					headingThContainer = jQuery('<div>')
						.addClass('wcdv_heading_container')
						.append(headingSpan, headingThControls);

					headingTh = jQuery('<th>')
						.append(headingThContainer);

					self.csv.addCol(fcc.displayText || field);

					self._addSortingToHeader(data, 'vertical', {groupFieldIndex: fieldIdx}, headingThControls.get(0), getProp(data, 'agg', 'info', 'group'));

					self.setCss(headingTh, field);

					self.ui.thMap[field] = headingTh;
					tr.append(headingTh);
				});
			}
			else if (what === 'groupAggregates') {
				self.drawHeader_aggregates(data, tr, displayOrderIndex, self.opts.displayOrder.length);
			}
			else if (what === 'addCols') {
				self.drawHeader_addCols(tr, typeInfo, opts);
			}
		}
	});

	// Add the row for this pivot field to the THEAD.
	self.ui.thead.append(tr);
};

// #drawBody {{{2

GridTableGroupSummary.prototype.drawBody = function (data, typeInfo, columns, cont, opts) {
	var self = this;
	var ai = self._getAggInfo(data);
	var aggType, aggInfo, rowAgg;

	self._setupFullValueWin(data);

	each(data.data, function (rowGroup, groupNum) {
		var tr = document.createElement('tr');
		tr.setAttribute('data-wcdv-rvi', groupNum);

		self.csv.addRow();

		each(self.opts.displayOrder, function (what, displayOrderIndex) {
			if (typeof what === 'string') {
				if (what === 'rowVals') {
					self.drawBody_rowVals(data, tr, groupNum);
				}
				else if (what === 'groupAggregates') {
					self.drawBody_groupAggregates(data, tr, groupNum, displayOrderIndex, self.opts.displayOrder.length);
				}
				else if (what === 'addCols') {
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

					if (self.opts.addCols == null || self.opts.addCols.length === 0) {
						return;
					}

					each(self.opts.addCols, function (addCol) {
						var td = document.createElement('td');
						var addColResult = addCol.value(data.data, groupNum, rowAgg, aggType);
						var addColText;

						if (addColResult instanceof jQuery) {
							addColResult = addColResult.get(0);
						}

						if (addColResult instanceof Element) {
							td.appendChild(addColResult);
							self.csv.addCol(addColResult.innerText);
						}
						else {
							if (aggInfo.instance.inheritFormatting) {
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
				}
			}
		});

		self.ui.tbody.append(tr);
	});

	var renderTotalRow = function () {
		var tr;

		tr = jQuery('<tr>', {'class': 'wcdv_btd'});
		self.csv.addRow();

		each(self.opts.displayOrder, function (what) {
			switch (what) {
			case 'rowVals':
				for (var i = 0; i < data.groupFields.length - 1; i += 1) {
					self.csv.addCol('');
				}
				self.csv.addCol('Total');

				var span = jQuery('<span>', {'class': 'wcdv_heading_title'})
					.text('Total');
				var headingThControls = jQuery('<div>');
				var headingThContainer = jQuery('<div>')
					.addClass('wcdv_heading_container')
					.append(span, headingThControls);
				var th = jQuery('<th>')
					.attr({'colspan': data.groupFields.length})
					.append(headingThContainer)
					.appendTo(tr);

				break;
			case 'groupAggregates':
				each(ai.all, function (aggInfo, aiAllIndex) {
					var aggResult = data.agg.results.all[aggInfo.aggNum];

					var td = document.createElement('td');
					td.setAttribute('data-wcdv-agg-scope', 'all');
					td.setAttribute('data-wcdv-agg-num', aggInfo.aggNum);

					var text;

					if (aggResult instanceof jQuery) {
						aggResult = aggResult.get(0);
					}

					if (aggResult instanceof Element) {
						td.appendChild(aggResult);
						self.csv.addCol(aggResult.innerText);
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
						self.csv.addCol(td.innerText);
					}

					if (self.opts.drawInternalBorders || ai.all.length > 1) {
						td.classList.add(aiAllIndex === 0 ? 'wcdv_pivot_aggregate_boundary' : 'wcdv_pivot_colval_boundary');
					}

					self.setAlignment(td, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());

					tr.append(td);
				});
				break;
			case 'addCols':
				if (self.opts.addCols == null || self.opts.addCols.length === 0) {
					break;
				}
				each(self.opts.addCols, function (addCol) {
					self.csv.addCol('');
					tr.append(document.createElement('td'));
				});
			}
		});

		tr.appendTo(self.ui.tbody);
	};

	if (ai.all.length > 0) {
		renderTotalRow();
	}

	if (self.features.floatingHeader) {
		switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
		case 'tabletool':
			window.TableTool.update();
			break;
		}
	}

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

// #drawFooter {{{2

GridTableGroupSummary.prototype.drawFooter = function (columns, data, typeInfo) {
	var self = this;
	var tr, td;
	var colspan;

	// Create the footer row to show aggregate functions.

	tr = jQuery('<tr>');

	// Add the "select all" checkbox when row selection is enabled.

	if (self.features.rowSelect) {
		self.ui.checkAll_tfoot = jQuery('<input>', { 'name': 'checkAll', 'type': 'checkbox' })
			.on('change', function (evt) {
				self.checkAll(evt);
			});
		jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).append(self.ui.checkAll_tfoot).appendTo(tr);
	}

	// Create a new footer row for an external footer that we've absorbed into the grid.

	if (self.opts.footer != null && self.opts.stealGridFooter) {
		tr.append(jQuery('<td>', {'colspan': data.groupFields.length + self._getAggInfo(data).group.length}).append(self.opts.footer));
	}

	if (tr.children().length > 0) {
		self.ui.tfoot.append(tr);
	}
};

// #addWorkHandler {{{2

GridTableGroupSummary.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on(ComputedView.events.workEnd, function (info, ops) {
		console.debug('DataVis // ' + 'GRID TABLE - GROUP - SUMMARY // HANDLER (ComputedView.workEnd)', 'ComputedView has finished doing work');

		if (!ops.group || ops.pivot) {
			self.fire('unableToRender', null, ops);
			return;
		}

		console.debug('DataVis // ' + 'GRID TABLE - GROUP - SUMMARY // HANDLER (ComputedView.workEnd)', 'Redrawing because the view has done work');
		self.draw(self.root);
	}, { who: self });
};

// Registry {{{1

GridRenderer.registry.set('table_group_summary', GridTableGroupSummary);

// Exports {{{1

export {
	GridTableGroupSummary
};
