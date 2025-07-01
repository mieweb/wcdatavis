// Imports {{{1

import sprintf from 'sprintf-js';
import jQuery from 'jquery';

import { trans } from '../../trans.js';
import {
	debug,
	deepCopy,
	defaults,
	determineColumns,
	fontAwesome,
	format,
	gensym,
	getElement,
	getProp,
	getPropDef,
	isElement,
	isEqual,
	isVisible,
	log,
	makeOperationButton,
	makeSubclass,
	mapObject,
	mergeSort2,
	mixinEventHandling,
	objFromArray,
	onVisibilityChange,
	setPropDef,
	setTableCell,
	setElement,
} from '../../util/misc.js';

import Lock from '../../util/lock.js';
import {AggregateInfo} from '../../aggregates.js';
import {GridFilterSet} from '../../grid_filter.js';
import {GridRenderer} from '../../grid_renderer.js';
import {ComputedView} from '../../computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from '../../group_fun.js';

import handlebarsUtil from '../../util/handlebars.js';

import {TableExport, Csv} from '../../util/csv.js';
import flags from '../../flags.js';

// GridTable {{{1
// JSDoc Types {{{2

/**
 * @typedef {function} GridTable~RowRenderCb
 * A callback that gets executed when a row is rendered in the table.
 *
 * @param {jQuery} tr
 * The row we've just finished rendering.
 *
 * @param {object} opts
 * Additional information for the callback.
 *
 * @param {boolean} opts.isGroup
 * True if we're in group output.
 *
 * @param {boolean} opts.groupMode
 * The group output mode, either "summary" or "detail."
 *
 * @param {string} opts.groupField
 * In group output, detail mode, when rendering a group (i.e. non-leaf node): the name of the field
 * that is currently being rendered.  Example: When grouping by [State, County] this property can
 * either by "State" or "County" depending on what part of the tree is being rendered.
 *
 * @param {string} opts.rowValElt
 * In group output, detail mode, when rendering a group (i.e. non-leaf node): the shared value of
 * the field given by `opts.groupField` for all rows in the grouping currently being rendered.
 * Following the previous example, it could be "New Mexico" or "Donut County."
 *
 * @param {metadataNode} opts.groupMetadata
 * In group output, detail mode, when rendering a group (i.e. non-leaf node): additional metadata
 * from the grouping process.  Can be used to find the number of children, for example.
 *
 * @param {Array.<object>} rowData
 * In group output, detail mode, when rendering a row (i.e. leaf node): the data that has been
 * rendered.
 *
 * @param {number} rowNum
 * In group output, detail mode, when rendering a row (i.e. leaf node): the unique row identifier.
 */

/**
 * @typedef {function} GridTable~AddCols_Value_Plain
 *
 * @param {Array.<object>} rowData
 * The data of the row that has been rendered.
 *
 * @param {number} rowNum
 * The unique ID of thw row that was rendered.
 */

/**
 * @typedef {function} GridTable~AddCols_Value_Pivot
 *
 * @param {object} data
 * @param {number} groupNum
 */

/**
 * @typedef GridTable~AddCols
 *
 * @property {string} name
 * The name of the column to add, which appears in the table header.
 *
 * @property {GridTable~AddCols_Value_Plain|GridTable~AddCols_Value_Pivot} value
 * A function that is called to determine what gets put into the table cell.
 */

/**
 * @typedef GridTable~CtorOpts
 *
 * @property {boolean} [drawInternalBorders=true]
 * If true, draw borders between the cells in the table.
 *
 * @property {boolean} [zebraStriping=true]
 * If true, use subtle alternating background colors in the table rows.
 *
 * @property {boolean} [generateCsv=true]
 * If true, allow the generation of a CSV file from the table contents.
 *
 * @property {boolean} [stealGridFooter=true]
 * If true, absorb the element specified by `footer` into the table footer.
 *
 * @property {object} [addClass]
 * Additional classes to add when generating the table.
 *
 * @property {string} [addClass.table]
 * Classes to add on the table element itself.
 *
 * @property {Array.<GridTable~AddCols>} [addCols]
 * Columns to add to the table.  These are always computed as rows are rendered, and they are not
 * backed by the ComputedView so they can't be sorted or filtered.  This option is best used as a way of
 * adding some UI to the table row.
 *
 * @property {object} [events]
 * Callbacks to bind on various events.
 *
 * @property {GridTable~RowRenderCb} [events.rowRender]
 * A callback to invoke when a row is rendered.
 *
 * @property {jQuery} [footer]
 * **Internal** An element to put into the table footer.
 *
 * @property {boolean} [fixedHeight]
 * **Internal** If true, configure the table to scroll within the parent element.
 */

// Constructor {{{2

/**
 * @class
 * @extends GridRenderer
 *
 * An abstract base class for all grid tables (which are responsible for building the DOM elements
 * to represent the data in a tabular format).  Concrete subclasses must implement the following
 * methods:
 *
 *   - `drawHeader(columns, data, typeInfo, opts)`
 *   - `drawBody(data, typeInfo, columns, cont, opts)`
 *   - `addWorkHandler()`
 *   - `canRender()`
 *
 * @property {number} UNIQUE_ID
 * A unique number for this grid table, used to generate namespaces for event handlers.
 *
 * @property {string} id
 *
 * @property {Grid} grid
 *
 * @property {object} defn
 *
 * @property {ComputedView} view
 *
 * @property {object} features
 *
 * @property {GridTable~CtorOpts} opts
 * Additional options for the renderer.
 *
 * @property {Timing} timing
 *
 * @property {Array.<number>} selection
 * An array of the row IDs of selected rows.  The row ID here refers to that used by the source, so
 * the selection maps directly back to the underlying source data.
 *
 * @property {boolean} needsRedraw
 * If true, then the view has done something that requires us to be redrawn.
 *
 * @property {OrdMap} colConfig
 */

var GridTable = makeSubclass('GridTable', GridRenderer, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.selection = [];
	self.needsRedraw = false;
	self.contextMenuSelectors = [];
	self.csvLock = new Lock('GridTable/csv');
	self.focus = {
		rvi: [],
		cvi: []
	};

	defaults(self.opts, {
		drawInternalBorders: true,
		zebraStriping: true,
		generateCsv: true,
		stealGridFooter: true
	});
});

// Events {{{2

/**
 * Fired when columns have been resized automatically.  No longer used.
 *
 * @event GridTable#columnResize
 */

/**
 * Fired when the current GridRenderer subclass instance is unable to render the data from the view,
 * potentially because the view performed an operation (e.g. pivot) that this renderer is not able
 * to show the result of.
 *
 * @event GridTable#unableToRender
 *
 * @param {ComputedView~OperationsPerformed} ops
 * The operations performed by the view.
 */

/**
 * Fired when the output has been limited according to the renderer's limit configuration.
 *
 * @event GridTable#limited
 */

/**
 * Fired when all output is being shown, even though the grid is configured to limit output.  Most
 * likely, this is due to the number of rows not reaching the threshold configured for limiting.
 *
 * @event GridTable#unlimited
 */

/**
 * Fired when asynchronous CSV generation is finished.
 *
 * @event GridTable#csvReady
 */

/**
 * Fired periodically while generating the CSV file to indicate progress.  Before rendering starts,
 * it will be fired with a `progress` value of 0.  After rendering is done, it will be fired with a
 * `progress` value of 100.
 *
 * @event GridTable#generateCsvProgress
 *
 * @param {number} progress
 * The progress on a scale from 0 to 100.
 */

/**
 * Fired when rendering has started.
 *
 * @event GridTable#renderBegin
 */

/**
 * Fired when rendering has finished.
 *
 * @event GridTable#renderEnd
 */

mixinEventHandling(GridTable, [
		'columnResize'        // A column is resized.
	, 'unableToRender'      // A grid table can't render the data in the view it's bound to.
	, 'limited'             // The grid table isn't rendering all possible rows.
	, 'unlimited'           // The grid table is rendering all possible rows.
	, 'csvReady'            // CSV data has been generated.
	, 'generateCsvProgress' // CSV generation progress.
	, 'renderBegin'
	, 'renderEnd'
	, 'selectionChange'
]);

// #_validateFeatures {{{2

