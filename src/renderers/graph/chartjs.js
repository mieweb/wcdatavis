import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';
import Chart from 'chart.js/auto'; // FIXME: This imports everything.

import {
	dataURItoBlob,
	debug,
	deepCopy,
	deepDefaults,
	each,
	flatten,
	gensym,
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

// GraphRendererChartJs {{{1

var GraphRendererChartJs = makeSubclass('GraphRendererChartJs', GraphRenderer, null, {
	graphTypes: OrdMap.fromArray([{
		value: 'bar',
		name: 'Bar Chart',
		modes: ['plain', 'group', 'pivot'],
	}, {
		value: 'column',
		name: 'Column Chart',
		modes: ['plain', 'group', 'pivot'],
	}], 'value')
});

// #draw_plain {{{2

GraphRendererChartJs.prototype.draw_plain = function (data, typeInfo, dt, config) {
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
		if (config.nameField == null) {
			throw new Error('Configuration option `nameField` must exist');
		}

		var timeConfigStr = '' + (+config.startField) + (+config.endField) + (+config.durationField);
		if (timeConfigStr === '100' || timeConfigStr === '010' || timeConfigStr === '000') {
			throw new Error('Time configuration is insufficient to determine offsets');
		}

		dt.addColumn('string', 'ID');
		dt.addColumn('string', 'Name');
		dt.addColumn('string', 'Resource');
		dt.addColumn('date', 'Start');
		dt.addColumn('date', 'End');
		dt.addColumn('number', 'Duration');
		dt.addColumn('number', 'Completion');
		dt.addColumn('string', 'Dependencies');

		var configOpts = [
			{ name: 'id', default: (function () { var x = 0; return function () { return x++; }; }) },
			{ name: 'name' },
			{ name: 'resource', default: null },
			{ name: 'start', default: null },
			{ name: 'end', default: null },
			{ name: 'duration', default: null },
			{ name: 'completion', default: 0 },
			{ name: 'dependencies', default: null }
		];

		each(configOpts, function (opt) {
			if (config[opt.name + 'Field'] != null) {
				Source.decodeAll(data.dataByRowId, config[opt.name + 'Field']);
			}
		});

		each(data.data, function (row) {
			var newRow = [];
			each(configOpts, function (opt) {
				if (config[opt.name + 'Field'] != null) {
					newRow.push(getRealValue(config[opt.name + 'Field'], row.rowData[config[opt.name + 'Field']]));
				}
				else if (opt.default === undefined) {
					throw new Error();
				}
				else if (typeof opt.default === 'function') {
					newRow.push(opt.default());
				}
				else {
					newRow.push(opt.default);
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
			Source.decodeAll(data.dataByRowId, field);
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

GraphRendererChartJs.prototype.draw_group = function (data, typeInfo, obj, config) {
	var self = this;
	var obj = {
		data: {
			datasets: [],
			labels: []
		}
	};

	if (typeof config === 'function') {
		config = config(data.groupFields);
	}

	config = deepDefaults(config, {
		graphType: 'bar',
		categoryField: data.groupFields[0],
		valueFields: [{
			name: 'Count',
			fun: 'count'
		}]
	});

	if (config.aggType != null && config.aggNum != null) {
		// We only have a single aggregate that's been specified in the configuration.  This is what is
		// *supposed* to happen when the user clicks the "graph" button in the aggregate control of the
		// grid that's attached to this graph.

		obj.data.datasets[0] = {};
		obj.data.datasets[0].label = config.categoryField;

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

		obj.data.datasets[0].data = [];

		each(data.rowVals, function (rowVal, rowValIdx) {
			obj.data.labels.push(rowVal.join(', '));
			var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx];
			if (aggResultType === 'number') {
				aggResult = +aggResult;
			}
			obj.data.datasets[0].data.push(aggResult);
		});
	}
	else {
		var ai = [];

		// For each value field, create the AggregateInfo instance that will manage it.  Also create a
		// column for the result in the data table.

		each(config.valueFields, function (v) {
			var aggInfo = new AggregateInfo('group', v, 0, null /* colConfig */, self.typeInfo, null /* convert */);
			ai.push(aggInfo);
			obj.data.datasets.push({
				label: (aggInfo.instance.getType(), v.name || aggInfo.instance.getFullName()),
				data: []
			});
		});

		// Go through each rowval and create a row for it in the data table.  Every value field gets its
		// own column, which is the result of the corresponding aggregate function specified above.

		each(data.rowVals, function (rowVal, rowValIdx) {
			obj.data.labels.push(rowVal.join(', '));

			each(ai, function (aggInfo, i) {
				var aggResult = aggInfo.instance.calculate(flatten(data.data[rowValIdx]));
				obj.data.datasets[i].data.push(aggResult);
				if (aggInfo.debug) {
					console.debug('[DataVis Graph // Group // Aggregate] Group aggregate (%s) : Group [%s] = %s',
						aggInfo.instance.name + (aggInfo.name ? ' -> ' + aggInfo.name : ''),
						rowVal.join(', '),
						JSON.stringify(aggResult));
				}
			});
		});
	}

	return obj;
};

// #draw_pivot {{{2

GraphRendererChartJs.prototype.draw_pivot = function (data, typeInfo, dt, config) {
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
						console.debug('[DataVis // Graph // Group // Aggregate] Group aggregate (%s) : RowVal [%s] x ColVal [%s] = %s',
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

// #draw {{{2

GraphRendererChartJs.prototype.draw = function (devConfig, userConfig) {
	var self = this;

	if (!self.hasRun) {
		self.super.addRedrawHandlers();
	}
	self.hasRun = true;

	devConfig = devConfig || {};
	userConfig = userConfig || {};

	self.view.getData(function (ok, data) {
		self.view.getTypeInfo(function (ok, typeInfo) {
			self.elt.children().remove();
			var id = gensym();
			self.elt.append(jQuery('<canvas>', { id: id }));

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

			if (data.isPlain) {
				config = self.draw_plain(data, typeInfo, getProp(userConfig, 'plain', 'graphs', getProp(userConfig, 'plain', 'current')) || devConfig.whenPlain);
			}
			else if (data.isGroup) {
				config = self.draw_group(data, typeInfo, getProp(userConfig, 'group', 'graphs', getProp(userConfig, 'group', 'current')) || devConfig.whenGroup);
			}
			else if (data.isPivot) {
				config = self.draw_pivot(data, typeInfo, getProp(userConfig, 'pivot', 'graphs', getProp(userConfig, 'pivot', 'current')) || devConfig.whenPivot);
			}

			if (config == null) {
				makeMessage('Nothing to Graph');
				return;
			}

			var graphTypeMap = {
				bar: {
					type: 'bar',
					options: {
						indexAxis: 'y'
					}
				},
				column: {
					type: 'bar'
				}
			};

			var obj = deepDefaults({}, graphTypeMap.bar, config);

			console.debug('[DataVis // Graph // Chartjs // Draw] Starting draw: [%O]', obj);

			var chart = new Chart(document.getElementById(id), obj);
			self.fire('draw', null, config);
		});
	}, 'Drawing Chart.js graph');
};

// Exports {{{1

export default GraphRendererChartJs;
