import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';

import {
	dataURItoBlob,
	debug,
	deepCopy,
	deepDefaults,
	each,
	flatten,
	getProp,
	loadScript,
	log,
	makeSubclass,
	map,
	setProp,
} from '../../util/misc.js';
import {AggregateInfo} from '../../aggregates';
import {GROUP_FUNCTION_REGISTRY} from '../../group_fun.js';

import OrdMap from '../../util/ordmap.js';
import { GraphRenderer } from '../../graph_renderer.js';
import { Source } from '../../source.js';

// GraphRendererGoogle {{{1

var GraphRendererGoogle = makeSubclass('GraphRendererGoogle', GraphRenderer, null, {
	graphTypes: OrdMap.fromArray([{
		value: 'area',
		name: 'Area Chart',
		modes: ['plain'],
	}, {
		value: 'line',
		name: 'Line Chart',
		modes: ['plain'],
	}, {
		value: 'bar',
		name: 'Bar Chart',
		modes: ['plain', 'group', 'pivot'],
	}, {
		value: 'column',
		name: 'Column Chart',
		modes: ['plain', 'group', 'pivot'],
	}, {
		value: 'pie',
		name: 'Pie Chart',
		modes: ['plain', 'group', 'pivot'],
	}, {
		value: 'gantt',
		name: 'Gantt Chart',
		modes: ['plain'],
	}], 'value')
});

// #draw_plain {{{2

GraphRendererGoogle.prototype.draw_plain = function (data, typeInfo, dt, config) {
	var self = this;

	if (config == null) {
		return null;
	}

	var convertType = function (t) {
		switch (t) {
		case 'currency':
			return 'number';
		default:
			return t;
		}
	};

	var getRealValue = function (f, x) {
		if (typeInfo.get(f).type === 'date' && moment.isMoment(x.value)) {
			return {v: x.value.toDate(), f: x.orig};
		}
		else if (['number', 'currency'].indexOf(typeInfo.get(f).type) >= 0 && numeral.isNumeral(x.value)) {
			return {v: x.value._value, f: x.orig};
		}
		else {
			return x.value;
		}
	};

	switch (config.graphType) {
	case 'gantt':
		var makeDate = function (x) {
			return typeof x === 'string' ? moment(x).toDate() :
				moment.isMoment(x) ? x.toDate() :
				null;
		}
		var cols = [{
			field: 'ID',
			type: 'string',
			default: (function () {
				var id = 1;
				return function () { return '' + id++; }
			})()
		}, {
			field: 'Task',
			type: 'string',
			required: true
		}, {
			field: 'Resource',
			type: 'string',
			required: true
		}, {
			field: 'Start',
			type: 'date',
			default: null,
			transform: makeDate
		}, {
			field: 'End',
			type: 'date',
			default: null,
			transform: makeDate
		}, {
			field: 'Duration',
			type: 'number',
			default: null
		}, {
			field: 'Completion',
			type: 'number',
			default: null
		}, {
			field: 'Dependencies',
			type: 'string',
			default: ''
		}];

		// Make sure that all the fields that we need are in the data.

		var missingRequired = false;
		each(cols, function (c) {
			if (c.required && !typeInfo.isSet(c.field)) {
				console.error('[DataVis // Graph(Google) // Gantt] Missing required data field: %s', c.field);
				missingRequired = true;
			}
		});
		if (missingRequired) {
			return null;
		}

		each(cols, function (c) {
			// Add columns to the Google Charts data table.
			dt.addColumn(c.type, c.field);

			// Make sure data is decoded.
			if (typeInfo.isSet(c.field)) {
				Source.decodeAll(data.dataByRowId, c.field, typeInfo);
			}
		});

		each(data.data, function (row) {
			var newRow = [];
			each(cols, function (c) {
				if (typeInfo.isSet(c.field)) {
					var v = row.rowData[c.field].value;
					newRow.push(c.transform != null ? c.transform(v) : v);
				}
				else {
					newRow.push(typeof c.default === 'function' ? c.default() : c.default);
				}
			});
			dt.addRow(newRow);
		});

		break;
	default:
		dt.addColumn(convertType(typeInfo.get(config.categoryField).type), config.categoryField);

		each(config.valueFields, function (field) {
			dt.addColumn(convertType(typeInfo.get(field).type), field);
		});

		each(config.valueFields, function (field) {
			Source.decodeAll(data.dataByRowId, field, typeInfo);
		});

		each(data.data, function (row) {
			var newRow;

			newRow = map([config.categoryField].concat(config.valueFields), function (f) {
				return getRealValue(f, row.rowData[f]);
			});

			dt.addRow(newRow);
		});
	}

	return config;
};

