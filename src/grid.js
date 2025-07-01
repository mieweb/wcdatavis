// Imports {{{1

import sprintf from 'sprintf-js';

import jQuery from 'jquery';

import {
	debug,
	deepCopy,
	deepDefaults,
	delegate,
	fontAwesome,
	getProp,
	getPropDef,
	I,
	log,
	makeRadioButtons,
	makeSubclass,
	makeToggleCheckbox,
	mixinEventHandling,
	mixinDebugging,
	mixinLogging,
	mixinNameSetting,
	presentDownload,
	setProp,
	setPropDef,
	Timing,
} from './util/misc.js';
import OrdMap from './util/ordmap.js';
import Lock from './util/lock.js';
import {
	AggregateControl,
	FilterControl,
	GroupControl,
	PivotControl,
} from './grid_control.js';
import { Prefs } from './prefs.js';
import { ComputedView } from './computed_view.js';
import { MirageView } from './mirage_view.js';
import { GridRenderer } from './grid_renderer.js';
import './renderers/grid/handlebars.js';
import './renderers/grid/squirrelly.js';
import { ColConfigWin } from './ui/windows/col_config.js';
import { DebugWin } from './ui/windows/debug.js';
import { TemplatesEditor } from './ui/templates.js';
import {
	ComputedViewToolbar,
	PlainToolbar,
	GroupToolbar,
	PivotToolbar,
	PrefsToolbar,
	RendererToolbar,
} from './ui/toolbars/grid.js';
import { OperationsPalette } from './operations_palette.js';
import { FileSource } from './source.js';
import { trans } from './trans.js';
import {GridRendererDummy} from './renderers/grid/dummy.js';
import {GridTablePlain} from './renderers/grid/table/plain.js';
import {GridTableGroupDetail} from './renderers/grid/table/group_detail.js';
import {GridTableGroupSummary} from './renderers/grid/table/group_summary.js';
import {GridTablePivot} from './renderers/grid/table/pivot.js';

// Server-Side Filter/Sort {{{1

/*
 * Here's the list of filter conditions supported by jQWidgets:
 *
 *   - NULL
 *   - NOT_NULL
 *   - EQUAL
 *
 * These only apply to strings:
 *
 *   - EMPTY
 *   - NOT_EMPTY
 *   - CONTAINS
 *   - CONTAINS_CASE_SENSITIVE
 *   - DOES_NOT_CONTAIN
 *   - DOES_NOT_CONTAIN_CASE_SENSITIVE
 *   - STARTS_WITH
 *   - STARTS_WITH_CASE_SENSITIVE
 *   - ENDS_WITH
 *   - ENDS_WITH_CASE_SENSITIVE
 *   - EQUAL_CASE_SENSITIVE
 *
 * These only apply to numbers and dates:
 *
 *   - NOT_EQUAL
 *   - LESS_THAN
 *   - LESS_THAN_OR_EQUAL
 *   - GREATER_THAN
 *   - GREATER_THAN_OR_EQUAL
 *
 * I find it weird that strings can't be NOT_EQUAL, but I'm just going by what their documentation
 * says they do.
 */

function makeJsonHaving(filters) {
	var having = {};
	var numClauses = 0;
	filters.forEach(function (f) {
		var h = having[f.datafield] = {};
		var numItems = 0;
		f.filter.getfilters().forEach(function (filter) {
			var isSupported = true;
			switch (filter.condition) {
				case 'EQUAL':
				case 'EQUAL_CASE_SENSITIVE':
					if (h['$eq']) {
						h['$in'] = [h['$eq']];
						delete h['$eq'];
					}
					if (h['$in']) {
						h['$in'].push(filter.value);
					}
					else {
						h['$eq'] = filter.value;
					}
					break;
				case 'CONTAINS':
				case 'CONTAINS_CASE_SENSITIVE':
					h['$like'] = '%' + filter.value + '%';
					break;
				case 'EMPTY':
					h['$eq'] = '';
					break;
				case 'NOT_EMPTY':
					h['$ne'] = '';
					break;
				default:
					log.error('Unsupported filter condition "' + filter.condition + '" for type "' + filter.type + '"');
					isSupported = false;
			}
			if (isSupported) {
				numItems += 1;
			}
		});
		if (numItems > 0) {
			numClauses += 1;
		}
		else {
			delete having[f.datafield];
		}
	});
	return numClauses > 0 ? having : null;
}

/**
 * Make a JSON ORDER BY object based on sort information from jQWidgets.
 *
 * @param {object} o A description of the sort from a jqxGrid.
 *
 * @return {object} A description of the sort that can be used by the system report code.
 */

function makeJsonOrderBy(o) {
	if (o.sortcolumn === null) {
		return null;
	}
	return [{
		column: o.sortcolumn,
		direction: o.sortdirection.ascending ? 'ASC' : 'DESC'
	}];
}

// Grid {{{1
// JSDoc Types {{{2

/**
 * @typedef {object} Grid~Defn
 *
 * @property {Object} table
 *
 * @property {string} table.id
 *
 * @property {Array.<Grid~ColConfig>} [table.columns]
 * Specifies the order that fields are rendered in plain output.  If not provided, all fields are
 * rendered in the order received from the source; fields with names starting with an underscore are
 * not shown.  If provided, only those fields specified are rendered, and in the order indicated.
 *
 * @property {Grid~Features} [table.features]
 * The features that are enabled for this grid.
 *
 * @property {object} [table.floatingHeader]
 * Configuration for the "floating header" feature.
 *
 * @property {string} [table.floatingHeader.method]
 * What library to use to create the floating table header.  Must be one of the following:
 *
 *   - `floatThead`
 *   - `fixedHeaderTable`
 *   - `tabletool`
 *
 * If this is not specified, the default is based on what library is available in the page, in the
 * order listed above.
 *
 * @property {string} [table.groupMode]
 * The starting mode for group output.  Must be one of the following:
 *
 *   - `summary`
 *   - `detail`
 *
 * The perspective will override this.
 *
 * @property {object} [table.incremental]
 * Configuration for the "incremental" feature.
 *
 * @property {boolean} [table.incremental.appendBodyLast=false]
 *
 * @property {string} [table.incremental.method="setTimeout"]
 * Must be one of the following:
 *
 *   - `setTimeout`
 *   - `requestAnimationFrame`
 *
 * @property {number} [table.incremental.delay=10]
 *
 * @property {number} [table.incremental.chunkSize=100]
 *
 * @property {object} [table.limit]
 * Configuration for the "limit" feature.
 *
 * @property {string} [table.limit.method="more"]
 * How to limit the output.  Must be one of the following:
 *
 *   - `more` — Show a row at the bottom, which when clicked, loads more rows.
 *
 * @property {number} [table.limit.threshold=100]
 * The total number of rows must exceed this in order to trigger using the limit method.  If
 * omitted, then the "limit" feature is effectively disabled.
 *
 * @property {number} [table.limit.chunkSize=50]
 * When using the "more" limit method, how many additional rows to load each time.
 *
 * @property {object} [table.whenPlain]
 * When the data has not been grouped, this is passed as the `opts` parameter to the GridRenderer
 * constructor.
 *
 * @property {object} [table.whenGroup]
 * When the data has been grouped, but not pivotted, this is passed as the `opts` parameter to the
 * GridRenderer constructor.
 *
 * @property {object} [table.whenPivot]
 * When the data has been pivotted, this is passed as the `opts` parameter to the GridRenderer
 * constructor.
 */

/**
 * @typedef {object} Grid~FieldColConfig
 * Represents the column configuration for a single field.
 *
 * @property {string} field
 * We're configuring the output of this field.
 *
 * @property {string} [displayText]
 * What to show as the name of the column; the default is to show the field name.
 *
 * @property {string} [format]
 * If the value is a number or currency: a Numeral format string used to render the value.  If the
 * value is a date, datetime, or time: a Moment format string used to render the value.  Otherwise,
 * this option is not used.  The default format strings are:
 *
 *   - number: [none]
 *   - currency: `$0,0.00` (e.g. "$1,000.23")
 *   - date: `LL` (e.g. "September 4, 1986")
 *   - datetime: `LLL` (e.g. "September 4, 1986 8:30 PM")
 *
 * @property {string} [format_dateOnly="LL"]
 * When `hideMidnight = true` this is the Moment format string used to display just the date
 * component of the datetime.  Note that the time component is still present in the value when it is
 * formatted, so don't reference the hours/minutes/seconds from the format string.
 *
 * @property {boolean} [hideMidnight=false]
 * If the value is a datetime, and this value is true, then the time component is not rendered when
 * it's midnight (00:00:00).  If the value is not a datetime, this option is not used.
 *
 * @property {string} [cellAlignment]
 * How to align the value within the cell horizontally.  Possible values:
 *
 *   - `left`
 *   - `center`
 *   - `right`
 *
 * The default depends on the type of the field.  Strings, dates, datetimes, and times are
 * left-aligned by default.  Numbers and currencies are right-aligned by default.
 *
 * @property {boolean} [allowHtml=false]
 * If true and the type of the field is a string, the value is interpreted as HTML and the resulting
 * nodes are inserted into the table result.  When exporting to CSV, the value emitted will be the
 * text nodes only.
 *
 * @property {string} [maxHeight]
 * If present, sets the maximum height allowed for the cell, and puts a "fullscreen" icon button in
 * the top-right which will pop open a window showing the full value.  Useful for extremely long
 * pieces of data that would otherwise blow up the table.  Only works in plain output.
 */

