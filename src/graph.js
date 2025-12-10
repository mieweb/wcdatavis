import _ from 'underscore';

import jQuery from 'jquery';

import {
	debug,
	deepCopy,
	deepDefaults,
	determineColumns,
	fontAwesome,
	gensym,
	getProp,
	getPropDef,
	makeSubclass,
	makeToggleCheckbox,
	presentDownload,
	setProp,
	toInt,
} from './util/misc.js';
import OrdMap from './util/ordmap.js';

import {ComputedView} from './computed_view.js';
import {Prefs} from './prefs.js';
import {trans} from './trans.js';

import GRAPH_RENDERER_REGISTRY from './reg/graph_renderer.js';

// Graph {{{1

// JSDoc Types {{{2

/**
 * @typedef {object} Graph~Config
 *
 * @property {Graph~Config_When} whenPlain
 * Tells how to configure the graph when the data is plain (has not been grouped or pivotted).
 *
 * @property {Graph~Config_When} whenGroup
 * Tells how to configure the graph when the data is grouped.
 *
 * @property {Graph~Config_When} whenPivot
 * Tells how to configure the graph when the data is pivotted.
 */

/**
 * @typedef {object} Graph~Config_When
 * Can either be a function that returns an object, or just an object.  If it's a function, it
 * receives the group fields and pivot fields as arguments.
 *
 * @property {string} graphType
 * Name of the type of graph.
 *
 * @property {number} [aggNum]
 * When graphing grouped or pivotted data, the aggregate number that we're graphing for the value.
 *
 * @property {string} [aggType]
 * When graphing pivotted data, the type of aggregate that we're graphing on the value axis.
 *
 * - `cell`: We're graphing separate series for each pivot colval.
 * - `group`: We're graphing the aggregate calculated over all the data in each group.
 * - `pivot`: We're graphing the aggregate calculated over all the data in each pivot.
 *
 * For example, when grouping by "Product" and pivotting by "Country", you can create a "Sum"
 * aggregate on the field "Sales." Let's assume we're doing a column graph.
 *
 * - `cell`: Shows a stacked graph where each bar is a product, and each item in the stack is a country.
 * - `group`: Shows a graph where each bar is a product (showing total sales in all countries).
 * - `pivot`: Shows a graph where each bar is a country (showing total sales for all products).
 *
 * @property {object} [options]
 * These options are passed directly to the graph rendering library (e.g. Google Charts, ChartJS).
 */

// Constructor {{{2

/**
 * Creates a new graph.
 *
 * @param {string} id
 *
 * @param {ComputedView} view
 *
 * @param {Graph~Config} opts
 *
 * @class
 *
 * Represents a graph.
 *
 * @property {string} id
 * @property {ComputedView} view
 * @property {object} devConfig
 * @property {object} userConfig
 * @property {object} opts
 * @property {GraphRenderer} renderer
 */