// #draw_group {{{2

GraphRendererGoogle.prototype.draw_group = function (data, typeInfo, dt, config) {
	var self = this;

	if (typeof config === 'function') {
		config = config(data.groupFields);
	}

	config = deepDefaults(config, {
		graphType: 'column',
		categoryField: data.groupFields[0],
		valueFields: [{
			name: 'Count',
			fun: 'count'
		}]
	});

	var valueAxis = config.graphType === 'bar' ? 'hAxis' : 'vAxis';

	// dt.addColumn(typeInfo.get(config.categoryField).type, config.categoryField);
	dt.addColumn('string', config.categoryField);

	if (config.aggType != null && config.aggNum != null) {
		var aggInfo = getProp(data, 'agg', 'info', config.aggType, config.aggNum);
		if (aggInfo == null) {
			log.error('The specified aggregate does not exist: ' + config.aggType + '[' + config.aggNum + ']');
			return null;
		}
		if (data.agg.results[config.aggType][config.aggNum] == null) {
			log.error('No results exist for the specified aggregate: ' + config.aggType + '[' + config.aggNum + ']');
			return null;
		}
		var name = aggInfo.name || aggInfo.instance.getFullName();
		var aggResultType = aggInfo.instance.getType();

		if (aggResultType === 'currency') {
			aggResultType = 'number';
			setProp('currency', config, 'options', valueAxis, 'format');
		}

		dt.addColumn(aggResultType, name);
		setProp(name, config, 'options', valueAxis, 'title');

		each(data.rowVals, function (rowVal, rowValIdx) {
			var newRow = [rowVal.join(', ')];

			var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx];
			if (aggResultType === 'number') {
				aggResult = +aggResult;
			}
			newRow.push(aggResult);
			dt.addRow(newRow);
		});
	}
	else {
		var ai = [];

		// For each value field, create the AggregateInfo instance that will manage it.  Also create a
		// column for the result in the data table.

		each(config.valueFields, function (v) {
			var aggInfo = new AggregateInfo('group', v, 0, null /* colConfig */, self.typeInfo, null /* convert */);
			dt.addColumn(aggInfo.instance.getType(), v.name || aggInfo.instance.getFullName());
			ai.push(aggInfo);
		});

		// Go through each rowval and create a row for it in the data table.  Every value field gets its
		// own column, which is the result of the corresponding aggregate function specified above.

		each(data.rowVals, function (rowVal, rowValIdx) {
			var newRow = [rowVal.join(', ')];

			each(ai, function (aggInfo) {
				var aggResult = aggInfo.instance.calculate(flatten(data.data[rowValIdx]));
				newRow.push(aggResult);
				if (aggInfo.debug) {
					debug.info('GRAPH // GROUP // AGGREGATE', 'Group aggregate (%s) : Group [%s] = %s',
						aggInfo.instance.name + (aggInfo.name ? ' -> ' + aggInfo.name : ''),
						rowVal.join(', '),
						JSON.stringify(aggResult));
				}
			});

			dt.addRow(newRow);
		});
	}

	return config;
};

// #draw_pivot {{{2

