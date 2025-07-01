// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../../../trans.js';
import {
	bind,
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
import {Source} from '../../../source.js';
import {GROUP_FUNCTION_REGISTRY} from '../../../group_fun.js';

import handlebarsUtil from '../../../util/handlebars.js';
import GridTable from '../table.js';

// GridTablePlain {{{1
// Constructor {{{2

/**
 * The GridTablePlain is in charge of displaying the HTML table of data.
 *
 * @class
 * @extends GridTable
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

var GridTablePlain = makeSubclass('GridTablePlain', GridTable, function (grid, defn, view, features, opts, timing, id) {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.features.filter = false;

	console.debug('DataVis // %s // Constructing grid table; features = %O', self.toString(), features);

	self.addFilterHandler();
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

GridTablePlain.prototype.canRender = function (what) {
	return ['plain'].indexOf(what) >= 0;
};

// #drawHeader {{{2

/**
 * Render the header columns of a GridTablePlain.
 *
 * @param {Array.<string>} columns A list of the fields that are to be included as columns within
 * the GridTablePlain.
 *
 * @param {ComputedView~Data} data
 *
 * @param {Source~TypeInfo} typeInfo
 *
 * @param {object} opts
 */

GridTablePlain.prototype.drawHeader = function (columns, data, typeInfo, opts) {
	var self = this;

	var headingTr, headingSpan, headingTh, filterTr;

	var headingThCss = {
		'white-space': 'nowrap'
	};

	var filterThCss = {
		'white-space': 'nowrap',
		'padding-top': 4,
		'vertical-align': 'top'
	};

	headingTr = jQuery('<tr>');
	filterTr = jQuery('<tr>', {
		'class': 'wcdv_grid_filterrow'
	});

	/*
	 * Create the checkbox that allows the user to select all rows.
	 */

	if (self.features.rowSelect) {
		self.ui.checkAll_thead = jQuery('<input>', { 'name': 'checkAll', 'type': 'checkbox' })
			.on('change', function (evt) {
				self.checkAll(evt);
			});

		headingTh = jQuery('<th>')
			.addClass('wcdv_group_col_spacer')
			.append(self.ui.checkAll_thead)
			.appendTo(headingTr);
		if (self.opts.drawInternalBorders) {
			headingTh.addClass('wcdv_pivot_colval_boundary');
		}

		if (self.features.filter) {
			filterTr.append(jQuery('<th>').css(filterThCss));
		}
	}

	// Create the column for row-based operations.

	if (self.hasOperations('row')) {
		headingTh = jQuery('<th>', {
			'class': 'wcdv_group_col_spacer'
		});
		headingTr.append(headingTh);
	}

	var progress = self.makeProgress('Filter');

	/*
	 * Set up the GridFilterSet instance that manages the (potentially multiple) filters on each
	 * column of the ComputedView that belongs to this GridTablePlain.
	 */

	if (self.features.filter) {
		self.defn.gridFilterSet = new GridFilterSet(self.view, null, self, progress);
	}

	/*
	 * Configure every column which comes from the data (i.e. not the "select all" checkbox, and not
	 * the editing "options" column).
	 */

	each(columns, function (field, colIndex) {
		var fcc = self.colConfig.get(field) || {};

		if (self.features.rowSelect) {
			colIndex += 1; // Add a column for the row selection checkbox.
		}

		if (self.hasOperations('row')) {
			colIndex += 1; // Add a column for row-based operations.
		}

		var headingText = fcc.displayText || field;

		// headingTh <TH>
		//   headingThContainer <DIV>
		//     headingThSpan <SPAN>
		//     headingThControls <DIV>

		var headingSpan = jQuery('<span>', {
			'class': 'wcdv_heading_title',
			'data-wcdv-field': field,
			'data-wcdv-draggable-origin': 'GRID_TABLE_HEADER',
		})
			.text(headingText)
			._makeDraggableField();

		var headingThControls = jQuery('<div>');

		var headingThContainer = jQuery('<div>')
			.addClass('wcdv_heading_container')
			.append(headingSpan, headingThControls);

		var headingTh = jQuery('<th>', { id: gensym() })
			.css(headingThCss)
			.append(headingThContainer);

		// In the plain grid table output, the only way to sort is vertically by field.

		self._addSortingToHeader(data, 'vertical', {field: field}, headingThControls.get(0));

		self._addFilterToHeader(headingThControls, field, headingText);


		if (self.opts.drawInternalBorders) {
			headingTh.addClass('wcdv_pivot_colval_boundary');
		}

		/*
		 * Configure filtering for this column.  This mainly involves creating a button, which when
		 * clicked adds (for this column) a filter to the GridFilterSet instance.
		 */

		if (self.features.filter) {

			// Add a TH to the TR that will contain the filters.  Every filter will actually be a DIV
			// inside this TH.
			//
			// The ID attribute here is used to provide a selector to NProgress, so the progress bar
			// will be drawn in the header cell for the column we're filtering by.  You can't pass an
			// element to NProgress for this, it needs to be a selector string.  Passing ('#' + id) was
			// the easiest way to do it.
			//
			// Unfortunately, the ID attribute is copied when using TableTool so this might mess us up.

			var filterThId = gensym();
			var filterTh = jQuery('<th>', { id: filterThId }).addClass('wcdv_grid_filtercol filter_col_' + colIndex).css(filterThCss);
			self.setCss(filterTh, field);
			filterTr.append(filterTh);

			// Create the "button" (really a SPAN) that will add the filter to the grid, and stick it
			// onto the end of the column heading TH.

			jQuery(fontAwesome('fa-filter', null, 'Click to add a filter on this column'))
				.css({'cursor': 'pointer', 'margin-left': '0.5ex'})
				.on('click', function () {
					// When using TableTool, we need to put the filter UI into the floating (clone) header,
					// instead of the original (variable `filterTh` holds the original).  This jQuery will
					// always do the right thing.

					var thead = jQuery(this).closest('thead');
					var tr = thead.children('tr:eq(1)');
					var th = tr.children('th.filter_col_' + colIndex);

					var adjustTableToolHeight = function () {
						if (self.features.floatingHeader) {
							// Update the height of the original, non-floating header to be the same as that of
							// the floating header.  This is needed because otherwise the floating header will
							// cover up the first rows of the table body as we add filters.  TableTool does not
							// keep the heights of the original and clone in sync on its own (using the `update`
							// function only synchronizes the widths).

							var trHeight = tr.innerHeight();

							console.debug('[DataVis // %s // Add Filter] Adjusting original table header height to ' + trHeight + 'px to match floating header height', self.toString());
							filterTr.innerHeight(trHeight);
						}
					};

					var onRemove = adjustTableToolHeight;

					self.defn.gridFilterSet.add(field, th, {
						filterType: fcc.filter,
						filterButton: jQuery(this),
						makeRemoveButton: true,
						onRemove: onRemove,
						autoUpdateInputWidth: true,
						sizingElement: filterTh
					});

					adjustTableToolHeight();
				})
				.appendTo(headingTh);
		}

		self.setCss(headingTh, field);
		self.setAlignment(headingTh, fcc, typeInfo.get(field));

		self.ui.thMap[field] = headingTh;
		headingTr.append(headingTh);
	});

	if (self.opts.addCols) {
		self.drawHeader_addCols(headingTr, typeInfo, opts);
	}

	/*
	 * Create a column with buttons that allows the user to reorder the rows.
	 */

	if (self.features.rowReorder) {
		headingTh = jQuery('<th>')
			.text('Options')
			.appendTo(headingTr);
		if (self.opts.drawInternalBorders) {
			headingTh.addClass('wcdv_pivot_colval_boundary');
		}

		if (self.features.filter) {
			headingTh = jQuery('<th>').css(filterThCss).appendTo(filterTr);
			if (self.opts.drawInternalBorders) {
				headingTh.addClass('wcdv_pivot_colval_boundary');
			}
		}
	}

	self.ui.thead.append(headingTr);

	if (self.features.filter) {
		self.ui.thead.append(filterTr);
	}
};

// #drawBody {{{2

GridTablePlain.prototype.drawBody = function (data, typeInfo, columns, cont, opts) {
	var self = this;
	var useLimit = self.features.limit;
	var limitConfig = getPropDef({}, self.defn, 'table', 'limit');
	var usingTableTool = self.features.floatingHeader && getProp(self.defn, 'table', 'floatingHeader', 'method') === 'tabletool';

	if (self.features.limit && limitConfig && data.data.length > limitConfig.threshold) {
		console.debug('[DataVis // %s // Draw] Limiting output to first ' + limitConfig.threshold + ' rows', self.toString());
	}

	if (self.opts.generateCsv) {
		self.addDataToCsv(data);
	}

	// Clear out the body of the table.  We do this in case somebody invokes this function multiple
	// times.  This function draws the entirety of the data, we certainly don't want to just tack rows
	// on to the end.

	self.ui.tbody.children().remove();

	self._setupFullValueWin(data);

	var renderDataRow = function (row) {
		var tr, td;

		tr = document.createElement('tr');
		tr.setAttribute('id', self.defn.table.id + '_' + row.rowNum);
		tr.setAttribute('data-row-num', row.rowNum);

		// Create the check box which selects the row.

		if (self.features.rowSelect) {
			var checkbox = jQuery('<input>', {
				'type': 'checkbox',
				'data-row-num': row.rowNum,
			});
			td = jQuery('<td>').addClass('wcdv_group_col_spacer').append(checkbox).appendTo(tr);
			if (self.opts.drawInternalBorders) {
				td.addClass('wcdv_pivot_colval_boundary');
			}
		}

		// Create the cell that contains row-based operations.

		if (self.hasOperations('row')) {
			td = document.createElement('td');
			td.classList.add('wcdv_group_col_spacer');
			td.classList.add('wcdv_pivot_colval_boundary');
			td.classList.add('wcdv_nowrap');
			td.classList.add('wcdv_row_operations');

			each(self.defn.operations.row, function (op, index) {
				var opBtn = makeOperationButton('row', op, index);
				if (op.disableWhen && op.disableWhen(row)) {
					opBtn.disabled = true;
				}
				if (op.hideWhen && op.hideWhen(row)) {
					opBtn.style.display = 'none';
				}
				td.appendChild(opBtn);
			});

			tr.appendChild(td);
		}

		// Create the data cells.

		each(columns, function (field, colIndex) {
			var fcc = self.colConfig.get(field) || {};
			var cell = row.rowData[field];

			var td = document.createElement('td');
			var value = format(fcc, typeInfo.get(field), cell);

			setTableCell(td, value, {
				field: field,
				colConfig: self.colConfig,
				typeInfo: typeInfo,
				operations: getProp(self.defn, 'operations', 'cell', field)
			});

			// Buttons within cells share a common 'onClick' handler, e.g. all "show full value" buttons
			// have the same callback.  In that handler, we need to be able to figure out what field we
			// were called for.  So if we're going to render buttons within the data cell, we need to
			// attach the field name so it can be used by the handler.
			//
			// There are two such situations right now:
			//
			//   1. When `maxHeight` is set on the field (the "show full value" button).
			//   2. When there are operations on the field.

			if (fcc.maxHeight != null || self.hasOperations('cell', field)) {
				td.setAttribute('data-wcdv-field', field);
			}

			self.setCss(jQuery(td), field);
			self.setAlignment(td, fcc, typeInfo.get(field));

			if (self.opts.drawInternalBorders) {
				td.classList.add('wcdv_pivot_colval_boundary');
			}

			tr.appendChild(td);
		});

		if (self.opts.addCols) {
			each(self.opts.addCols, function (addColSpec) {
				var value = addColSpec.value(row.rowData, row.rowNum);
				var td = document.createElement('td');

				if (!(value instanceof jQuery || value instanceof Element)) {
					value = format(null, null, value);
				}

				setTableCell(td, value);

				if (self.opts.drawInternalBorders) {
					td.classList.add('wcdv_pivot_colval_boundary');
				}

				tr.appendChild(td);
			});
		}

		// Create button used as the "handle" for dragging/dropping rows.

		if (self.features.rowReorder) {
			jQuery('<td>').append(self.makeRowReorderBtn()).appendTo(tr);
		}

		self.ui.tr[row.rowNum] = jQuery(tr);
		self.ui.tbody.append(tr);

		// When using TableTool with a pinned column, the pinned column is a clone on the left hand
		// side. TableTool does not monitor the original tbody to see if new elements are added, so we
		// need to add new data to the pinned column clone as well.

		if (usingTableTool) {
			self.ui.tbody.parents('div.ttsticky').find('table > tbody').append(tr);
		}
	};

	var renderShowMore = function (rowNum) {
		var tr;
		var showMoreId = gensym();

		tr = document.createElement('tr');
		tr.classList.add('wcdvgrid_more');
		tr.setAttribute('data-show-more-id', showMoreId);

		var colSpan = columns.length
			+ (self.features.rowSelect ? 1 : 0)
			+ (self.hasOperations('row') ? 1 : 0)
			+ (getPropDef(0, self.opts, 'addCols', 'length'))
			+ (self.features.rowReorder ? 1 : 0);

		var showMore = function () {
			// When using pinned columns, TableTool will make a clone of the "show more rows" <TR> which
			// we otherwise have no knowledge of. So we must track it using a data attribute instead, so
			// we can remove both the original and the clone.

			jQuery('tr[data-show-more-id="' + showMoreId + '"]').remove();
			render(rowNum + 1, limitConfig.chunkSize, nextChunk);
		};

		var td = jQuery('<td>', {
			colspan: colSpan
		})
			.on('click', showMore)
			.append(fontAwesome('fa-chevron-circle-down'))
			.append(jQuery('<span>Showing rows '
											+ '1–'
											+ (rowNum + 1)
											+ ' of '
											+ data.data.length
											+ '.</span>')
								.css({
								'padding-left': '0.5em',
							}))
			.append(jQuery('<span>Click to load ' + limitConfig.chunkSize + ' more rows.</span>')
							.css({
								'padding-left': '0.5em',
								'padding-right': '0.5em'
							}))
			.append(fontAwesome('fa-chevron-circle-down'));

		self.moreVisibleHandler = onVisibilityChange(self.scrollEventElement, td, function(isVisible) {
			if (isVisible && getProp(self.defn, 'table', 'limit', 'autoShowMore')) {
				console.debug('[DataVis // %s // More] "Show More Rows" button scrolled into view', self.toString());
				showMore();
			}
		});

		tr.appendChild(td.get(0));
		self.ui.tbody.append(tr);

		// When using TableTool with a pinned column, the pinned column is a clone on the left hand
		// side. TableTool does not monitor the original tbody to see if new elements are added, so we
		// need to add new data to the pinned column clone as well.

		if (usingTableTool) {
			self.ui.tbody.parents('div.ttsticky').find('table > tbody').append(tr);
		}
	};

	var render = function (startIndex, howMany, nextChunk) {
		var atLimit = false;

		if (startIndex == null) {
			startIndex = 0;
		}

		if (howMany == null) {
			howMany = data.data.length;
		}

		console.debug('[DataVis // %s // Draw] Rendering rows '
			+ startIndex
			+ ' - '
			+ Math.min(useLimit && startIndex === 0 ? limitConfig.threshold - 1 : Number.POSITIVE_INFINITY
				, startIndex + howMany - 1
				, data.data.length - 1)
				+ ' '
				+ (data.data.length - 1 <= startIndex + howMany - 1
					? '[END]'
					: ('/ ' + data.data.length - 1)), self.toString());

		for (var rowNum = startIndex; rowNum < data.data.length && rowNum < startIndex + howMany && !atLimit; rowNum += 1) {
			renderDataRow(data.data[rowNum]);

			if (!self.features.incremental
					&& useLimit
					&& limitConfig.method === 'more'
					&& rowNum !== data.data.length - 1 // [0]
					&& ((startIndex === 0 && rowNum === limitConfig.threshold - 1) // [1]
							|| (startIndex > 0 && rowNum === startIndex + limitConfig.chunkSize - 1))) { // [2]

				// Condition [0]: We haven't reached the end of the data.
				// Condition [1]: We've reached the initial threshold for showing the more button.
				// Condition [2]: We're showing additional rows because they clicked the more button.

				renderShowMore(rowNum);
				atLimit = true;
			}
		}

		if (atLimit) {
			self.fire('limited');
		}
		else {
			self.fire('unlimited');
		}

		self._updateSelectionGui();

		if (self.features.floatingHeader) {
			switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
			case 'tabletool':
				window.TableTool.update();
				break;
			}
		}

		if (rowNum === data.data.length) {
			// All rows have been produced, so we're done!

			delete self.moreVisibleHandler;

			//self.ui.tbl.css({'table-layout': 'auto'}); // XXX - Does nothing?!

			if (typeof cont === 'function') {
				return cont();
			}

			// Nothing to do next, but we're done here.

			return;
		}
		else if (typeof nextChunk === 'function') {
			return nextChunk(startIndex, howMany);
		}

		if (typeof cont === 'function') {
			return cont();
		}

		// Nothing to do next, but we're done here.

		return;
	};

	var nextChunk;

	if (self.features.incremental) {
		var incrementalConfig = self.defn.table.incremental;
		if (incrementalConfig.method === 'setTimeout') {
			nextChunk = function (startIndex, howMany) {
				window.setTimeout(function () {
					render(startIndex + howMany, howMany, nextChunk);
				}, incrementalConfig.delay);
			};

			// Kick off the initial render starting at index 0.

			window.setTimeout(function () {
				render(0, incrementalConfig.chunkSize, nextChunk);
			}, incrementalConfig.delay);
		}
		else if (incrementalConfig.method === 'requestAnimationFrame') {
			nextChunk = function (startIndex, howMany) {
				window.requestAnimationFrame(function () {
					render(startIndex + howMany, howMany, nextChunk);
				});
			};

			// Kick off the initial render starting at index 0.

			window.requestAnimationFrame(function () {
				render(0, incrementalConfig.chunkSize, nextChunk);
			});
		}
		else {
			throw new Error('Invalid value for `table.incremental.method` (' + incrementalConfig.method + ') - must be either "setTimeout" or "requestAnimationFrame"');
		}
	}
	else {
		render();
	}

	//self.ui.tbl.css({'table-layout': 'fixed'}); // XXX - Does nothing?!
};