/**
 * @typedef {OrdMap.<string, Grid~FieldColConfig>} Grid~ColConfig
 * A collection of configurations across all the available fields in the grid.  If a field isn't in
 * this object, then it might as well not exist.
 */

/**
 * @typedef {object} Grid~Features
 *
 * @property {boolean} [footer=false] If true, then a footer is shown at the bottom of the table.
 * This is automatically enabled if `defn.table.footer` is provided.
 *
 * @property {boolean} [sort=false] If true, the user is allowed to sort the data by clicking the
 * column header.
 *
 * @property {boolean} [filter=false] If true, the user is allowed to filter the data by clicking
 * the "add filter" button in the column header.
 *
 * @property {boolean} [group=false] If true, the user is allowed to group the data.
 *
 * @property {boolean} [pivot=false] If true, the user is allowed to pivot the data.
 *
 * @property {boolean} [rowSelect=false] If true, the user is allowed to select rows by using the
 * checkbox in the first column.
 *
 * @property {boolean} [rowReorder=false] If true, the user is allowed to manually reorder the rows
 * using the handle in the last column.
 *
 * @property {boolean} [add=false] Unused
 *
 * @property {boolean} [edit=false] Unused
 *
 * @property {boolean} [delete=false] Unused
 *
 * @property {boolean} [limit=false] If true, then limit the amount of rows output by some method.
 *
 * @property {boolean} [tabletool=false] If true, then use TableTool to create a floating header for
 * the table.
 *
 * @property {boolean} [blockUI=false] If true, use BlockUI to prevent interaction with the table
 * while the ComputedView is doing something.
 *
 * @property {boolean} [nprogress=false] If true, use nprogress to show the progress of sort/filter
 * operations that the ComputedView is performing.
 *
 * @property {boolean} [incremental=false] If true, render rows in the table incrementally, which
 * prevents UI freezes while doing so.  However, the overall time required to finish rendering the
 * table goes way up.
 */

/**
 * @typedef {object} Grid~Opts
 * Various options for the grid.
 *
 * @param {string} [name]
 * The name of the grid, used for logging and debugging.  If not provided, one will be generated,
 * but you won't like it.
 *
 * @param {boolean} [opts.runImmediately=true]
 * If true, then show the grid immediately.
 *
 * @param {boolean} [opts.showOnDataChange=true]
 * Whether or not to show the grid automatically when the view reports there's new data available.
 * Useful when using push-oriented data flow, causing view updates to cascade to multiple outputs.
 *
 * @param {number} [opts.height]
 * If present, sets the height of the grid.
 *
 * @param {string} [opts.title]
 * If present, create a title bar for the grid.
 *
 * @param {string} [opts.helpText]
 * If present, create a help bubble with this text.
 *
 * @param {boolean} [opts.showToolbar=true]
 * Whether or not to show the toolbar by default.
 *
 * @param {boolean} [opts.showControls=false]
 * Whether or not to show the controls by default.
 */

// Constructor {{{2

/**
 * Create a new Grid and place it somewhere in the page.  A Grid consists of two major parts: the
 * decoration (e.g. titlebar and toolbar), and the underlying grid (e.g. jQWidgets or Tablesaw).
 *
 * @param {string} id The ID of a DIV (which must already exist in the page) where we will put the
 * grid and its decoration.  This DIV is also known as the "tag container" because it's typically
 * created by the <WCGRID> layout tag.
 *
 * @param {Grid~Defn} defn The definition of the grid itself.
 *
 * @param {Grid~Opts} [opts] Configuration of the decoration of the grid.
 *
 * @param {function} cb A function that will be called after the grid has finished rendering, with
 * the underlying output method grid object (e.g. the jqxGrid instance) being passed.
 *
 * @class
 *
 * @property {string} id The ID of the div that contains the whole tag output.
 * @property {Grid~Defn} defn The definition object used to create the grid.
 * @property {Grid~Opts} opts Options for the grid's container.
 * @property {object} grid The underlying grid object (e.g. a jqxGrid instance).
 * @property {object} ui Contains various user interface components which are tracked for convenience.
 * @property {Grid~Features} features
 * @property {Timing} timing
 *
 * @property {boolean} rootHasFixedHeight
 * If true, then the root DIV element has a fixed height (e.g. "600px") and the grid must fit within
 * that size.  Basically, this controls the "overflow" CSS property of the grid table, and also the
 * scroll handler for when a grid table automatically shows more rows.
 *
 * @property {boolean} _isIdle
 * If true, then the grid currently has no pending operations that would require the UI to change.
 *
 * @property {Grid~ColConfig} colConfig
 *
 * @property {string} colConfigSource
 * Where the column configuration came from, recognized values are: `defn`, `typeinfo`.
 *
 * @property {boolean} colConfigRestricted
 * If true, then the available columns in column configuration are restricted and cannot be added to
 * via the source or user preferences.  In other words, the set of available columns is restricted
 * to the subset specified via the grid definition.
 *
 * @borrows GridTable#getSelection
 * @borrows GridTable#setSelection
 * @borrows GridTable#select
 * @borrows GridTable#unselect
 * @borrows GridTable#isSelected
 */