GridTable.prototype._validateFeatures = function () {
	var self = this;

	if (self.features.block && !jQuery.blockUI) {
		log.error('GRID TABLE // CONFIG',
							'Feature "block" requires BlockUI library, which is not present');
		self.features.block = false;
	}

	if (self.features.limit) {
		self._validateLimit();

		self.scrollEvents = ['DOMContentLoaded', 'load', 'resize', 'scroll'].map(function (x) {
			return x + '.wcdv_gt_' + self.UNIQUE_ID;
		}).join(' ');
	}

	if (self.features.floatingHeader) {
		self._validateFloatTableHeader();
	}
};

// #_validateLimit {{{2

/**
 * Make sure the limit configuration is good.  If there's anything wrong, the limit feature is
 * disabled automatically.
 */

GridTable.prototype._validateLimit = function () {
	var self = this;

	if (self.features.limit) {
		if (self.defn.table.limit.threshold === undefined) {
			debug.warn('GRID TABLE - PLAIN // DRAW', 'Disabling limit feature because no limit threshold was provided');
			self.features.limit = false;
		}
	}
};

// #_validateFloatTableHeader {{{2

GridTable.prototype._validateFloatTableHeader = function () {
	var self = this;

	if (!self.features.floatingHeader) {
		return;
	}

	var config = getPropDef({}, self.defn, 'table', 'floatingHeader');

	if (config.method != null) {

		// The user requested a specific method for doing the floating header, make sure that the
		// library required is actually available.

		switch (config.method) {
		case 'floatThead':
			if (jQuery.prototype.floatThead == null) {
				log.error('GRID TABLE // CONFIG', 'Requested floating header method "floatThead" is not available');
				self.features.floatingHeader = false;
			}
			break;
		case 'fixedHeaderTable':
			if (jQuery.prototype.fixedHeaderTable == null) {
				log.error('GRID TABLE // CONFIG', 'Requested floating header method "fixedHeaderTable" is not available');
				self.features.floatingHeader = false;
			}
			break;
		case 'tabletool':
			if (window.TableTool == null) {
				log.error('GRID TABLE // CONFIG', 'Requested floating header method "tabletool" is not available');
				self.features.floatingHeader = false;
			}
			break;
		case 'css':
			// TODO Check for browser support.
			break;
		default:
			log.error('GRID TABLE // CONFIG', 'Unrecognized floating header method: ' + config.method);
			self.features.floatingHeader = false;
		}
	}
	else {

		// The user didn't request a specific method for doing the floating header, so let's look at
		// what libraries are available and pick based on that.

		if (jQuery.prototype.floatThead) {
			config.method = 'floatThead';
		}
		else if (jQuery.prototype.fixedHeaderTable) {
			config.method = 'fixedHeaderTable';
		}
		else if (window.TableTool) {
			config.method = 'tabletool';
		}
		else if (true /* TODO Replace with actual check for browser support. */) {
			config.method = 'css';
		}
		else {
			self.features.floatingHeader = false;
		}
	}

	self.defn.table.floatingHeader = config;
};

// #toString {{{2

GridTable.prototype.toString = function () {
	var self = this;
	return 'GridTable(' + self.UNIQUE_ID + ')';
};

// #setCss {{{2

GridTable.prototype.setCss = function (elt, field) {
	var self = this;
	var fcc = self.colConfig.get(field);

	if (fcc == null) {
		return;
	}

	var css = [
		{ configName: 'width'        , cssName: 'width'      },
		{ configName: 'minWidth'     , cssName: 'min-width'  },
		{ configName: 'maxWidth'     , cssName: 'max-width'  },
		{ configName: 'cellAlignment', cssName: 'text-align' }
	];

	for (var i = 0; i < css.length; i += 1) {
		if (fcc[css[i].configName] !== undefined) {
			elt.css(css[i].cssName, fcc[css[i].configName]);
		}
	}
};

// #setAlignment {{{2

/**
 * Set the alignment on a table cell.
 *
 * @param {HTMLElement} elt
 * The element to set alignment on.
 *
 * @param {Grid~FieldColConfig} [fcc]
 * Column configuration for the field that this cell is based on.
 *
 * @param {Grid~FieldTypeInfo} [fti]
 * Type information for the field that this cell is based on.
 *
 * @param {string} [overrideType]
 * Override the type of the field, used when an aggregate function produces a result with a
 * different type than the source field (e.g. distinctValues of a date produces a string, not a
 * date, so `overrideType` should be "string").
 *
 * @param {string} [fallback]
 * Fallback default alignment when no alignment is determined by DataVis.
 */

GridTable.prototype.setAlignment = function (elt, fcc, fti, overrideType, fallback) {
	fcc = fcc || {};
	fti = fti || {};

	if (elt instanceof jQuery) {
		elt = elt.get(0);
	}

	if (!(elt instanceof Element)) {
		throw new Error('Call Error: `elt` must be an instance of Element');
	}

	var type = overrideType || fti.type;
	var alignment = fcc.cellAlignment || fallback;

	if (alignment == null && (type === 'number' || type === 'currency')) {
		alignment = 'right';
	}

	switch (alignment) {
	case 'left':
		elt.classList.add('wcdvgrid_textLeft');
		break;
	case 'right':
		elt.classList.add('wcdvgrid_textRight');
		break;
	case 'center':
		elt.classList.add('wcdvgrid_textCenter');
		break;
	case 'justify':
		elt.classList.add('wcdvgrid_textJustify');
		break;
	default:
		// We don't have a class for every possible value, so just set the style rule on the element in
		// those cases.  This should be extremely rare, given what we've covered above.
		elt.style.setProperty('text-align', alignment);
	}
};

// #_addSortingToHeader {{{2

/**
 * Attaches a sort icon to the given table header element, which (1) indicates the current sort, and
 * (2) when clicked brings up a menu to allow sorting by that header.
 *
 * @param {any} data
 *
 * @param {string} orientation
 * Indicates whether the sorting is `horizontal` (i.e. sorting reorders columns) or `vertical` (i.e.
 * sorting reorders rows).
 *
 * @param {ComputedView~SortSpec} spec
 * The sort spec.
 *
 * @param {Element} th
 * Where to place the sort icon.
 *
 * @param {Array.<ComputedView~AggInfo>} agg
 * Aggregate functions which we can sort by their results.
 */