// #drawFooter {{{2

GridTablePlain.prototype.drawFooter = function (columns, data, typeInfo) {
	var self = this;

	var makeSelectAll = function (tr) {
		self.ui.checkAll_tfoot = jQuery('<input>', { 'name': 'checkAll', 'type': 'checkbox' })
			.on('change', function (evt) {
				self.checkAll(evt);
			});
		jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).append(self.ui.checkAll_tfoot).appendTo(tr);
	};

	var makeAggregateRow = function () {
		// Circumventing the correct logic here because TableTool requires an empty footer in order to
		// implement horizontal scrolling; if you omit the footer (with a TR and all appropriate TD's in
		// it) then you can't scroll horizontally.
		if (false && getProp(self.defn, 'table', 'footer') == null) {
			return;
		}

		var tr = jQuery('<tr>');

		// Add the "select all" checkbox when row selection is enabled.

		if (self.features.rowSelect) {
			makeSelectAll(tr);
		}

		// If there are row operations, make a column in the footer to take up that space.
		//
		//   | [ ] | op op op | col1 | col2 | ... |
		//   +-----+----------+------+------+-----+
		//   |     | <here>   |                   |

		if (self.hasOperations('row')) {
			tr.append(jQuery('<td>'));
		}

		// Create the columns for the data fields, which contain aggregate function results over those
		// fields.

		var didFooterCell = false;

		tr.append(map(columns, function (field, colIndex) {
			var fcc = self.colConfig.get(field) || {};
			var colTypeInfo = typeInfo.get(field);
			var td = jQuery('<td>');
			var footerConfig = getProp(self.defn, 'table', 'footer', field);
			var agg;
			var aggFun;
			var aggResult;
			var footerVal;

			self.setCss(td, field);
			self.setAlignment(td, fcc, typeInfo.get(field));

			if (footerConfig == null) {
				if (didFooterCell) {
					td.addClass('wcdv_divider');
				}

				didFooterCell = false;
			}
			else {
				if (colIndex > 0) {
					td.addClass('wcdv_divider');
				}

				didFooterCell = true;

				// Although the footer config is an aggregate spec, there is one place we allow more
				// flexibility.  If the fields aren't set, use the field for the column in which we're
				// displaying this footer.  This is merely a convenience for the most common case.

				if (footerConfig.fields == null) {
					footerConfig.fields = [field];
				}

				console.debug('[DataVis // %s // Footer(%s)] Creating footer using config: %O', self.toString(), field, footerConfig);

				var aggInfo = new AggregateInfo('all', footerConfig, 0, self.colConfig, typeInfo, function (tag, fti) {
					if (fti.needsDecoding) {
						console.debug('[DataVis // %s // Footer(%s) // %s] Converting data: { field = "%s", type = "%s" }',
							self.toString(), field, tag, fti.field, fti.type);

						Source.decodeAll(data.dataByRowId, fti.field, typeInfo);
					}

					fti.deferDecoding = false;
					fti.needsDecoding = false;
				});
				aggResult = aggInfo.instance.calculate(data.data);
				var aggResult_formatted;

				if (isElement(aggResult)) {
					footerVal = aggResult;
				}
				else {
					if (aggInfo.instance.inheritFormatting) {
						aggResult_formatted = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
							overrideType: aggInfo.instance.getType()
						});
					}
					else {
						aggResult_formatted = format(null, null, aggResult, {
							overrideType: aggInfo.instance.getType(),
							decode: false
						});
					}

					if (aggInfo.debug) {
						console.debug('[DataVis // %s // Footer(%s)] Aggregate result: %s',
							self.toString(), field, JSON.stringify(aggResult));
					}

					switch (typeof footerConfig.format) {
					case 'function':
						footerVal = footerConfig.format(aggResult_formatted);
						break;
					case 'string':
						footerVal = sprintf.sprintf(footerConfig.format, aggResult_formatted);
						break;
					default:
						throw new Error('Footer config for field "' + field + '": `format` must be a function or a string');
					}
				}

				if (isElement(footerVal)) {
					td.append(footerVal);
				}
				else {
					td.text(footerVal);
				}
			}

			return td;
		}));

		// ...

		if (self.features.rowReorder) {
			tr.append(jQuery('<td>').text('Options'));
		}

		// Finish the row that contains the aggregate functions.

		self.ui.tfoot.append(tr);
	};

	/*
	 * Create a row in the footer for an external footer that we've absorbed into the grid.
	 */

	var makeExternalFooterRow = function () {
		if (self.opts.footer == null || !self.opts.stealGridFooter) {
			return;
		}

		var tr = jQuery('<tr>');

		if (!isVisible(self.opts.footer)) {
			tr.hide();
		}

		if (self.features.rowSelect) {
			// Circumventing the correct logic here because TableTool requires an empty footer in order to
			// implement horizontal scrolling; if you omit the footer (with a TR and all appropriate TD's
			// in it) then you can't scroll horizontally.
			if (true || getProp(self.defn, 'table', 'footer')) {
				// There is an aggregate row, so it contains the "select all" checkbox.
				jQuery('<td>', {'class': 'wcdv_group_col_spacer'}).appendTo(tr);
			}
			else {
				// There is no aggregate row, so make the "select all" checkbox here.
				makeSelectAll(tr);
			}
		}

		// If there are row operations, make a column in the footer to take up that space.
		//
		//   | [ ] | op op op | col1 | col2 | ... |
		//   +-----+----------+------+------+-----+
		//   |     | <here>   |                   |

		if (self.hasOperations('row')) {
			tr.append(jQuery('<td>'));
		}

		// If there are row operations, make a column in the footer to take up that space.
		//
		//   | [ ] | op op op | col1 | col2 | ...  |
		//   +-----+----------+------+------+------+
		//   |     |          | <here> ----------> |

		tr.append(jQuery('<td>', {'colspan': columns.length}).append(self.opts.footer));

		if (self.features.rowReorder) {
			tr.append(jQuery('<td>'));
		}

		self.ui.tfoot.append(tr);
	};

	makeAggregateRow();
	makeExternalFooterRow();
};

