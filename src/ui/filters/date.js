import moment from 'moment';
import jQuery from 'jquery';

import { each, makeSubclass } from '../../util/misc.js';
import { trans } from '../../trans.js';

import GridFilter from '../grid_filter.js';

var DateFilter = makeSubclass('DateFilter', GridFilter, function () {
	var self = this;

	GridFilter.apply(self, arguments);

	self.limit = 1;

	self.operatorDrop = self.makeOperatorDrop();

	var everyOpts = {
		day: [
				'MONDAY'
			, 'TUESDAY'
			, 'WEDNESDAY'
			, 'THURSDAY'
			, 'FRIDAY'
			, 'SATURDAY'
			, 'SUNDAY'
		],
		month: [
				'JANUARY'
			, 'FEBRUARY'
			, 'MARCH'
			, 'APRIL'
			, 'MAY'
			, 'JUNE'
			, 'JULY'
			, 'AUGUST'
			, 'SEPTEMBER'
			, 'OCTOBER'
			, 'NOVEMBER'
			, 'DECEMBER'
		]
	};
	var lastOpts = [
			'DATE'
		, 'WEEK'
		, 'MONTH'
		, 'QUARTER'
		, 'YEAR'
	]
	self.inputs = {};
		// used for: on, before, after
	self.inputs.single = jQuery('<input>').attr({
		type: self.typeInfo.type === 'date' ? 'date' : 'datetime-local'
	}).on('blur', function () {
		self.gridFilterSet.update(false);
	});
	// used for: between
	self.inputs.range = jQuery('<div>');
	self.inputs.rangeStart = jQuery('<input>').attr({
		type: self.typeInfo.type === 'date' ? 'date' : 'datetime-local'
	}).on('blur', function () {
		self.gridFilterSet.update(false);
	});
	self.inputs.rangeEnd = jQuery('<input>').attr({
		type: self.typeInfo.type === 'date' ? 'date' : 'datetime-local'
	}).on('blur', function () {
		self.gridFilterSet.update(false);
	});
	self.inputs.range
		.append(self.inputs.rangeStart)
		.append(' – ')
		.append(self.inputs.rangeEnd);
	// used for: every
	self.inputs.every = jQuery('<div>');
	self.inputs.everyDay = jQuery('<select>').on('change', function () {
		self.gridFilterSet.update(false);
	});
	self.inputs.everyMonth = jQuery('<select>').on('change', function () {
		self.gridFilterSet.update(false);
	});
	each(everyOpts.day, function (v) {
		self.inputs.everyDay.append(jQuery('<option>', {value: v}).text(trans('CALENDAR.DAY.' + v)));
	});
	each(everyOpts.month, function (v) {
		self.inputs.everyMonth.append(jQuery('<option>', {value: v}).text(trans('CALENDAR.MONTH.' + v)));
	});
	self.inputs.everyDropdown = jQuery('<select>')
		.css({'margin-right': '0.5em'})
		.append(jQuery('<option>', {value: 'DAY'}).text(trans('CALENDAR.DAY')))
		.append(jQuery('<option>', {value: 'MONTH'}).text(trans('CALENDAR.MONTH')))
		.on('change', function () {
			self.inputs.everyDay.hide();
			self.inputs.everyMonth.hide();
			switch (this.value) {
			case 'DAY':
				self.inputs.everyDay.show();
				break;
			case 'MONTH':
				self.inputs.everyMonth.show();
				break;
			}
			self.gridFilterSet.update(false);
		});
	self.inputs.every
		.append(self.inputs.everyDropdown.show())
		.append(self.inputs.everyDay.show())
		.append(self.inputs.everyMonth.hide());
	// used for: this, last
	self.inputs.last = jQuery('<select>').on('change', function () {
		self.gridFilterSet.update(false);
	});
	each(lastOpts, function (v) {
		self.inputs.last.append(jQuery('<option>', {value: v}).text(trans('CALENDAR.' + v)));
	});

	self.div
		.append(self.operatorDrop)
		.append(self.inputs.single.show())
		.append(self.inputs.range.hide())
		.append(self.inputs.every.hide())
		.append(self.inputs.last.hide());

	if (self.removeBtn) {
		self.div.append(self.removeBtn);
	}
});