GridTable.prototype._addSortingToHeader = function (data, orientation, spec, container, agg) {
	var self = this;

	if (!self.features.sort) {
		return;
	}

	if (['horizontal', 'vertical'].indexOf(orientation) < 0) {
		throw new Error('Call Error: `orientation` must be "horizontal" or "vertical"');
	}
	if (!(container instanceof Element)) {
		throw new Error('Call Error: `container` must be an Element');
	}

	var sortIcon_orientationClass = 'wcdv_sort_icon_' + orientation;

	/**
	 * @param {Element} span
	 * The sort indicator span to replace.
	 *
	 * @param {string} [dir]
	 * What direction we're sorting by, ascending or descending.
	 */

	var replaceSortIndicator = function (span, dir) {
		var i;

		if (!(span instanceof Element)) {
			throw new Error('Call Error: `span` must be an Element');
		}
		if (dir != null) {
			if (typeof dir !== 'string') {
				throw new Error('Call Error: `dir` must be null or a string');
			}
			else if (dir.toUpperCase() !== 'ASC' && dir.toUpperCase() !== 'DESC') {
				throw new Error('Call Error: `dir` must be either "ASC" or "DESC"');
			}
		}

		var th = container.closest('th');

		for (i = 0; i < span.children.length; i += 1) {
			span.children[i].classList.remove('wcdv_sort_arrow_active');
		}
		th.classList.remove('wcdv_sort_column_active');
		th.classList.remove('wcdv_bg-primary');

		if (dir != null) {
			th.classList.add('wcdv_sort_column_active');
			th.classList.add('wcdv_bg-primary');

			// Yes, this is backwards.  The FontAwesome icon for "ascending" points upwards, but I want to
			// color the one that points dowards, indicating that is the direction of increasing values.

			for (i = 0; i < span.children.length; i += 1) {
				var child = span.children[i];
				child.classList.remove('wcdv_sort_arrow_active');
				if (child.classList.contains('fa-sort-desc')) {
					child.classList.add('wcdv_sort_arrow_' + (dir.toUpperCase() === 'ASC' ? 'active' : 'inactive'));
				}
				if (child.classList.contains('fa-sort-asc')) {
					child.classList.add('wcdv_sort_arrow_' + (dir.toUpperCase() === 'DESC' ? 'active' : 'inactive'));
				}
			}
		}
	};

	/**
	 * Set the sorting for the view to the current orientation/spec, on the specified aggregate number
	 * and in the specified direction.
	 *
	 * @param {string} dir
	 *
	 * @param {number} [aggNum]
	 * If missing, no aggregate number is added to the sort spec.  Used when sorting directly by the
	 * field (e.g. in plain output) or by the group field index (e.g. in group detail output).
	 */

	var setSort = function (dir, aggNum) {
		if (typeof dir !== 'string') {
			throw new Error('Call Error: `dir` must be a string');
		}
		else if (dir.toUpperCase() !== 'ASC' && dir.toUpperCase() !== 'DESC') {
			throw new Error('Call Error: `dir` must be either "ASC" or "DESC"');
		}

		if (aggNum != null && typeof aggNum !== 'number') {
			throw new Error('Call Error: `aggNum` must be a number');
		}

		jQuery('span.' + sortIcon_orientationClass + '.fa-stack').each(function (i, elt) {
			replaceSortIndicator(elt);
		});

		jQuery('span.' + sortIcon_class).each(function (i, elt) {
			replaceSortIndicator(elt, dir);
		});

		spec.aggNum = aggNum;
		spec.dir = dir;

		var sortSpec = self.view.getSort() || {};
		sortSpec[orientation] = deepCopy(spec);
		self.view.setSort(sortSpec, self.makeProgress('Sort'));
	};

	var ascArrow, descArrow, sortIcon_class, sortIcon_span;

	if (flags['FontAwesome Method'] === 'font') {
		// Set the sort direction in the arrow icon.  The way we do this is by building a single
		// FontAwesome "stack" from the up and down carets.  Then we can style the one we want.

		ascArrow = document.createElement('span');
		ascArrow.classList.add('fa');
		ascArrow.classList.add('fa-sort-asc');
		ascArrow.classList.add('fa-stack-1x');

		descArrow = document.createElement('span');
		descArrow.classList.add('fa');
		descArrow.classList.add('fa-sort-desc');
		descArrow.classList.add('fa-stack-1x');

		sortIcon_class = gensym();

		sortIcon_span = fontAwesome('fa-stack', orientation === 'horizontal' ? 'fa-rotate-270' : null).get(0);
		sortIcon_span.classList.add(sortIcon_class);
		sortIcon_span.classList.add(sortIcon_orientationClass);
		sortIcon_span.classList.add('wcdv_sort_icon');
		sortIcon_span.appendChild(ascArrow);
		sortIcon_span.appendChild(descArrow);
	}
	else if (flags['FontAwesome Method'] === 'svg') {
		ascArrow = document.createElement('span');
		ascArrow.classList.add('fa');
		ascArrow.classList.add('fa-sort-asc');

		descArrow = document.createElement('span');
		descArrow.classList.add('fa');
		descArrow.classList.add('fa-sort-desc');

		sortIcon_class = gensym();

		sortIcon_span = document.createElement('span');
		sortIcon_span.classList.add('fa-layers');
		if (orientation === 'horizontal') {
			sortIcon_span.classList.add('fa-rotate-270');
		}
		sortIcon_span.classList.add(sortIcon_class);
		sortIcon_span.classList.add(sortIcon_orientationClass);
		sortIcon_span.classList.add('wcdv_sort_icon');
		sortIcon_span.appendChild(ascArrow);
		sortIcon_span.appendChild(descArrow);
	}

	var sortIcon_menu_items = {};

	var makeIcon = function (icon) {
		return flags['FontAwesome Method'] === 'font' ? icon :
			function (a, b, c, item) {
				var id = item._icon ? item._icon.id : gensym();
				if (item._icon) {
					// Remove the existing icon because contextmenu won't do it for you! The actual span
					// shouldn't be attached to the page anymore but we'll get rid of it just in case.
					jQuery(item._icon).remove();
					jQuery(document.getElementById(id)).remove();
				}
				return fontAwesome(icon).attr({id: id}).get(0);
			};
	};

	if (spec.field != null || spec.groupFieldIndex != null || spec.pivotFieldIndex != null) {

		// We're sorting by a field.  This can occur in these situations:
		//
		//   1. Sorting plain output by any column.
		//   2. Sorting group/pivot output by a field that we've grouped by.
		//   3. Sorting pivot output by a field that we've pivotted by.

		var name = spec.field != null
			? spec.field
			: spec.groupFieldIndex != null
			? data.groupFields[spec.groupFieldIndex]
			: spec.pivotFieldIndex != null
			? data.pivotFields[spec.pivotFieldIndex]
			: 'Unknown'
		;

		sortIcon_menu_items[gensym()] = {
			name: trans('GRID.TABLE.SORT_MENU.ASCENDING', name),
			icon: makeIcon('fa-sort-amount-asc'),
			callback: function () {
				window.setTimeout(function () {
					setSort('asc');
				});
			}
		};
		sortIcon_menu_items[gensym()] = {
			name: trans('GRID.TABLE.SORT_MENU.DESCENDING', name),
			icon: makeIcon('fa-sort-amount-desc'),
			callback: function () {
				window.setTimeout(function () {
					setSort('desc');
				});
			}
		};
		sortIcon_menu_items[gensym()] = '----';
	}
	else {

		// We're sorting by the result of an aggregate function.

		agg.forEach(function (aggInfo, aggNum) {
			if (spec.aggType != null && spec.aggNum !== aggNum) {
				return;
			}

			//var aggType = aggInfo.instance.getType();
			sortIcon_menu_items[gensym()] = {
				name: trans('GRID.TABLE.SORT_MENU.ASCENDING', aggInfo.instance.getFullName()),
				icon: makeIcon('fa-sort-amount-asc'),
				callback: function () {
					window.setTimeout(function () {
						setSort('asc', aggNum);
					});
				}
			};
			sortIcon_menu_items[gensym()] = {
				name: trans('GRID.TABLE.SORT_MENU.DESCENDING', aggInfo.instance.getFullName()),
				icon: makeIcon('fa-sort-amount-desc'),
				callback: function () {
					window.setTimeout(function () {
						setSort('desc', aggNum);
					});
				}
			};
			sortIcon_menu_items[gensym()] = '----';
		});
	}

	// Include an option to reset the sort.  This is just as much to fluff up the all-too-common
	// two-entry menu as anything else.

	sortIcon_menu_items.reset = {
		name: trans('GRID.TABLE.SORT_MENU.RESET_SORT'),
		icon: makeIcon('fa-ban'),
		callback: function () {
			window.setTimeout(function () {
				self.view.clearSort();
			});
		}
	};

	// Create the context menu.
	//
	// TODO The plugin allow the reuse of the menu among multiple targets.  See if we can use that
	// within the grid.
	//
	// TODO Does spawning a bunch of these (i.e. every time the table is redrawn) use a bunch of
	// memory?  Is there a way to destroy the menu to reclaim it?

	var sortIcon_menu = jQuery.contextMenu({
		selector: '.' + sortIcon_class,
		appendTo: self.ui.contextMenus,
		trigger: 'left',
		callback: function (itemKey, opt) {
			// This should never be called, it's only for items that don't specify their own callback,
			// which they all should be doing.
			console.log(itemKey);
		},
		items: sortIcon_menu_items
	});

	self.contextMenuSelectors.push('.' + sortIcon_class);

	container.appendChild(sortIcon_span);

	// Now check the existing sort specification in the view to see if any of the sort icons that we
	// just created should be lit up.

	var sortSpec_copy = deepCopy(self.view.getSort());
	var spec_copy = deepCopy(spec);

	if (sortSpec_copy[orientation]) {
		var currentDir = sortSpec_copy[orientation].dir;

		// Delete things that would be in the view's spec that aren't in the spec we were provided by
		// the caller (because they're independent of the user interface reflecting the sort).  This way
		// we can just do an object-object comparison to see if what we just made corresponds to the
		// sort that is already set in the view.  Crucially, for grid tables that redraw when the view
		// is updated, this is the only way you're ever going to see what the sort is.

		delete sortSpec_copy[orientation].dir;

		// Note that `aggNum` is an important part of the spec when sorting group or pivot aggregates
		// (i.e. total rows/columns) because they have their own row/column, and aren't thrown together
		// like cell aggregates are.

		if (spec.aggType == null) {
			delete sortSpec_copy[orientation].aggNum;
			delete spec_copy.aggNum;
		}

		console.debug('[DataVis // %s // Add Sorting] orientation = %s ; spec = %O ; current = %O ; dir = %s',
			self.toString(), orientation, spec_copy, sortSpec_copy[orientation], currentDir);

		if (isEqual(sortSpec_copy[orientation], spec_copy)) {
			replaceSortIndicator(sortIcon_span, currentDir);
		}
	}
};