// #makeRowReorderBtn {{{2

GridTablePlain.prototype.makeRowReorderBtn = function () {
	var self = this;

	return jQuery('<button type="button" class="drag-handle fa">')
		.html(fontAwesome('fa-arrows-v',null,'Drag or press up/down arrows to move'));
};

// #updateFeatures {{{2

/**
 * Change the features of this grid table, then redraw the grid table.
 *
 * @param {Object} f
 * The new features to apply.  Any features not indicated will maintain their current settings.
 *
 * @method
 */

GridTablePlain.prototype.updateFeatures = function (f) {
	var self = this;

	each(f, function (v, k) {
		self.features[k] = v;
	});

	self.draw(self.root);
};

// #addWorkHandler {{{2

GridTablePlain.prototype.addWorkHandler = function () {
	var self = this;

	self.view.on(ComputedView.events.workEnd, function (info, ops) {
		console.debug('[DataVis // %s // Handler(ComputedView.workEnd)] ComputedView has finished doing work',
			self.toString());

		if (ops.group || ops.pivot) {
			console.debug('[DataVis // %s // Handler(ComputedView.workEnd)] Unable to render this data: %O',
				self.toString(), ops);
			self.fire('unableToRender', null, ops);
			return;
		}

		console.debug('[DataVis // %s // Handler(ComputedView.workEnd)] Redrawing because the view has done work',
			self.toString());
		self.draw(self.root);
	}, { who: self });
};