GraphRendererGoogle.prototype.draw_pivot = function (data, typeInfo, dt, config) {
	var self = this

	if (typeof config === 'function') {
		config = config(data.groupFields, data.pivotFields);
	}

	config = deepDefaults(config, {
		graphType: 'column',
		categoryField: data.groupFields[0],
		valueFields: [{
			fun: 'count'
		}],
		options: {
			isStacked: true
		}
	});

	var valueAxis = config.graphType === 'bar' ? 'hAxis' : 'vAxis';

	dt.addColumn('string', config.categoryField);

	if (config.aggType != null && config.aggNum != null) {
		var aggInfo = getProp(data, 'agg', 'info', config.aggType, config.aggNum);
		if (aggInfo == null) {
			log.error('The specified aggregate does not exist: ' + config.aggType + '[' + config.aggNum + ']');
			return null;
		}
		if (data.agg.results[config.aggType][config.aggNum] == null) {
			log.error('No results exist for the specified aggregate: ' + config.aggType + '[' + config.aggNum + ']');
			return null;
		}
		var name = aggInfo.name || aggInfo.instance.getFullName();
		var aggResultType = aggInfo.instance.getType();

		if (aggResultType === 'currency') {
			aggResultType = 'number';
			setProp('currency', config, 'options', valueAxis, 'format');
		}

		switch (config.aggType) {
		case 'cell':
			each(data.colVals, function (colVal) {
				dt.addColumn(aggResultType, colVal.join(', '));
			});

			setProp(name, config, 'options', valueAxis, 'title');

			each(data.rowVals, function (rowVal, rowValIdx) {
				var newRow = [rowVal.join(', ')];

				each(data.colVals, function (colVal, colValIdx) {
					var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx][colValIdx];
					if (aggResultType === 'number') {
						aggResult = +aggResult;
					}
					newRow.push(aggResult);
				});

				dt.addRow(newRow);
			});
			break;
		case 'group':
			dt.addColumn(aggResultType, name);
			setProp(name, config, 'options', valueAxis, 'title');

			each(data.rowVals, function (rowVal, rowValIdx) {
				var newRow = [rowVal.join(', ')];

				var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx];
				if (aggResultType === 'number') {
					aggResult = +aggResult;
				}
				newRow.push(aggResult);
				dt.addRow(newRow);
			});
			break;
		case 'pivot':
			dt.addColumn(aggResultType, name);
			setProp(name, config, 'options', valueAxis, 'title');

			each(data.colVals, function (colVal, colValIdx) {
				var newRow = [colVal.join(', ')];

				var aggResult = data.agg.results[config.aggType][config.aggNum][colValIdx];
				if (aggResultType === 'number') {
					aggResult = +aggResult;
				}
				newRow.push(aggResult);
				dt.addRow(newRow);
			});
			break;
		}
	}
	else {
		var ai = [];

		// For each value field, create the AggregateInfo instance that will manage it.  Also create
		// columns for the results (one for each colval) in the data table.

		each(config.valueFields, function (v) {
			var aggInfo = new AggregateInfo('cell', v, 0, null /* colConfig */, self.typeInfo, null /* convert */);

			each(data.colVals, function (colVal) {
				dt.addColumn(aggInfo.instance.getType(), colVal.join(', '));
			});

			ai.push(aggInfo);
		});

		each(data.rowVals, function (rowVal, rowValIndex) {
			var newRow = [rowVal.join(', ')];

			each(data.colVals, function (colVal, colValIndex) {
				each(ai, function (aggInfo) {
					var aggResult = aggInfo.instance.calculate(data.data[rowValIndex][colValIndex]);
					newRow.push(aggResult);
					if (aggInfo.debug) {
						debug.info('GRAPH // GROUP // AGGREGATE', 'Group aggregate (%s) : RowVal [%s] x ColVal [%s] = %s',
							aggInfo.instance.name + (aggInfo.name ? ' -> ' + aggInfo.name : ''),
							rowVal.join(', '),
							colVal.join(', '),
							JSON.stringify(aggResult));
					}
				});
			});

			dt.addRow(newRow);
		});
	}

	return config;
};

// #_ensureGoogleChartsLoaded {{{2

GraphRendererGoogle.prototype._ensureGoogleChartsLoaded = function (cont) {
	return loadScript('https://www.gstatic.com/charts/loader.js', function (wasAlreadyLoaded, k) {
		var cb = function () {
			k();
			cont();
		};
		if (!wasAlreadyLoaded) {
			debug.info('GRAPH // GOOGLE // DRAW', 'Loading support for Google Charts');
			window.google.charts.load('current', {'packages': ['corechart', 'gantt']});
			window.google.charts.setOnLoadCallback(cb);
		}
		else {
			cb();
		}
	}, {
		needAsyncSetup: true
	});
};

// #draw {{{2

