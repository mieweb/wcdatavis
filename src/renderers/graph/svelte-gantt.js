import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';

// Promise polyfill for Svelte in IE mode.
import 'core-js/actual/promise';

// CSS.escape() polyfill for Svelte in IE mode.
import 'css.escape';

// import { mount } from 'svelte'; // Svelte 5
import { SvelteGantt, SvelteGanttTable, SvelteGanttDependencies } from 'svelte-gantt';

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
	setProp,
} from '../../util/misc.js';
import {AggregateInfo} from '../../aggregates';
import {GROUP_FUNCTION_REGISTRY} from '../../group_fun.js';

import { GraphRenderer } from '../../graph_renderer.js';
import { Source } from '../../source.js';

// GraphRendererSvelteGantt {{{1

var GraphRendererSvelteGantt = makeSubclass('GraphRendererSvelteGantt', GraphRenderer);

// #draw {{{2

GraphRendererSvelteGantt.prototype.draw = function () {
	var self = this;

	self.elt.children().remove();

	self.view.getData(function (ok, data) {
		self.view.getTypeInfo(function (ok, typeInfo) {
			var rows = []
				, rowMap = {} // Used to keep track of rows we've already created.
				, tasks = []
				, deps = []
				, rowId = 0
				, taskId = 0
				, depId = 0
				, minDate = null
				, maxDate = null;

			var makeDate = function (x) {
				return typeof x === 'string' ? moment(x).valueOf() :
					moment.isMoment(x) ? x.valueOf() :
					null;
			}
			var cols = [{
				field: 'Task',
				required: true
			}, {
				field: 'Resource',
				required: true
			}, {
				field: 'Start',
				required: true
			}, {
				field: 'End',
				required: true
			}, {
				field: 'Completion'
			}, {
				field: 'Dependencies'
			}];

			// Make sure that all the fields that we need are in the data.

			var missingRequired = false;
			each(cols, function (c) {
				if (c.required && !typeInfo.isSet(c.field)) {
					console.error('[DataVis // Graph(SvelteGantt) // Gantt] Missing required data field: %s', c.field);
					missingRequired = true;
				}
			});
			if (missingRequired) {
				return null;
			}

			each(cols, function (c) {
				// Make sure data is decoded.
				if (typeInfo.isSet(c.field)) {
					Source.decodeAll(data.dataByRowId, c.field, typeInfo);
				}
			});

			each(data.data, function (row) {
				if (rowMap[row.rowData['Resource'].value] == null) {
					rows.push({
						id: rowId,
						name: row.rowData['Resource'].value
					});
					rowMap[row.rowData['Resource'].value] = rowId;
					rowId += 1;
				}

				var newTask = {
					id: taskId,
					resourceId: rowMap[row.rowData['Resource'].value],
					from: makeDate(row.rowData['Start'].value),
					to: makeDate(row.rowData['End'].value),
					label: row.rowData['Task'].value,
				};
				if (row.rowData['Completion'] != null) {
					newTask.amountDone = row.rowData['Completion'].value;
				}
				tasks.push(newTask);
				taskId += 1;

				if (row.rowData['Dependencies'] != null && row.rowData['Dependencies'].value.length > 0) {
					each(row.rowData['Dependencies'].value.split(','), function (dep) {
						deps.push({
							id: depId,
							fromId: dep - 1,
							toId: newTask.id
						});
						depId += 1;
					});
				}

				// Track the overall min/max date for the task.

				if (minDate == null || minDate > newTask.from) {
					minDate = newTask.from;
				}
				if (maxDate == null || maxDate < newTask.to) {
					maxDate = newTask.to;
				}
			});

			var target = jQuery('<div>').appendTo(self.elt).get(0);
			var props = {
				rows: rows,
				tasks: tasks,
				from: minDate,
				to: maxDate,
				headers: [{
					unit: 'week',
					format: 'dd/MM/yyyy'
				}],
				tableHeaders: [{title: 'Resource', property: 'name'}],
				ganttTableModules: [SvelteGanttTable],
				highlightedDurations: {
					unit: 'day',
					fractions: [0,6]
				},
				dependencies: deps,
				ganttBodyModules: [SvelteGanttDependencies]
			};

			// Svelte 4
			var gantt = new SvelteGantt({
				target: target,
				props: props
			});

			// Svelte 5
			// mount(SvelteGantt(self.elt, props));
		});
	}, 'Drawing Svelte-Gantte graph');
};

// Exports {{{1

export default GraphRendererSvelteGantt;