//GridTablePlain.prototype.addWorkHandler = function () {
//	var self = this;
//
//	// Sets up callbacks responsible for correctly redrawing the grid when the view has done work
//	// (e.g. sorting or filtering) that will change what is displayed.  This is only needed when
//	// limiting output because otherwise, sort and filter callbacks don't need to redraw the whole
//	// grid, and they are taken care of by the 'sort' and 'filter' events on a row-by-row basis.
//
//	self.view.on(ComputedView.events.workEnd, function (info, ops) {
//		console.debug('DataVis // ' + 'GRID TABLE // HANDLER (ComputedView.workEnd)', 'ComputedView has finished doing work');
//
//		if (ops.group || ops.pivot) {
//
//			// If the data is grouped or pivotted, we can't render it.  Emit the "unable to render" event
//			// so that our Grid instance can replace us with a GridTableGroup or GridTablePivot instance
//			// which can render the data.
//
//			self.fire(GridTable.events.unableToRender);
//			return;
//		}
//
//		if (self.needsRedraw) {
//			console.debug('DataVis // ' + 'GRID TABLE // HANDLER (ComputedView.workEnd)', 'Redrawing because the view has done work');
//
//			self.needsRedraw = false;
//
//			return self.view.getData(function (data) {
//				return self.view.getTypeInfo(function (typeInfo) {
//					self.timing.start(['Grid Table', 'Redraw triggered by view']);
//
//					// Determine what columns will be in the table.  This comes from the user, or from the
//					// data itself.  We may then add columns for extra features (like row selection or
//					// reordering).
//
//					var columns = determineColumns(self.defn, data, typeInfo);
//
//					// Draw the body.
//
//					self.drawBody(data, typeInfo, columns, function () {
//						self.timing.stop(['Grid Table', 'Redraw triggered by view']);
//
//						// Potentially the columns resized as a result of sorting, filtering, or adding new data.
//						self.fire(GridTable.events.columnResize);
//					});
//				});
//			});
//		}
//		else {
//			// Potentially the columns resized as a result of sorting, filtering, or adding new data.
//			self.fire(GridTable.events.columnResize);
//		}
//	}, { who: self });
//};