GraphRendererGoogle.prototype.draw = function (devConfig, userConfig) {
	var self = this;

	if (!self.hasRun) {
		self.super.addRedrawHandlers();
	}
	self.hasRun = true;

	devConfig = devConfig || {};
	userConfig = userConfig || {};

	self._ensureGoogleChartsLoaded(function () {
		self.view.getData(function (ok, data) {
			self.view.getTypeInfo(function (ok, typeInfo) {
				self.elt.children().remove();

				var makeMessage = function (msg) {
					jQuery('<div>')
						.addClass('wcdv_graph_message_container')
						.css({ 'height': self.opts.height + 'px' })
						.append(
							jQuery('<div>')
								.addClass('wcdv_graph_message')
								.text(msg)
						)
						.appendTo(self.elt);
				};

				if (data.data.length === 0) {
					makeMessage('No Data');
					return;
				}

				var config = null;
				var dt = new google.visualization.DataTable();

				if (data.isPlain) {
					config = self.draw_plain(data, typeInfo, dt, getProp(userConfig, 'plain', 'graphs', getProp(userConfig, 'plain', 'current')) || devConfig.whenPlain);
				}
				else if (data.isGroup) {
					config = self.draw_group(data, typeInfo, dt, getProp(userConfig, 'group', 'graphs', getProp(userConfig, 'group', 'current')) || devConfig.whenGroup);
				}
				else if (data.isPivot) {
					config = self.draw_pivot(data, typeInfo, dt, getProp(userConfig, 'pivot', 'graphs', getProp(userConfig, 'pivot', 'current')) || devConfig.whenPivot);
				}

				if (config == null) {
					makeMessage('Nothing to Graph');
					return;
				}

				var ctor = {
					area: 'AreaChart',
					bar: 'BarChart',
					column: 'ColumnChart',
					line: 'LineChart',
					pie: 'PieChart',
					gantt: 'Gantt'
				};

				// This is the object that's actually passed to the chart's draw() method.  All the options
				// in the Google documentation should go into this object.

				var options = {
					title: self.opts.title,
					width: self.opts.width,
					height: self.opts.height,
					isStacked: config.stacked,
				};

				var categoryAxis = config.graphType === 'bar' ? 'vAxis' : 'hAxis';

				if (config.graphType === 'pie') {
					options.chartArea = {
						top: '5%',
						left: '5%',
						width: '90%',
						height: '90%'
					};
				}

				setProp(config.categoryField, options, categoryAxis, 'title');

				jQuery.extend(true, options, config.options);

				var chart = new google.visualization[ctor[config.graphType]](self.elt.get(0));

				google.visualization.events.addListener(chart, 'ready', function () {
					var blob = null;
					if (typeof chart.getImageURI === 'function') {
						blob = dataURItoBlob(chart.getImageURI());
					}
					self.graph._setExportBlob(blob);
				});

				google.visualization.events.addListener(chart, 'select', function () {
					var sel = chart.getSelection();
					each(sel, function (o) {
						debug.info('GRAPH // DRILL DOWN', 'User selected element in graph: row = %s, column = %s, value = %s, formattedValue = %s', o.row, o.column, dt.getValue(o.row, o.column), dt.getFormattedValue(o.row, o.column));

						var filter = deepCopy(self.view.getFilter());

						each(data.rowVals[o.row], function (x, i) {
							var gs = data.groupSpec[i];
							filter[data.groupFields[i]] = gs.fun != null
								? GROUP_FUNCTION_REGISTRY.get(gs.fun).valueToFilter(x)
								: { '$eq': x };
						});

						if (data.isPivot) {
							// Offset column by one because the category is stored in the first column of the Google
							// DataTable, but that obviously doesn't exist in the View.

							each(data.colVals[o.column - 1], function (x, i) {
								var ps = data.pivotSpec[i];
								filter[data.pivotFields[i]] = ps.fun != null
									? GROUP_FUNCTION_REGISTRY.get(ps.fun).valueToFilter(x)
									: { '$eq': x };
							});
						}

						debug.info('GRAPH // DRILL DOWN',
							'Creating new perspective: filter = %O', filter);

						window.setTimeout(function () {
							self.view.prefs.addPerspective(null, 'Drill Down', { view: { filter: filter } }, { isTemporary: true }, null, { onDuplicate: 'replace' });
						});
					});
				});

				debug.info('GRAPH // GOOGLE // DRAW', 'Starting draw: [config = %O ; options = %O]', config, options);
				chart.draw(dt, options);
				self.fire('draw', null, config);
			});
		}, 'Drawing Google graph');
	});
};

// Exports {{{1

export default GraphRendererGoogle;