var Grid = makeSubclass('Grid', Object, function (defn, opts, cb) {
	var self = this;

	opts = deepDefaults(opts, {
		runImmediately: true,
		showOnDataChange: true,
		showToolbar: true,
		showControls: false,
	});

	self.setName(opts.name);

	var rowCount = null; // Container span for the row counter.
	var clearFilter = null; // Container span for the "clear filter" link.
	var doingServerFilter = getProp(defn, 'server', 'filter') && getProp(defn, 'server', 'limit') !== -1;
	var viewDropdown = null;

	self._isIdle = false;

	self.mode = 'plain';

	self.generateCsv = false;
	self.csvReady = false;
	self.exportLock = new Lock('Export');
	self.colConfigLock = new Lock('colConfig');

	self.rootHasFixedHeight = false;
	self.timing = new Timing();

	self.colConfigWin = new ColConfigWin(self);
	self.debugWin = new DebugWin();

	self.defn = self._normalize(defn); // Definition used to retrieve data and output grid.
	self.opts = opts; // Other tag options, not related to the grid.
	self.grid = null; // List of all grids generated as a result.
	self.ui = {}; // User interface elements.
	self.selected = {}; // Information about what rows are selected.

	self._validateFeatures();
	self._validateId(self.defn.id);

	self.debug(null, 'Definition: %O', defn);
	self.debug(null, 'Options: %O', opts);

	// Check the validity of the provided computed/mirage views and prefs.

	if (defn.computedView != null && !(defn.computedView instanceof ComputedView)) {
		throw new Error('Call Error: `defn.computedView` must be null or an instance of ComputedView');
	}

	if (defn.mirageView != null && !(defn.mirageView instanceof MirageView)) {
		throw new Error('Call Error: `defn.mirageView` must be null or an instance of MirageView');
	}

	if (defn.prefs != null && !(defn.prefs instanceof Prefs)) {
		throw new Error('Call Error: `defn.prefs` must be null or an instance of Prefs');
	}

	self.computedView = defn.computedView;
	self.mirageView = defn.mirageView;
	self.prefs = defn.prefs;

	// Create default versions of the computed/mirage views and prefs if none were provided.

	if (self.computedView == null) {
		self.debug('COMPUTED VIEW', 'No computed view specified, creating our own.');
		self.computedView = new ComputedView();
	}

	if (self.mirageView == null) {
		self.debug('MIRAGE VIEW', 'No mirage view specified, creating our own.');
		self.mirageView = new MirageView();
	}

	if (self.prefs == null) {
		self.debug('PREFS', 'No prefs specified, creating our own.');
		self.prefs = new Prefs(self.id);
	}

	// Make sure we're all using the same prefs.

	self.computedView.setPrefs(self.prefs);
	self.mirageView.setPrefs(self.prefs);

	self.view = self.defn.computedView || self.defn.mirageView || self.computedView;

	if (self.colConfig != null) {
		self.view.setColConfig(self.colConfig);
	}
	self.view.addClient(self, 'grid');

	self.defn.grid = self;

	self.TemplatesEditor = new TemplatesEditor(self, function () {
		self.redraw();
	});

	// Set up UI elements {{{3

	self.ui.root = jQuery(document.getElementById(self.id))
		.addClass('wcdv_grid')
		.attr('data-title', self.id + '_title');

	self.ui.root.children().remove();

	if (self.ui.root.height() !== 0) {
		self.rootHasFixedHeight = true;
		self.rootHeight = self.ui.root.height();
		// When using TableTool, we can't just set the height of the whole grid and use flex to control
		// the height of the table automatically.  See DV-196.
		// Remove the height CSS property here, so the renderer can use it for data-ttheight instead.
		if (self.features.floatingHeader &&
				getProp(self.defn, 'table', 'floatingHeader', 'method') === 'tabletool' &&
				window.TableTool != null) {
			self.ui.root.css('height', '');
		}
	}

	if (self.view.source.origin instanceof FileSource) {
		self.ui.root._onFileDrop(function (files) {
			self.view.source.origin.setFiles(files);
		});
	}

	// Titlebar {{{4

	self.ui.titlebar = jQuery('<div class="wcdv_grid_titlebar">')
		.attr('title', trans('GRID.TITLEBAR.SHOW_HIDE'))
		.on('click', function (evt) {
			evt.stopPropagation();
			self.toggle();
		})
		.droppable({
			accept: '.wcdv_drag_handle',
			over: function (evt, ui) {
				self.showControls();

				// Need to recalculate the position of the droppable targets, because they are now
				// guaranteed to be visible (they may have been hidden within the grid control before).

				ui.draggable.draggable('option', 'refreshPositions', true);
			}
		});

	self._addTitleWidgets(self.ui.titlebar, doingServerFilter, self.id);

	self.ui.autoLimit = jQuery('<div>', {
		'class': 'wcdv_warning_banner auto_limit_warning'
	})
	.text(trans('GRID.TITLEBAR.DATA_LIMITED_WARNING'))
	.on('click', function () {
		self.ui.autoLimit.hide();
		self.view.unlimit();
		self.refresh();
	})
	.hide();

	// Toolbar {{{4

	self.ui.content = jQuery('<div>', {
		'class': 'wcdv_grid_content'
	});

	self.ui.toolbar = jQuery('<div>')
		.addClass('wcdv_grid_toolbar')
		.droppable({
			accept: '.wcdv_drag_handle',
			over: function (evt, ui) {
				self.showControls();

				// Need to recalculate the position of the droppable targets, because they are now
				// guaranteed to be visible (they may have been hidden within the grid control before).

				ui.draggable.draggable('option', 'refreshPositions', true);
			}
		});

	self.ui.toolbar_computedView = new ComputedViewToolbar(self);
	self.ui.toolbar_computedView.attach(self.ui.toolbar);

	self.ui.toolbar_plain = new PlainToolbar(self);
	self.ui.toolbar_plain.attach(self.ui.toolbar);
	self.ui.toolbar_plain.hide();

	self.ui.toolbar_group = new GroupToolbar(self);
	self.ui.toolbar_group.attach(self.ui.toolbar);
	self.ui.toolbar_group.hide();

	self.ui.toolbar_pivot = new PivotToolbar(self);
	self.ui.toolbar_pivot.attach(self.ui.toolbar);
	self.ui.toolbar_pivot.hide();

	self.ui.toolbar_renderer = new RendererToolbar(self)
	self.ui.toolbar_renderer.attach(self.ui.toolbar);

	if (!self.opts.showToolbar) {
		self.ui.toolbar.hide();
	}

	// Controls {{{4

	self.ui.controls = jQuery('<div>', { 'class': 'wcdv_grid_control' });
	self.ui.filterControl = jQuery('<div>', { 'class': 'wcdv_control_pane wcdv_filter_control' });
	self.ui.groupControl = jQuery('<div>', { 'class': 'wcdv_control_pane wcdv_group_control' });
	self.ui.pivotControl = jQuery('<div>', { 'class': 'wcdv_control_pane wcdv_pivot_control' });
	self.ui.aggregateControl = jQuery('<div>', { 'class': 'wcdv_control_pane wcdv_aggregate_control' });
	self.ui.operationsPalette = jQuery('<div>', { 'class': 'wcdv_grid_control' }).css({
		display: 'block'
	});

	// Filter Control {{{5

	self.filterControl = new FilterControl(self, self.colConfig, self.view, self.features, self.timing);
	self.ui.filterControl.children().remove();
	self.filterControl.draw(self.ui.filterControl);
	self.ui.filterControl.show();

	// Group Control {{{5

	self.groupControl = new GroupControl(self, self.colConfig, self.view, self.features, self.timing);
	self.groupControl.draw(self.ui.groupControl);

	self.groupControl.on('fieldAdded', function (fieldAdded, fields) {
		self.ui.pivotControl.show();
		self.ui.aggregateControl.show();
	});
	self.groupControl.on('fieldRemoved', function (fieldRemoved, fields) {
		if (fields.length === 0) {
			self.ui.pivotControl.hide();
			self.ui.aggregateControl.hide();
		}
	});
	self.groupControl.on('cleared', function () {
		self.ui.pivotControl.hide();
		self.ui.aggregateControl.hide();
	});

	// Pivot Control {{{5

	self.pivotControl = new PivotControl(self, self.colConfig, self.view, self.features, self.timing);
	self.pivotControl.draw(self.ui.pivotControl);

	// Group <-> Pivot (Drag & Drop) {{{5

	self.groupControl.getListElement().sortable({
		connectWith: '#' + self.pivotControl.getListElement().attr('id')
	})
		.on('sortupdate', function () {
			self.groupControl.sortableSync();
		});
	self.pivotControl.getListElement().sortable({
		connectWith: '#' + self.groupControl.getListElement().attr('id')
	})
		.on('sortupdate', function () {
			self.pivotControl.sortableSync();
		});

	self.operationsPalette = new OperationsPalette(self);
	self.operationsPalette.setOperations(self.defn.operations);
	self.operationsPalette.draw(self.ui.operationsPalette);

	// Aggregate Control {{{5

	self.aggregateControl = new AggregateControl(self, self.colConfig, self.view, self.features, self.timing);
	self.aggregateControl.draw(self.ui.aggregateControl);

	// }}}5

	if (!self.opts.showControls) {
		self.ui.controls.hide();
	}

	// }}}4

	self.ui.grid = jQuery('<div>', { 'id': defn.table.id, 'class': 'wcdv_grid_table' });

	if (self.rootHasFixedHeight) {
		// When using TableTool, we can't just set the height of the whole grid and use flex to control
		// the height of the table automatically.  See DV-196.
		// Don't use the height: 0px trick in this situation and let TableTool manage the table height.
		// FIXME Is this needed with the CSS method?
		if (!self.features.floatingHeader || getProp(self.defn, 'table', 'floatingHeader', 'method') !== 'tabletool') {
			// This is a trick to make 'flex: 1 1 auto' work right in Firefox, IE, Edge.
			// Otherwise, the table takes up as much space as it needs and doesn't scroll.
			self.ui.grid.css('height', '0px');
		}
	}

	// The user has fixed the height of the containing grid, so we will need to have the browser put
	// in some scrollbars for the overflow.

	if (self.rootHasFixedHeight) {
		self.ui.grid.css({ 'overflow': 'auto' });
	}

	if (document.getElementById(self.id + '_footer')) {
		// There was a footer which was printed out by dashboard.c which we are now going to move
		// inside the structure that we've been creating.

		self.ui.footer = jQuery(document.getElementById(self.id + '_footer'));
	}

	self.ui.root
		.append(self.ui.titlebar)
		.append(self.ui.content
			.append(self.ui.toolbar)
			.append(self.ui.controls
				.append(self.ui.filterControl)
				.append(self.ui.groupControl)
				.append(self.ui.pivotControl)
				.append(self.ui.aggregateControl))
			.append(self.ui.operationsPalette)
			.append(self.ui.autoLimit)
			.append(self.ui.grid)
			.append(self.ui.footer))
	;

	if (self.defn.renderer != null) {
		self.clearRenderers();
		self.addRenderer(0, null, {
			name: self.defn.renderer,
			opts: self.defn.rendererOpts
		});
	}
	else {
		self.resetRenderers();
	}

	self.makeResponsive();

	// }}}3

	var initialRender = true;

	self.tableDoneCont = function (grid, srcIndex) {
		self.debug(null, 'Finished drawing grid table!');

		if (initialRender) {
			initialRender = false;
		}

		// Invoke the callback for the Grid constructor, after the grid has been created.  Sometimes
		// people want to start manipulating the grid from JS right away.

		if (typeof cb === 'function') {
			cb();
		}
	};

	self.view.on('fetchDataBegin', function () {
		self._setSpinner('loading');
		self._showSpinner();
		if (self.opts.title) {
			self.ui.title._addTrailing(',');
			self.ui.statusSpan.show().text(trans('GRID.TITLEBAR.LOADING'));
			self.ui.rowCount.hide();
		}
		if (self.view.source.isCancellable()) {
			self.ui.cancelFetchBtn.show();
		}
	});
	self.view.on('fetchDataEnd', function () {
		self._hideSpinner();
		self.ui.cancelFetchBtn.hide();
		self.ui.statusSpan.show().text(trans('GRID.TITLEBAR.LOADED'));
	});
	self.view.source.on('fetchDataCancel', function () {
		self.ui.cancelFetchBtn.hide();
		if (initialRender) {
			if (self.opts.title) {
				self.ui.title._addTrailing(',');
				self.ui.statusSpan.show().text(trans('GRID.TITLEBAR.NOT_LOADED'));
				self.ui.rowCount.hide();
			}
			self._setSpinner('not-loaded');
			self.hasRun = false;
			self.hide();
		}
		else {
			if (self.opts.title) {
				self.ui.title._addTrailing(',');
				self.ui.statusSpan.hide();
				self.ui.rowCount.show();
			}
			self._hideSpinner();
		}
	});

	self.view.on('workBegin', function () {
		self._isIdle = false;
		self._setSpinner('working');
		self._showSpinner();
		if (self.opts.title) {
			self.ui.title._addTrailing(',');
			self.ui.statusSpan.show().text(trans('GRID.TITLEBAR.WORKING'));
			self.ui.rowCount.hide();
		}
	});
	self.view.on('workEnd', function (info, ops) {
		self._isIdle = true;
		self._hideSpinner();
		self.ui.title._stripTrailing(',');
		self.ui.statusSpan.hide();
		self.ui.rowCount.show();
		self._updateRowCount(info, ops);
		self.mode = info.isPlain ? 'plain' : info.isGroup ? 'group' : info.isPivot ? 'pivot' : null;
	});

	self.view.on('dataUpdated', function () {
		if (self.opts.showOnDataChange && !self.isVisible()) {
			self.show({ redraw: false });
		}
		self.redraw();
	});

	self.view.on('getTypeInfo', function (typeInfo) {
		self.colConfigFromTypeInfo(typeInfo);
	});

	self.prefs.prime(function () {
		// Create a way to switch back and forth between the two types of views depending on if a
		// perspective is live or not.

		self.prefs.on('perspectiveChanged', function (id, p) {
			self.setView();
			self.redraw();
		}, {
			info: 'Changing view type to match new perspective'
		});

		if (self.opts.runImmediately) {
			self.setView();
			self.redraw();
		}
		else {
			self.hasRun = false;
			self.hide();
		}
	});

	/*
	 * Store self object so it can be accessed from other JavaScript in the page.
	 */

	setProp(self, window, 'MIE', 'WC_DataVis', 'grids', self.id);
});

