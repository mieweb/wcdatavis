import _ from 'underscore';
import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';
import Chart from 'chart.js/auto'; // FIXME: This imports everything.

import {
	dataURItoBlob,
	debug,
	deepCopy,
	deepDefaults,
	gensym,
	getProp,
	loadScript,
	log,
	makeSubclass,
	setProp,
} from '../../util/misc.js';
import {AggregateInfo} from '../../aggregates';
import {GROUP_FUNCTION_REGISTRY} from '../../group_fun.js';

import OrdMap from '../../util/ordmap.js';
import { GraphRenderer } from '../../graph_renderer.js';
import { Source } from '../../source.js';

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
	}, {
		value: 'line',
		name: 'Line Chart',
		modes: ['plain', 'group', 'pivot'],
	}, {
		value: 'pie',
		name: 'Pie Chart',
		modes: ['plain', 'group', 'pivot'],
	}], 'value')
});

// #draw_plain {{{2

GraphRendererChartJs.prototype.draw_plain = function (data, typeInfo, dt, config) {
	var self = this;

	if (config == null) {
		return null;
	}

	var obj = {
		data: {
			datasets: [],
			labels: []
		}
	};

	var getRealValue = function (f, x) {
		if (typeInfo.get(f).type === 'date' && moment.isMoment(x.value)) {
			return x.value.format('YYYY-MM-DD');
		}
		else if (['number', 'currency'].indexOf(typeInfo.get(f).type) >= 0 && numeral.isNumeral(x.value)) {
			return x.value._value;
		}
		else {
			return x.value;
		}
	};

	// Decode fields first
	_.each(config.valueFields, function (field) {
		Source.decodeAll(data.dataByRowId, field, typeInfo);
	});
	Source.decodeAll(data.dataByRowId, config.categoryField, typeInfo);

	// Create datasets for each value field
	_.each(config.valueFields, function (field, index) {
		obj.data.datasets.push({
			label: field,
			data: [],
			backgroundColor: 'rgba(54, 162, 235, 0.5)',
			borderColor: 'rgba(54, 162, 235, 1)',
			borderWidth: 1
		});
	});

	// Populate data
	_.each(data.data, function (row) {
		var categoryValue = getRealValue(config.categoryField, row.rowData[config.categoryField]);
		obj.data.labels.push(categoryValue);

		_.each(config.valueFields, function (field, index) {
			var value = getRealValue(field, row.rowData[field]);
			obj.data.datasets[index].data.push(value);
		});
	});

	return obj;
};

// #draw_group {{{2

