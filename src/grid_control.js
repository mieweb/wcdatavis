import jQuery from 'jquery';

import { trans } from './trans.js';
import {
	debug,
	deepCopy,
	deepDefaults,
	defaults,
	determineColumns,
	each,
	fontAwesome,
	gensym,
	getProp,
	log,
	makeSubclass,
	map,
	mapLimit,
	mapObject,
	mixinEventHandling,
	objFromArray,
	without,
} from './util/misc.js';

import './util/jquery.js';
import {AGGREGATE_REGISTRY} from './aggregates.js';
import {ComputedView} from './computed_view.js';
import {GROUP_FUNCTION_REGISTRY} from './group_fun.js';
import {Grid} from './grid.js';
import {GridFilterSet} from './grid_filter.js';
import {GroupFunWin} from './group_fun_win.js';
import types from './types.js';

/*
 * Grid controls are the rounded boxes that appear between the toolbar and the grid.  They allow
 * dynamic configuration of the view to which the grid is bound.
 *
 *   - Filters
 *   - Group Fields
 *   - Pivot Fields
 *   - Aggregates
 *
 * Each control is basically a list of things that have been added to it, e.g. for grouping, it's a
 * list of fields to group by.  Internally, the control is an instance of a subclass of GridControl,
 * and the items are corresponding instances of a subclass of GridControlField.  The name "Field"
 * here is historical, before aggregates were specified this way, all controls managed fields from
 * the source data.
 */

// GridControlField {{{1

// Constructor {{{2

/**
 * Create a new GridControlField instance.
 *
 * @param {GridControl} control
 *
 * @param {string} field
 *
 * @param {string} displayText
 *
 * @param {object} colConfig
 *
 * @class
 *
 * Represents an individual field added to a control.  In an older iteration, this literally
 * corresponded to a field in the data (e.g. because the control was a filter, group, or pivot).
 * Now that aggregate functions are also managed through a GridControl subclass, the "field" name is
 * no longer strictly accurate.
 *
 * @property {GridControl} control
 *
 * @property {string|object} spec
 * If a string, simply the field to add.  If an object, should contain a `field` property along with
 * anything else that this instance needs to carry.
 *
 * @property {string} displayText
 *
 * @property {object} colConfig
 *
 * @property {object} [opts]
 *
 * @property {object} ui
 * Refers to all user interface constructs that we might need to use later.
 *
 * @property {Element} ui.root
 * The DIV that completely contains the control field.
 *
 * @property {Element} ui.removeButton
 * A button that is used to remove the control field.
 */

var GridControlField = (function () {
	var CONTROL_FIELD_ID = 0;
	return makeSubclass('GridControlField', Object, function (control, spec, displayText, colConfig, opts) {
		var self = this;

		self.control = control;

		if (typeof spec === 'string') {
			self.field = {
				field: spec
			};
		}
		else {
			self.field = deepCopy(spec);
		}
		self.displayText = displayText;
		self.colConfig = colConfig;
		self.opts = opts;

		self.fti = self.control.typeInfo.get(self.field.field);

		self.ui = {};
		self.id = CONTROL_FIELD_ID++;
	});
})();

// #draw {{{2

/**
 * Renders the control field into a DIV.
 *
 * @returns {Element}
 * A newly created DIV that contains everything needed by the control field.
 */

GridControlField.prototype.draw = function () {
	var self = this;
	var label = self.displayText || (self.colConfig && self.colConfig.displayText) || self.field.field;

	self.ui.removeButton = jQuery('<button>', {'type': 'button'})
		.append(fontAwesome('fa-minus-square'))
		.attr('title', trans('GRID_CONTROL.FIELD.REMOVE'))
		.addClass('wcdv_icon_button wcdv_remove wcdv_text-primary')
		.on('click', function () {
			self.control.removeField(self);
		})
	;

	self.ui.fieldLabel = jQuery('<span>', {
		'class': 'wcdv_field_name',
		'title': label
	})
		.text(label);

	self.ui.root = jQuery('<div>', { 'class': 'wcdv_field' })
		.append(self.ui.removeButton)
		.append(self.ui.fieldLabel)
	;

	self._addErrorIndicator(self.ui.root, 'wcdv_aggregate_control_error');

	return self.ui.root;
};

// #getElement {{{2

/**
 * Gets the DIV that contains the UI for this control field.
 *
 * @returns {Element}
 * The DIV that this control field was rendered into.
 */

GridControlField.prototype.getElement = function () {
	var self = this;

	return self.ui.root;
};

// #destroy {{{2

/**
 * Called when the control field is removed; should be used to clean up resources like DOM nodes and
 * event handlers.
 */

GridControlField.prototype.destroy = function () {
	// DO NOTHING
};

// #showError {{{2

GridControlField.prototype.showError = function (errMsg) {
	var self = this;

	debug.error('GRID // CONTROL', errMsg);

	if (self.ui.error) {
		self.ui.error.attr('title', errMsg);
		self.ui.error.show();
	}
	else {
		log.error('Call Error: Attempted to call `showError()` on a ControlField subclass instance that does not provide a way of indicating errors in the user interface.');
	}
};

// #_addErrorIndicator {{{2

GridControlField.prototype._addErrorIndicator = function (parent, cls) {
	var self = this;

	self.ui.error = fontAwesome('fa-exclamation-triangle', cls)
		.hide()
		.tooltip({
			classes: {
				'ui-tooltip': 'ui-corner-all ui-widget-shadow ' + cls + '_tooltip'
			},
			show: { delay: 1000 }
		})
		.appendTo(parent);
};

// #getSpec {{{2

GridControlField.prototype.getSpec = function () {
	var self = this;

	return {
		field: self.field.field
	};
};

// FunGridControlField {{{1

// Constructor {{{2

/**
 * @class
 * @extends GridControlField
 */

var FunGridControlField = makeSubclass('FunGridControlField', GridControlField);

// #draw {{{2

FunGridControlField.prototype.draw = function () {
	var self = this;

	self.super.draw();

	// Let's find out what group functions there are that work on the type of the field that we
	// represent, e.g. if we are a date, find out what group functions work on dates.

	var applicableGroupFuns = GROUP_FUNCTION_REGISTRY.filter(function (gf) {
		if (self.fti == null) {
			return false;
		}
		return gf.allowedTypes.indexOf(self.fti.type) >= 0;
	});

	if (applicableGroupFuns.size() > 0) {
		// When there are some group functions for the type of this field, we need to create a window to
		// choose between them, plus a button to show the window.

		self.ui.groupFunWin = new GroupFunWin(trans('GRID.GROUP_FUN.DIALOG.TITLE', self.field.field), applicableGroupFuns);

		self.ui.groupFunWinBtn = jQuery('<button>', {
			'type': 'button',
			'data-wcdv-role': 'set-group-fun',
			title: trans('GRID_CONTROL.FIELD.SHOW_FUNCTIONS')
		})
			.addClass('wcdv_icon_button wcdv_button_left wcdv_text-primary')
			.on('click', function () {
				self.showFunWin();
			})
			.append(fontAwesome('fa-bolt'))
			.appendTo(self.ui.root)
		;

		if (self.field.fun != null) {
			var gf = GROUP_FUNCTION_REGISTRY.get(self.field.fun);
			self.ui.fieldLabel.text(self.field.field + ' (' + gf.displayName + ')');
			self.ui.fieldLabel.attr('title', self.field.field + ' (' + gf.displayName + ')');
		}
		self.ui.fieldLabel.after(self.ui.groupFunWinBtn);
	}

	return self.ui.root;
};