// #_addFilterToHeader {{{2

GridTable.prototype._addFilterToHeader = function (container, field, displayText) {
	var self = this;

	if (self.grid.filterControl == null) {
		return;
	}

	jQuery('<button>', {
		'title': trans('GRID.TABLE.ADD_FILTER_HELP', field)
	})
		.addClass('wcdv_icon_button')
		.css({'color': '#FFF'})
		.append(fontAwesome('fa-filter'))
		.on('click', function () {
			self.grid.filterControl.addField(field, displayText, {
				openControls: true
			});
		})
		.tooltip({
			classes: {
				'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
			},
			show: { delay: 1000 }
		})
		.appendTo(container);
};

// #_addDrillDownHandler {{{2

GridTable.prototype._addDrillDownHandler = function (tbl, data) {
	var self = this;

	tbl.on('mousedown', function (evt) {
		if (evt.detail > 1) {
			evt.preventDefault();
		}
	});
	tbl.on('dblclick', 'td.wcdv_drill_down', function () {
		if (window.getSelection) {
			window.getSelection().removeAllRanges();
		}
		else if (document.selection) {
			document.selection.empty();
		}

		var elt = jQuery(this);
		var filter = deepCopy(self.view.getFilter());
		var rowValIndex = elt.dvAttr('rvi');
		var colValIndex = elt.dvAttr('cvi');

		if (rowValIndex != null) {
			data.rowVals[rowValIndex].forEach(function (x, i) {
				var gs = data.groupSpec[i];
				filter[data.groupFields[i]] = gs.fun != null
					? GROUP_FUNCTION_REGISTRY.get(gs.fun).valueToFilter(x)
					: { '$eq': x };
			});
		}

		if (colValIndex != null) {
			data.colVals[colValIndex].forEach(function (x, i) {
				var ps = data.pivotSpec[i];
				filter[data.pivotFields[i]] = ps.fun != null
					? GROUP_FUNCTION_REGISTRY.get(ps.fun).valueToFilter(x)
					: { '$eq': x };
			});
		}

		console.debug('[DataVis // %s // Drill Down] Creating new perspective: filter = %O', self.toString(), filter);

		window.setTimeout(function () {
			self.view.prefs.addPerspective(null, 'Drill Down', { view: { filter: filter } }, { isTemporary: true }, null, { onDuplicate: 'replace' });
		});
	});
};

// #_addDrillDownClass {{{2

GridTable.prototype._addDrillDownClass = function (elt) {
	elt.classList.add('wcdv_drill_down');
};

GridTable.prototype._updateFocus = function (tbl) {
	var self = this;

	tbl.find('td').removeClass('wcdv_focus');

	self.focus.rvi.forEach(function (rvi) {
		tbl.find('td[data-wcdv-rvi=' + rvi + ']').addClass('wcdv_focus');
	});

	self.focus.cvi.forEach(function (cvi) {
		tbl.find('td[data-wcdv-cvi=' + cvi + ']').addClass('wcdv_focus');
	});
}

// #_addFocusHandler {{{2

GridTable.prototype._addFocusHandler = function (tbl, data) {
	var self = this;

	tbl._onSingleClick('tr[data-wcdv-rvi] > th', function () {
		var rvi = jQuery(this).parent('tr').attr('data-wcdv-rvi');

		if (rvi == null || rvi === '') {
			return;
		}

		var fi = self.focus.rvi.indexOf(rvi);

		if (fi < 0) {
			// Adding a new focus for this rowval.
			self.focus.rvi.push(rvi);
		}
		else {
			// Remove the focus for this rowval.
			self.focus.rvi.splice(fi, 1);
		}

		self._updateFocus(tbl);
	}, ['shift']);

	tbl._onSingleClick('th[data-wcdv-cvi]', function () {
		var cvi = jQuery(this).attr('data-wcdv-cvi');

		if (cvi == null || cvi === '') {
			return;
		}

		var fi = self.focus.cvi.indexOf(cvi);

		if (fi < 0) {
			// Adding a new focus for this rowval.
			self.focus.cvi.push(cvi);
		}
		else {
			// Remove the focus for this rowval.
			self.focus.cvi.splice(fi, 1);
		}

		self._updateFocus(tbl);
	}, ['shift']);
};

// #addSortHandler {{{2

GridTable.prototype.addSortHandler = function () {
	var self = this;

	// Register the event handler for when a sort occurs in the view.  The way this works is that
	// the view will invoke the callback for each row in order.  We just append them to the table
	// body in that same order, and boom: all the rows are sorted.
	//
	// However, we DON'T want to do this if we're limiting the output because we're currently only
	// showing part of the data.  So, when we sort, we need to completely redraw the window (e.g.
	// rows 21-40) that we're showing.
	//
	// FIXME - This will cause problems with multiple grids (some supporting sorting, some not)
	// using the same view.

	self.view.off('sort');

	if (self.features.sort) {
//		if (self.features.limit) {
			self.view.on('sortEnd', function () {
				console.debug('[DataVis // %s // Handler(ComputedView.sortEnd)] Marking table to be redrawn', self.toString());
				self.needsRedraw = true;
			}, { who: self });
//		}
//		else {
//			self.view.on('sort', function (rowNum, position) {
//				var elt = jQuery(document.getElementById(self.defn.table.id + '_' + rowNum));
//
//				// Add one to the position (which is 0-based) to match the 1-based row number in CSS.
//
//				elt.removeClass('even odd');
//				elt.addClass((position + 1) % 2 === 0 ? 'even' : 'odd');
//				self.ui.tbody.append(elt);
//
//				self.csv.setOrder(rowNum, position);
//			}, { who: self });
//		}
	}
};

// #addFilterHandler {{{2

GridTable.prototype.addFilterHandler = function () {
	var self = this;

	// Register the event handler for when a filter occurs in the view.  The way this works is that
	// the view will invoke the callback for each row and indicate if it should be shown or hidden.
	//
	// However, we DON'T want to do this if we're limiting the output because we're currently only
	// showing part of the data.  So, when we filter, we need to completely redraw the window (e.g.
	// rows 21-40) that we're showing.
	//
	// We also can't use this approach when we're using preferences, because those can cause the data
	// to be filtered down before our grid actually creates all the rows.  (The prefs are applied
	// before the grid table is created.)  At that point, showing or hiding rows is irrelevant because
	// the grid table doesn't event know what the unfiltered ones are, it's only ever seen the data
	// with filters applied.

	self.view.off('filter');

//	if (self.features.limit || self.view.opts.saveViewConfig) {
		self.view.on(ComputedView.events.filterEnd, function () {
			console.debug('[DataVis // %s // Handler(ComputedView.filterEnd)] Marking table to be redrawn', self.toString());
			self.needsRedraw = true;
		}, { who: self });
//	}
//	else {
//		var even = false; // Rows are 1-based to match our CSS zebra-striping.
//
//		self.view.on(ComputedView.events.filter, function (rowNum, hide) {
//			if (isNothing(self.ui.tr[rowNum])) {
//				console.debug('[DataVis // ' + 'GRID TABLE // HANDLER (ComputedView.filter)', 'We were told to ' + (hide ? 'hide' ] 'show') + ' row ' + rowNum + ', but it doesn\'t exist');
//				return;
//			}
//
//			self.ui.tr[rowNum].removeClass('even odd');
//			if (hide) {
//				self.ui.tr[rowNum].hide();
//			}
//			else {
//				self.ui.tr[rowNum].show();
//				self.ui.tr[rowNum].addClass(even ? 'even' : 'odd');
//				even = !even;
//			}
//
//			self.csv.updateVisibility(rowNum, hide);
//		}, { who: self });
//	}
};

// #_addRowReorderHandler {{{2

GridTable.prototype._addRowReorderHandler = function () {
	var self = this;

	self.ui.tbody._makeSortableTable(self.view.source.swapRows.bind(self.view.source));
};

// #_addRowSelectHandler {{{2

/**
 * Add an event handler for the row select checkboxes.  The event is bound on `self.ui.tbody` and
 * looks for checkbox inputs inside TD elements with class `wcdv-row-select-col` to actually handle
 * the events.  The handler calls `self.select(ROW_NUM)` or `self.unselect(ROW_NUM)` when the
 * checkbox is changed.
 */