// Mixins {{{2

mixinEventHandling(Grid, [
		'showControls'
	, 'hideControls'
	, 'renderBegin'
	, 'renderEnd'
	, 'colConfigUpdate'
	, 'selectionChange'
]);

delegate(Grid, 'renderer', ['setSelection', 'getSelection', 'select', 'unselect', 'isSelected']);

mixinDebugging(Grid);
mixinLogging(Grid);
mixinNameSetting(Grid);

// Events JSDoc {{{3

/**
 * Fired when controls are shown in the grid.
 *
 * @event Grid#showControls
 */

/**
 * Fired when controls are hidden in the grid.
 *
 * @event Grid#hideControls
 */

/**
 * Fired when rendering has started.
 *
 * @event Grid#renderBegin
 */

/**
 * Fired when rendering has finished.
 *
 * @event Grid#renderEnd
 */

/**
 * Fired when column configuration has changed.
 *
 * @event Grid#colConfigUpdate
 */

/**
 * Fired when selection is changed.
 *
 * @event Grid#selectionChange
 *
 * @param {Array.<ComputedView~Data_Row>} selected
 * Data from rows that are selected.
 */

// #toString {{{2

Grid.prototype.toString = function () {
	var self = this;
	return 'Grid(' + self.id + ')';
};

// #_validateFeatures {{{2

Grid.prototype._validateFeatures = function () {
	var self = this;

	self.features = {};

	var availableFeatures = [
		'footer',
		'sort',
		'filter',
		'group',
		'pivot',
		'rowSelect',
		'rowReorder',
		'add',
		'edit',
		'delete',
		'limit',
		'floatingHeader',
		'block',
		'progress',
		'incremental',
		'operations'
	];

	// When the user has specified the `footer` option, enable the footer feature (if it hasn't
	// already been set by the user - in other words, the user can override this automatic behavior).

	if (getProp(self.defn, 'table', 'footer') !== undefined) {
		setPropDef(true, self.defn, 'table', 'features', 'footer');
	}

	availableFeatures.forEach(function (feat) {
		self.features[feat] = getPropDef(false, self.defn, 'table', 'features', feat);
	});

	self.debug(null, 'Features =', self.features);
};

// #_validateId {{{2

Grid.prototype._validateId = function (id) {
	var self = this;

	// If the ID was specified as a jQuery object, extract the ID from the element.

	if (Array.isArray(id) && id[0] instanceof jQuery) {
		id = id[0];
	}

	if (id instanceof jQuery) {
		id = id.attr('id');
	}

	if (typeof id !== 'string') {
		throw '<grid> "id" is not a string';
	}

	if (document.getElementById(id) === null) {
		throw 'No element exists with given ID: ' + id;
	}

	self.id = id;
	setProp(id + '_gridContainer', self.defn, 'table', 'id');
};

// #setView {{{2

Grid.prototype.setView = function () {
	var self = this;

	var p = self.prefs.currentPerspective;

	// If the perspective is meant for live data then configure the grid to use a ComputedView.
	// Otherwise, configure the grid to use a MirageView.

	if (p.isMirage()) {
		self.debug('SET VIEW', 'Switching to Mirage View for pre-computed data for perspective "%s"', p.name);
		self.view = self.prefs.modules['mirage'].target;
		self.view.setPerspectiveName(p.name);
	}
	else {
		self.debug('SET VIEW', 'Switching to Computed View for live data for perspective "%s"', p.name);
		self.view = self.prefs.modules['view'].target;
	}
};
// #_addTitleWidgets {{{2

/**
 * Add widgets to the header of the grid.
 *
 * @method
 * @memberof Grid
 * @private
 *
 * @param {object} header
 * @param {boolean} doingServerFilter If true, then we are filtering and sorting on the server.
 * @param {string} id
 */