// #getSpec {{{2

FunGridControlField.prototype.getSpec = function () {
	var self = this;

	return {
		field: self.field.field,
		fun: self.field.fun
	}
};

// #showFunWin {{{2

FunGridControlField.prototype.showFunWin = function () {
	var self = this;

	self.ui.groupFunWin.show(self.field.fun || 'none', function (groupFunName) {
		if (groupFunName != null) {
			if (groupFunName === 'none') {
				self.field.fun = null;
				self.ui.fieldLabel.text(self.field.field);
			}
			else {
				self.field.fun = groupFunName;
				var gf = GROUP_FUNCTION_REGISTRY.get(self.field.fun);
				self.ui.fieldLabel.text(self.field.field + ' (' + gf.displayName + ')');
			}
			self.control.updateView();
		}
		else if (self.field.fun === undefined) {
			self.field.fun = null;
			self.control.updateView();
		}
	});
};

// GroupControlField {{{1

// Constructor {{{2

/**
 * @class
 * @extends FunGridControlField
 */

var GroupControlField = makeSubclass('GroupControlField', FunGridControlField);

// PivotControlField {{{1

// Constructor {{{2

/**
 * @class
 * @extends FunGridControlField
 */

var PivotControlField = makeSubclass('PivotControlField', FunGridControlField);

// FilterControlField {{{1
// Constructor {{{2

/**
 * @class
 * @extends GridControlField
 */

var FilterControlField = makeSubclass('FilterControlField', GridControlField);

// #draw {{{2

FilterControlField.prototype.draw = function () {
	var self = this;

	self.super.draw();
	self.ui.filterContainer = jQuery('<div>')
		.addClass('wcdv_filter_control_filter_container')
		.appendTo(self.ui.root);
	self.control.gfs.add(self.field.field, self.ui.filterContainer, {
		filterType: self.colConfig && self.colConfig.filter
	});

	return self.ui.root;
};
// AggregateControlField {{{1
// Constructor {{{2

/**
 * @class
 * @extends GridControlField
 *
 * @property {object} [opts]
 *
 * @property {string[]} [opts.fields]
 * List of the fields used by the aggregate function.
 *
 * @property {object} [aggFunOpts]
 * Options passed to the aggregate function.
 */

var AggregateControlField = makeSubclass('AggregateControlField', GridControlField, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);
	self.fieldDropdowns = [];
	self.shouldGraph = false;
});

// #draw {{{2

AggregateControlField.prototype.draw = function () {
	var self = this;

	self.super.draw();

	self._addErrorIndicator(self.ui.root, 'wcdv_aggregate_control_error');

	var aggDefn = AGGREGATE_REGISTRY.get(self.field.field);

	var fieldList = jQuery('<ul>', {
		'class': 'wcdv_aggregate_control_fieldlist'
	}).appendTo(self.ui.root);

	for (var i = 0; i < aggDefn.prototype.fieldCount; i += 1) {
		var li = jQuery('<li>').addClass('wcdv_aggregate_field').appendTo(fieldList);
		if (getProp(aggDefn.prototype, 'fieldInfo', i, 'name')) {
			var label = jQuery('<label>').text(aggDefn.prototype.fieldInfo[i].name + ':').appendTo(li);
		}
		var select = jQuery('<select>')
			.on('change', function (evt) {
				select.children('option[data-wcdv-bad-field]').filter(function (eltIndex, elt) {
					return jQuery(elt).attr('value') !== select.val();
				}).remove();
				self.control.updateView();
			})
			.appendTo(li);
		self.fieldDropdowns.push(select);
	}

	each(determineColumns(self.control.colConfig, null, self.control.typeInfo), function (fieldName) {
		var text = getProp(self.control.colConfig.get(fieldName), 'displayText') || fieldName;
		each(self.fieldDropdowns, function (dropdown, i) {
			jQuery('<option>', { 'value': fieldName }).text(text).appendTo(dropdown);
		});
	});

	// For each field dropdown, set its value to whatever we received.  This has the effect of making
	// the user interface match the internal aggregate configuration.

	each(self.fieldDropdowns, function (dropdown, i) {
		if (getProp(self.opts, 'fields', i)) {
			var matchingOption = dropdown.children('option').filter(function (eltIndex, elt) {
				return jQuery(elt).attr('value') === self.opts.fields[i];
			});

			// When the field in the configuration isn't in the dropdown (i.e. it's not in colConfig) then
			// we need to make an entry for it.  This happens when the aggregate spec from prefs refers to
			// a field that no longer exists in the data.

			if (matchingOption.length === 0) {
				jQuery('<option>', {
					'value': self.opts.fields[i],
					'data-wcdv-bad-field': 'yup'
				})
					// FIXME: i18n
					.text(self.opts.fields[i] + ' — Invalid')
					.appendTo(dropdown);
			}

			dropdown.val(self.opts.fields[i]);
		}
	});

	if (aggDefn.prototype.options != null) {
		jQuery('<button>', {
			'type': 'button',
			title: trans('GRID_CONTROL.AGGREGATE.EDIT_OPTIONS')
		})
			.addClass('wcdv_icon_button wcdv_button_left wcdv_text-primary')
			.on('click', function () {
				self.ui.optionsDialog.dialog('open');
			})
			.append(fontAwesome('fa-pencil-square-o'))
			.appendTo(self.ui.root)
		;
		self._makeOptionsDialog(aggDefn);
	}

	// if (self.control.view.hasClientKind('graph')) {
	// 	self.ui.graphBtn = jQuery('<button>', {
	// 		'type': 'button'
	// 	})
	// 		.addClass('wcdv_icon_button wcdv_text-primary')
	// 		.on('click', function () {
	// 			// TODO Think of a better way to do this.  I feel like the coupling here is too high.
	// 			self.control.clearGraphFlag();
	// 			self.shouldGraph = true;
	// 			self.control.updateView();
	// 		})
	// 		.append(fontAwesome('fa-bar-chart'))
	// 		.appendTo(self.ui.root)
	// 	;
	// }

	self.ui.isHiddenCheckbox = jQuery('<input>', {
		'type': 'checkbox'
	})
		.prop('checked', getProp(self.opts, 'isHidden'))
		.on('change', function () {
			self.control.updateView();
		})
		.appendTo(self.ui.root)
		._makeIconCheckbox('fa-eye-slash wcdv_text-primary', 'fa-eye wcdv_text-primary')
	;

	return self.ui.root;
};

// #_makeOptionsDialog {{{2