GridTable.prototype._addRowSelectHandler = function () {
	var self = this;

	self.ui.tbody.on('change', 'td.wcdv-row-select-col > input[type="checkbox"]', function () {
		if (this.checked) {
			self.select(+(jQuery(this).attr('data-row-num')));
		}
		else {
			self.unselect(+(jQuery(this).attr('data-row-num')));
		}
	});
};

// #_getAggInfo {{{2

GridTable.prototype._getAggInfo = function (data) {
	var ai = objFromArray(['cell', 'group', 'pivot', 'all'], [[]]);
	ai = mapObject(ai, function (val, key) {
		return getPropDef([], data, 'agg', 'info', key).filter(
			function (aggInfo) {
				return !aggInfo.isHidden;
			}
		);
	});
	return ai;
};

// #_getDisplayFormat {{{2

GridTable.prototype._getDisplayFormat = function () {
	var self = this;
	var df = objFromArray(['cell', 'group', 'pivot', 'all'], [[]]);
	df = mapObject(df, function (val, key) {
		return getPropDef([], self.opts, 'displayFormat', key)
	});
	return df;
};

// #_setupFullValueWin {{{2

/**
 * Setup the behavior to show the full value of a cell when it's been truncated due to having the
 * `maxHeight` property set in the column config.
 *
 * For plain output, you need to set:
 *
 *   - `data-row-num` on the TR
 *   - `data-wcdv-field` on the TD
 *
 * For group & pivot output, you need to set:
 *
 *   - `data-wcdv-rvi` on the TR (for group & cell aggregates)
 *   - `data-wcdv-cvi` on the TD (for pivot & cell aggregates)
 *   - `data-wcdv-agg-scope` on the TD
 *   - `data-wcdv-agg-num` on the TD
 */

GridTable.prototype._setupFullValueWin = function (data) {
	var self = this;

	// Create a window that will show the full value of a cell whose display has been truncated by
	// setting the `maxHeight` property in the column configuration.

	var fullValueWinDiv = document.createElement('div');

	var fullValueWinEffect = {
		effect: 'fade',
		duration: 100
	};

	var fullValueWin = jQuery('<div>', { title: 'Full Value' }).dialog({
		autoOpen: false,
		modal: true,
		width: 800,
		maxHeight: 600,
		classes: {
			"ui-dialog": "ui-corner-all wcdv_dialog",
			"ui-dialog-titlebar": "ui-corner-all",
		},
		show: fullValueWinEffect,
		hide: fullValueWinEffect,
	});

	fullValueWin.append(fullValueWinDiv);

	// When the "show full value" button is clicked, use the attached data attributes to determine the
	// value that will be shown in the window.

	self.ui.tbody.on('click', 'button.wcdv_show_full_value', function (evt) {
		evt.stopPropagation();

		var btn = jQuery(this);
		var td = btn.parents('td');
		var tr = td.parents('tr');

		var field
			, rowNum
			, rvi
			, cvi
			, aggScope
			, aggNum
			, aggInfo
			, aggResult
			, val;

		if (data.isPlain) {
			field = td.attr('data-wcdv-field');
			rowNum = +tr.attr('data-row-num');
			val = getProp(data, 'data', rowNum, 'rowData', field, 'cachedRender');
			setElement(fullValueWinDiv, val);
		}
		else if (data.isGroup || data.isPivot) {
			aggScope = td.attr('data-wcdv-agg-scope');
			aggNum = +td.attr('data-wcdv-agg-num');

			switch (aggScope) {
			case 'cell':
				rvi = +tr.dvAttr('rvi');
				cvi = +td.dvAttr('cvi');
				aggResult = data.agg.results[aggScope][aggNum][rvi][cvi];
				break;
			case 'group':
				rvi = +tr.dvAttr('rvi');
				aggResult = data.agg.results[aggScope][aggNum][rvi];
				break;
			case 'pivot':
				cvi = +td.dvAttr('cvi');
				aggResult = data.agg.results[aggScope][aggNum][cvi];
				break;
			case 'all':
				aggResult = data.agg.results[aggScope][aggNum];
				break;
			}

			aggInfo = data.agg.info[aggScope][aggNum];
			field = getProp(aggInfo, 'fields', 0);

			if (isElement(aggResult)) {
				setElement(fullValueWinDiv, aggResult);
			}
			else {
				if (aggInfo.instance.inheritFormatting) {
					val = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
						overrideType: aggInfo.instance.getType()
					});
					setElement(fullValueWinDiv, val, {
						field: aggInfo.fields[0],
						colConfig: aggInfo.colConfig[0],
						typeInfo: aggInfo.typeInfo[0]
					});
				}
				else {
					val = format(null, null, aggResult, {
						overrideType: aggInfo.instance.getType(),
						decode: false
					});
					setElement(fullValueWinDiv, val);
				}
			}
		}

		fullValueWin.dialog('open');
	});
};

// #draw {{{2