// #addDataToCsv {{{2

/**
 * Add all data to the CSV file.  Because plain tables frequently don't show all the data, it's not
 * enough to perform the CSV generation inside the `render()` method like we do with other GridTable
 * implementations.
 *
 * @param {object} data
 */

GridTablePlain.prototype.addDataToCsv = function (data) {
	var self = this;
	var columns = determineColumns(self.colConfig, data, self.typeInfo);

	console.debug('[DataVis // %s // Generate CSV] Started generating CSV file', self.toString());
	self.fire('generateCsvProgress', null, 0);

	self.csv.start();
	self.csv.addRow();
	each(columns, function (field, colIndex) {
		var fcc = self.colConfig.get(field) || {};
		self.csv.addCol(fcc.displayText || field);
	});

	var howMany = data.data.length / 10;

	var f = function (startIndex) {
		var endIndex = Math.min(data.data.length, startIndex + howMany);
		for (var i = startIndex; i < endIndex; i += 1) {
			var row = data.data[i];

			self.csv.addRow();
			each(columns, function (field, colIndex) {
				var fcc = self.colConfig.get(field) || {};
				var cell = row.rowData[field];
				var value = format(fcc, self.typeInfo.get(field), cell);

				if (value instanceof Element) {
					self.csv.addCol(jQuery(value).text());
				}
				else if (value instanceof jQuery) {
					self.csv.addCol(value.text());
				}
				else if (fcc.allowHtml && self.typeInfo.get(field).type === 'string' && value.charAt(0) === '<') {
					self.csv.addCol(jQuery(value).text());
				}
				else {
					self.csv.addCol(value);
				}
			});
		}

		if (i === data.data.length) {
			self.csv.finish(function () {
				console.debug('[DataVis // %s // Generate CSV] Finished generating CSV file', self.toString());
				self.csvLock.unlock();
				self.fire('generateCsvProgress', null, 100);
				self.fire('csvReady');
			});
		}
		else {
			self.fire('generateCsvProgress', null, Math.floor((i / data.data.length) * 100));
			setTimeout(function () {
				return f(i);
			}, 100);
		}
	};

	return f(0);
};