AggregateControlField.prototype._makeOptionsDialog = function (aggDefn) {
	var self = this;

	self.ui.optionsDiv = jQuery('<div>')
		.css('display', 'none')
		.appendTo(document.body);

	var table = jQuery('<table>').appendTo(self.ui.optionsDiv);
	var opts = {};

	each(aggDefn.prototype.options, function (optConfig, optName) {
		optConfig = deepDefaults(optConfig, {
			type: 'string',
			widget: 'text',
			displayText: optName
		});
		var id = gensym();
		var input = jQuery('<input>', {
			'type': 'text',
			'id': id
		});
		opts[optName] = input;
		var label = jQuery('<label>', {
			'for': id
		}).text(optConfig.displayText);
		jQuery('<tr>')
			.append(jQuery('<td>').append(label))
			.append(jQuery('<td>').append(input))
			.appendTo(table);
	});

	jQuery('<hr>')
		.appendTo(self.ui.optionsDiv);

	var buttonBar = jQuery('<div>')
		.addClass('wcdv_button_bar')
		.appendTo(self.ui.optionsDiv);

	jQuery('<button>', {
		'type': 'button',
		'class': '',
		'title': trans('DIALOG.OK'),
		'data-role': 'ok'
	})
		.append(fontAwesome('fa-check'))
		.append(trans('DIALOG.OK'))
		.on('click', function () {
			self.aggFunOpts = opts;
			self.control.updateView();
			self.ui.optionsDialog.dialog('close');
		})
		.appendTo(buttonBar);

	jQuery('<button>', {
		'type': 'button',
		'class': '',
		'title': trans('DIALOG.CANCEL'),
		'data-role': 'cancel'
	})
		.append(fontAwesome('fa-ban'))
		.append(trans('DIALOG.CANCEL'))
		.on('click', function () {
			self.ui.optionsDialog.dialog('close');
		})
		.appendTo(buttonBar);

	self.ui.optionsDialog = self.ui.optionsDiv.dialog({
		autoOpen: false,
		modal: true,
		title: trans('GRID_CONTROL.AGGREGATE.OPTIONS_DIALOG.TITLE', aggDefn.prototype.name),
		minHeight: 0,
		classes: {
			"ui-dialog": "ui-corner-all wcdv_dialog",
			"ui-dialog-titlebar": "ui-corner-all",
		}
	});
};

// #destroy {{{2

AggregateControlField.prototype.destroy = function () {
	var self = this;

	if (self.ui.optionsDiv != null) {
		self.ui.optionsDialog.dialog('destroy');
		self.ui.optionsDiv.remove();
	}

	self.super.destroy();
};

// #getInfo {{{2

AggregateControlField.prototype.getInfo = function () {
	var self = this;

	return {
		fun: self.field.field,
		name: null,
		fields: map(self.fieldDropdowns, function (dropdown) {
			return dropdown.val();
		}),
		isHidden: self.ui.isHiddenCheckbox._isChecked(),
		shouldGraph: self.shouldGraph,
		opts: mapObject(self.aggFunOpts, function (input, optName) {
			return input.val();
		})
	};
};

// GridControl {{{1

// Constructor {{{2

/**
 * Creates a new GridControl instance.
 *
 * @param {Grid} grid
 * @param {OrdMap.<Grid~ColConfig>} colConfig
 * @param {ComputedView} view
 * @param {object} features
 * @param {Timing} timing
 *
 * @class
 *
 * An abstract class that represents some kind of interface that the user can operate over the
 * available fields.
 *
 * Subclasses should implement the following functions:
 *
 * - `draw(TARGET)`
 *   Called to create all required user interface components.
 *
 * - `updateView()`
 *   Use `self.fields` to set whatever properties are needed on the view.
 *
 * @property {Grid} grid
 * @property {ComputedView} view
 * @property {object} features
 * @property {Timing} timing
 * @property {OrdMap.<Grid~ColConfig>} colConfig
 *
 * @property {Array.<string>} fields
 * List of all the fields selected by the user.
 *
 * @property {Array.<ControlField>} controlFields
 * List of all the control fields currently in the UI.
 *
 * @property {Object.<string, Array.<ControlField>>} controlFieldsByField
 * Object for looking up control fields by name.
 *
 * @property {Object.<string, ControlField>} controlFieldsById
 * Object for looking up control fields by ID.
 *
 * @property {object} ui
 * Object containing different user interface components.
 *
 * @property {jQuery} ui.dropdown
 * The SELECT element containing the available fields.
 *
 * @property {boolean} [prototype.isHorizontal=false]
 * If true, display the list horizontally rather than vertically.
 *
 * @property {boolean} [prototype.isReorderable=true]
 * If true, display an arrow for reordering the items in the list (when `isHorizontal=false`).
 *
 * @property {boolean} [prototype.showColumns=true]
 * If true, display a dropdown with field names to choose from.
 *
 * @property {boolean} [prototype.disableUsedItems=false]
 * If true, items that are added will be disabled in the columns dropdown.
 *
 * @property {boolean} [prototype.useColConfig=true]
 * If true, pass colConfig for the item to the appropriate `Field` subclass.
 *
 * @property {boolean} [prototype.updateCanHide=true]
 * If true, automatically update colConfig to show (and prohibit hiding of) the column being added.
 */

var GridControl = makeSubclass('GridControl', Object, function (grid, colConfig, view, features, timing) {
	var self = this;

	if (!(grid instanceof Grid)) {
		throw new Error('Call Error: `grid` must be an instance of MIE.WC_DataVis.Grid');
	}

	self.grid = grid;
	self.colConfig = colConfig;
	self.view = view;
	self.features = features;
	self.timing = timing;
	self.fields = [];
	self.controlFields = [];
	self.controlFieldsByField = {};
	self.controlFieldsById = {};

	self.ui = {};

	self.grid.on('colConfigUpdate', function (colConfig) {
		self.colConfig = colConfig;
	});
}, {
	isHorizontal: false,
	isReorderable: true,
	showColumns: true,
	disableUsedItems: false,
	useColConfig: true,
	updateCanHide: true
});

// Events {{{2

/**
 * Fired when a field has been added to the control.
 *
 * @event GridControl#fieldAdded
 *
 * @param {string} fieldAdded
 * The field that was added.
 *
 * @param {Array.<string>} allFields
 * All fields in the control, after the addition.
 */

/**
 * Fired when a field has been removed from the control.
 *
 * @event GridControl#fieldRemoved
 *
 * @param {string} fieldRemoved
 * The field that was removed.
 *
 * @param {Array.<string>} allFields
 * All fields in the control, after the removal.
 */

/**
 * Fired when the control has been cleared (reset).
 *
 * @event GridControl#cleared
 */

mixinEventHandling(GridControl, [
		'fieldAdded'
	, 'fieldRemoved'
	, 'cleared'
]);

// #makeClearButton {{{2

/**
 * Make a button that calls the `clear` method when clicked.
 *
 * @param {jQuery} target
 * Where to append the button.
 *
 * @returns {jQuery}
 * The button created.
 */

GridControl.prototype.makeClearButton = function (target) {
	var self = this;

	return jQuery('<button>')
		.addClass('wcdv_icon_button wcdv_text-primary wcdv_control_clear_button')
		.append(fontAwesome('fa-ban'))
		.hide()
		.on('click', function () {
			jQuery(this).hide();
			self.clear();
		})
		.appendTo(target);
};

// #addField {{{2

/**
 * Add a field to this control.  Automatically updates the view afterwards.
 *
 * @param {string} field
 * Name of the field to add.
 *
 * @param {string} displayText
 *
 * @param {object} opts
 *
 * @param {object} controlFieldOpts
 *
 * @param {function} next
 */