Grid.prototype._addTitleWidgets = function (titlebar, doingServerFilter, id) {
	var self = this;

	self.ui.spinner = jQuery('<span>', {
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_spinner'
	})
		.appendTo(titlebar)
	;

	self._setSpinner(self.opts.runImmediately ? 'loading' : 'not-loaded');

	self.ui.title = jQuery('<strong>', {'id': id + '_title', 'data-parent': id})
		.addClass('wcdv_title')
		.text(self.opts.title)
		.appendTo(titlebar);

	var notHeader = jQuery('<span>', {'class': 'headingInfo'})
		.on('click', function (evt) {
			evt.stopPropagation();
		})
		.appendTo(titlebar);

	notHeader.append(' ');

	self.ui.statusSpan = jQuery('<span>').appendTo(notHeader);
	self.ui.rowCount = jQuery('<span>').appendTo(notHeader);

	self.ui.selectionInfo = jQuery('<span>').appendTo(notHeader);

	self.ui.clearFilter = jQuery('<span>')
		.hide()
		.append(' (')
		.append(jQuery('<span>', {'class': 'link'})
			.text(trans('GRID.TITLEBAR.CLEAR_FILTER'))
			.on('click', function (evt) {
				evt.stopPropagation();
				self.ui.clearFilter.hide();
				self.view.clearFilter({ notify: true });
			}))
		.append(')')
		.appendTo(notHeader);

	self.ui.cancelFetchBtn = jQuery('<button>', {'type': 'button'})
		.css({'margin-left': '0.5em'})
		.text(trans('GRID.TITLEBAR.CANCEL'))
		.on('click', function (evt) {
			evt.stopPropagation();
			self.view.source.cancel();
		})
		.hide()
		.appendTo(notHeader);

	if (typeof self.opts.helpText === 'string' && self.opts.helpText !== '') {
		notHeader.append(' ');
		fontAwesome('fa-question-circle')
			.tooltip({
				classes: {
					'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
				},
				show: { delay: 1000 },
				content: self.opts.helpText
			})
			.appendTo(notHeader);
	}

	self.ui.toolbar_prefs = new PrefsToolbar(self);
	self.ui.toolbar_prefs.attach(titlebar);

	self.prefs.bind('grid', self, {
		toolbar: self.ui.toolbar_prefs.ui.root
	});

	// Create container to hold all the controls in the titlebar

	self.ui.titlebar_controls = jQuery('<div>')
		.addClass('wcdv_titlebar_controls pull-right')
		.appendTo(titlebar);

	// Create the Debug Info button.

	if (window.MIE && window.MIE.DEBUGGING) {
		jQuery('<button>', {
			'type': 'button',
			'style': 'font-size: 18px',
			'class': 'wcdv_icon_button wcdv_text-primary'
		})
			.attr('title', trans('GRID.TITLEBAR.SHOW_DEBUG_INFO'))
			.click(function (evt) {
				evt.stopPropagation();
				self.debugWin.show(self, self.view, self.view.source);
			})
			.append(fontAwesome('fa-bug'))
			.appendTo(self.ui.titlebar_controls);
	}

	// Create the Export button

	self.ui.exportBtn = jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary'
	})
		.on('click', function (evt) {
			evt.stopPropagation();
			self.export();
		})
		.appendTo(self.ui.titlebar_controls)
	;

	self._setExportStatus('notReady');

	// Create the Refresh button

	self.ui.refreshBtn = jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary'
	})
		.attr('title', trans('GRID.TITLEBAR.REFRESH'))
		.on('click', function (evt) {
			evt.stopPropagation();
			self.refresh();
		})
		.append(fontAwesome('fa-refresh'))
		.appendTo(self.ui.titlebar_controls)
	;

	var pWinEffect = {
		effect: 'fade',
		duration: 100
	};

	var pWin = jQuery('<div>', { title: trans('GRID.PERSPECTIVE_WIN.TITLE') }).dialog({
		autoOpen: false,
		modal: true,
		width: 500,
		position: {
			my: 'top',
			at: 'bottom',
			of: titlebar
		},
		show: pWinEffect,
		hide: pWinEffect,
	});

	var pWinWarning = jQuery('<div>')
		.addClass('wcdv_dlg_warning_banner')
		.appendTo(pWin);

	var pWinTextArea = jQuery('<textarea>', {'style': 'font-family: monospace; font-size: 10pt; width: 100%', 'rows': '20', 'readonly': true})
		.appendTo(pWin);

	// This is the "gear" icon that shows/hides the controls below the toolbar.  The controls are used
	// to set the group, pivot, aggregate, and filters.  Ideally the user only has to utilize these
	// once, and then switches between perspectives to get the same effect.

	jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary'
	})
		.attr('title', trans('GRID.TITLEBAR.SHOW_HIDE_CONTROLS'))
		.click(function (evt) {
			evt.stopPropagation();
			if (evt.shiftKey) {
				if (self.prefs.currentPerspective.opts.isTemporary) {
					pWinWarning.text(trans('GRID.PERSPECTIVE_WIN.TEMP_PERSPECTIVE_WARNING'));
					pWinWarning.show();
				}
				else {
					pWinWarning.hide();
				}
				pWinTextArea.val(JSON.stringify(self.prefs.currentPerspective.config, null, 2));
				pWin.dialog('open');
			}
			else {
				self.toggleControls();
			}
		})
		.append(jQuery(fontAwesome('fa-cog')))
		.appendTo(self.ui.titlebar_controls)
	;

	// Create the down-chevron button that shows/hides everything under the titlebar.

	self.ui.showHideButton = jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary showhide'
	})
		.attr('title', trans('GRID.TITLEBAR.SHOW_HIDE'))
		.click(function (evt) {
			evt.stopPropagation();
			self.toggle();
		})
		.append(jQuery(fontAwesome('fa-chevron-down')))
		.appendTo(self.ui.titlebar_controls)
	;
};

// #clear {{{2

Grid.prototype.clear = function () {
	var self = this;

	self.ui.root.children().remove();
};
// #redraw {{{2

/**
 * Redraw the data shown in a grid.  If the grid is not visible, this function does nothing (i.e.
 * you cannot use it to retrieve data for an invisible grid).
 *
 * @method
 * @memberof Grid
 *
 * @param {function} [contOk]
 * Function to call on success.
 *
 * @param {function} [contFail]
 * Function to call on failure.
 */

Grid.prototype.redraw = function (contOk, contFail) {
	var self = this;

	if (contOk != null && typeof contOk !== 'function') {
		throw new Error('Call Error: `contOk` must be null or a function');
	}
	if (contFail != null && typeof contFail != 'function') {
		throw new Error('Call Error: `contFail` must be null or a function');
	}

	contOk = contOk || I;
	contFail = contFail || I;

	self.debug(null, 'Redrawing...');

	var rendererCtor
		, rendererCtorOpts;

	self.colConfigLock.lock('redrawing grid; prevent colConfig changes from notifying existing renderer');

	self.view.getData(function (ok, data) {
		if (!ok) {
			return contFail();
		}

		var mode = data.isPlain ? 'plain' : data.isGroup ? 'group' : data.isPivot ? 'pivot' : null;
		var renderer = self.findRenderer(self.ui.root.get(0).getBoundingClientRect().width, mode);

		self.rendererName = renderer.name;
		self.rendererId = renderer.id;

		var rendererCtor = GridRenderer.registry.get(self.rendererName);
		var rendererCtorOpts = deepCopy(renderer.opts);

		if (self.ui.footer) {
			rendererCtorOpts.footer = self.ui.footer;
		}

		if (self.renderer) {
			self.renderer.destroy();
		}

		rendererCtorOpts.generateCsv = self.generateCsv;
		rendererCtorOpts.fixedHeight = self.rootHasFixedHeight;

		self.ui.exportBtn.attr('disabled', true);
		self.renderer = new rendererCtor(self, self.defn, self.view, self.features, rendererCtorOpts, self.timing, self.id, self.colConfig);

		// Update the toolbar sections.  This needs to be done after creating the renderer because the
		// renderer validates (and possibly changes) the supported features, and that changes what parts
		// of the toolbar we show.  Obviously, we shouldn't show buttons for features that the current
		// renderer doesn't implement.

		if (data.isPlain) {
			self.ui.toolbar_plain.show();
			self.ui.toolbar_group.hide();
			self.ui.toolbar_pivot.hide();
		}
		else if (data.isGroup) {
			self.ui.toolbar_plain.hide();
			self.ui.toolbar_group.show();
			self.ui.toolbar_pivot.hide();
		}
		else if (data.isPivot) {
			self.ui.toolbar_plain.hide();
			self.ui.toolbar_group.hide();
			self.ui.toolbar_pivot.show();
		}

		self.renderer.on('renderBegin', function () {
			self._isIdle = false;
			self.fire('renderBegin');
		});
		self.renderer.on('renderEnd', function () {
			self.fire('renderEnd');
			self._isIdle = true;
		});

		self.renderer.on('unableToRender', function () {
			self._setExportStatus('notReady');
			self.redraw();
		});

		self.renderer.on('csvReady', function () {
			if (self.exportLock.isLocked()) {
				self.exportLock.unlock();
			}
			self._setExportStatus('ready');
		});
		self.renderer.on('generateCsvProgress', function (progress) {
			if (progress === 0) {
				self.ui.exportBtn.children('span.fa, svg.svg-inline--fa').remove();
				self.ui.exportBtn.append(fontAwesome('fa-spinner', 'fa-pulse'));
			}
		});

		if (self.features.limit) {
			self.renderer.on('limited', function () {
				self.ui.limit_div.show();
			});
			self.renderer.on('unlimited', function () {
				self.ui.limit_div.hide();
			});
		}

		if (self.features.rowSelect) {
			self.renderer.on('selectionChange', function (selection) {
				if (selection.length === 0) {
					self.ui.selectionInfo.text('');
				}
				else {
					var addComma = self.ui.rowCount.text().length > 0;
					var str = addComma ? ', ' : '';
					str += trans(selection.length === 1 ? 'GRID.TITLEBAR.SELECTED_COUNT_SINGULAR' : 'GRID.TITLEBAR.SELECTED_COUNT_PLURAL', selection.length);
					self.ui.selectionInfo.text(str);
				}
				self.fire('selectionChange', null, selection);
			});
		}

		self.renderer.draw(self.ui.grid, null, function () {
			if (self.colConfigLock.isLocked()) {
				self.colConfigLock.unlock('renderer finished drawing');
			}
			self.setSelection();
			self.ui.exportBtn.attr('disabled', false);
			self.tableDoneCont();
		});
	});
};

// #refresh {{{2

/**
 * Refreshes the data from the data view in the grid.
 *
 * @method
 * @memberof Grid
 */