DateFilter.prototype.makeOperatorDrop = function () {
	var self = this;

	var operators = [
		['$eq', 'ON'],
		['$bet', 'BETWEEN'],
		['$lte', 'BEFORE'],
		['$gte', 'AFTER'],
		['$every', 'EVERY'],
		['$this', 'CURRENT'],
		['$last', 'LAST'],
	];

	var operatorDrop = jQuery('<select>');

	operatorDrop.css({'margin-right': '0.5em'});

	each(operators, function (op) {
		var value = op[0]
			, name = op[1];
		operatorDrop.append(jQuery('<option>', { value: value }).text(trans('FILTER.DATE.OPERATOR.' + name)));
	});

	operatorDrop.on('change', function () {
		self.inputs.single.hide();
		self.inputs.range.hide();
		self.inputs.every.hide();
		self.inputs.last.hide();

		switch (this.value) {
		case '$eq':
		case '$ne':
		case '$lte':
		case '$gte':
			self.inputs.single.show();
			break;
		case '$bet':
			self.inputs.range.show();
			break;
		case '$every':
			self.inputs.every.show();
			break;
		case '$this':
		case '$last':
			self.inputs.last.show();
			break;
		}

		self.gridFilterSet.update();
	});

	return operatorDrop;
};

DateFilter.prototype.getValue = function () {
	var self = this
		, result;

	switch (self.getOperator()) {
	case '$eq':
	case '$ne':
	case '$gte':
	case '$lte':
		if (self.inputs.single.val() === '') {
			// User hasn't entered a complete value in the date input.
			break;
		}
		result = self.typeInfo.type === 'date' ? self.inputs.single.val()
			: self.inputs.single.val().replace('T', ' ');
		if (self.typeInfo.internalType === 'moment') {
			result = moment(result);
		}
		break;
	case '$bet':
		if (self.inputs.rangeStart.val() === '' || self.inputs.rangeEnd.val() === '') {
			// User hasn't entered a complete value in the date input.
			break;
		}

		switch (self.typeInfo.type) {
		case 'date':
			result = [
					self.inputs.rangeStart.val()
				, self.inputs.rangeEnd.val()
			];
			break;
		case 'datetime':
			result = [
					self.inputs.rangeStart.val().replace('T', ' ')
				, self.inputs.rangeEnd.val().replace('T', ' ')
			];
			break;
		}

		if (self.typeInfo.internalType === 'moment') {
			result[0] = moment(result[0]);
			result[1] = moment(result[1]);
		}

		break;
	case '$every':
		result = self.inputs.everyDropdown.val() === 'DAY' ? self.inputs.everyDay.val()
			: self.inputs.everyDropdown.val() === 'MONTH' ? self.inputs.everyMonth.val()
			: null;
		break;
	case '$this':
	case '$last':
		result = self.inputs.last.val();
		break;
	}

	return result;
};

DateFilter.prototype.setValue = function (val1, val2) {
	var self = this;

	switch (self.getOperator()) {
	case '$bet':
		self.inputs.rangeStart.val(val1);
		self.inputs.rangeEnd.val(val2);
		break;
	case '$eq':
	case '$ne':
	case '$lte':
	case '$gte':
		self.inputs.single.val(val1);
		break;
	case '$every':
		var days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
		var months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

		var dayIdx = days.indexOf(val1);
		var monthIdx = months.indexOf(val1);

		if (dayIdx >= 0) {
			self.inputs.everyDropdown.val('DAY').change();
			self.inputs.everyDay.val(val1);
		}
		else if (monthIdx >= 0) {
			self.inputs.everyDropdown.val('MONTH').change();
			self.inputs.everyMonth.val(val1);
		}
		else {
			console.error('Invalid filter for operator "' + self.getOperator() + '" and value "' + val1 + '"');
		}
		break;
	case '$this':
	case '$last':
		self.inputs.last.val(val1);
		break;
	}
};

export default DateFilter;