GridControl.prototype.addField = function (field, displayText, opts, controlFieldOpts, next) {
	var self = this
		, args = Array.prototype.slice.call(arguments)
		, fieldName;

	opts = deepDefaults(opts, {
		updateView: true,
		silent: false,
		openControls: false
	});

	if (field == null || field === '') {
		return typeof next === 'function' ? next(false) : undefined;
	}

	fieldName = typeof field === 'string' ? field : field.field;

	if (fieldName == null || fieldName === '' || (self.disableUsedItems && self.fields.indexOf(fieldName) >= 0)) {
		return typeof next === 'function' ? next(false) : undefined;
	}

	// Make sure we have access to typeinfo before continuing.  The typeinfo is used for:
	//
	//   1. Making sure aggregates are only applied to certain fields.
	//   2. Showing group/pivot functions for applicable fields only.

	if (self.typeInfo == null) {
		return self.view.getTypeInfo(function (ok, typeInfo) {
			if (!ok) {
				return typeof next === 'function' ? next(false) : undefined;
			}
			self.typeInfo = typeInfo;
			return GridControl.prototype.addField.apply(self, args);
		});
	}

	if (opts.openControls) {
		self.grid.showControls();
	}

	// Check to see if we are supposed to update the 'canHide' property of the column config.  Since
	// we're adding the field, we mark it so that the field can't be hidden.

	if (self.updateCanHide && self.colConfig != null && self.colConfig.isSet(fieldName)) {
		self.colConfig.get(fieldName).isHidden = false;
		self.colConfig.get(fieldName).canHide = false;
	}

	var cf = new self.controlFieldCtor(self, field, displayText, self.useColConfig ? self.colConfig.get(fieldName) : null, controlFieldOpts);

	self.controlFields.push(cf);
	self.controlFieldsById[cf.id] = cf;

	if (self.controlFieldsByField[fieldName] == null) {
		self.controlFieldsByField[fieldName] = [];
	}
	self.controlFieldsByField[fieldName].push(cf);

	self.ui.clearBtn.show();

	var li = jQuery('<li>')
		.attr({
			'data-wcdv-field': fieldName,
			'data-wcdv-control-field-id': cf.id,
			'data-wcdv-draggable-origin': 'GRID_CONTROL_FIELD'
		});

	if (self.isHorizontal) {
		li.append(fontAwesome('fa-long-arrow-right'));
	}

	li.append(cf.draw());
	li.appendTo(self.ui.fields); // Add it to the DOM.

	if (self.disableUsedItems) {
		self.ui.dropdown.find('option').filter(function () {
			return jQuery(this).val() === fieldName;
		}).prop('disabled', true);
	}

	self.ui.dropdown.val('');
	self.fields.push(fieldName); // Add it to the fields array.

	if (typeof self.updateView === 'function' && opts.updateView) {
		self.updateView();
	}

	if (!opts.silent) {
		self.fire('fieldAdded', null, fieldName, self.fields);
	}

	return typeof next === 'function' ? next(true, cf) : undefined;
};

// #removeField {{{2

/**
 * Remove a field from this control.  Automatically updates the view afterwards.
 *
 * @param {ControlField} cf
 * The field to remove.
 */

GridControl.prototype.removeField = function (cf) {
	var self = this
		, fieldName = cf.field.field;

	// Check to see if we are supposed to update the 'canHide' property of the column config.  Since
	// we're removing the field, we mark it so that the field can be hidden.

	if (self.updateCanHide && self.colConfig != null && self.colConfig.isSet(fieldName)) {
		self.colConfig.get(fieldName).canHide = true;
	}

	// Remove it from the UI.

	cf.destroy();
	cf.getElement().parent('li').remove();

	// Remove it from the internal data structures.

	self.controlFields = without(self.controlFields, cf);
	self.controlFieldsById[cf.id] = undefined;
	self.controlFieldsByField[fieldName] = without(self.controlFieldsByField[fieldName], cf);

	// Re-enable the option in the dropdown, if necessary.

	self.fields.splice(self.fields.indexOf(fieldName), 1);

	if (self.disableUsedItems) {
		self.ui.dropdown.find('option').filter(function () {
			return jQuery(this).val() === fieldName;
		}).prop('disabled', false);
	}

	// Hide the "clear" button if there's nothing to clear.

	if (self.controlFields.length === 0) {
		self.ui.clearBtn.hide();
	}

	self.updateView();
	self.fire(GridControl.events.fieldRemoved, null, fieldName, self.fields);
};

// #clear {{{2

/**
 * Removes all fields from the control.  Automatically updates the view afterwards.
 */

GridControl.prototype.clear = function (opts) {
	var self = this;

	opts = opts || {};
	defaults(opts, {
		updateView: true
	});

	// Check to see if we are supposed to update the 'canHide' property of the column config.  Since
	// we're removing all fields, we mark it so that they can all be hidden.

	if (self.updateCanHide && self.colConfig != null) {
		self.colConfig.each(function (cc) {
			cc.canHide = true;
		});
	}

	self.fields = [];
	self.controlFields = [];
	self.controlFieldsById = {};
	self.controlFieldsByField = {};
	self.ui.fields.children().remove();
	self.ui.dropdown.find('option:disabled').filter(function () {
		return jQuery(this).val() !== '';
	}).prop('disabled', false);
	self.ui.clearBtn.hide();

	if (opts.updateView) {
		self.updateView();
	}

	self.fire(GridControl.events.cleared);
};

// #destroy {{{2

GridControl.prototype.destroy = function () {
	var self = this;

	console.debug('[DataVis // GridControl] Good-bye, cruel world!');

	self.view.off('*', self);
	self.grid.off('*', self);
	self.ui.root.remove();
};

// #addViewConfigChangeHandler {{{2

/**
 * Registers an event handler on the view to update the UI when the view is changed (typically by
 * loading preferences, but also possibly by another grid connected to the same view).
 *
 * @param {string} event
 * Name of the event to register on in the view.
 *
 * @param {function} sync
 * Event handler for the specified event.
 */

