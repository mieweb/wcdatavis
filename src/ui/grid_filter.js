import moment from 'moment';
import numeral from 'numeral';
import jQuery from 'jquery';
import BigNumber from 'bignumber.js';

import {
	debug,
	deepDefaults,
	defaults,
	each,
	fontAwesome,
	gensym,
	getPropDef,
	isFloat,
	isInt,
	log,
	makeSubclass,
	makeSuper,
	mixinEventHandling,
	reject,
	toFloat,
	toInt,
} from '../util/misc.js';

/**
 * @file
 * Contains the implementation of "grid filters" which are the dynamically applied filters that are
 * shown in the filter control of a grid.  They set the filter on the {@link View} associated with
 * the {@link Grid}.
 *
 * If you're looking for the parameters that get sent to the {@link Source} then you want {@link
 * source_param.js} instead.
 *
 * ## Classes
 *
 * - {@link GridFilter}
 *   - {@link StringTextboxGridFilter}
 *   - {@link StringDropdownGridFilterChosen}
 *   - {@link StringDropdownGridFilterSumo}
 *   - {@link NumberTextboxGridFilter}
 *   - {@link NumberCheckboxGridFilter}
 *   - {@link DateSingleGridFilter}
 *   - {@link DateRangeGridFilter}
 *   - {@link BooleanCheckboxGridFilter}
 * - {@link GridFilterSet}
 */

// GridFilter {{{1

// Superclass {{{2

// Constructor {{{3

/**
 * Base class for all grid filter widgets.
 *
 * @class
 *
 * @property {string} field
 *
 * @property {GridFilterSet} gridFilterSet
 *
 * @property {object} opts
 *
 * @property {string} [opts.filterType]
 *
 * @property {string} [opts.filterButton]
 * The button used to add a new filter.
 *
 * @property {string} [opts.noRemoveButton=false]
 * If true, don't create a remove button to place next to the filter.
 *
 * @property {number} limit
 *
 * @property {boolean} applyImmediately
 *
 * @property {jQuery} div
 *
 * @property {jQuery} input
 *
 * @property {jQuery} removeBtn
 *
 * @property {string} id
 *
 */

var GridFilter = (function () {
	var id = 0;

	var genId = function () {
		return 'GridFilter_' + id++;
	};

	return makeSubclass('GridFilter', Object, function (field, gridFilterSet, typeInfo, opts) {
		var self = this;
		var localRemoveButton;

		self.id = genId();
		self.field = field;
		self.gridFilterSet = gridFilterSet;
		self.typeInfo = typeInfo;
		self.opts = opts;

		self.limit = 0;
		self.applyImmediately = false;
		self.div = jQuery('<div>')
			.addClass('wcdv_filter_control_filter');

		if (self.opts.makeRemoveButton) {
			self.removeBtn = self.makeRemoveBtn();
			localRemoveButton = self.removeBtn;
		}
		else if (self.opts.removeButton) {
			localRemoveButton = self.opts.removeButton;
		}

		if (localRemoveButton) {
			localRemoveButton.on('click', function () {
				self.gridFilterSet.remove(self.getId(), self.opts.filterButton);
				if (typeof self.opts.onRemove === 'function') {
					self.opts.onRemove();
				}
			});
		}

		if (self.gridFilterSet.gridTable) {
			self.gridFilterSet.gridTable.on('columnResize', function () {
				self.adjustInputWidth({ useSizingElement: true, fromColumnResize: true });
			});
		}
	});
})();

// #getValue {{{3

/**
 * This represents an exact value to use with a filter operator to decide what to show in the grid.
 *
 * @typedef {string|Moment|Numeral} GridFilter~Value
 */

/**
 * This represents a range of allowed values; anything within the range should be shown in the grid.
 *
 * @typedef {Object} GridFilter~RangeValue
 *
 * @property {GridFilter~Value} start The starting number / date in the range (inclusive).
 * @property {GridFilter~Value} end The ending number / date in the range (inclusive).
 */

/**
 * Gives the value that should be used when building the filters for the View from the user's
 * input in the GridFilter.  A GridFilter can return either a single value (which should be combined
 * with the operator, e.g. "greater than 40") or a range value (where the operators are implicitly
 * greater-than-or-equal and less-than-or-equal, e.g. "between January 1st and March 31st").
 *
 * @returns {GridFilter~Value|GridFilter~RangeValue} The value of the filter; you can tell whether
 * or not it will be a range by checking the result of #isRange().
 */

GridFilter.prototype.getValue = function () {
	var self = this
		, fti = self.gridFilterSet.view.typeInfo.get(self.field);

	switch (fti.type) {
	case 'date':
	case 'time':
	case 'datetime':
		if (self.input.val() === '') {
			return undefined;
		}
		return fti.internalType === 'moment' ? moment(self.input.val()) : self.input.val();
	case 'number':
	case 'currency':
		if (self.input.val() === '') {
			return undefined;
		}
		switch (fti.internalType) {
		case 'bignumber':
			return new BigNumber(self.input.val());
		case 'numeral':
			return numeral(self.input.val());
		case 'primitive':
			return isInt(self.input.val()) ? toInt(self.input.val())
				: isFloat(self.input.val()) ? toFloat(self.input.val())
				: self.input.val();
		default:
			return self.input.val();
		}
	case 'string':
	default:
		return self.input.val();
	}
};

// #setValue {{{3

GridFilter.prototype.setValue = function (val) {
	var self = this;

	if (['$exists', '$notexists'].indexOf(self.getOperator()) < 0) {
		if (numeral && numeral.isNumeral(val)) {
			self.input.val(val._value);
		}
		else {
			self.input.val(val);
		}
	}
};