GraphRendererChartJs.prototype.draw_group = function (data, typeInfo, dt, config) {
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

		_.each(data.rowVals, function (rowVal, rowValIdx) {
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

		_.each(config.valueFields, function (v) {
			var aggInfo = new AggregateInfo('group', v, 0, null /* colConfig */, self.typeInfo, null /* convert */);
			ai.push(aggInfo);
			obj.data.datasets.push({
				label: v.name || aggInfo.instance.getFullName(),
				data: []
			});
		});

		// Go through each rowval and create a row for it in the data table.  Every value field gets its
		// own column, which is the result of the corresponding aggregate function specified above.

		_.each(data.rowVals, function (rowVal, rowValIdx) {
			obj.data.labels.push(rowVal.join(', '));

			_.each(ai, function (aggInfo, i) {
				var aggResult = aggInfo.instance.calculate(_.flatten(data.data[rowValIdx]));
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
	var self = this;
	var obj = {
		data: {
			datasets: [],
			labels: []
		}
	};

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

		switch (config.aggType) {
		case 'cell':
			// Create datasets for each pivot column
			_.each(data.colVals, function (colVal, colValIdx) {
				obj.data.datasets.push({
					label: colVal.join(', '),
					data: []
				});
			});

			// Populate data for each row and column combination
			_.each(data.rowVals, function (rowVal, rowValIdx) {
				obj.data.labels.push(rowVal.join(', '));

				_.each(data.colVals, function (colVal, colValIdx) {
					var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx][colValIdx];
					if (aggResultType === 'number') {
						aggResult = +aggResult;
					}
					obj.data.datasets[colValIdx].data.push(aggResult);
				});
			});
			break;
		case 'group':
			obj.data.datasets.push({
				label: name,
				data: []
			});

			_.each(data.rowVals, function (rowVal, rowValIdx) {
				obj.data.labels.push(rowVal.join(', '));
				var aggResult = data.agg.results[config.aggType][config.aggNum][rowValIdx];
				if (aggResultType === 'number') {
					aggResult = +aggResult;
				}
				obj.data.datasets[0].data.push(aggResult);
			});
			break;
		case 'pivot':
			obj.data.datasets.push({
				label: name,
				data: []
			});

			_.each(data.colVals, function (colVal, colValIdx) {
				obj.data.labels.push(colVal.join(', '));
				var aggResult = data.agg.results[config.aggType][config.aggNum][colValIdx];
				if (aggResultType === 'number') {
					aggResult = +aggResult;
				}
				obj.data.datasets[0].data.push(aggResult);
			});
			break;
		}
	}
	else {
		// Create datasets for each pivot column value
		_.each(data.colVals, function (colVal) {
			obj.data.datasets.push({
				label: colVal.join(', '),
				data: []
			});
		});

		// Create aggregate info instances
		var ai = [];
		_.each(config.valueFields, function (v) {
			var aggInfo = new AggregateInfo('cell', v, 0, null /* colConfig */, self.typeInfo, null /* convert */);
			ai.push(aggInfo);
		});

		// Populate data for each row and column combination
		_.each(data.rowVals, function (rowVal, rowValIndex) {
			obj.data.labels.push(rowVal.join(', '));

			_.each(data.colVals, function (colVal, colValIndex) {
				var aggResult = 0;
				_.each(ai, function (aggInfo) {
					aggResult += aggInfo.instance.calculate(data.data[rowValIndex][colValIndex]);
					if (aggInfo.debug) {
						console.debug('[DataVis // Graph // Pivot // Aggregate] Pivot aggregate (%s) : RowVal [%s] x ColVal [%s] = %s',
							aggInfo.instance.name + (aggInfo.name ? ' -> ' + aggInfo.name : ''),
							rowVal.join(', '),
							colVal.join(', '),
							JSON.stringify(aggResult));
					}
				});
				obj.data.datasets[colValIndex].data.push(aggResult);
			});
		});
	}

	return obj;
};

// #draw {{{2

GraphRendererChartJs.prototype.draw = function (devConfig, userConfig) {
	var self = this;

	if (!self.hasRun) {
		self.super['GraphRenderer'].addRedrawHandlers();
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
			var chartjsConfig = null;

			if (data.isPlain) {
				chartjsConfig = self.draw_plain(data, typeInfo, null, getProp(userConfig, 'plain', 'graphs', getProp(userConfig, 'plain', 'current')) || devConfig.whenPlain);
			}
			else if (data.isGroup) {
				chartjsConfig = self.draw_group(data, typeInfo, null, getProp(userConfig, 'group', 'graphs', getProp(userConfig, 'group', 'current')) || devConfig.whenGroup);
			}
			else if (data.isPivot) {
				chartjsConfig = self.draw_pivot(data, typeInfo, null, getProp(userConfig, 'pivot', 'graphs', getProp(userConfig, 'pivot', 'current')) || devConfig.whenPivot);
			}

			if (chartjsConfig == null) {
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
				},
				line: {
					type: 'line'
				},
				pie: {
					type: 'pie'
				}
			};

			// Get the config that was passed to the draw method
			var inputConfig = getProp(userConfig, data.isPlain ? 'plain' : data.isGroup ? 'group' : 'pivot', 'graphs', 
				getProp(userConfig, data.isPlain ? 'plain' : data.isGroup ? 'group' : 'pivot', 'current')) || 
				(data.isPlain ? devConfig.whenPlain : data.isGroup ? devConfig.whenGroup : devConfig.whenPivot);

			// Apply graph type specific settings
			var graphType = inputConfig && inputConfig.graphType ? inputConfig.graphType : 'column';
			var typeConfig = graphTypeMap[graphType] || graphTypeMap.column;
			
			var finalConfig = deepDefaults({}, typeConfig, {
				data: chartjsConfig.data,
				options: {
					responsive: true,
					plugins: {
						title: {
							display: !!self.opts.title,
							text: self.opts.title
						}
					}
				}
			});

			console.debug('[DataVis // Graph // Chartjs // Draw] Starting draw: [%O]', finalConfig);

			var chart = new Chart(document.getElementById(id), finalConfig);
			self.fire('draw', null, inputConfig);
		});
	}, 'Drawing Chart.js graph');
};

// Exports {{{1

export default GraphRendererChartJs;