// #_updateSelectionGui {{{2

/**
 * Update the checkboxes in the grid table to match what the current selection is.
 */

GridTablePlain.prototype._updateSelectionGui = function () {
	var self = this;

	// True if there are no rows to select.
	var isDisabled = self.data.data.length === 0;

	// True if all rows are selected.
	var isAllChecked = !isDisabled && self.selection.length === self.data.data.length;

	// True if some rows are selected, but not all of them.
	var isIndeterminate = !isDisabled && !isAllChecked && self.selection.length > 0;

	var updateCheckboxState = function (elt) {
		elt.prop('disabled', isDisabled);
		elt.prop('checked', isAllChecked);
		elt.prop('indeterminate', isIndeterminate);
	};

	// First, deselect all rows (remove "selected" class and uncheck the box).

	self.root.find('tbody td.wcdv_selected_row').removeClass('wcdv_selected_row');
	self.root.find('tbody td:first-child input[type="checkbox"]').prop('checked', false);

	// Next, find all the TR elements which correspond to selected rows.

	var trs = self.root.find('tbody tr').filter(function (_idx, elt) {
		return self.selection.indexOf(+(jQuery(elt).attr('data-row-num'))) >= 0;
	});

	// Set the "check all" input in the header.

	if (self.ui.checkAll_thead) {
		updateCheckboxState(self.ui.checkAll_thead);
		updateCheckboxState(self.ui.checkAll_thead.parents('div.tabletool').find('input[name="checkAll"]'));
	}

	// Set the "check all" input in the footer.

	if (self.ui.checkAll_tfoot) {
		updateCheckboxState(self.ui.checkAll_tfoot);
		updateCheckboxState(self.ui.checkAll_tfoot.parents('div.tabletool').find('input[name="checkAll"]'));
	}

	// Finally, select appropriate rows (add "selected" class and check the box).

	trs.children('td').addClass('wcdv_selected_row');
	trs.find('td:first-child input[type="checkbox"]').prop('checked', true);
};