var Graph = makeSubclass('Graph', Object, function (id, view, devConfig, opts) {
	var self = this;

	self.id = id;
	self.view = view;
	self.devConfig = devConfig || {};
	self.userConfig = {
		plain: {},
		group: {},
		pivot: {}
	};
	self.opts = deepDefaults(opts, {
		title: 'Graph',
		runImmediately: true,
		showToolbar: true,
		showOnDataChange: false,
	});
	self.hasRun = false;

	if (typeof id !== 'string') {
		throw new Error('Call Error: `id` must be a string');
	}

	if (!(view instanceof ComputedView)) {
		throw new Error('Call Error: `view` must be an instance of MIE.WC_DataVis.ComputedView');
	}

	if (self.opts.prefs != null && !(self.opts.prefs instanceof Prefs)) {
		throw new Error('Call Error: `opts.prefs` must be an instance of MIE.WC_DataVis.Prefs');
	}

	if (self.opts.prefs != null) {
		self.prefs = self.opts.prefs;
	}
	else if (self.view.prefs != null) {
		self.prefs = self.view.prefs;
	}
	else {
		self.prefs = new Prefs(self.id);
	}

	self.prefs.bind('graph', self);

	self._makeUserInterface();

	self.view.addClient(self, 'graph');

	// Event handlers for keeping the spinner icon updated.

	self.view.on('fetchDataBegin', function () {
		self._setSpinner('loading');
		self._showSpinner();
	});
	self.view.on('fetchDataEnd', function () {
		self._hideSpinner();
	});

	self.view.on('workBegin', function () {
		self._setSpinner('working');
		self._showSpinner();
	});
	self.view.on('workEnd', function () {
		self._hideSpinner();
	});

	// Event handler for keeping the UI in sync with the data. We don't let the graph renderer redraw itself because we need to keep the UI in sync with the data. For example, if a pivot is removed, the aggregate will change if we were graphing a pivot-specific aggregate like "Count by [Pivot Field]").

	self.view.on('workEnd', function (info, ops) {
		self.lastOps = ops;
		// self.drawFromConfig();
	}, {
		who: self
	});

	self.view.on('dataUpdated', function () {
		if (self.opts.showOnDataChange && !self.isVisible()) {
			self.show({ redraw: false });
		}
		self.redraw();
		/*
		switch (self.lastDrawnFrom) {
		case 'config':
			self.drawFromConfig();
			break;
		case 'interactive':
		default:
			self.drawInteractive();
			break;
		}
		*/
	});

	// self.view.on('aggregateSet', function (spec, shouldGraph) {
	// 	var aggType, aggNum;
	//
	// 	if (shouldGraph != null) {
	// 		if (shouldGraph.group && shouldGraph.group.length > 0) {
	// 			aggType = 'group';
	// 			aggNum = shouldGraph.group[0].aggNum;
	// 		}
	// 		else if (shouldGraph.pivot && shouldGraph.pivot.length > 0) {
	// 			aggType = 'pivot';
	// 			aggNum = shouldGraph.pivot[0].aggNum;
	// 		}
	//
	// 		if (aggType == null || aggNum == null) {
	// 			// Couldn't find an aggregate we could graph.
	// 			return;
	// 		}
	//
	// 		// Set the dropdown to match the aggregate we're supposed to graph.
	//
	// 		var matchingAgg = self.ui.aggDropdown.find('option');
	// 		matchingAgg = matchingAgg.filter(function (i, elt) {
	// 			return elt.getAttribute('data-wcdv-agg-type') === aggType;
	// 		});
	// 		matchingAgg = matchingAgg.filter(function (i, elt) {
	// 			return +elt.getAttribute('data-wcdv-agg-num') === aggNum;
	// 		});
	// 		if (matchingAgg.length === 1) {
	// 			self.ui.aggDropdown.val(matchingAgg.attr('value'));
	// 			// self.ui.aggDropdown.trigger('change');
	// 		}
	// 	}
	// });

	if (self.opts.runImmediately) {
		self.show();
	}
	else {
		self.hasRun = false;
		self.hide();
	}

	/*
	 * Store self object so it can be accessed from other JavaScript in the page.
	 */

	setProp(self, window, 'MIE', 'WC_DataVis', 'graphs', self.id);
});

// #toString {{{2

Graph.prototype.toString = function () {
	return 'Graph(id="' + this.id + '")';
};

// #_makeUserInterface {{{2