GridTable.prototype.draw = function (root, opts, cont) {
	var self = this
		, args = Array.prototype.slice.call(arguments);

	if (self.opts.generateCsv) {
		if (self.csvLock.isLocked()) {
			return self.csvLock.onUnlock(function () {
				console.debug('[DataVis // %s // CSV] Retrying table draw due to CSV lock: %O %O', self.toString(), root, opts);
				self.draw.apply(self, args);
			});
		}
		else {
			console.debug('[DataVis // %s // CSV] Creating new CSV buffer', self.toString());
			self.csvLock.lock();
			self.csv = new Csv();
		}
	}
	else {
		self.csv = new TableExport();
	}

	return self.super.draw(root, opts, function (ok, data, typeInfo, andThen) {
		if (!ok) {
			return cont();
		}

		self.timing.start(['Grid Table', 'Draw']);

		// Configuration for floating header feature.

		if (!self.features.floatingHeader || self.defn.table.floatingHeader.method !== 'tabletool') {
			root.css({ 'overflow-x': 'auto' });
		}

		// Configuration for limit feature.

		if (self.features.limit && self.defn.table.limit.method === 'more') {
			self.scrollEventElement = self.opts.fixedHeight ? self.root : window;
			jQuery(self.scrollEventElement).on(self.scrollEvents, function () {
				if (typeof self.moreVisibleHandler === 'function') {
					self.moreVisibleHandler();
				}
			});
		}

		// All operations buttons share the same 'onClick' callback.

		if (self.features.operations) {
			jQuery(self.root).on('click.wcdv_operation', 'button.wcdv_operation', function () {
				var btn = this;
				var opType = btn.getAttribute('data-operation-type');
				var opIndex = btn.getAttribute('data-operation-index');
				var sel, cellElt, rowElt, rowNum, field, op;

				switch (opType) {
				case 'row':
					rowElt = jQuery(btn).parents('tr');
					rowNum = +(rowElt.attr('data-row-num'));
					op = self.defn.operations.row[opIndex];
					op.callback({
						rowId: rowNum,
						rowElt: rowElt,
						row: self.data.dataByRowId[rowNum],
						opBtn: jQuery(btn)
					});
					break;
				case 'cell':
					cellElt = jQuery(btn).parents('td');
					field = jQuery(btn).parents('td').attr('data-wcdv-field');
					rowElt = jQuery(btn).parents('tr');
					rowNum = +(jQuery(btn).parents('tr').attr('data-row-num'));
					op = self.defn.operations.cell[field][opIndex];
					op.callback({
						rowId: rowNum,
						rowElt: rowElt,
						row: self.data.dataByRowId[rowNum],
						cellElt: cellElt,
						cell: self.data.dataByRowId[rowNum][field].value,
						opBtn: jQuery(btn)
					});
					break;
				}
			});
		}

		var tr;
		var srcIndex = 0;

		self.ui = {
			tbl: jQuery('<table>'),
			thead: jQuery('<thead>'),
			tbody: jQuery('<tbody>'),
			tfoot: jQuery('<tfoot>'),
			thMap: {},
			tr: {},
			progress: jQuery('<div>'),
			contextMenus: jQuery('<div>')
		};

		self._addDrillDownHandler(self.ui.tbl, data);
		self._addFocusHandler(self.ui.tbl, data);

		if (self.features.block) {
			var blockConfig = {
				overlayCSS: {
					opacity: 0.9,
					backgroundColor: '#FFF'
				}
			};

			if (self.features.progress && getProp(self.defn, 'table', 'progress', 'method') === 'jQueryUI') {
				blockConfig.message = jQuery('<div>')
					.append(jQuery('<h1>').text('Working...'))
					.append(self.ui.progress);
			}
		}

		self.ui.contextMenus.appendTo(document.body);

		self.view.on(ComputedView.events.workBegin, function () {
			if (self.features.block) {
				console.debug('[DataVis // %s // Handler(ComputedView.workBegin)] Blocking table body', self.toString());
				if (getProp(self.defn, 'table', 'block', 'wholePage')) {
					jQuery.blockUI(blockConfig);
				}
				else {
					self.ui.tbl.block(blockConfig);
				}
			}
			if (self.features.floatingHeader) {
				switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
				case 'tabletool':
					window.TableTool.update();
					break;
				}
			}
		}, { who: self });

		self.view.on(ComputedView.events.workEnd, function () {
			if (self.features.block) {
				console.debug('[DataVis // %s // Handler(ComputedView.workEnd)] Unblocking table body', self.toString());
				if (getProp(self.defn, 'table', 'block', 'wholePage')) {
					jQuery.unblockUI();
				}
				else {
					self.ui.tbl.unblock();
				}
			}
			if (self.features.floatingHeader) {
				switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
				case 'tabletool':
					window.TableTool.update();
					break;
				}
			}
		}, { who: self });

		/*
		 * Determine what columns will be in the table.  This comes from the user, or from the data
		 * itself.  We may then add columns for extra features (like row selection or reordering).
		 */

		var columns = determineColumns(self.colConfig, data, typeInfo);

		self.drawHeader(columns, data, typeInfo, opts);

		if (self.features.footer) {
			self.drawFooter(columns, data, typeInfo);
		}

		self.addSortHandler();

		if (self.features.rowSelect) {
			if (typeof self._addRowSelectHandler !== 'function') {
				log.warn('Requested feature "rowSelect" is not available: `_addRowSelectHandler` method does not exist');
			}
			else {
				self._addRowSelectHandler();
			}
		}

		if (self.features.rowReorder) {
			self._addRowReorderHandler();
		}

		if (self.opts.zebraStriping) {
			self.ui.tbl.addClass('zebra');
		}

		if (getProp(self.opts, 'addClass', 'table')) {
			self.ui.tbl.addClass(getProp(self.opts, 'addClass', 'table'));
		}

		self.ui.tbl.append(self.ui.thead);

		if (self.features.incremental && !getProp(self.defn, 'table', 'incremental', 'appendBodyLast')) {
			self.ui.tbl.append(self.ui.tbody);

			if (self.features.footer) {
				self.ui.tbl.append(self.ui.tfoot);
			}
		}

		// IMPORTANT: We use appendChild() here instead of jQuery's append() because the latter will
		// re-run any <script> elements in the footer, which we don't want.

		self.root.get(0).appendChild(self.ui.tbl.get(0));

		self.drawBody(data, typeInfo, columns, function () {
			if (!self.features.incremental || getProp(self.defn, 'table', 'incremental', 'appendBodyLast')) {
				self.ui.tbl.append(self.ui.tbody);

				if (self.features.footer) {
					self.ui.tbl.append(self.ui.tfoot);
				}
			}

			// Activate TableTool using this attribute, if the user asked for it.

			if (self.features.floatingHeader) {
				console.debug('[DataVis // %s // Draw] Enabling floating header using method "%s"',
					self.toString(), getProp(self.defn, 'table', 'floatingHeader', 'method'));
				switch (getProp(self.defn, 'table', 'floatingHeader', 'method')) {
				case 'floatThead':
					var floatTheadConfig = {
						zIndex: 1
					};

					if (self.opts.fixedHeight) {
						floatTheadConfig.position = 'fixed';
						floatTheadConfig.scrollContainer = true;
					}
					else {
						floatTheadConfig.responsiveContainer = function () {
							return self.root;
						};
					}

					self.grid.on('showControls', function () {
						self.ui.tbl.floatThead('reflow');
					}, { who: self });
					self.grid.on('hideControls', function () {
						self.ui.tbl.floatThead('reflow');
					}, { who: self });
					self.grid.filterControl.on(['fieldAdded', 'fieldRemoved'], function () {
						self.ui.tbl.floatThead('reflow');
					}, { who: self });
					self.grid.aggregateControl.on(['fieldAdded', 'fieldRemoved'], function () {
						self.ui.tbl.floatThead('reflow');
					}, { who: self });

					self.ui.tbl.floatThead(floatTheadConfig);
					break;
				case 'tabletool':
					if (self.opts.fixedHeight) {
						self.ui.tbl.attr('data-tttype', 'fixed');
						self.ui.tbl.attr('data-ttheight', self.grid.rootHeight);
					}
					else {
						self.ui.tbl.attr('data-tttype', 'sticky');
					}
					if (data.isPlain) {
						var pinnedColumns = 0;
						columns.forEach(function (field) {
							var fcc = self.colConfig.get(field);
							if (fcc != null && fcc.isPinned) {
								pinnedColumns += 1;
							}
						});
						if (pinnedColumns > 0) {
							// Figure out if there's a column for the row selection checkbox.
							if (self.features.rowSelect) {
								pinnedColumns += 1;
							}
							// Figure out if there's a column for row-based operations.
							if (self.hasOperations('row')) {
								pinnedColumns += 1;
							}
							self.ui.tbl.attr('data-tttype', 'sidescroll');
							self.ui.tbl.attr('data-ttsidecells', pinnedColumns);
						}
					}
					else if ((data.isGroup || data.isPivot) && getProp(self.defn, 'table', 'whenGroup', 'pinRowvals')) {
						self.ui.tbl.attr('data-tttype', 'sidescroll');
						self.ui.tbl.attr('data-ttsidecells', data.groupFields.length);
					}
					break;
				case 'css':
					self.ui.thead.addClass('sticky');
					self.ui.tfoot.addClass('sticky');
					break;
				}
			}

			// This isn't fast or reliable but it is one way to get rid of excess "show full value" buttons
			// if the cell doesn't actually get cut off.  It's fine for small numbers of cells, but once you
			// get over like 1000 cells it's going to take a while.  Plus, it technically needs to be rerun
			// whenever the table size changes.  I just want to leave it here in case I need it later.

			// jQuery(self.ui.tbody).find('div.wcdv_maxheight_wrapper').each(function (i, elt) {
			// 	var s = window.getComputedStyle(elt);
			// 	var height = s.height.slice(0, -2);
			// 	var maxHeight = s.maxHeight.slice(0, -2);
			// 	if (+height < +maxHeight) {
			// 		jQuery(elt).children('button.wcdv_show_full_value').hide();
			// 	}
			// });

			self.addWorkHandler();

			self.timing.stop(['Grid Table', 'Draw']);
			andThen(cont);
		}, opts);
	});
};

// #drawHeader_aggregates {{{2

/**
 * Add TH elements for all the aggregates to the specified TR.
 *
 * @param {Object} data
 *
 * @param {Element} tr
 * Where to put the TH elements.
 */

GridTable.prototype.drawHeader_aggregates = function (data, tr, displayOrderIndex, displayOrderMax) {
	var self = this;
	var ai = self._getAggInfo(data);

	ai.group.forEach(function (aggInfo, aggIndex) {
		var aggNum = aggInfo.aggNum,
			text = aggInfo.instance.getFullName(),
			span = jQuery('<span>')
				.addClass('wcdv_heading_title')
				.text(text),
			headingThControls = jQuery('<div>'),
			headingThContainer = jQuery('<div>')
				.addClass('wcdv_heading_container')
				.append(span, headingThControls),
			th = jQuery('<th>')
				.append(headingThContainer)
				.appendTo(tr);

		if (self.opts.drawInternalBorders || data.agg.info.group.length > 1) {
			if (displayOrderIndex > 0 && aggIndex === 0) {
				th.addClass('wcdv_bld'); // border-left: double
			}
			if (displayOrderIndex < displayOrderMax - 1 && aggIndex === ai.group.length - 1) {
				th.addClass('wcdv_brd'); // border-right: double
			}
			if (aggIndex > 0) {
				th.addClass('wcdv_pivot_colval_boundary');
			}
		}
		self.csv.addCol(text);
		self._addSortingToHeader(data, 'vertical', {aggType: 'group', aggNum: aggNum}, headingThControls.get(0), ai.group);
		self.setAlignment(th, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());
	});
};

// #drawHeader_addCols {{{2

/**
 * Add user-defined columns to the header.
 */