// #checkAll {{{2

/**
 * Event handler for using the "check all" checkbox.
 *
 * @param {Event} evt
 * The event generated by the browser when the checkbox is changed.
 */

GridTablePlain.prototype.checkAll = function (evt) {
	var self = this;

	// Synchronize with floating header clone.
	jQuery(evt.target).parents('div.tabletool').find('input[name="checkAll"]').prop('checked', evt.target.checked);

	// Either select or unselect all rows.
	if (evt.target.checked) {
		self.select();
	}
	else {
		self.unselect();
	}
}

// #_addRowReorderHandler {{{2

GridTablePlain.prototype._addRowReorderHandler = function () {
	var self = this;

	// configureRowReordering(self.ui.tbody, bind(self.view.source.swapRows, self.view.source));
};

// #_addRowSelectHandler {{{2

/**
 * Add an event handler for the row select checkboxes.  The event is bound on `self.ui.tbody` and
 * looks for checkbox inputs inside TD elements with class `wcdv_group_col_spacer` to actually handle
 * the events.  The handler calls `self.select(ROW_NUM)` or `self.unselect(ROW_NUM)` when the
 * checkbox is changed.
 */

GridTablePlain.prototype._addRowSelectHandler = function () {
	var self = this;

	self.ui.tbody.on('change', '.wcdv_group_col_spacer > input[type="checkbox"]', function () {
		if (this.checked) {
			self.select(+(jQuery(this).attr('data-row-num')));
		}
		else {
			self.unselect(+(jQuery(this).attr('data-row-num')));
		}
	});
};

// Registry {{{1

GridRenderer.registry.set('table_plain', GridTablePlain);

// Exports {{{1

export {
	GridTablePlain
};