GridControl.prototype.addViewConfigChangeHandler = function (event, sync) {
	var self = this;

	var clearDropdown = function () {
		self.ui.dropdown.children().remove();
		jQuery('<option>', {
			'value': '',
			'disabled': true,
			'selected': true
		})
			.text(trans('GRID_CONTROL.SELECT_FIELD'))
			.appendTo(self.ui.dropdown);
	};

	// There are two main things that we sync:
	//
	// 1. The dropdown that shows all the fields.  (Not used by aggregate control.)  This is done when
	//    the column configuration is updated.  Interactive column configuration can change the names
	//    shown for the fields in the dropdown.
	//
	// 2. The list of elements applied in the control; for group & pivot these are the fields with
	//    arrows connecting them; for filter it's the list of filters; for aggregate it's the list of
	//    aggregate functions.  It's up to the caller (i.e. the subclass) to provide a function that
	//    does this synchronization.

	var sync_colConfig = function (colConfig) {
		console.debug('[DataVis // %s // %s Control] Synchronizing column configuration with grid', self.grid.toString(), self.controlType.toUpperCase());
		self.colConfig = colConfig;
		if (self.showColumns) {
			clearDropdown();
			colConfig.each(function (fcc) {
				jQuery('<option>', { 'value': fcc.field }).text(fcc.displayText || fcc.field).appendTo(self.ui.dropdown);
			});
		}
	};

	var sync_view = function () {
		console.debug('[DataVis // %s // %s Control] Synchronizing user interface with view', self.grid.toString(), self.controlType.toUpperCase());
		sync();
	};

	// To fully sync, you need column configuration and type info.  Obviously you need column config
	// because that says what all the available fields' names are.  Type info is only needed right now
	// for the filter control, to determine what type of control to show (e.g. the widget used for
	// numbers is different from that used for dates).
	//
	// We need to do things in that order: sync #1 (column config) first, then #2 (view).  The reason
	// is that synchronizing #2 may cause us to modify the dropdown, i.e. to disable a field that must
	// already exist due to synchronizing #1.
	//
	// BUT we don't know that any of this code will necessarily execute *before* the column config
	// and/or type info has been determined.  This code may run before either of those are known, or
	// it may be afterwards (because column config could come directly from the JS instantiating the
	// grid, from prefs, or from the source itself).  So we need to always take that info account ---
	// if the column config is already known, use it; otherwise register an event handler to capture
	// it when it's decided.  Similarly with type info.

	if (self.grid.colConfig != null) {
		sync_colConfig(self.grid.colConfig);
		self.grid.on('colConfigUpdate', sync_colConfig);
		if (self.view.typeInfo != null) {
			sync_view();
			self.view.on(event, sync_view, { who: self });
		}
		else {
			self.view.on('getTypeInfo', function () {
				sync_view();
				self.view.on(event, sync_view, { who: self });
			}, { limit: 1 });
		}
	}
	else {
		// This setup of event handlers forces us to receive one `colConfigUpdate` event before we allow
		// any `*Set` events to come through.  This is important because the `*Set` events will cause us
		// to disable elements in the dropdown, so we need to have populated it first.

		self.grid.on('colConfigUpdate', function (colConfig) {
			sync_colConfig(colConfig);
			self.grid.on('colConfigUpdate', sync_colConfig);
			if (self.view.typeInfo != null) {
				sync_view();
				self.view.on(event, sync_view, { who: self });
			}
			else {
				self.view.on('getTypeInfo', function (ok) {
					sync_view();
					self.view.on(event, sync_view, { who: self });
				}, { limit: 1 });
			}
		}, { limit: 1 });
	}
};

// #getListElement {{{2

GridControl.prototype.getListElement = function () {
	var self = this;

	return self.ui.fields;
};

// #draw {{{2

/**
 * Render this grid control and attach it to the specified parent element.
 *
 * @abstract
 *
 * @param {jQuery} parent
 * Element to append this grid control to.
 */

GridControl.prototype.draw = function (parent) {
	throw new Error('ABSTRACT');
};

// #updateView {{{2

/**
 * Update the view with the configuration entered using this grid control.
 *
 * @abstract
 */

GridControl.prototype.updateView = function () {
	throw new Error('ABSTRACT');
};

// GroupControl {{{1

// Constructor {{{2

/**
 * Part of the user interface which governs the fields that are part of the group, including
 * filtering.
 *
 * @class
 * @extends GridControl
 */

var GroupControl = makeSubclass('GroupControl', GridControl, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.view.on(ComputedView.events.invalidGroupField, function (field) {
		each(self.controlFieldsByField[field], function (cf) {
			cf.showError('This field does not exist in the data.');
		});
	});
}, {
	controlFieldCtor: GroupControlField,
	controlType: 'Group'
});

// #draw {{{2

/**
 * Create a DIV element that can be placed within the Grid instance to hold the user interface for
 * the GroupControl.  The caller must add the result to the DOM somewhere.
 *
 * @returns {jQuery} The DIV element that holds the entire UI.
 */

GroupControl.prototype.draw = function (parent) {
	var self = this;

	parent.droppable({
		classes: {
			'ui-droppable-hover': 'wcdv_drop_target_hover'
		},
		drop: function (evt, ui) {
			// Turn this off for the sake of efficiency.
			//ui.draggable.draggable('option', 'refreshPositions', false);

			// The problem is, this event gets triggered both (1) when dropping a field from the grid
			// table's header, and (2) when shuffling fields between the group & pivot controls.  In the
			// case of (1) we need to make an <LI>.  But in the case of (2), we don't need to modify the
			// DOM in any way, jQuery UI sortable does that for us.  To tell the difference, we use the
			// `wcdv-draggable-origin` data attribute, which tells where the draggable came from.

			if (ui.draggable.attr('data-wcdv-draggable-origin') === 'GRID_TABLE_HEADER') {
				var field = ui.draggable.attr('data-wcdv-field');
				self.addField(field, getProp(self.colConfig.get(field), 'displayText'), {
					autoShowFunWin: true
				});
			}
		}
	})
		._addEventDebugging('drop', 'GROUP');

	self.ui.root = jQuery('<div>').appendTo(parent);
	self.ui.title = jQuery('<div>')
		.addClass('wcdv_control_title_bar')
		.appendTo(self.ui.root);
	jQuery('<span>', { 'class': 'wcdv_control_title' })
		.text(trans('GRID_CONTROL.GROUP.TITLE'))
		.appendTo(self.ui.title);
	self.ui.clearBtn = self.makeClearButton(self.ui.title);
	self.ui.fields = jQuery('<ul>', {
		id: gensym(),
		'class': self.isHorizontal ? 'wcdv_control_horizontal' : 'wcdv_control_vertical'
	}).appendTo(self.ui.root);

	var dropdownContainer = jQuery('<div>').appendTo(self.ui.root);
	self.ui.dropdown = jQuery('<select>', { 'class': 'wcdv_control_addField' }).appendTo(dropdownContainer);
	self.ui.dropdown.on('change', function () {
		self.addField(self.ui.dropdown.val(), self.ui.dropdown.find('option:selected').text(), {
			autoShowFunWin: true
		});
	});

	self.addViewConfigChangeHandler('groupSet', function () {
		var spec = self.view.getGroup();
		var fields = (!self.view.source.origin.isLimited && spec && spec.fieldNames) || [];
		self.clear({ updateView: false });
		console.debug('[DataVis // %s // Group Control] View set group fields to: %s', self.grid.toString(), JSON.stringify(fields));
		each(fields, function (field) {
			self.addField(field, getProp(self.colConfig.get(field), 'displayText'), { updateView: false });
		});
	});

	return self.ui.root;
};

// #updateView {{{2

GroupControl.prototype.updateView = function () {
	var self = this;
	var fieldNames = map(self.controlFields, function (cf) {
		return cf.getSpec();
	});

	if (fieldNames.length > 0) {
		self.view.setGroup({fieldNames: fieldNames}, {
			dontSendEventTo: self
		});
	}
	else {
		self.view.clearGroup();
	}
};

// #toString {{{2

GroupControl.prototype.toString = function () {
	var self = this;

	return self.grid.id + ', Group';
};

// #sortableSync {{{2

GroupControl.prototype.sortableSync = function () {
	var self = this;

	var controlFieldIds = self.ui.fields.children('li').map(function (index, elt) {
		return jQuery(elt).attr('data-wcdv-control-field-id');
	}).get();

	self.controlFields = [];
	each(controlFieldIds, function (id) {
		self.controlFields.push(self.controlFieldsById[id]);
	});

	return self.updateView();
};

// #addField {{{2

