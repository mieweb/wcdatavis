import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';

import {
	dataURItoBlob,
	debug,
	deepCopy,
	deepDefaults,
	each,
	getProp,
	loadScript,
	log,
	makeSubclass,
	map,
	setProp,
} from '../../util/misc.js';
import {AggregateInfo} from '../../aggregates';
import {GROUP_FUNCTION_REGISTRY} from '../../group_fun.js';

import { GraphRenderer } from '../../graph_renderer.js';

// GraphRendererJit {{{1

var GraphRendererJit = makeSubclass('GraphRendererJit', GraphRenderer);

// #draw {{{2

GraphRendererJit.prototype.draw = function () {
	var self = this;

	elt.children().remove();

	self.view.getData(function (ok, data) {
		self.view.getTypeInfo(function () {
			var ctor = {
				area: 'AreaChart',
				bar: 'BarChart',
				line: 'LineChart'
			};

			var json = {
				label: [],
				values: []
			};

			each(self.opts.valueFields, function (f) {
				json.label.push(f);
			});

			each(data.data, function (row) {
				var newRow = {};
				newRow.label = row.rowData[self.opts.categoryField].value;
				newRow.values = map(self.opts.valueFields, function (f) {
					return row.rowData[f].value;
				});
				json.values.push(newRow);
			});

			var options = {
				injectInto: elt.attr('id')
			};

			jQuery.extend(true, options, self.opts.options);

			var chart = new $jit[ctor[self.opts.type]](options);
			chart.loadJSON(json);
		});
	}, 'Drawing JIT graph');
};

// Exports {{{1

export default GraphRendererJit;