GridTable.prototype.drawHeader_addCols = function (tr, typeInfo, opts) {
	var self = this;
	var span, th;

	if (self.opts.addCols) {
		self.opts.addCols.forEach(function (addCol) {
			span = jQuery('<span>')
				.text(addCol.name);

			th = jQuery('<th>')
				.append(span)
				.appendTo(tr);

			self.csv.addCol(addCol.name);

			// When the added column is an aggregate function over some field, we can use that information
			// to look up the colConfig and typeInfo of the field to determine the alignment.  For example
			// if the aggregate is Max(Age) we can look up Age and find it's a number and therefore should
			// be right-aligned.
			//
			// TODO Implement this for the aggregate type as well, as aggregates like Sum() only produce
			// numbers which should be right-aligned.

			if (getProp(opts, 'pivotConfig', 'aggField')) {
				self.setAlignment(th, self.colConfig.get(opts.pivotConfig.aggField), typeInfo.get(opts.pivotConfig.aggField));
			}
		});
	}
};

// #drawBody_rowVals {{{2

/**
 * Draw the rowvals from a single group.  For example, if grouping by "State" and "County", group
 * number 0 might be the rowval `["Alabama", "Autauga"]` — and that's what this function would put
 * out as TH elements.
 *
 * @param {object} data
 *
 * @param {Element} tr
 * The row to attach the TH elements to.
 *
 * @param {number} rowValIndex
 * What group number you want to print out.
 */

GridTable.prototype.drawBody_rowVals = function (data, tr, rowValIndex) {
	var self = this;

	if (!(tr instanceof Element)) {
		throw new Error('Call Error: `tr` must be an instance of Element');
	}

	if (typeof rowValIndex !== 'number') {
		throw new Error('Call Error: `rowValIndex` must be a number');
	}

	// Create the cells that show the values of the grouped columns.
	//
	// EXAMPLE
	// -------
	//
	//   groupFields = ["First Name", "Last Name"]
	//   rowVals = [["Luke", "Skywalker"], ...]
	//
	// <tr>
	//   <th>Luke</th>
	//   <th>Skywalker</th>
	//   ... row[col] | col ∉ groupFields ...
	// </tr>

	var leafMetadataNode = data.groupMetadata.lookup.byRowValIndex[rowValIndex];
	var metadataNode = leafMetadataNode;
	var th = [];
	var i;

	// Iterate through the group fields from last to first, navigating through the group metadata tree
	// from leaf (last group field) to root (first group field).  Along the way, construct the <TH>
	// elements for the rowval elements in reverse order.

	for (i = data.groupFields.length - 1; i >= 0; i -= 1) {
		var groupField = data.groupFields[i];
		var groupSpec = data.groupSpec[i];
		var fcc = self.colConfig.get(groupField) || {};
		var t = self.typeInfo.get(groupField);
		var v = metadataNode.rowValCell || metadataNode.rowValElt;

		if (groupSpec.fun != null) {
			t = {
				type: GROUP_FUNCTION_REGISTRY.get(groupSpec.fun).resultType
			};
			v = metadataNode.rowValElt;
		}

		// The rowValCell is a representative cell that matches the rowValElt.  If there is more than
		// one rowVal containing the same rowValElt, the rowValCell is shared between them all.  It's
		// the same representative cell.  Because it's shared, we need to enable `saferCaching` so any
		// Element produced by a `render` function on the cell doesn't get reused and moved around on
		// the page.  A good example of this issue can be seen in the allowHtml tests, on the link3 and
		// link4 fields which use a `render` function to create an <A> element.
		//
		// After more difficulty was discovered, `saferCaching` was turned on by default.  This will
		// have some performance impacts, but until a different way is found to implement this, it's
		// necessary.

		v = format(fcc, t, v);

		// TH (th[i])
		//   DIV (headingThContainer)
		//     SPAN (headingThValue)
		//     DIV (headingThControls)

		var headingThValue = document.createElement('span');
		headingThValue.classList.add('wcdv_heading_title');

		var headingThControls = document.createElement('div');

		var headingThContainer = document.createElement('div');
		headingThContainer.classList.add('wcdv_heading_container');
		headingThContainer.appendChild(headingThValue);
		headingThContainer.appendChild(headingThControls);

		th[i] = document.createElement('th');
		th[i].appendChild(headingThContainer);

		if (v instanceof jQuery) {
			v = v.get(0);
		}

		if (v instanceof Element) {
			headingThValue.appendChild(v);
		}
		else if (fcc.allowHtml) {
			headingThValue.innerHTML = v;
		}
		else {
			headingThValue.innerText = v;
		}

		self.csv.addCol(headingThValue.innerText, {
			prepend: true
		});

		if (data.isPivot && i === data.groupFields.length - 1) {
			self._addSortingToHeader(data, 'horizontal', {rowVal: data.rowVals[rowValIndex], aggNum: 0}, headingThControls, getPropDef([], data, 'agg', 'info', 'cell'));
		}

		metadataNode = metadataNode.parent;
	}

	for (i = 0; i < data.groupFields.length; i += 1) {
		tr.appendChild(th[i]);
	}
};

// #drawBody_groupAggregates {{{2

/**
 * Render the group aggregate results in a row.
 *
 * @param {any} data
 *
 * @param {Element} tr
 * Row to which we add the group aggregate results.
 *
 * @param {number} groupNum
 * Group number (a.k.a. the rowVal index) to render the aggregate results for.
 *
 * @param {number} displayOrderIndex
 * What position we're rendering the group aggregate results in.  When greater than zero, draw a
 * left border.
 *
 * @param {number} displayOrderMax
 * The max number of positions for rendering data.  When this isn't the last thing rendered, draw a
 * right border.
 */