GroupControl.prototype.addField = function (field, displayText, opts) {
	var self = this;

	// Make sure we have typeInfo.  We need that so we can detect when the user is dragging a field
	// with a type that doesn't permit grouping (e.g. JSON).

	if (self.typeInfo == null) {
		return self.view.getTypeInfo(function (ok, typeInfo) {
			if (!ok) {
				console.error('[DataVis // Control(Group) // Add] Failed to retrieve typeInfo');
				return;
			}
			self.typeInfo = typeInfo;
			return self.addField(field, displayText, opts);
		});
	}

	var fieldName = typeof field === 'string' ? field : field.field;
	var fti = self.typeInfo.get(fieldName);
	if (fti == null) {
		console.error('[DataVis // Control(Group) // Add] Field not in typeInfo: %s', fieldName);
		self.ui.dropdown.val('');
		return;
	}

	var tc = types.registry.get(fti.type);
	if (tc == null) {
		console.error('[DataVis // Control(Group) // Add] Field "%s" type "%s" not in registry', fieldName, fti.type);
		self.ui.dropdown.val('');
		return;
	}

	if (!tc.supports.group) {
		console.info('[DataVis // Control(Group) // Add] Field "%s" type "%s" does not support grouping', fieldName, fti.type);
		self.ui.dropdown.val('');
		return;
	}

	opts = deepDefaults(opts, {
		autoShowFunWin: false,
		updateView: true
	});
	var updateView = opts.updateView;
	opts.updateView = false;

	self.super.addField(field, displayText, opts, null, function (ok, cf) {
		if (!ok) {
			return;
		}
		if (opts.autoShowFunWin && cf.fti != null && ['date', 'datetime'].indexOf(cf.fti.type) >= 0 && cf.field.fun === undefined) {
			cf.showFunWin();
		}
		else if (updateView) {
			self.updateView();
		}
	});
};

// PivotControl {{{1

// Constructor {{{2

/**
 * Part of the user interface which governs: (1) the fields that are part of the pivot, including
 * filtering; (2) the aggregate function [and potentially its arguments] that produces the values in
 * the pivot table.
 *
 * @class
 * @extends GridControl
 *
 * @property {GridControl} super
 * Proxy to call prototype ("superclass") methods even if we override them.
 *
 * @property {string[]} fields
 * Names of the fields
 */

var PivotControl = makeSubclass('PivotControl', GridControl, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.view.on(ComputedView.events.invalidPivotField, function (field) {
		each(self.controlFieldsByField[field], function (cf) {
			cf.showError('This field does not exist in the data.');
		});
	});
}, {
	controlFieldCtor: PivotControlField,
	controlType: 'Pivot'
});

// #draw {{{2

/**
 * Create a DIV element that can be placed within the Grid instance to hold the user interface for
 * the PivotControl.  The caller must add the result to the DOM somewhere.
 *
 * @returns {jQuery} The DIV element that holds the entire UI.
 */

PivotControl.prototype.draw = function (parent) {
	var self = this;

	parent.droppable({
		classes: {
			'ui-droppable-hover': 'wcdv_drop_target_hover'
		},
		drop: function (evt, ui) {
			// Turn this off for the sake of efficiency.
			//ui.draggable.draggable('option', 'refreshPositions', false);

			// The problem is, this event gets triggered both (1) when dropping a field from the grid
			// table's header, and (2) when shuffling fields between the group & pivot controls.  In the
			// case of (1) we need to make an <LI>.  But in the case of (2), we don't need to modify the
			// DOM in any way, jQuery UI sortable does that for us.  To tell the difference, we use the
			// `wcdv-draggable-origin` data attribute, which tells where the draggable came from.

			if (ui.draggable.attr('data-wcdv-draggable-origin') === 'GRID_TABLE_HEADER') {
				var field = ui.draggable.attr('data-wcdv-field');
				self.addField(field, getProp(self.colConfig.get(field), 'displayText'), {
					autoShowFunWin: true
				});
			}
		}
	})
		._addEventDebugging('drop', 'PIVOT');

	self.ui.root = jQuery('<div>').appendTo(parent);
	self.ui.title = jQuery('<div>')
		.addClass('wcdv_control_title_bar')
		.appendTo(self.ui.root);
	jQuery('<span>')
		.addClass('wcdv_control_title')
		.text(trans('GRID_CONTROL.PIVOT.TITLE'))
		.appendTo(self.ui.title);
	self.ui.clearBtn = self.makeClearButton(self.ui.title);
	self.ui.fields = jQuery('<ul>', {
		id: gensym(),
		'class': self.isHorizontal ? 'wcdv_control_horizontal' : 'wcdv_control_vertical'
	}).appendTo(self.ui.root);

	var dropdownContainer = jQuery('<div>').appendTo(self.ui.root);
	self.ui.dropdown = jQuery('<select>', { 'class': 'wcdv_control_addField' }).appendTo(dropdownContainer);
	self.ui.dropdown.on('change', function () {
		self.addField(self.ui.dropdown.val(), self.ui.dropdown.find('option:selected').text(), {
			autoShowFunWin: true
		});
	});

	self.addViewConfigChangeHandler('pivotSet', function (spec) {
		spec = self.view.getPivot();
		var fields = (!self.view.source.origin.isLimited && spec && spec.fieldNames) || [];
		self.clear({ updateView: false });
		console.debug('[DataVis // %s // Pivot Control] View set pivot fields to: %s', self.grid.toString(), JSON.stringify(fields));
		each(fields, function (field) {
			self.addField(field, getProp(self.colConfig.get(field), 'displayText'), { updateView: false });
		});
	});

	return self.ui.root;
};

// #updateView {{{2

/**
 * Set the pivot configuration on the ComputedView.  The pivot configuration consists of:
 *
 *   - Fields that are part of the pivot.
 */

PivotControl.prototype.updateView = function () {
	var self = this;
	var fieldNames = map(self.controlFields, function (cf) {
		return cf.getSpec();
	});

	if (fieldNames.length > 0) {
		self.view.setPivot({fieldNames: fieldNames}, {
			dontSendEventTo: self
		});
	}
	else {
		self.view.clearPivot();
	}
};

// #toString {{{2

PivotControl.prototype.toString = function () {
	var self = this;

	return self.grid.id + ', Pivot';
};

// #sortableSync {{{2

PivotControl.prototype.sortableSync = function () {
	var self = this;

	var controlFieldIds = self.ui.fields.children('li').map(function (index, elt) {
		return jQuery(elt).attr('data-wcdv-control-field-id');
	}).get();

	self.controlFields = [];
	each(controlFieldIds, function (id) {
		self.controlFields.push(self.controlFieldsById[id]);
	});

	return self.updateView();
};

// #addField {{{2