Grid.prototype.refresh = function () {
	var self = this;

	if (!self.isVisible()) {
		return;
	}

	self.debug(null, 'Refreshing...');

	self._isIdle = false;
	self.view.refresh();
};

// #clearRenderCache {{{2

/**
 * Clear the cache of the render on each cell.
 */

Grid.prototype.clearRenderCache = function (cols) {
	var self = this;

	if (self.renderer != null) {
		self.renderer.clearRenderCache(cols);
	}
}

// #_updateRowCount {{{2

/**
 * Set the number of rows shown in the titlebar.  You can provider the number yourself!
 *
 * @method
 * @memberof Grid
 *
 * @param {object} info
 * @param {number} info.numRows
 * @param {number} info.totalRows
 * @param {number} info.numGroups
 * @param {number} info.numPivots
 * @param {boolean} info.isPlain
 * @param {boolean} info.isGroup
 * @param {boolean} info.isPivot
 *
 * @param {object} ops
 * Describes what the view did.
 *
 * @param {boolean} ops.filter
 * If true, then the view filtered data.
 *
 * @param {boolean} ops.group
 * If true, then the view grouped data.
 *
 * @param {boolean} ops.pivot
 * If true, then the view pivotted data.
 *
 * @param {boolean} ops.sort
 * If true, then the view sorted data.
 */

Grid.prototype._updateRowCount = function (info, ops) {
	var self = this;
	var doingServerFilter = getProp(self.defn, 'server', 'filter') && getProp(self.defn, 'server', 'limit') !== -1;
	var text = [];

	self.debug(null, 'Updating row count');

	// When there's no titlebar, there's nothing for us to do here.

	if (!self.opts.title) {
		return;
	}

	self._hideSpinner();

	if (info.numRows != null) {
		if (info.totalRows != null) {
			text.push(info.numRows + ' / ' + trans(info.totalRows === 1 ? 'GRID.TITLEBAR.RECORD_COUNT_SINGULAR' : 'GRID.TITLEBAR.RECORD_COUNT_PLURAL', info.totalRows));
		}
		else {
			text.push(trans(info.numRows === 1 ? 'GRID.TITLEBAR.RECORD_COUNT_SINGULAR' : 'GRID.TITLEBAR.RECORD_COUNT_PLURAL', info.numRows));
		}
	}

	if (info.isGroup || info.isPivot) {
		text.push(trans(info.numGroups === 1 ? 'GRID.TITLEBAR.GROUP_COUNT_SINGULAR' : 'GRID.TITLEBAR.GROUP_COUNT_PLURAL', info.numGroups));
	}

	self.ui.rowCount.text(text.join(', '));

	// When we have been auto-limited, show the banner message showing as much and prevent people from
	// grouping (because we don't have all the data, grouping / pivotting is misleading).

	if (self.view.source.origin.isLimited) {
		self.ui.autoLimit.show();
		self.ui.groupControl.hide();
	}
	else {
		self.ui.autoLimit.hide();
		self.ui.groupControl.show();
	}

	if (self.ui.clearFilter) {
		if (info.totalRows) {
			self.ui.clearFilter.show();
		}
		else {
			self.ui.clearFilter.hide();
		}
	}

	self.ui.title._addTrailing(',');
};

// #hide {{{2

/**
 * Hide the grid.
 *
 * @method
 * @memberof Grid
 */

Grid.prototype.hide = function () {
	var self = this;

	self.debug(null, 'Hiding...');

	self.ui.content.hide({
		duration: 0,
		done: function () {
			if (self.opts.title) {
				self.ui.showHideButton.removeClass('open fa-rotate-180');
			}
		}
	});
};

// #show {{{2

/**
 * Make the grid visible.  If the grid has not been "run" yet, it will be done now.
 *
 * @param {object} [opts]
 *
 * @param {boolean} [opts.redraw=true]
 * If true, automatically redraw the grid after it has been shown.  This is almost always what you
 * want, unless you intend to manually call `redraw()` or `refresh()` immediately after showing it.
 */

Grid.prototype.show = function (opts) {
	var self = this;

	opts = deepDefaults(opts, {
		redraw: true
	});

	self.debug(null, 'Showing...');

	self.ui.content.show({
		duration: 0,
		done: function () {
			if (self.opts.title) {
				self.ui.showHideButton.addClass('open fa-rotate-180');
			}
			if (!self.hasRun && opts.redraw) {
				self.hasRun = true;
				self.redraw();
			}
		}
	});
};

// #toggle {{{2

/**
 * Toggle grid visibility.
 */

Grid.prototype.toggle = function () {
	var self = this;

	if (self.ui.content.css('display') === 'none') {
		self.show();
	}
	else {
		self.hide();
	}
};

// #isVisible {{{2

/**
 * Determine if the grid is currently visible.
 *
 * @returns {boolean}
 * True if the grid is currently visible, false if it is not.
 */

Grid.prototype.isVisible = function () {
	var self = this;

	return self.ui.content.css('display') !== 'none';
};

// hideControls {{{2

Grid.prototype.hideControls = function () {
	var self = this;

	if (self.ui.controls._isHidden()) {
		return;
	}

	// We need this to happen after both of the async functions (to hide the
	// controls & toolbar) happen below.

	var l = new Lock('Hide Controls', {start: 2});
	l.onUnlock(function () {
		if (window.Tabletool) {
			window.Tabletool.update();
		}
	}, 'Update Tabletool');

	self.ui.controls.hide({
		duration: 0,
		complete: function () {
			self.fire(Grid.events.hideControls);
			l.unlock();
		}
	});

	self.ui.toolbar.hide({
		duration: 0,
		complete: function () {
			//self.fire(Grid.events.hideToolbar);
			l.unlock();
		}
	});
};

// showControls {{{2

Grid.prototype.showControls = function () {
	var self = this;

	if (!self.ui.controls._isHidden()) {
		return;
	}

	// We need this to happen after both of the async functions (to show the
	// controls & toolbar) happen below.

	var l = new Lock('Show Controls', {start: 2});
	l.onUnlock(function () {
		if (window.Tabletool) {
			window.Tabletool.update();
		}
	}, 'Update Tabletool');

	self.ui.controls.show({
		duration: 0,
		complete: function () {
			self.fire(Grid.events.showControls);
			l.unlock();
		}
	});

	self.ui.toolbar.show({
		duration: 0,
		complete: function () {
			//self.fire(Grid.events.showToolbar);
			l.unlock();
		}
	});
};

// toggleControls {{{2

Grid.prototype.toggleControls = function () {
	var self = this;

	if (self.ui.controls._isHidden()) {
		self.showControls();
	}
	else {
		self.hideControls();
	}
};

// #_setSpinner {{{2

/**
 * Set the type of the spinner icon.
 *
 * @param {string} what
 * The kind of spinner icon to show.  Must be one of: loading, not-loaded, working.
 */

Grid.prototype._setSpinner = function (what) {
	var self = this;

	switch (what) {
	case 'loading':
		self.ui.spinner.html(fontAwesome('fa-refresh', 'fa-spin', trans('GRID.TITLEBAR.LOADING')));
		break;
	case 'not-loaded':
		self.ui.spinner.html(fontAwesome('fa-ban', null, trans('GRID.TITLEBAR.NOT_LOADED')));
		break;
	case 'working':
		self.ui.spinner.html(fontAwesome('fa-circle-o-notch', 'fa-spin', trans('GRID.TITLEBAR.WORKING')));
		break;
	}
};

// #_showSpinner {{{2

/**
 * Show the spinner icon.
 */

Grid.prototype._showSpinner = function () {
	var self = this;

	if (self.opts.title) {
		self.ui.spinner.show();
	}
};

// #_hideSpinner {{{2

/**
 * Hide the spinner icon.
 */

Grid.prototype._hideSpinner = function () {
	var self = this;

	if (self.opts.title) {
		self.ui.spinner.hide();
	}
};

// #_normalize {{{2

/**
 * The point of "normalizing" a definition is to expand shortcut configurations.  For example, lots
 * of properties can be a string (the shortcut) or an object which contains the same info plus some
 * additional configuration.  This function would convert the string into the object.  This way,
 * later code only has to check for the object version.  It also adds a layer of backwards
 * compatibility.
 *
 * You only need to normalize a definition once; after doing so, we flag it so we won't mess with it
 * again, even though it should be possible to normalize something that's already been done.
 */

