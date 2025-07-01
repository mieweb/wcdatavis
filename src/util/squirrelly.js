// Imports {{{1

import Handlebars from 'handlebars';
import jQuery from 'jquery';

import {
	debug,
	format,
	getPropDef,
	objFromArray,
} from './misc.js';

// addHelpers {{{1

function addHelpers(env, data) {
	var ai = objFromArray(['cell', 'group', 'pivot', 'all'], [[]]);
	// Map object properties to filter aggregates
	const aiResult = {};
	Object.keys(ai).forEach(function(key) {
		aiResult[key] = getPropDef([], data, 'agg', 'info', key).filter(function (aggInfo) {
			return !aggInfo.isHidden;
		});
	});
	ai = aiResult;

	// rowval {{{2

	env.define('rowval', function (content) {
		var [ctx, groupField] = content.params;

		if (['number', 'string'].indexOf(typeof groupField) < 0) {
			throw new Error('In Handlebars "rowval" helper, `groupField` must be a number or string');
		}

		var gfi;

		if (typeof groupField === 'number') {
			gfi = groupField;

			if (gfi < 0) {
				throw new Error('In Handlebars "rowval" helper, group field index "' + groupField + '" out of range');
			}
		}
		else {
			gfi = data.groupFields.indexOf(groupField);

			if (gfi < 0) {
				throw new Error('In Handlebars "rowval" helper, specified field "' + groupField + '" is not part of group');
			}
		}

		return data.rowVals[ctx.rowValIdx][gfi];
	});

	// colval {{{2

	env.define('colval', function (content) {
		let [ctx, pivotField] = content.params;

		if (['number', 'string'].indexOf(typeof pivotField) < 0) {
			throw new Error('In Handlebars "rowval" helper, `pivotField` must be a number or string');
		}

		var pivotFieldIndex;

		if (typeof pivotField === 'number') {
			pivotFieldIndex = pivotField;

			if (pivotFieldIndex < 0) {
				throw new Error('In Handlebars "rowval" helper, pivot field index "' + pivotField + '" out of range');
			}
		}
		else {
			pivotFieldIndex = data.pivotFields.indexOf(pivotField);

			if (pivotFieldIndex < 0) {
				throw new Error('In Handlebars "rowval" helper, specified field "' + pivotField + '" is not part of pivot');
			}
		}

		return data.colVals[ctx.colValIdx][pivotFieldIndex];
	});

	// aggregate {{{2

	env.define('aggregate', function (content) {
		let [ctx, type, aggNum] = content.params;

		if (data.isPlain) {
			throw new Error('In Handlebars "aggregate" helper, data must be grouped to use this helper');
		}
		else if (data.isGroup && ['group', 'all'].indexOf(type) < 0) {
			throw new Error('In Handlebars "aggregate" helper, `type` must be one of: { group, all }');
		}
		else if (data.isPivot && ['cell', 'group', 'pivot', 'all'].indexOf(type) < 0) {
			throw new Error('In Handlebars "aggregate" helper, `type` must be one of: { cell, group, pivot, all }');
		}

		if (data.isGroup && ctx.rowValIdx == null) {
			throw new Error('missing rowvalidx from context');
		}
		if (data.isPivot && (ctx.rowValIdx == null || ctx.colValIdx == null)) {
			throw new Error('missing rowValIdx or colValIdx from context');
		}

		if (typeof aggNum !== 'number' || parseInt(aggNum) != aggNum) {
			return '[HELPER/AGGREGATE: AGGNUM MUST BE AN INT]';
		}

		if (ai[type].length <= aggNum) {
			return '[HELPER/AGGREGATE: AGGNUM OUT OF RANGE]';
		}

		var aggInfo = data.agg.info[type][aggNum];
		var aggResult = data.isGroup ? data.agg.results[type][aggNum][ctx.rowValIdx]
			: data.isPivot ? data.agg.results[type][aggNum][ctx.rowValIdx][ctx.colValIdx]
			: null;
		var text;

		if (aggResult instanceof jQuery) {
			aggResult = aggResult.get(0);
		}

		if (aggResult instanceof Element) {
			//td.appendChild(aggResult);
			return aggResult;
		}
		else {
			if (aggInfo.instance.inheritFormatting) {
				text = format(aggInfo.colConfig[0], aggInfo.typeInfo[0], aggResult, {
					overrideType: aggInfo.instance.getType()
				});
				//setTableCell(td, text, {
				//	field: aggInfo.fields[0],
				//	colConfig: aggInfo.colConfig[0],
				//	typeInfo: aggInfo.typeInfo[0]
				//});
				return text;
			}
			else {
				text = format(null, null, aggResult, {
					overrideType: aggInfo.instance.getType(),
					decode: false
				});
				//setTableCell(td, text);
				return text;
			}
		}
	});
}

// Exports {{{1

export default {
	addHelpers: addHelpers,
};