PivotControl.prototype.addField = function (field, displayText, opts) {
	var self = this;

	// Make sure we have typeInfo.  We need that so we can detect when the user is dragging a field
	// with a type that doesn't permit grouping (e.g. JSON).

	if (self.typeInfo == null) {
		return self.view.getTypeInfo(function (ok, typeInfo) {
			if (!ok) {
				console.error('[DataVis // Control(Pivot) // Add] Failed to retrieve typeInfo');
				return;
			}
			self.typeInfo = typeInfo;
			return self.addField(field, displayText, opts);
		});
	}

	var fieldName = typeof field === 'string' ? field : field.field;
	var fti = self.typeInfo.get(fieldName);
	if (fti == null) {
		console.error('[DataVis // Control(Pivot) // Add] Field not in typeInfo: %s', fieldName);
		self.ui.dropdown.val('');
		return;
	}

	var tc = types.registry.get(fti.type);
	if (tc == null) {
		console.error('[DataVis // Control(Pivot) // Add] Field "%s" type "%s" not in registry', fieldName, fti.type);
		self.ui.dropdown.val('');
		return;
	}

	if (!tc.supports.group) {
		console.info('[DataVis // Control(Pivot) // Add] Field "%s" type "%s" does not support grouping', fieldName, fti.type);
		self.ui.dropdown.val('');
		return;
	}

	opts = deepDefaults(opts, {
		autoShowFunWin: false,
		updateView: true
	});
	var updateView = opts.updateView;
	opts.updateView = false;

	self.super.addField(field, displayText, opts, null, function (ok, cf) {
		if (!ok) {
			return;
		}
		if (opts.autoShowFunWin && cf.fti != null && ['date', 'datetime'].indexOf(cf.fti.type) >= 0 && cf.field.fun === undefined) {
			cf.showFunWin();
		}
		else if (updateView) {
			self.updateView();
		}
	});
};

// AggregateControl {{{1

// Constructor {{{2

/**
 * Part of the user interface which governs the aggregate function (and potentially its arguments)
 * that produces the values in (1) group summary columns, (2) pivot cells.
 *
 * @class
 * @extends GridControl
 *
 * @property {string[]} fields
 * Names of the fields
 */

var AggregateControl = makeSubclass('AggregateControl', GridControl, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);

	self.view.on(ComputedView.events.invalidAggregate, function (aggNum, errMsg) {
		self.controlFields[aggNum].showError(errMsg);
	});
}, {
	disableUsedItems: false,
	showColumns: false,
	updateCanHide: false,
	controlFieldCtor: AggregateControlField,
	controlType: 'Aggregate'
});

// #draw {{{2

/**
 * Create a DIV element that can be placed within the Grid instance to hold the user interface for
 * the AggregateControl.  The caller must add the result to the DOM somewhere.
 *
 * @returns {jQuery} The DIV element that holds the entire UI.
 */

AggregateControl.prototype.draw = function (parent) {
	var self = this;

	self.ui.root = jQuery('<div>').appendTo(parent);

	self.ui.title = jQuery('<div>')
		.addClass('wcdv_control_title_bar')
		.appendTo(self.ui.root);
	jQuery('<span>')
		.addClass('wcdv_control_title')
		.text(trans('GRID_CONTROL.AGGREGATE.TITLE'))
		.appendTo(self.ui.title);
	self.ui.clearBtn = self.makeClearButton(self.ui.title);
	self.ui.fields = jQuery('<ul>', {
		id: gensym(),
		'class': self.isHorizontal ? 'wcdv_control_horizontal' : 'wcdv_control_vertical'
	}).appendTo(self.ui.root);
	var dropdownContainer = jQuery('<div>').appendTo(self.ui.root);
	self.ui.dropdown = jQuery('<select>', { 'class': 'wcdv_control_addField' }).appendTo(dropdownContainer);
	self.ui.dropdown.on('change', function () {
		self.addField(self.ui.dropdown.val(), self.ui.dropdown.find('option:selected').text());
	});

	jQuery('<option>', { 'value': '', 'disabled': true, 'selected': true })
		.text(trans('GRID_CONTROL.SELECT_AGGREGATE'))
		.appendTo(self.ui.dropdown);

	AGGREGATE_REGISTRY.each(function (aggFunDefn, aggFunShortName) {
		jQuery('<option>', { 'value': aggFunShortName }).text(aggFunDefn.prototype.name).appendTo(self.ui.dropdown);
	});
	/*
	self.ui.fun = jQuery('<div>').css({'margin-top': '7px'}).appendTo(self.ui.root);
	jQuery('<label>').text('Function:').appendTo(self.ui.fun);
	self.ui.funDropdown = jQuery('<select>')
		.appendTo(self.ui.fun)
		.on('change', function () {
			self.triggerAggChange();
		})
	;

	// Create a dropdown containing all the aggregate functions that are allowed to be used for
	// calculating pivot cells.  Right now that's everything that needs no external parameters aside
	// from the field.

	AGGREGATE_REGISTRY.each(function (aggClass, aggFunName) {
		if (aggClass.prototype.enabled && aggClass.prototype.enabled) {
			jQuery('<option>', {
				value: aggFunName
			})
				.text(aggClass.prototype.name || aggFunName)
				.appendTo(self.ui.funDropdown);
		}
	});

	// When we receive type information, use that to populate the "fields" dropdown.
	//
	// TODO This needs to be expanded to the possibility of having multiple fields.

	self.view.on('getTypeInfo', function (typeInfo) {
		self.typeInfo = typeInfo;
		self.updateFieldDropdowns();
	}, { limit: 1 });

	var syncAgg = function (spec) {
		var agg;
		if (getProp(spec, 'cell', 0, 'fun')) {
			self.ui.funDropdown.val(spec.cell[0].fun);
			agg = AGGREGATE_REGISTRY.get(spec.cell[0].fun);
			if (agg.prototype.fieldCount >= self.ui.fields.length) {
				self.addFieldDropdowns(agg);
			}
			self.showHideFields(agg);
		}
		if (getProp(spec, 'cell', 0, 'fields')) {
			each(spec.cell[0].fields, function (f, i) {
				self.ui.fields[i].dropdown.val(f);
			});
		}

		debug.info('GRID // AGGREGATE CONTROL',
							 'ComputedView set aggregate to: ' + JSON.stringify(spec));
	};

	self.view.on(ComputedView.events.aggregateSet, function (spec) {
		syncAgg(spec)
	}, { who: self });
	*/

	self.addViewConfigChangeHandler('aggregateSet', function () {
		var spec = self.view.getAggregate();
		self.clear({ updateView: false });
		if (spec != null) {
			console.debug('[DataVis // %s // Aggregate Control] View set aggregate to: %s', self.grid.toString(), JSON.stringify(spec.all));

			each(spec.all, function (agg) {
				self.addField(agg.fun, AGGREGATE_REGISTRY.get(agg.fun).prototype.name, { updateView: false }, {
					fields: agg.fields,
					isHidden: agg.isHidden
				});
			});
		}
	});
	return self.ui.root;
};

// #updateView {{{2

AggregateControl.prototype.updateView = function () {
	var self = this;
	var info = map(self.controlFields, function (cf) {
		return cf.getInfo();
	});
	self.ui.root.find('.wcdv_aggregate_control_error').hide();
	self.view.setAggregate(objFromArray(['group', 'pivot', 'cell', 'all'], [info]), {
		dontSendEventTo: self
	});
};

// #clearGraphFlag {{{2

AggregateControl.prototype.clearGraphFlag = function () {
	var self = this;

	each(self.controlFields, function (cf) {
		cf.shouldGraph = false;
	});
};

// #triggerAggChange (PROTOTYPE) {{{2

/**
 * Perform necessary actions when the aggregate function is changed.
 *
 *   - Update the UI to show/hide field argument.
 */