GridTable.prototype.drawBody_groupAggregates = function (data, tr, groupNum, displayOrderIndex, displayOrderMax) {
	var self = this;
	var ai = self._getAggInfo(data);

	// Go through all the group aggregates and create columns for each one in the specified row.

	ai.group.forEach(function (aggInfo, aggGroupIndex) {
		var aggNum = aggInfo.aggNum;
		var aggType = aggInfo.instance.getType();
		var aggResult = data.agg.results.group[aggNum][groupNum];
		var text;

		var td = document.createElement('td');
		td.setAttribute('data-wcdv-rvi', groupNum);
		td.setAttribute('data-wcdv-agg-scope', 'group');
		td.setAttribute('data-wcdv-agg-num', aggNum);

		if (aggResult instanceof jQuery) {
			aggResult = aggResult.get(0);
		}

		if (aggResult instanceof Element) {
			td.appendChild(aggResult);
			self.csv.addCol(getElement(aggResult).innerText);
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
				td.setAttribute('data-wcdv-field', aggInfo.fields[0]);
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

		// Allow drilldown, but only when there's no group function set.  This limitation is currently
		// in place because we lack the ability to set filters that match all group functions' results.
		// For example, day of week, because we can't filter to show "only Mondays."

		if (data.groupSpec.every(function (gs) {
			return gs.fun == null || GROUP_FUNCTION_REGISTRY.get(gs.fun).canFilter
		})) {
			self._addDrillDownClass(td);
		}

		// Decide how we should draw borders based on the display order index & max.

		if (self.opts.drawInternalBorders || data.agg.info.group.length > 1) {
			if (displayOrderIndex > 0 && aggGroupIndex === 0) {
				td.classList.add('wcdv_bld'); // border-left: double
			}
			if (displayOrderIndex < displayOrderMax - 1 && aggGroupIndex === ai.group.length - 1) {
				td.classList.add('wcdv_brd'); // border-right: double
			}
			if (aggGroupIndex > 0) {
				td.classList.add('wcdv_pivot_colval_boundary');
			}
		}

		self.setAlignment(td, aggInfo.colConfig[0], aggInfo.typeInfo[0], aggInfo.instance.getType());
		tr.appendChild(td);
	});
};

// #clear {{{2

/**
 * Remove the table from page.
 */

GridTable.prototype.clear = function () {
	var self = this;

	if (getProp(self, 'ui', 'contextMenus') != null) {
		self.ui.contextMenus.remove();
	}

	console.debug('[DataVis // %s // Clear] Removing %d context menus', self.toString(), self.contextMenuSelectors.length);

	self.contextMenuSelectors.forEach(function (sel) {
		jQuery.contextMenu('destroy', sel);
	});

	self.contextMenuSelectors = [];

	if (self.features.limit && self.defn.table.limit.method === 'more') {
		jQuery(self.scrollEventElement).off(self.scrollEvents);
	}

	if (self.features.operations) {
		jQuery(self.root).off('click.wcdv_operation', 'button.wcdv_operation');
	}

	// Remove the event handler from clicking on the "show full value" buttons.

	if (getProp(self, 'ui', 'tbody') != null) {
		self.ui.tbody.off('click', 'button.wcdv_show_full_value');
	}

	self.view.off('*', self, {silent: true});

	if (self.opts.footer != null && self.opts.stealGridFooter) {
		self.grid.ui.content.get(0).appendChild(self.opts.footer.get(0));
	}

	self.root.children().remove();
};

// #makeProgress {{{2

GridTable.prototype.makeProgress = function (thing) {
	var self = this;

	if (!self.features.progress) {
		return;
	}

	if (getProp(self.defn, 'table', 'progress', 'method') === 'NProgress') {
		return {
			begin: function () {
				console.debug('[DataVis // %s // Progress(%s)] Begin', self.toString(), thing);
				if (window.NProgress !== undefined) {
					window.NProgress.start();
				}
			},
			update: function (amount, estTotal) {
				console.debug('[DataVis // %s // Progress(%s)] %s', self.toString(), thing, sprintf.sprintf('Update: %d / %d = %.0f%%', amount, estTotal, (amount / estTotal) * 100));
				if (window.NProgress !== undefined) {
					window.NProgress.set(amount / estTotal);
				}
			},
			end: function () {
				console.debug('[DataVis // %s // Progress(%s)] End', self.toString(), thing);
				if (window.NProgress !== undefined) {
					window.NProgress.done();
					jQuery('.nprogress-custom-parent').removeClass('nprogress-custom-parent');
				}
			}
		};
	}
	else if (getProp(self.defn, 'table', 'progress', 'method') === 'jQueryUI') {
		return {
			begin: function () {
				console.debug('[DataVis // %s // Progress(%s)] Begin', self.toString(), thing);
				self.ui.progress.progressbar({
					'classes': {
						'ui-progressbar': 'wcdvgrid_progressbar',
						'ui-progressbar-value': 'wcdvgrid_progressbar'
					}
				});
			},
			update: function (amount, estTotal) {
				console.debug('[DataVis // %s // Progress(%s)] %s', self.toString(), thing, sprintf.sprintf('Update: %d / %d = %.0f%%', amount, estTotal, (amount / estTotal) * 100));
				self.ui.progress.progressbar('value', (amount / estTotal) * 100);
			},
			end: function () {
				console.debug('[DataVis // %s // Progress(%s)] End', self.toString(), thing);
				self.ui.progress.progressbar('destroy');
			}
		};
	}
};

// #getCsv {{{2

GridTable.prototype.getCsv = function () {
	var self = this;

	return self.csv.toString();
};

// #getSelection {{{2

/**
 * Get the currently selected rows.
 *
 * @return {object}
 * Information on what rows are selected.  Contains the following properties:
 *
 * - `rowIds` — An array of the unique IDs of the selected rows.  Probably not that useful to you,
 *   but it's available.
 *
 * - `rows` — An array of the data represented by each row.  Each row is an object, each key in the
 *   object is a field in the source data.  Values are references to the actual data used by the
 *   grid, so don't mess with their internal structures.
 *
 * The ordering of the results is not guaranteed to have any relationship to the order of the rows
 * from the source, or the order in which they were checked.
 */

GridTable.prototype.getSelection = function () {
	var self = this;

	return {
		rowIds: self.selection,
		rows: self.selection.map(function (rowId) {
			return self.data.dataByRowId[rowId];
		})
	};
};

// #setSelection {{{2

/**
 * Set the currently selected rows.  This is different from {@link GridTable#select} and {@link
 * GridTable#unselect} because this straight-up sets the selection (the other methods add to and
 * remove from the selection).
 *
 * @param {number[]} [what]
 * Set the selection to the specified row IDs, or select nothing if not specified.
 */

GridTable.prototype.setSelection = function (what) {
	var self = this;
	var data = self.data.data;

	if (self.data.isGroup) {
		data = data.flat();
	}
	else if (self.data.isPivot) {
		log.error('Selection is not supported for pivotted data, because there is no way to see or change the selection in the user interface');
		return;
	}

	if (what == null) {
		self.selection = [];
	}
	else if (Array.isArray(what)) {
		self.selection = what;
	}
	else {
		log.error('GridTable#setSelection(): parameter `what` must be null/undef or an array');
		return false;
	}

	// Try to reflect these changes in the user interface.

	if (typeof self._updateSelectionGui === 'function') {
		self._updateSelectionGui();
	}

	self.fire('selectionChange', null, self.getSelection().rows);
};

// #select {{{2

/**
 * Adds to the current selection.
 *
 * To add all rows where the field "Model" is Civic, Fit, or Accord:
 *
 * ```
 * grid.select((row) => { ['Civic', 'Fit', 'Accord'].indexOf(row['Model'].value) >= 0 });
 * ```
 *
 * @param {number|number[]|function} [what]
 * Behaves as follows:
 *
 * - When not specified, adds all rows to the selection.
 * - When a number or array of numbers, adds all those row IDs to the selection.
 * - When a function, adds all rows that pass that filter to the selection.
 */

GridTable.prototype.select = function (what) {
	var self = this;
	var data = self.data.data;

	if (self.data.isGroup) {
		data = data.flat();
	}
	else if (self.data.isPivot) {
		log.error('Selection is not supported for pivotted data, because there is no way to see or change the selection in the user interface');
		return;
	}

	if (what == null) {
		// Select all.
		self.selection = data.map(function(d) { return d.rowNum; });
	}
	else if (Array.isArray(what)) {
		// Add elements to the selection.
		self.selection = [...new Set([...self.selection, ...what])];
	}
	else if (typeof what === 'function') {
		// Add passing rows to the selection.
		var passing = data.filter(function (d) {
			return what(d.rowData);
		});
		var passingRowNums = passing.map(function(d) { return d.rowNum; });
		self.selection = [...new Set([...self.selection, ...passingRowNums])];
	}
	else if (!self.selection.includes(what)) {
		// Add item to ths selection.
		self.selection.push(what);
	}

	// Try to reflect these changes in the user interface.

	if (typeof self._updateSelectionGui === 'function') {
		self._updateSelectionGui();
	}

	self.fire('selectionChange', null, self.getSelection().rows);
};

// #unselect {{{2

/**
 * Removes from the current selection.
 *
 * To remove all rows where the field "Make" is Honda:
 *
 * ```
 * grid.unselect((row) => { row['Make'].value === 'Honda' });
 * ```
 *
 * @param {number|number[]|function} [what]
 * Behaves as follows:
 *
 * - When not specified, removes all rows from the selection.
 * - When a number or array of numbers, removes all those row IDs from the selection.
 * - When a function, removes all rows that pass that filter from the selection.
 */

GridTable.prototype.unselect = function (what) {
	var self = this;
	var data = self.data.data;

	if (self.data.isGroup) {
		data = data.flat();
	}
	else if (self.data.isPivot) {
		log.error('Selection is not supported for pivotted data, because there is no way to see or change the selection in the user interface');
		return;
	}

	if (what == null) {
		// Unselect all.
		self.selection = [];
	}
	else if (Array.isArray(what)) {
		// Remove elements from the selection.
		self.selection = self.selection.filter(function(item) { return !what.includes(item); });
	}
	else if (typeof what === 'function') {
		// Remove passing elements from the selection.
		self.selection = self.selection.filter(function (x) {
			return !what(self.data.dataByRowId[x]);
		});
	}
	else {
		// Remove item from the selection.
		self.selection = self.selection.filter(function(item) { return item !== what; });
	}

	// Try to reflect these changes in the user interface.

	if (typeof self._updateSelectionGui === 'function') {
		self._updateSelectionGui();
	}

	self.fire('selectionChange', null, self.getSelection().rows);
};

// #isSelected {{{2

/**
 * Tells if a row is selected.
 *
 * @param {number} what
 * Row ID to check.
 *
 * @return {boolean}
 * True if the row is selected, false if it isn't.
 */

GridTable.prototype.isSelected = function (what) {
	var self = this;

	return self.selection.indexOf(what) >= 0;
};

// #_updateSelectionGui {{{2

GridTable.prototype._updateSelectionGui = function () {
	log.error('GridTable#_updateSelectionGui(): Must be implemented by subclass');
}

export default GridTable;