// #getOperator {{{3

GridFilter.prototype.getOperator = function () {
	var self = this;

	return self.operatorDrop.val();
};

// #setOperator {{{3

GridFilter.prototype.setOperator = function (op) {
	var self = this;

	if (self.operatorDrop) {
		self.operatorDrop.val(op);
		self.operatorDrop.change();
	}
};

// #getId {{{3

GridFilter.prototype.getId = function () {
	return this.id;
};

// #makeOperatorDrop {{{3

/**
 * Construct a SELECT that allows the user to pick the operator.
 *
 * @param {Array<string>} include If present, only include operators that correspond to those
 * operations requested.  This should be an array like ``['$eq', '$ne']`` to only show equality and
 * inequality operators.
 */

GridFilter.prototype.makeOperatorDrop = function (include) {
	var self = this;

	// These are all the operators that are possible.

	var operators = [
		['$contains', '∈'],
		['$notcontains', '∉'],
		['$eq', '='],
		['$ne', '≠'],
		['$gt', '>'],
		['$gte', '≥'],
		['$lt', '<'],
		['$lte', '≤'],
		['$in', 'in'],
		['$nin', 'not in'],
		['$exists', 'not blank'],
		['$notexists', 'blank']
	];

	// Remove anything that user didn't ask for.

	if (include !== undefined && Array.isArray(include)) {
		operators = reject(operators, function (elt) {
			return include.indexOf(elt[0]) < 0;
		});
	}

	var operatorDrop = jQuery('<select>');

	operatorDrop.css({'margin-right': '0.5em'});

	// Add all the operators as options within the <SELECT>.

	each(operators, function (op) {
		var value = op[0]
			, name = op[1];
		operatorDrop.append(jQuery('<option>', { value: value }).text(name));
	});

	// Hook up the event to update the filter when the operator is changed.

	operatorDrop.on('change', function () {
		// Hide the input when selecting either the "blank" or "not blank" operator.
		// Show the input when selecting any other operator.

		if (self.input) {
			['$exists', '$notexists'].indexOf(self.getOperator()) >= 0
				? self.hideInput()
				: self.showInput();
		}

		// For non-blank operators, only update the filter spec when the input has something in it.
		if (['$exists', '$notexists'].indexOf(self.getOperator()) >= 0 || self.getValue() !== '') {
			self.gridFilterSet.update();
		}
	});

	// Return the <SELECT> so that the caller can put it where they want.

	return operatorDrop;
};

// #makeRemoveBtn {{{3

GridFilter.prototype.makeRemoveBtn = function () {
	var self = this;

	var removeBtn = jQuery(fontAwesome('fa-times', null, 'Click to remove filter'));

	removeBtn.css({'cursor': 'pointer', 'margin-left': '0.5em'})
	return removeBtn;
};

// #remove {{{3

GridFilter.prototype.remove = function () {
	var self = this;

	self.div.remove();
	self.gridFilterSet.update(false);
};

// #isRange {{{3

GridFilter.prototype.isRange = function () {
	return false;
};

// #adjustInputWidth {{{3

GridFilter.prototype.adjustInputWidth = function (opts) {
	var self = this;

	if (!self.opts.autoUpdateInputWidth) {
		return;
	}

	if (opts === undefined) {
		opts = {};
	}

	// In case we're using TableTool, we need to carry around this idea of the sizing element.  At
	// this point in the JS execution, TableTool hasn't caught up and correctly resized the floating
	// header to match the original header column widths.  Therefore, we can't use `self.div` for
	// determining the correct width (it's the wrong size, because it's still in a column which is the
	// wrong size).  Instead, we need to use the sizing element - which is the original version of the
	// TH containing `self.div` - to determine the correct size.  TableTool will catch up later,
	// correctly resizing the column to align perfectly with what we set here.
	//
	// FIXME: This is extremely tightly coupled to knowledge about how the grid table is laid out and
	// what features it has (e.g. TableTool).  It would be better to pass in what the size of the
	// column currently is with the event handler.

	defaults(opts, {
		useSizingElement: false,
		input: self.input
	});

	console.debug('[DataVis // Grid Filter // Adjust Input Width] Target: %O', opts.input);

	var targetWidth = opts.useSizingElement ? self.opts.sizingElement.width() : self.div.width();
	console.debug('[DataVis // Grid Filter // Adjust Input Width] Available Space: ' + targetWidth + 'px ' + (opts.useSizingElement ? '[sizing element]' : '[div]'));

	if (self.removeBtn) {
		targetWidth -= self.removeBtn.outerWidth();
		console.debug('[DataVis // Grid Filter // Adjust Input Width] Remove Button: ' + self.removeBtn.outerWidth() + 'px');
	}

	if (self.operatorDrop !== undefined) {
		targetWidth -= self.operatorDrop.outerWidth();
		console.debug('[DataVis // Grid Filter // Adjust Input Width] Operator Drop: ' + self.operatorDrop.outerWidth() + 'px');
	}

	console.debug('[DataVis // Grid Filter' + (opts.fromColumnResize ? ' // Handler(columnResize)' : '') + '] Adjusting ' + self.field + ' filter widget width to ' + targetWidth + 'px to match column width');

	opts.input.outerWidth(targetWidth);

	if (typeof opts.callback === 'function') {
		opts.callback(targetWidth);
	}
};

// #showInput {{{3

GridFilter.prototype.showInput = function (input) {
	var self = this;

	self.input.show();
};

// #hideInput {{{3

GridFilter.prototype.hideInput = function (input) {
	var self = this;

	self.input.hide();
};

export default GridFilter;