Graph.prototype._makeUserInterface = function () {
	var self = this;

	// div.wcdv_graph (ui.root)
	// |
	// +-- div.wcdv_grid_titlebar (ui.titlebar)
	// |   |
	// |   +-- strong (ui.spinner)
	// |   +-- strong [[ the title ]]
	// |   `-- button [[ show/hide button ]]
	// |
	// `-- div.wcdv_grid_content (ui.content)
	//     |
	//     +-- div.wcdv_grid_toolbar (ui.toolbar)
	//     +-- div.wcdv_toolbar_section (ui.toolbar_source)
	//     +-- div.wcdv_toolbar_section (ui.toolbar_common)
	//     +-- div.wcdv_toolbar_section (ui.toolbar_aggregate)
	//     `-- div.wcdv_graph_render (ui.graph)

	self.ui = {};
	self.ui.root = jQuery(document.getElementById(self.id));

	self.ui.root.addClass('wcdv_graph');
	self.ui.root.children().remove();

	self.ui.titlebar = jQuery('<div>')
		.addClass('wcdv_grid_titlebar')
		.on('click', function (evt) {
			evt.stopPropagation();
			self.toggle();
		})
		.appendTo(self.ui.root);

	self._addTitleWidgets(self.ui.titlebar);

	self.ui.content = jQuery('<div>', {
		'class': 'wcdv_grid_content'
	}).appendTo(self.ui.root);

	self.ui.toolbar = jQuery('<div>')
		.addClass('wcdv_grid_toolbar')
		.appendTo(self.ui.content)
	;

	if (!self.opts.showToolbar) {
		self.ui.toolbar.hide();
	}

	// The "pivot" toolbar section lets the user decide if colvals should show up stacked or as
	// separate bars (for bar & column charts).

	self.ui.toolbar_pivot = jQuery('<div>')
		.addClass('wcdv_toolbar_section')
		.css('visibility', 'hidden')
		.appendTo(self.ui.toolbar);
	self._addPivotButtons(self.ui.toolbar_pivot);

	// The "aggregates" toolbar section lets the user control what is drawn based on the aggregate
	// functions calculated by the view.

	self.ui.toolbar_aggregates = jQuery('<div>')
		.addClass('wcdv_toolbar_section pull-right')
		.css('visibility', 'hidden')
		.appendTo(self.ui.toolbar);
	self._addAggregateButtons(self.ui.toolbar_aggregates);

	self.ui.graph = jQuery('<div>', { 'id': self.id, 'class': 'wcdv_graph_render' });

	self.ui.root
		.append(self.ui.titlebar)
		.append(self.ui.content
			.append(self.ui.toolbar)
			.append(self.ui.graph))
	;
};

// #_addTitleWidgets {{{2

/**
 * Add widgets to the header of the graph.
 *
 * @private
 *
 * @param {jQuery} titlebar
 */