AggregateControl.prototype.triggerAggChange = function () {
	var self = this;
	var agg = AGGREGATE_REGISTRY.get(self.ui.funDropdown.val());

	if (agg.prototype.fieldCount > self.ui.fields.length) {
		self.addFieldDropdowns(agg);
	}

	self.showHideFields(agg);

	var aggSpec = objFromArray(['group', 'pivot', 'cell', 'all'], [[{
		fun: self.ui.funDropdown.val(),
		fields: agg.prototype.fieldCount > 0 && mapLimit(self.ui.fields, function (f) {
			return f.dropdown.val();
		}, agg.prototype.fieldCount)
	}]]);
	var i;
	var div;

	self.view.setAggregate(aggSpec, {
		dontSendEventTo: self
	});
};

// #showHideFields (PROTOTYPE) {{{2

AggregateControl.prototype.showHideFields = function (agg) {
	var self = this;
	var i;

	for (i = 0; i < self.ui.fields.length; i += 1) {
		if (i < agg.prototype.fieldCount) {
			self.ui.fields[i].div.show();
		}
		else {
			self.ui.fields[i].div.hide();
		}
	}
};

// #addFieldDropdowns (PROTOTYPE) {{{2

/**
 * For each field that an aggregate function requires, add a dropdown for it to the user interface.
 * This is used by some prototype code that allows changing the aggregate function dynamically.  If
 * the new aggregate function needs more fields than the old one (e.g. going from "count" to "sum")
 * then this function adds the extra UI elements needed to get those fields from the user.
 */

AggregateControl.prototype.addFieldDropdowns = function (agg) {
	var self = this;

	console.debug('[DataVis // %s // Aggregate Control] Adding %s extra field dropdowns for the %s aggregate function',
		self.grid.toString(), agg.prototype.fieldCount - self.ui.fields.length, agg.prototype.name);

	// Create the extra dropdowns that we need to get all the fields required by the aggregate
	// function selected.

	while (self.ui.fields.length < agg.prototype.fieldCount) {
		var x = {};
		x.div = jQuery('<div>').css({'margin-top': '4px'}).appendTo(self.ui.root);
		x.label = jQuery('<label>').text(trans('GRID_CONTROL.FIELD') + ':').appendTo(x.div);
		x.dropdown = jQuery('<select>').on('change', function () { self.triggerAggChange(); }).appendTo(x.div);
		self.ui.fields.push(x);
	}

	self.updateFieldDropdowns();
};

// #updateFieldDropdowns (PROTOTYPE) {{{2

/**
 * Populate the field dropdowns with the list of fields that are available in the view.  This is
 * used by prototype code that allows changing the aggregate function dynamically.
 */

AggregateControl.prototype.updateFieldDropdowns = function () {
	var self = this;

	// Clear out the fields that are already in the dropdown (in case anything was removed, and to
	// prevent duplicates from being added).

	each(self.ui.fields, function (f) {
		f.dropdown.children().remove();
	});

	// Add <OPTION> elements for all the fields.

	each(determineColumns(self.colConfig, null, self.typeInfo), function (fieldName) {
		var text = getProp(self.colConfig.get(fieldName), 'displayText') || fieldName;
		each(self.ui.fields, function (f) {
			jQuery('<option>', { 'value': fieldName }).text(text).appendTo(f.dropdown);
		});
	});
};

// #toString {{{2

AggregateControl.prototype.toString = function () {
	var self = this;

	return self.grid.id + ', Aggregate';
};

// FilterControl {{{1

// Constructor {{{2

/**
 * Part of the user interface which lets users filter columns.
 *
 * @param {object} defn
 *
 * @param {ComputedView} view
 *
 * @param {Grid~Features} features
 *
 * @param {object} timing
 *
 * @class
 * @extends GridControl
 */

var FilterControl = makeSubclass('FilterControl', GridControl, function () {
	var self = this;

	self.super.ctor.apply(self, arguments);
	self.gfs = new GridFilterSet(self.view, null, null, null, {
		dontSendEventTo: self
	});
}, {
	isReorderable: false,
	disableUsedItems: true,
	controlFieldCtor: FilterControlField,
	controlType: 'Filter'
});

// #draw {{{2

/**
 * Create a DIV element that can be placed within the Grid instance to hold the user interface for
 * the FilterControl.  The caller must add the result to the DOM somewhere.
 *
 * @returns {jQuery} The DIV element that holds the entire UI.
 */

FilterControl.prototype.draw = function (parent) {
	var self = this;

	/*
	parent.resizable({
		handles: 'e',
		minWidth: 100
	});
	*/

	parent.droppable({
		classes: {
			'ui-droppable-hover': 'wcdv_drop_target_hover'
		},
		drop: function (evt, ui) {
			// Turn this off for the sake of efficiency.
			//ui.draggable.draggable('option', 'refreshPositions', false);
			var field = ui.draggable.attr('data-wcdv-field');

			self.addField(field, getProp(self.colConfig.get(field), 'displayText'));
		}
	})
		._addEventDebugging('drop', 'FILTER');

	self.ui.root = jQuery('<div>').appendTo(parent);
	self.ui.title = jQuery('<div>')
		.addClass('wcdv_control_title_bar')
		.appendTo(self.ui.root);
	jQuery('<span>', { 'class': 'wcdv_control_title' })
		.text(trans('GRID_CONTROL.FILTER.TITLE'))
		.appendTo(self.ui.title);
	self.ui.clearBtn = self.makeClearButton(self.ui.title);
	self.ui.fields = jQuery('<ul>', {
		id: gensym(),
		'class': self.isHorizontal ? 'wcdv_control_horizontal' : 'wcdv_control_vertical'
	}).appendTo(self.ui.root);

	var dropdownContainer = jQuery('<div>').appendTo(self.ui.root);
	self.ui.dropdown = jQuery('<select>', { 'class': 'wcdv_control_addField' }).appendTo(dropdownContainer);
	self.ui.dropdown.on('change', function () {
		self.addField(self.ui.dropdown.val(), self.ui.dropdown.find('option:selected').text());
	});

	self.addViewConfigChangeHandler('filterSet', function () {
		var spec = self.view.getFilter();
		console.debug('[DataVis // %s // Filter Control] View set filter to: %s', self.grid.toString(), JSON.stringify(spec));
		self.clear({ updateView: false });
		each(spec, function (fieldSpec, field) {
			self.addField(field, getProp(self.colConfig.get(field), 'displayText'), { updateView: false });
			self.gfs.set(field, fieldSpec, { updateView: false });
		});
	});

	return self.ui.root;
};

// #addField {{{2

FilterControl.prototype.addField = function (field, displayText, opts) {
	var self = this;

	self.super.addField(field, displayText || getProp(self.colConfig.get(field), 'displayText'), opts);
};

// #removeField {{{2

FilterControl.prototype.removeField = function (cf) {
	var self = this;

	self.gfs.removeField(cf.field.field);
	self.super.removeField(cf);
};

// #clear {{{2

FilterControl.prototype.clear = function (opts) {
	var self = this;

	self.gfs.reset(opts);
	self.super.clear(opts);
};

// #updateView {{{2

FilterControl.prototype.updateView = function () {
	// NOTE This function intentionally does nothing!
	//      It overrides the behavior of the superclass' method.
};

// #toString {{{2

FilterControl.prototype.toString = function () {
	var self = this;

	return self.grid.id + ', Filter';
};

// Exports {{{1

export {
	FilterControl,
	GroupControl,
	PivotControl,
	AggregateControl,
};