Grid.prototype._normalize = function (defn) {
	var self = this;

	if (defn == null) {
		defn = {};
	}

	if (defn.normalized) {
		return;
	}

	defn.normalized = true;

	deepDefaults(true, defn, {
		prefs: null,
		table: {
			groupMode: 'detail',
			features: {
				sort: true,
				filter: true,
				group: true,
				pivot: true,
				rowSelect: false,
				rowReorder: false,
				add: false,
				edit: false,
				delete: false,
				limit: true,
				floatingHeader: true,
				block: false,
				progress: false
			},
			limit: {
				appendBodyLast: false,
				method: 'more',
				threshold: 100,
				chunkSize: 50
			},
			floatingHeader: {
				method: 'tabletool'
			},
			incremental: {
				method: 'setTimeout',
				delay: 10,
				chunkSize: 100
			}
		}
	});

	self._normalizeColumns(defn);

	return defn;
};

// #_normalizeColumns {{{2

Grid.prototype._normalizeColumns = function (defn) {
	var self = this;

	// When the developer did not provider column configuration, take it from the ComputedView via typeInfo.
	// Potentially the source could change what fields it contains (e.g. add/remove a field to/from a
	// report) and this would all still work OK, we would stay up-to-date because every time the ComputedView
	// got new typeInfo we would update our colConfig.

	if (getProp(defn, 'table', 'columns') == null) {
		self.initColConfig = null;
		self.colConfig = null;
		return;
	}

	var colConfig = new OrdMap();

	for (var i = 0; i < defn.table.columns.length; i += 1) {
		var cc = defn.table.columns[i];

		if (typeof cc === 'string') {
			cc = { field: cc };
		}

		if (typeof cc.field !== 'string') {
			log.warn('Column Configuration: `field` must be a string');
			continue;
		}

		cc = deepDefaults(cc, {
			hideMidnight: false,
			format_dateOnly: 'LL',
			allowHtml: false,
			allowFormatting: false,
			canHide: true
		});

		colConfig.set(cc.field, cc);
	}

	self.initColConfig = colConfig.clone();

	var columnConfig = getPropDef([], defn, 'table', 'columnConfig');
	Object.keys(columnConfig).forEach(function (colName) {
		var cc = columnConfig[colName];

		// When you want to show a checkbox to represent the value, it only makes sense to have a
		// checkbox for the filter widget.

		if (cc.widget === 'checkbox') {
			if (cc.filter !== undefined && cc.filter !== 'checkbox') {
				log.warn('Overriding configuration to use filter type "' + cc.filter + '" for checkbox widgets.');
			}
			cc.filter = 'checkbox';
		}
	});

	self.setColConfig(colConfig, {
		from: 'defn',
		savePrefs: false
	});
};

// #export {{{2

/**
 * Export whatever this grid is currently showing as a CSV file for the user to download.
 */

Grid.prototype.export = function () {
	var self = this;

	if (self.exportLock.isLocked()) {
		return;
	}

	if (self.csvReady) {
		var fileName = (self.opts.title || self.id) + '.csv';
		var csv = self.renderer.getCsv();
		var contentType = 'text/csv';
		var blob = new Blob([csv], {'type': contentType});

		presentDownload(blob, fileName);
	}
	else {
		self.exportLock.lock(); // Unlocked in `csvReady` event handler.
		self.generateCsv = true;
		self.redraw();
	}
};

// #_setExportStatus {{{2

Grid.prototype._setExportStatus = function (status) {
	var self = this;

	switch (status) {
	case 'notReady':
		self.csvReady = false;
		self.ui.exportBtn.attr('title', trans('GRID.TITLEBAR.GENERATE_CSV'));
		self.ui.exportBtn.children('span.fa, svg.svg-inline--fa').remove();
		self.ui.exportBtn.append(fontAwesome('fa-file-o'));
		break;
	case 'ready':
		self.csvReady = true;
		self.ui.exportBtn.attr('title', trans('GRID.TITLEBAR.DOWNLOAD_CSV'));
		self.ui.exportBtn.children('span.fa, svg.svg-inline--fa').remove();
		self.ui.exportBtn.append(fontAwesome('fa-download'));
		break;
	default:
		throw new Error('Call Error: invalid status "' + status + '"');
	}
};

// #setColConfig {{{2

/**
 * Set the column configuration.
 *
 * @param {OrdMap} colConfig
 * @param {Object} opts
 * @param {string} opts.from
 * @param {boolean} [opts.sendEvent=true]
 * @param {Array.<Object>} [opts.dontSendEventTo]
 * @param {boolean} [opts.redraw=true]
 * @param {boolean} [opts.savePrefs=true]
 */

Grid.prototype.setColConfig = function (colConfig, opts) {
	var self = this;
	var updated = false;

	if (['defn', 'prefs', 'typeInfo', 'ui', 'reset'].indexOf(opts.from) < 0) {
		throw new Error('Call Error: `opts.from` must be one of: [defn, prefs, typeInfo, ui, reset]');
	}

	opts = deepDefaults(opts, {
		sendEvent: true,
		dontSendEventTo: [],
		redraw: true,
		savePrefs: true
	});

	// We use the colConfig lock so that we don't have a bunch of processes updating the colConfig
	// when we're trying to redraw the grid. If we already have a renderer, it's going to be get
	// replaced by `Grid#redraw()` so we shouldn't send an event to the renderer to have it redraw.

	if (self.colConfigLock.isLocked() && self.renderer) {
		opts.dontSendEventTo.push(self.renderer);
	}

	var setCurrent = function () {
		self.debug('COLCONFIG', 'Setting from %s: %O', opts.from || '[unknown]', colConfig);
		self.colConfig = colConfig;
		self.colConfigSource = opts.from;

		if (self.renderer != null) {
			self.renderer.colConfig = self.colConfig;
		}

		self.debug('COLCONFIG', 'Setting shadow from %s: %O', opts.from || '[unknown]', colConfig);
		self.shadowColConfig = colConfig.clone();
		updated = true;
	};

	var setInitial = function () {
		self.debug('COLCONFIG', 'Setting initial from %s: %O', opts.from || '[unknown]', colConfig);
		self.initColConfig = colConfig.clone();
	};

	/**
	 * Add elements (that are absent in `dst`) from `src` to `dst`.
	 *
	 * @param {OrdMap} src
	 * @param {string} srcMsg
	 * @param {OrdMap} dst
	 * @param {string} dstMsg
	 */

	var addMissing = function (src, srcMsg, dst, dstMsg) {
		var count = dst.mergeWith(src);
		self.debug('COLCONFIG', 'Merged %d fields from %s into %s', count, srcMsg, dstMsg);
		return count;
	};

	/**
	 * Remove elements from `dst` that are absent from `src`.
	 *
	 * @param {OrdMap} src
	 * @param {string} srcMsg
	 * @param {OrdMap} dst
	 * @param {string} dstMsg
	 */

	var removeMissing = function (src, srcMsg, dst, dstMsg) {
		var absent = [];

		dst.each(function (fcc, fieldName) {
			if (!src.isSet(fieldName)) {
				absent.push(fieldName);
			}
		});

		if (absent.length > 0) {
			self.debug('COLCONFIG', 'Removing %d fields from %s which are absent from %s: %O',
				absent.length, dstMsg, srcMsg, absent);
			absent.forEach(function (fieldName) {
				dst.unset(fieldName);
			});
			return true;
		}

		return false;
	};

	if (typeof getProp(self.defn, 'advice', 'setColConfig', 'before') === 'function') {
		self.defn.advice.setColConfig.before(colConfig, opts.from, self);
	}

	switch (opts.from) {
	case 'defn':
		setCurrent();
		setInitial();
		self.colConfigRestricted = true;
		break;
	case 'prefs':
		if (self.colConfigRestricted) {
			self.colConfig.each(function (v, k) {
				if (colConfig.isSet(k)) {
					// Apply defaults: existing values take precedence over defaults
					var existing = colConfig.get(k);
					Object.keys(v).forEach(function(key) {
						if (existing[key] === undefined) {
							existing[key] = v[key];
						}
					});
				}
			});

			// The column configuration is restricted by defn, so remove anything from prefs that's
			// missing from defn.

			removeMissing(self.colConfig, 'defn', colConfig, 'prefs');

			// Add anything that's in defn but not in prefs.

			addMissing(self.colConfig, 'defn', colConfig, 'prefs');
		}

		setCurrent();
		break;
	case 'reset':
	case 'ui':
		setCurrent();
		break;
	case 'typeInfo':
		// Column configuration derived from typeInfo merges with existing config (by removing config on
		// columns that don't exist in the source, and by adding defaults for columns that exist in the
		// source but aren't specified in the current config).  It can also set the initial, filling in
		// when no defn is specified.

		if (self.colConfig == null) {
			setCurrent();
		}
		else {
			self.colConfig = self.shadowColConfig.clone();
			if (self.renderer != null) {
				self.renderer.colConfig = self.colConfig;
			}

			// Delete fields from existing colConfig which aren't in the source.

			if (removeMissing(colConfig, 'source', self.colConfig, 'existing')) {
				updated = true;
			}

			// Add fields from source that are missing from existing colConfig.  Columns set explicitly in
			// the grid's definition are there to limit what we see, so don't try to add to them.

			if (!self.colConfigRestricted) {
				if (addMissing(colConfig, 'source', self.colConfig, 'existing')) {
					updated = true;
				}
			}
		}
		if (self.initColConfig == null) {
			setInitial();
		}
		break;
	}

	if (!updated) {
		return;
	}

	if (opts.savePrefs) {
		self.prefs.save();
	}

	if (opts.sendEvent) {
		self.fire('colConfigUpdate', {
			notTo: opts.dontSendEventTo
		}, self.colConfig, self.initColConfig);
	}

	if (opts.redraw) {
		//self.redraw();
	}
};