Graph.prototype._addTitleWidgets = function (titlebar) {
	var self = this;

	self.ui.spinner = jQuery('<span>', {
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_spinner'
	})
		.appendTo(titlebar)
	;

	self._setSpinner(self.opts.runImmediately ? 'loading' : 'not-loaded');

	jQuery('<strong>')
		.text(self.opts.title)
		.appendTo(titlebar);


	// Create container to hold all the controls in the titlebar

	self.ui.titlebar_controls = jQuery('<div>')
		.addClass('wcdv_titlebar_controls pull-right')
		.appendTo(titlebar);

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
		.append(fontAwesome('fa-download'))
		.appendTo(self.ui.titlebar_controls)
	;

	// Create the Refresh button

	self.ui.refreshBtn = jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary'
	})
		.attr('title', 'Refresh')
		.on('click', function (evt) {
			evt.stopPropagation();
			self.refresh();
		})
		.append(fontAwesome('fa-refresh'))
		.appendTo(self.ui.titlebar_controls)
	;

	// This is the "gear" icon that shows/hides the controls below the toolbar.  The controls are used
	// to set the group, pivot, aggregate, and filters.  Ideally the user only has to utilize these
	// once, and then switches between perspectives to get the same effect.

	jQuery('<button>', {
		'type': 'button',
		'style': 'font-size: 18px',
		'class': 'wcdv_icon_button wcdv_text-primary'
	})
		.attr('title', trans('GRAPH.TITLEBAR.SHOW_HIDE_CONTROLS'))
		.click(function (evt) {
			evt.stopPropagation();
			self.ui.toolbar.toggle();
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
		.attr('title', trans('GRAPH.TITLEBAR.SHOW_HIDE'))
		.click(function (evt) {
			evt.stopPropagation();
			self.toggle();
		})
		.append(jQuery(fontAwesome('fa-chevron-down')))
		.appendTo(self.ui.titlebar_controls)
	;
};

// #_addAggregateButtons {{{2

Graph.prototype._addAggregateButtons = function (toolbar) {
	var self = this;

	// Add renderer selection dropdown
	var rendererDropdownId = gensym();
	jQuery('<label>', { 'for': rendererDropdownId }).text('Renderer: ').appendTo(toolbar);
	self.ui.rendererDropdown = jQuery('<select>', { 'id': rendererDropdownId })
		.on('change', function () {
			self.opts.renderer = this.value;
			self.redraw();
		})
		.appendTo(toolbar);

	// Populate renderer options
	GRAPH_RENDERER_REGISTRY.each(function (renderer, key) {
		self.ui.rendererDropdown.append(jQuery('<option>', { 
			'value': key,
			'selected': key === (self.opts.renderer || 'google')
		}).text(key.charAt(0).toUpperCase() + key.slice(1)));
	});

	var graphTypeDropdownId = gensym();
	jQuery('<label>', { 'for': graphTypeDropdownId }).text('Graph Type: ').appendTo(toolbar);
	self.ui.graphTypeDropdown = jQuery('<select>', { 'id': graphTypeDropdownId })
		.on('change', function () {
			self.drawInteractive();
		})
		.appendTo(toolbar);

	var aggDropdownId = gensym();
	jQuery('<label>', { 'for': aggDropdownId }).text('Aggregate: ').appendTo(toolbar);
	self.ui.aggDropdown = jQuery('<select>', { 'id': aggDropdownId })
		.on('change', function () {
			self.drawInteractive();
		})
		.appendTo(toolbar);

	self.ui.zeroAxisCheckbox = makeToggleCheckbox(
		null,
		null,
		false,
		'Y-Axis Starts at Zero',
		toolbar,
		function () {
			self.drawInteractive()
		}
	);

	self.view.on('workEnd', function () {
		self._updateAggDropdown();
	});
};

// #_setGraphTypeOptions {{{2

Graph.prototype._setGraphTypeOptions = function () {
	var self = this;

	if (self.ui.graphTypeDropdown == null) {
		console.error('[DataVis // Graph // Set Graph Type Options] Dropdown UI element does not exist');
		return;
	}

	if (self.renderer == null) {
		console.error('[DataVis // Graph // Set Graph Type Options] Renderer does not exist');
		return;
	}

	self.ui.graphTypeDropdown.children().remove();
	if (self.renderer.graphTypes != null) {
		self.renderer.graphTypes.each(function (gt) {
			self.ui.graphTypeDropdown.append(jQuery('<option>', { 'value': gt.value }).text(gt.name));
		});
	}
}

// #_addPivotButtons {{{2

Graph.prototype._addPivotButtons = function (toolbar) {
	var self = this;

	self.ui.stackCheckbox = makeToggleCheckbox(
		null,
		null,
		true,
		'Stack',
		toolbar,
		function () {
			self.drawInteractive()
		}
	);
};

// #_udpateAggDropdown {{{2

Graph.prototype._updateAggDropdown = function () {
	var self = this;

	// options : [obj]
	// obj : {
	//   name : string
	//   type : string ('group', 'pivot', 'cell')
	//   num : int
	// }

	var options = [];

	// addOption : AggregateInfo, string -> ()

	var addOption = function (aggInfo, appendToName) {
		var name = aggInfo.name || aggInfo.instance.getFullName();
		if (appendToName != null) {
			name += appendToName;
		}
		options.push({
			name: name,
			type: aggInfo.aggType,
			num: aggInfo.aggNum
		});
	};

	self.view.getData(function (ok, data) {
		self.ui.aggDropdown.children().remove();

		if (data.isGroup) {
			_.each(getPropDef([], data, 'agg', 'info', 'group'), function (ai) {
				addOption(ai);
			});
		}
		else if (data.isPivot) {
			_.each(getPropDef([], data, 'agg', 'info', 'group'), function (ai) {
				addOption(ai, ' by ' + data.groupFields.join(', '));
			});
			_.each(getPropDef([], data, 'agg', 'info', 'pivot'), function (ai) {
				addOption(ai, ' by ' + data.pivotFields.join(', '));
			});
			_.each(getPropDef([], data, 'agg', 'info', 'cell'), function (ai) {
				addOption(ai);
			});
		}

		// For pivotted data, there are three different aggregates we could graph.  We list them
		// separately in the dropdown, and we want them in the order: cell, group, pivot.  It just so
		// happens that this is also alphabetical order, so we just sort by the aggType first before
		// sorting by the aggNum so the dropdown will be in the right order.

		_.each(_.sortBy(_.sortBy(options, 'type'), 'num'), function (opt) {
			var option = jQuery('<option>', {
				'value': opt.name,
				'data-wcdv-agg-type': opt.type,
				'data-wcdv-agg-num': opt.num,
			}).text(opt.name);
			self.ui.aggDropdown.append(option);
		});
	}, 'Updating graph aggregate dropdown');
};

// #syncDrawnGraphConfigWithUi {{{2

/**
 * Synchronize the configuration actually used to draw a graph with the user interface. This updates
 * things like the graph type and aggregate dropdowns to reflect how the graph was drawn.
 *
 * @param {Graph~Config_When} config
 * The configuration used by the graph that was just drawn.
 */

Graph.prototype.syncDrawnGraphConfigWithUi = function (config) {
	var self = this;

	if (config == null) {
		return;
	}

	var axis = config.graphType === 'bar' ? 'hAxis' : 'vAxis';
	self.ui.graphTypeDropdown.val(config.graphType);

	if (self.lastOps != null && self.lastOps.group) {
		self.ui.toolbar_aggregates.css('visibility', 'visible');
		var matchingAgg = self.ui.aggDropdown.find('option');
		if (config.aggType != null) {
			matchingAgg = matchingAgg.filter(function (i, elt) {
				return elt.getAttribute('data-wcdv-agg-type') === config.aggType;
			});
		}
		if (config.aggNum != null) {
			matchingAgg = matchingAgg.filter(function (i, elt) {
				return +elt.getAttribute('data-wcdv-agg-num') === config.aggNum;
			});
		}
		if (matchingAgg.length === 1) {
			self.ui.aggDropdown.val(matchingAgg.attr('value'));
		}
		self.ui.zeroAxisCheckbox.prop('checked', getProp(config, 'options', axis, 'minValue') == 0);
	}
	else {
		self.ui.toolbar_aggregates.css('visibility', 'hidden');
	}

	if (self.lastOps != null && self.lastOps.pivot) {
		self.ui.toolbar_pivot.css('visibility', 'visible');
		self.ui.stackCheckbox.prop('checked', !!getProp(config, 'options', 'isStacked'));
	}
	else {
		self.ui.toolbar_pivot.css('visibility', 'hidden');
	}
}

// #export {{{2

Graph.prototype.export = function () {
	var self = this;

	if (self.exportBlob == null) {
		return;
	}

	var fileName = (self.opts.title || self.id) + '.png';
	presentDownload(self.exportBlob, fileName);
};

// #_setExportBlob {{{2

Graph.prototype._setExportBlob = function (blob) {
	var self = this;

	self.exportBlob = blob;
	self.ui.exportBtn.prop('disabled', blob == null);
};

// #_clearExportBlob {{{2

Graph.prototype._clearExportBlob = function () {
	var self = this;

	self.exportBlob = null;
	self.ui.exportBtn.prop('disabled', true);
};

// #drawFromConfig {{{2

Graph.prototype.drawFromConfig = function () {
	var self = this;

	self.lastDrawnFrom = 'config';
	self.renderer.draw(self.devConfig, self.userConfig);
}

// #drawInteractive {{{2

Graph.prototype.drawInteractive = function () {
	var self = this;

	var graphType = self.ui.graphTypeDropdown.val();
	var minValue = self.ui.zeroAxisCheckbox.prop('checked') ? 0 : null;

	var config = {
		group: {
			graphs: {},
			current: graphType
		},
		pivot: {
			graphs: {},
			current: graphType
		}
	};

	// NOTE The `graphType` field here is useless except that it makes the rendering function (e.g.
	// GraphRendererGoogle#draw_plain) more convenient to implement.

	var selOptIdx = self.ui.aggDropdown.get(0).selectedIndex;
	var selOpt = self.ui.aggDropdown.get(0).options[selOptIdx];

	config.group.graphs[graphType] = {
		graphType: graphType,
		aggType: selOpt.getAttribute('data-wcdv-agg-type'),
		aggNum: toInt(selOpt.getAttribute('data-wcdv-agg-num')),
		options: {}
	};

	// At least with Google Charts, you have to swap the horizontal and vertical axis configuration
	// for bar charts (since they're on their side).

	switch (graphType) {
	case 'bar':
		config.group.graphs[graphType].options = {
			vAxis: {
				minValue: minValue
			}
		};
		break;
	default:
		config.group.graphs[graphType].options = {
			vAxis: {
				minValue: minValue
			}
		};
	}

	// Copy everything... not strictly necessary AFAIK, but it's safe.
	config.pivot = deepCopy(config.group);

	// Make sure to add the stack setting for pivot mode.
	config.pivot.graphs[graphType].options.isStacked = self.ui.stackCheckbox.prop('checked');

	// Store this configuration in the userConfig so that it can be saved with prefs.
	_.extend(self.userConfig, config);

	if (self.prefs != null) {
		self.prefs.save();
	}

	console.debug('[DataVis // Graph] Drawing graph based on interactive config [userConfig = %O]', self.userConfig);

	self.lastDrawnFrom = 'interactive';
	self.renderer.draw(self.devConfig, self.userConfig);
};

// #checkGraphConfig {{{2

Graph.prototype.checkGraphConfig = function () {
	if (self.devConfig == null) {
		return;
	}

	_.each(['whenPlain', 'whenGroup', 'whenPivot'], function (dataFormat) {
		if (self.devConfig[dataFormat] === undefined) {
			return;
		}

		var config = self.devConfig[dataFormat];

		// Check the "graphType" property.

		if (config.graphType != null) {
			if (!_.isString(config.graphType)) {
				throw new Error('Graph config error: data format "' + dataFormat + '": `graphType` must be a string');
			}

			if (['area', 'bar', 'column', 'line', 'pie'].indexOf(config.graphType) === -1) {
				throw new Error('Graph config error: data format "' + dataFormat + '": invalid `graphType`: ' + config.graphType);
			}
		}

		switch (config.graphType) {
		case 'area':
		case 'bar':
		case 'column':
		case 'line':
		case 'pie':
			if (config.valueField != null && config.valueFields != null) {
				throw new Error('Graph config error: data format "' + dataFormat + '": can\'t define both `valueField` and `valueFields`');
			}

			// Turn the singular "valueField" into the plural "valueFields."

			if (config.valueField != null) {
				if (!_.isString(config.valueField)) {
					throw new Error('Graph config error: data format "' + dataFormat + '": `valueField` must be a string');
				}
				config.valueFields = [config.valueField];
				delete config.valueField;
			}

			// Check the "valueFields" property, if it exists.

			if (config.valueFields != null) {
				if (!_.isArray(config.valueFields)) {
					throw new Error('Graph config error: data format "' + dataFormat + '": `valueFields` must be an array');
				}

				_.each(config.valueFields, function (f, i) {
					if (!_.isString(f)) {
						throw new Error('Graph config error: data format "' + dataFormat + '": `valueFields[' + i + ']` must be a string');
					}
				});
			}
		}
	});
};

// #refresh {{{2

/**
 * Refreshes the data from the data view in the grid.
 *
 * @method
 * @memberof Grid
 */

Graph.prototype.refresh = function () {
	var self = this;

	self.view.clearSourceData();
};

// #redraw {{{2

Graph.prototype.redraw = function () {
	var self = this;

	self.prefs.prime(function () {
		self.checkGraphConfig();
		var ctor = getProp(self.opts, 'renderer') && GRAPH_RENDERER_REGISTRY.isSet(self.opts.renderer)
			? GRAPH_RENDERER_REGISTRY.get(self.opts.renderer)
			: GRAPH_RENDERER_REGISTRY.get('google');
		self.renderer = new ctor(self, self.ui.graph, self.view, self.opts);
		self.renderer.on('draw', function (config) {
			self.syncDrawnGraphConfigWithUi(config);
		});
		self._setGraphTypeOptions();
		self.drawFromConfig();
	}, {
		who: self
	});
};

// #hide {{{2

/**
 * Hide the grid.
 *
 * @method
 * @memberof Grid
 */

Graph.prototype.hide = function () {
	var self = this;

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

Graph.prototype.show = function (opts) {
	var self = this;

	opts = deepDefaults(opts, {
		redraw: true
	});

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
 * Toggle graph visibility.
 */

Graph.prototype.toggle = function () {
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
 * Determine if the graph is currently visible.
 *
 * @returns {boolean}
 * True if the graph is currently visible, false if it is not.
 */

Graph.prototype.isVisible = function () {
	var self = this;

	return self.ui.content.css('display') !== 'none';
};

// #_setSpinner {{{2

/**
 * Set the type of the spinner icon.
 *
 * @param {string} what
 * The kind of spinner icon to show.  Must be one of: loading, not-loaded, working.
 */

Graph.prototype._setSpinner = function (what) {
	var self = this;

	switch (what) {
	case 'loading':
		self.ui.spinner.html(fontAwesome('fa-refresh', 'fa-spin', 'Loading...'));
		break;
	case 'not-loaded':
		self.ui.spinner.html(fontAwesome('fa-ban', null, 'Not Loaded'));
		break;
	case 'working':
		self.ui.spinner.html(fontAwesome('fa-circle-o-notch', 'fa-spin', 'Working...'));
		break;
	}
};

// #_showSpinner {{{2

/**
 * Show the spinner icon.
 */

Graph.prototype._showSpinner = function () {
	var self = this;

	self.ui.spinner.show();
};

// #_hideSpinner {{{2

/**
 * Hide the spinner icon.
 */

Graph.prototype._hideSpinner = function () {
	var self = this;

	self.ui.spinner.hide();
};

// #setUserConfig {{{2

Graph.prototype.setUserConfig = function (config) {
	var self = this;

	self.userConfig = config;

	// When the constructor binds to prefs, this method can be called before the renderer is created.
	// That's not a big deal, just don't do anything here if that's the case.

	if (self.renderer != null) {
		self.renderer.draw(self.devConfig, self.userConfig);
	}
};

// GraphControl {{{1

var GraphControl = makeSubclass('GraphControl', Object, function () {
	var self = this;

	self.ui = {};
});

// #draw {{{2

GraphControl.prototype.draw = function () {
	var self = this;

	self.view.on('getTypeInfo', function (typeInfo) {
		var fields = [];

		_.each(determineColumns(null, null, typeInfo), function (fieldName) {
			var text = getProp(self.colConfig, fieldName, 'displayText') || fieldName;
			fields.push({ fieldName: fieldName, displayText: text });
		});

		// Graph Type Dropdown

		self.ui.graphType = jQuery('<select>');

		if (getProp(self.renderer, 'prototype', 'graphTypes')) {
			self.renderer.prototype.graphTypes.each(function (gt) {
				self.ui.graphType.append(jQuery('<option>', { 'value': gt.value }).text(gt.name));
			});
		}

		self.ui.root.append(jQuery('<div>').append(self.ui.graphType));

		// Plain Data Configuration

		self.ui.plainCheckbox = jQuery('<input>', { 'type': 'checkbox', 'checked': 'checked' })
			.on('change', function () {
				if (self.ui.plainCheckbox.prop('checked')) {
					self.ui.plainConfig.show();
				}
				else {
					self.ui.plainConfig.hide();
				}
			});

		self.ui.root.append(
			jQuery('<span>', { 'class': 'wcdv_title' })
			.append(self.ui.plainCheckbox)
			.append('Plain Data')
		);

		self.ui.plainCategoryField = jQuery('<select>')
			.on('change', function () {
				self.defn.whenPlain.categoryField = self.ui.plainCategoryField.val();
			});
		self.ui.plainValueField = jQuery('<select>')
			.on('change', function () {
				self.defn.whenPlain.valueField = self.ui.plainValueField.val();
			});

		_.each(fields, function (f) {
			self.ui.plainCategoryField.append(
				jQuery('<option>', { 'value': f.fieldName }).text(f.displayText)
			);
			self.ui.plainValueField.append(
				jQuery('<option>', { 'value': f.fieldName }).text(f.displayText)
			);
		});

		self.ui.plainConfig = jQuery('<div>')
			.append(
				jQuery('<div>')
				.append('Category Field: ')
				.append(self.ui.plainCategoryField)
			)
			.append(
				jQuery('<div>')
				.append('Value Field: ')
				.append(self.ui.plainValueField)
			)
			.appendTo(self.ui.root);

		// Group Data Configuration



		// Pivot Data Configuration
	}, { limit: 1 });
};

// Exports {{{1

export {
	Graph,
};