// #getColConfig {{{2

Grid.prototype.getColConfig = function (colConfig) {
	var self = this;

	return self.colConfig;
};

// #resetColConfig {{{2

Grid.prototype.resetColConfig = function (opts) {
	var self = this;

	self.debug('COLCONFIG', 'Resetting to: %O', self.initColConfig);

	opts = deepDefaults(opts, {
		from: 'reset',
		savePrefs: false
	});

	self.setColConfig(self.initColConfig.clone(), opts);
};

// #isIdle {{{2

/**
 * Ask the grid whether there are currently any pending operations that would change the UI.
 *
 * Caveats:
 *
 *   - If you yield after checking this, then it's no longer guaranteed to be true; some other
 *     asynchronous event could cause the grid to become active.
 *
 *   - If you have `renderEnd` event handlers that yield, it is possible that those event handlers
 *     will continue executing after the grid has been marked idle.
 *
 * @returns {boolean} True if the grid is currently idle, false if there are changes pending which
 * might cause the grid to be redrawn.
 */

Grid.prototype.isIdle = function () {
	var self = this;

	return self._isIdle;
};

// #colConfigFromTypeInfo {{{2

Grid.prototype.colConfigFromTypeInfo = function (typeInfo, opts) {
	var self = this;

	opts = deepDefaults(opts, {
		from: 'typeInfo',
		savePrefs: false
	});

	if (!(typeInfo instanceof OrdMap)) {
		throw new Error('Call Error: `typeInfo` must be an OrdMap');
	}

	var typeInfoColConfig = new OrdMap();

	typeInfo.each(function (fti, fieldName) {
		typeInfoColConfig.set(fieldName, {
			field: fieldName
		});
	});

	self.debug(null, 'Creating colConfig from typeInfo: %O -> %O', typeInfo.asMap(), typeInfoColConfig.asMap());

	//self.setColConfig(self.colConfig == null
	//	? typeInfoColConfig
	//	: OrdMap.fromMerge([self.colConfig, typeInfoColConfig]), opts);
	self.setColConfig(typeInfoColConfig, opts);
};

// #setOperations {{{2

Grid.prototype.setOperations = function (ops) {
	var self = this;

	if (self.operationsPalette != null) {
		self.operationsPalette.setOperations(ops);
	}

	self.defn.operations = ops;

	// We need to redraw the grid because operations that affect one row at a time might change,
	// therefore the buttons in the row need to be redrawn.

	self.redraw();
};

// #makeResponsive {{{2

Grid.prototype.makeResponsive = function () {
	var self = this;

	if (window.ResizeObserver == null) {
		log.warn('ResizeObserver is not supported; grid will not be responsive.');
		return;
	}

	var timer;

	// We use a timer to create a delay, so the page has to be "still" for 500ms before we'll try to
	// redraw the grid with a different renderer.

	self.resizeObserver = new ResizeObserver(function (elts) {
		if (timer != null) {
			clearTimeout(timer);
		}
		timer = setTimeout(function () {
			timer = null;
			var renderer = self.findRenderer(elts[0].contentRect.width, self.mode);
			if (renderer.id !== self.rendererId) {
				self.debug('Resize', 'Resized to ' + elts[0].contentRect.width + '; using renderer: %O', renderer);
				self.redraw();
			}
		}, 500);
	});

	self.resizeObserver.observe(self.ui.root.get(0));
};

// #addRenderer {{{2

/**
 * @typedef RendererSpec
 * Either `name` or `fn` must exist.
 *
 * @prop {string} [name]
 * Name of the renderer to use; must be registered in {@see GridRenderer.registry}.
 *
 * @prop {function} [fn]
 * A nullary function that returns the name of the name of a renderer registered in
 * {@see GridRenderer.registry}.
 *
 * @prop {object} [opts]
 * Additional options to pass to the renderer contructor.
 */

/**
 * Adds a new renderer to the grid.
 *
 * @param {number} minWidth
 * The minimum width at which this renderer will work.
 *
 * @param {string[]} modes
 * List of modes for which this renderer will work.
 *
 * @param {RendererSpec} renderer
 * Specification of the renderer to add.
 */

Grid.prototype.addRenderer = (function () {
	var id = 1;

	return function (minWidth, modes, renderer) {
		var self = this
			, i;

		renderer.id = 'CUSTOM.' + id++;

		for (i = 0; i < self.widthBreaks.length; i += 1) {
			if (minWidth < self.widthBreaks[i].minWidth) {
				// Insert at the appropriate place in the list.

				self.widthBreaks.splice(i, 0, {
					minWidth: minWidth,
					modes: modes,
					renderer: renderer
				});

				return;
			}
		}

		// New entry has the largest minWidth in the list, put it at the end.

		self.widthBreaks.splice(-1, 0, {
			minWidth: minWidth,
			modes: modes,
			renderer: renderer
		});
	};
})();

// #clearRenderers {{{2

/**
 * Completely clears all grid renderers.
 */

Grid.prototype.clearRenderers = function () {
	var self = this;

	self.widthBreaks = [];
};

// #resetRenderers {{{2

/**
 * Resets the list of grid renderers to the initial state.
 */

Grid.prototype.resetRenderers = function () {
	var self = this;

	self.widthBreaks = [{
		minWidth: 1024,
		modes: ['plain'],
		renderer: {
			name: 'table_plain',
			opts: getPropDef({}, self.defn, 'table', 'whenPlain')
		}
	}, {
		minWidth: 1024,
		modes: ['group'],
		renderer: {
			fn: function () {
				switch (self.defn.table.groupMode) {
				case 'summary':
					return {
						name: 'table_group_summary',
						opts: getPropDef({}, self.defn, 'table', 'whenGroup')
					};
				case 'detail':
					return {
						name: 'table_group_detail',
						opts: getPropDef({}, self.defn, 'table', 'whenGroup')
					}
				}
			}
		}
	}, {
		minWidth: 1024,
		modes: ['pivot'],
		renderer: {
			name: 'table_pivot',
			opts: getPropDef({}, self.defn, 'table', 'whenPivot')
		}
	}];
};

// #findRenderer {{{2

/**
 * Find a renderer suitable for drawing the grid.  A "suitable" renderer is one that (1) can handle
 * the data `mode`, and (2) has a `minWidth` property less than the current width.  If no such
 * renderer exists, we pick one that can handle the data, at the smallest `minWidth` available.  If
 * there still aren't any renderers available (e.g. if the developer cleared the list) then null is
 * returned.
 *
 * @param {number} width
 * The width of the grid.
 *
 * @param {string} mode
 * What type of data we're displaying. Must be one of: plain, group, pivot.
 *
 * @returns {RendererSpec}
 * A renderer that can be used to display the grid.  Returns null if there aren't any options.
 */

Grid.prototype.findRenderer = function (width, mode) {
	var self = this,
		i, b;

	var processRenderer = function (r) {
		var x = deepCopy(r);
		delete x.fn;

		// If the `fn` property exists, call it to get properties that can override (or supplement)
		// those in the "main" object.  This is how you can set the group renderer depending on whether
		// the grid is in summary or details mode.

		if (typeof r.fn === 'function') {
			var spec = r.fn();
			x = deepDefaults(spec, x);
		}

		return x;
	}

	if (self.widthBreaks == null || self.widthBreaks.length === 0) {
		return null;
	}

	// Find the entry with the largest minWidth that's still less than the current width, which also
	// supports the mode we're currently in.

	for (i = self.widthBreaks.length - 1; i >= 0; i -= 1) {
		b = self.widthBreaks[i];
		if (b.minWidth <= width && (b.modes == null || b.modes.indexOf(mode) >= 0)) {
			return processRenderer(b.renderer);
		}
	}

	// There aren't any renderers with a minWidth less than the current width; start at the bottom and
	// find the smallest that can handle the data.

	for (i = 0; i < self.widthBreaks.length; i += 1) {
		b = self.widthBreaks[i];
		if (b.modes == null || b.modes.indexOf(mode) >= 0) {
			return processRenderer(b.renderer);
		}
	}
};

// Exports {{{1

export {
	Grid
};
