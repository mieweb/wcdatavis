import _ from 'underscore';
import sprintf from 'sprintf-js';

import jQuery from 'jquery';

import {trans} from '../../trans.js';
import {
	deepCopy,
	fontAwesome,
	log,
	makeRadioButtons,
	makeSubclass,
	makeToggleCheckbox,
	mixinLogging,
} from '../../util/misc.js';

import {ToolbarSection} from '../toolbar.js';
import {PrefsBackendTemporary} from '../../prefs_backend.js';
import {GridTableOptsWin} from '../windows/grid_table_opts.js';
import {ComputedView} from '../../computed_view.js';
import {MirageView} from '../../mirage_view.js';

// PlainToolbar {{{1

var PlainToolbar = makeSubclass('PlainToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	grid.ui.limit_div = jQuery('<div>').css({'display': 'inline-block'}).appendTo(self.ui.root);

	// Create a checkbox that will toggle the "automatically show more" feature for the grid table.

	self.ui.autoShowMore = makeToggleCheckbox(
		grid.defn,
		['table', 'limit', 'autoShowMore'],
		true,
		trans('GRID_TOOLBAR.PLAIN.SHOW_MORE_ON_SCROLL'),
		grid.ui.limit_div
	);

	// Create a button that will show all the rows when clicked.  We fake this a little bit by just
	// turning off the "limit" feature and letting the grid table be redrawn (changing the features
	// causes it to be redrawn).
	//
	// TODO: This should disable the "automatically show more" checkbox (need to make sure it gets
	// re-enabled if we switch grid tables and come back - as "limit" feature will be reset to its
	// default value).

	jQuery('<button>', {'type': 'button'})
		.on('click', function (evt) {
			grid.renderer.updateFeatures({
				'block': true,
				'progress': true,
				'limit': false
			});
		})
		.text(trans('GRID_TOOLBAR.PLAIN.SHOW_ALL_ROWS'))
		.appendTo(grid.ui.limit_div)
	;

	self.ui.columnConfig = jQuery('<button>', {
		'type': 'button',
		'title': trans('GRID_TOOLBAR.PLAIN.COLUMNS')
	})
		.append(fontAwesome('fa-columns'))
		.append(trans('GRID_TOOLBAR.PLAIN.COLUMNS'))
		.on('click', function (evt) {
			grid.colConfigWin.show(grid.ui.controls, function (colConfig, opts) {
				if (opts.clearRenderCache) {
					grid.clearRenderCache(opts.clearRenderCache);
				}
				grid.setColConfig(colConfig, {
					from: 'ui'
				});
			});
		})
		.appendTo(self.ui.root)
	;

	self.ui.TemplatesEditor = jQuery('<button>', {
		'type': 'button'
	})
		.append(fontAwesome('fa-pencil'))
		.append(trans('GRID_TOOLBAR.PLAIN.TEMPLATES_EDITOR'))
		.on('click', function (evt) {
			grid.TemplatesEditor.show();
		})
		.appendTo(self.ui.root)
	;
});

// #update {{{2

PlainToolbar.prototype.update = function () {
	var self = this;

	if (self.grid.renderer.features.limit) {
		self.grid.ui.limit_div.show();
		self.ui.autoShowMore.show();
	}
	else {
		self.grid.ui.limit_div.hide();
		self.ui.autoShowMore.hide();
	}

	switch (self.grid.rendererName) {
	case 'table':
		self.ui.columnConfig.show();
		self.ui.TemplatesEditor.hide();
		break;
	case 'handlebars':
		self.ui.columnConfig.hide();
		self.ui.TemplatesEditor.show();
		break;
	}
};

// GroupToolbar {{{1

var GroupToolbar = makeSubclass('GroupToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	var aggSpec;

	grid.view.on('aggregateSet', function (a) {
		aggSpec = deepCopy(a);
	});

	var enableDisable = function (selected) {
		switch (selected) {
		case 'summary':
			self.ui.showTotalRow.prop('disabled', false);
			self.ui.pinRowVals.prop('disabled', false);
			self.ui.columnConfig.prop('disabled', true);
			break;
		case 'detail':
			self.ui.showTotalRow.prop('disabled', true);
			self.ui.pinRowVals.prop('disabled', true);
			self.ui.columnConfig.prop('disabled', false);
			break;
		}
	};

	// Create radio buttons to switch between summary and detail group grid tables.

	self.ui.groupMode = makeRadioButtons(
		grid.defn
		, ['table', 'groupMode']
		, 'detail'
		, null
		, 'groupOutput'
		, [{label: trans('GRID_TOOLBAR.GROUP.MODE.SUMMARY'), value: 'summary'}
			, {label: trans('GRID_TOOLBAR.GROUP.MODE.DETAIL'), value: 'detail'}]
		, null
		, function (selected) {
			enableDisable(selected);
			grid.redraw();
		}
		, self.ui.root
	);

	self.ui.showTotalRow = makeToggleCheckbox(
		grid.defn,
		['table', 'whenGroup', 'showTotalRow'],
		true,
		trans('GRID_TOOLBAR.GROUP.TOTAL_ROW'),
		self.ui.root,
		function (isChecked) {
			var agg = grid.view.getAggregate();

			if (!isChecked) {
				aggSpec = deepCopy(agg);
				delete agg.all;
			}
			else {
				agg.all = aggSpec.all;
			}

			grid.view.setAggregate(agg, {
				sendEvent: false
			});
		}
	);

	self.ui.showExpandedGroups = makeToggleCheckbox(
		grid.defn,
		['table', 'whenGroup', 'showExpandedGroups'],
		false,
		trans('GRID_TOOLBAR.GROUP.EXPAND_ALL'),
		self.ui.root,
		function (isChecked) {
			grid.redraw();
		}
	);

	self.ui.pinRowVals = makeToggleCheckbox(
		grid.defn,
		['table', 'whenGroup', 'pinRowvals'],
		false,
		trans('GRID_TOOLBAR.GROUP.PIN_GROUPS'),
		self.ui.root,
		function (isChecked) {
			grid.redraw();
		}
	);

	//make a toggle for expanded groups

	self.ui.columnConfig = jQuery('<button>', {
		'type': 'button'
	})
		.append(fontAwesome('fa-columns'))
		.append(trans('GRID_TOOLBAR.PLAIN.COLUMNS'))
		.on('click', function (evt) {
			grid.colConfigWin.show(grid.ui.controls, function (colConfig) {
				grid.setColConfig(colConfig, {
					from: 'ui'
				});
			});
		})
		.appendTo(self.ui.root)
	;

	self.ui.TemplatesEditor = jQuery('<button>', {
		'type': 'button'
	})
		.append(fontAwesome('fa-pencil'))
		.append(trans('GRID_TOOLBAR.PLAIN.TEMPLATES_EDITOR'))
		.on('click', function (evt) {
			grid.TemplatesEditor.show();
		})
		.appendTo(self.ui.root)
	;

	enableDisable(grid.defn.table.groupMode);
});

// #update {{{2

GroupToolbar.prototype.update = function () {
	var self = this;

	switch (self.grid.rendererName) {
	case 'table':
		self.ui.groupMode.show();
		self.ui.showTotalRow.show();
		self.ui.pinRowVals.show();
		self.ui.columnConfig.show();
		self.ui.TemplatesEditor.hide();
		break;
	case 'handlebars':
		self.ui.groupMode.hide();
		self.ui.showTotalRow.hide();
		self.ui.pinRowVals.hide();
		self.ui.columnConfig.hide();
		self.ui.TemplatesEditor.show();
		break;
	}
};

// PivotToolbar {{{1

var PivotToolbar = makeSubclass('PivotToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	var aggSpec;

	grid.view.on('aggregateSet', function (a) {
		aggSpec = deepCopy(a);
	});

	self.ui.showTotals = makeToggleCheckbox(
		grid.defn,
		['table', 'whenPivot', 'showTotalCol'],
		true,
		trans('GRID_TOOLBAR.PIVOT.TOTAL_ROW_COLUMN'),
		self.ui.root,
		function (isChecked) {
			var agg = grid.view.getAggregate();

			if (!isChecked) {
				aggSpec = deepCopy(agg);
				delete agg.group;
				delete agg.pivot;
				delete agg.all;
			}
			else {
				agg.group = aggSpec.group;
				agg.pivot = aggSpec.pivot;
				agg.all = aggSpec.all;
			}

			grid.view.setAggregate(agg, {
				sendEvent: false
			});
		}
	);

	self.ui.pinRowVals = makeToggleCheckbox(
		grid.defn,
		['table', 'whenGroup', 'pinRowvals'],
		false,
		trans('GRID_TOOLBAR.GROUP.PIN_GROUPS'),
		self.ui.root,
		function (isChecked) {
			grid.redraw();
		}
	);

	self.ui.hideBottomValueAggResults = makeToggleCheckbox(
		grid.defn,
		['table', 'whenPivot', 'hideBottomValueAggResults'],
		false,
		trans('GRID_TOOLBAR.PIVOT.HIDE_ZERO_VALUES'),
		self.ui.root,
		function (isChecked) {
			grid.redraw();
		}
	);

	self.ui.TemplatesEditor = jQuery('<button>', {
		'type': 'button'
	})
		.append(fontAwesome('fa-pencil'))
		.append(trans('GRID_TOOLBAR.PLAIN.TEMPLATES_EDITOR'))
		.on('click', function (evt) {
			grid.TemplatesEditor.show();
		})
		.appendTo(self.ui.root)
	;
});

// #update {{{2

PivotToolbar.prototype.update = function () {
	var self = this;

	switch (self.grid.rendererName) {
	case 'table':
		self.ui.showTotals.show();
		self.ui.pinRowVals.show();
		self.ui.TemplatesEditor.hide();
		break;
	case 'handlebars':
		self.ui.showTotals.hide();
		self.ui.pinRowVals.hide();
		self.ui.TemplatesEditor.show();
		break;
	}
};

// PrefsToolbar {{{1

var PrefsToolbar = makeSubclass('PrefsToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	var div = jQuery('<div>')
		.addClass('wcdv_toolbar_view')
		.css({'display': 'inline-block'})
		.appendTo(self.ui.root)
	;

	var options = {};

	var showHideBtns = function () {
		var p = grid.prefs.getPerspective({ id: dropdown.val() });

		if (p == null) {
			throw new Error('No such perspective: ' + dropdown.val());
		}

		if (p.opts.isTemporary) {
			saveAsBtn.show();
		}
		else {
			saveAsBtn.hide();
		}

		if (p.opts.isEssential) {
			renameBtn.hide();
			deleteBtn.hide();
		}
		else {
			renameBtn.show();
			deleteBtn.show();
		}
	};

	var removePerspectiveFromDropdown = function (name) {
		options[name].remove();
		delete options[name];
	};

	// Clicking this button will reset all preferences back to the initial set (i.e. just "Main
	// Perspective" and no changes in the view from its default).  Perhaps useful when you have too
	// many different perspectives set, but I feel better having it as a safety in case your prefs
	// somehow get really messed up and don't work at all anymore.  This button is always shown.

	var resetBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.PREFS.RESET.TOOLTIP')})
		.addClass('wcdv_icon_button wcdv_text-primary')
		.append(fontAwesome('fa-undo'))
		.on('click', function (evt) {
			evt.stopPropagation();
			if (confirm(trans('GRID_TOOLBAR.PREFS.RESET.CONFIRM'))) {
				grid.prefs.reset();
			}
		})
		.appendTo(div)
	;

	var backBtn = jQuery('<button>', {'type': 'button'})
		.append(fontAwesome('fa-chevron-circle-left'))
		.attr('title', trans('GRID_TOOLBAR.PREFS.BACK.TOOLTIP'))
		.attr('disabled', true)
		.addClass('wcdv_icon_button wcdv_text-primary')
		.on('click', function (evt) {
			evt.stopPropagation();
			grid.prefs.back();
		})
		.appendTo(div)
	;

	var forwardBtn = jQuery('<button>', {'type': 'button'})
		.append(fontAwesome('fa-chevron-circle-right'))
		.attr('title', trans('GRID_TOOLBAR.PREFS.FORWARD.TOOLTIP'))
		.attr('disabled', true)
		.addClass('wcdv_icon_button wcdv_text-primary')
		.on('click', function (evt) {
			evt.stopPropagation();
			grid.prefs.forward();
		})
		.appendTo(div)
	;

	/*
	var historyBtn = jQuery(fontAwesome('fa-clock-o', 'wcdv_button', 'History'))
		.on('click', function () {
			grid.prefs._historyDebug();
		})
		.appendTo(div)
	;
	*/

	// Dropdown of all the available perspectives, plus an entry that (when selected) prompts for the
	// name of a new perspective.

	var dropdown = jQuery('<select>')
		.append(jQuery('<option>', { value: 'NEW' }).text(trans('GRID_TOOLBAR.PREFS.NEW_PERSPECTIVE')))
		.on('click', function (evt) {
			// After moving the perspective toolbar section into the titlebar, clicking
			// the dropdown was toggling the grid; we need to add a click event handler
			// here so we can explicitly prevent that from happening.
			evt.stopPropagation();
		})
		.on('change', function () {
			if (dropdown.val() === 'NEW') {
				var name = prompt(trans('GRID_TOOLBAR.PREFS.NEW_PERSPECTIVE.PROMPT'), grid.prefs.currentPerspective.name);
				if (name) {
					grid.prefs.addPerspective(null, name);
					grid.prefs.save();
				}
				else {
					// User cancelled the dialog, so just put the dropdown back to whatever the current
					// perspective is.
					dropdown.val(grid.prefs.currentPerspective.id);
				}
				return;
			}

			grid.prefs.setCurrentPerspective(dropdown.val());
			showHideBtns();
		})
		.appendTo(div)
	;

	var warnMsgText = jQuery('<span>');

	var warnMsgContent = jQuery('<div>')
		.append(fontAwesome('fa-info-circle').css('padding-right', '0.25em').addClass('wcdv_text-primary'))
		.append(warnMsgText);

	var warnMsg = fontAwesome('fa-info-circle', 'wcdv_info_icon')
		.attr({'title': trans('GRID_TOOLBAR.PREFS.INFO.TOOLTIP')})
		.hide()
		.tooltip({
			classes: {
				'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
			},
			show: { delay: 1000 },
			content: warnMsgContent,
		})
		.appendTo(div)
	;

	if (grid.prefs.backend instanceof PrefsBackendTemporary) {
		warnMsgText.text(trans('GRID_TOOLBAR.PREFS.BACKEND_DOES_NOT_SAVE'));
		warnMsg.show();
	}

	// Save As {{{2

	var saveAsBtnTooltipContent = jQuery('<div>')
		.append(fontAwesome('fa-info-circle').css('padding-right', '0.25em').addClass('wcdv_text-primary'))
		.append(trans('GRID_TOOLBAR.PREFS.SAVE_AS.HELP'));

	var saveAsBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.PREFS.SAVE_AS.TOOLTIP')})
		.append(fontAwesome('fa-save'))
		.addClass('wcdv_icon_button wcdv_text-primary')
		.tooltip({
			classes: {
				'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
			},
			show: { delay: 1000 },
			content: saveAsBtnTooltipContent
		})
		.on('click', function (evt) {
			evt.stopPropagation();
			grid.prefs.clonePerspective();
		})
		.appendTo(div)
	;

	// Save {{{2

	var saveBtnTooltipContent = jQuery('<div>')
		.append(fontAwesome('fa-info-circle').css('padding-right', '0.25em').addClass('wcdv_text-primary'))
		.append(trans('GRID_TOOLBAR.PREFS.SAVE.HELP'));

	var saveBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.PREFS.SAVE.TOOLTIP')})
		.append(fontAwesome('fa-save'))
		.addClass('wcdv_icon_button wcdv_text-primary')
		.hide()
		// .tooltip({
		// 	classes: {
		// 		'ui-tooltip': 'ui-corner-all ui-widget-shadow wcdv_info_tooltip wcdv_border-primary'
		// 	},
		// 	show: { delay: 1000 },
		// 	content: saveBtnTooltipContent
		// })
		.on('click', function (evt) {
			evt.stopPropagation();
			grid.prefs.reallySave();
		})
		.appendTo(div)
	;

	// Rename {{{2

	// Clicking this button will show a prompt to rename the currently selected perspective.  If you
	// cancel the prompt, nothing will happen.  This button is only shown when the currently selected
	// perspective is not "Main Perspective" as it cannot be renamed.
	//
	// XXX: What if the user types in the name of an existing perspective?
	// XXX: What if the user types in "Main Perspective" ?
	// XXX: What if the user types in "NEW" ?

	var renameBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.PREFS.RENAME.TOOLTIP')})
		.addClass('wcdv_icon_button wcdv_text-primary')
		.append(fontAwesome('fa-pencil'))
		.on('click', function (evt) {
			evt.stopPropagation();
			var id = dropdown.val();
			var p = grid.prefs.getPerspective({ id: id });

			if (p.opts.isEssential) {
				alert('Cannot rename essential perspective!');
			}
			else {
				var newName = prompt(trans('GRID_TOOLBAR.PREFS.RENAME_PERSPECTIVE.PROMPT', p.name));
				if (newName) {
					grid.prefs.renamePerspective(id, newName);
				}
			}
		})
		.appendTo(div)
	;

	// Delete {{{2

	// Clicking this button will delete the currently selected perspective and switch back to "Main
	// Perspective".  It is only shown when the currently selected perspective is not "Main
	// Perspective" as it cannot be deleted.

	var deleteBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.PREFS.DELETE.TOOLTIP')})
		.addClass('wcdv_icon_button wcdv_text-primary')
		.append(fontAwesome('fa-trash'))
		.on('click', function (evt) {
			evt.stopPropagation();
			if (confirm(trans('GRID_TOOLBAR.PREFS.DELETE_PERSPECTIVE.CONFIRM'))) {
				grid.prefs.deletePerspective(dropdown.val());
			}
		})
		.appendTo(div)
	;

	// }}}2

	// Get the list of available perspectives from the Prefs instance and put them into the dropdown.
	// The initial perspective will be selected by default.  This DOES NOT actually load that
	// perspective, it's just for the UI.
	//
	// XXX: Is it possible for perspectives to change by some other route so that we need to know
	// about it to update the UI?

	setTimeout(function () {
		grid.prefs.prime(function () {
			grid.prefs.getPerspectives(function (ids) {
				_.each(_.sortBy(_.map(ids, function (id) {
					return grid.prefs.getPerspective({ id: id });
				}), 'name'), function (o) {
					if (options[o.id] == null) {
						options[o.id] = jQuery('<option>', { 'value': o.id })
							.text(o.name)
							.appendTo(dropdown);
					}
				});

				dropdown.val(grid.prefs.currentPerspective.id);
				showHideBtns();
			});

			grid.prefs.on('perspectiveAdded', function (id) {
				if (options[id] == null) {
					var p = grid.prefs.getPerspective({ id: id });
					options[id] = jQuery('<option>', { value: id })
						.text(p.name)
						.appendTo(dropdown);
				}
			}, {
				info: 'Adding new perspective to dropdown'
			});

			grid.prefs.on('perspectiveDeleted', function (id) {
				if (options[id] == null) {
					throw new Error(sprintf.sprintf('Received `perspectiveDeleted` event that references unknown perspective: id = "%s"', id));
				}
				options[id].remove();
				delete options[id];
			}, {
				info: 'Removing perspective from dropdown'
			});

			grid.prefs.on('perspectiveRenamed', function (id, newName) {
				if (options[id] == null) {
					throw new Error(sprintf.sprintf('Received `perspectiveRenamed` event that references unknown perspective: id = "%s"', id));
				}
				options[id].text(newName);
			}, {
				info: 'Changing perspective name in dropdown'
			});

			grid.prefs.on('perspectiveChanged', function (id, p) {
				if (options[id] == null) {
					throw new Error(sprintf.sprintf('Received `perspectiveChanged` event that references unknown perspective: id = "%s"', id));
				}
				if (p.isUnsaved) {
					saveBtn.show();
				}
				else {
					saveBtn.hide();
				}
				dropdown.val(id);
				showHideBtns();
			}, {
				info: 'Changing dropdown to reflect new current perspective'
			});

			grid.prefs.on('prefsReset', function () {
				_.each(options, function (elt) {
					elt.remove();
				});
				options = {};
			}, {
				info: 'Deleting all perspectives from the dropdown'
			});

			grid.prefs.on('prefsChanged', function () {
				var cp = grid.prefs.currentPerspective;
				var o = options[cp.id];
				o.text('[*] ' + cp.name);
				saveBtn.show();
			});

			grid.prefs.on('prefsSaved', function () {
				var cp = grid.prefs.currentPerspective;
				var o = options[cp.id];
				o.text(cp.name);
				saveBtn.hide();
			});

			grid.prefs.on('prefsHistoryStatus', function (back, forward) {
				backBtn.attr('disabled', !back);
				forwardBtn.attr('disabled', !forward);
			});
		});
	});
});

// RendererToolbar {{{1

var RendererToolbar = makeSubclass('RendererToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	var div = jQuery('<div>')
		.addClass('wcdv_toolbar_view')
		.css({'display': 'inline-block'})
		.appendTo(self.ui.root)
	;

	var configBtn = jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.RENDERER.DISPLAY_OPTIONS')})
		.append(fontAwesome('fa-table'))
		.append(trans('GRID_TOOLBAR.RENDERER.DISPLAY_OPTIONS'))
		.on('click', function () {
			var gridTableOptsWin = new GridTableOptsWin(grid.renderer);
			gridTableOptsWin.show(function (newOpts) {
				if (grid.renderer.canRender('plain')) {
					grid.defn.table.whenPlain = newOpts;
				}
				else if (grid.renderer.canRender('group')) {
					grid.defn.table.whenGroup = newOpts;
				}
				else if (grid.renderer.canRender('pivot')) {
					grid.defn.table.whenPivot = newOpts;
				}
				grid.redraw();
			});
		})
		.appendTo(div)
	;

	grid.on('renderEnd', function () {
		configBtn.prop('disabled', grid.renderer.canRender('plain'));
	});
});

// ComputedViewToolbar {{{1

var ComputedViewToolbar = makeSubclass('ComputedViewToolbar', ToolbarSection, function (grid) {
	var self = this;

	self.super.ctor.apply(self, []);
	self.ui.root.addClass('wcdv_toolbar_section');

	self.grid = grid;

	var div = jQuery('<div>')
		.addClass('wcdv_toolbar_view')
		.css({'display': 'inline-block'})
		.appendTo(self.ui.root)
	;

	// Store {{{2

	// This button creates a MirageView from the current view, and switches my grid's view to the new
	// MirageView.  If an error occurs, it should abort and leave things the way they are.

	jQuery('<button>', {'type': 'button', 'title': trans('GRID_TOOLBAR.MIRAGE.STORE_DISPLAYED_DATA')})
		.append(fontAwesome('fa-save'))
		.append(trans('GRID_TOOLBAR.MIRAGE.STORE_DISPLAYED_DATA'))
		.on('click', function () {
			var perspectiveName = prompt(trans('GRID_TOOLBAR.PREFS.NEW_PERSPECTIVE.PROMPT'), grid.prefs.currentPerspective.name);
			if (perspectiveName != null) {
				grid.mirageView.initFromView(grid.view.prefs, grid.view, grid.view.source, function () {
					// XXX Clone the new perspective, redraw the grid, then switch to the mirage and save it?
					// Or make the mirage first and lie to it about the perspective name, then clone it?
					grid.mirageView.setPerspectiveName(perspectiveName);
					grid.mirageView.save(function () {
						// FIXME Needs to be a better way of doing this.  Either reuse the existing mirageView
						// or provide an API to switch the target of a prefs module.
						// grid.prefs.modules.mirageView.target = grid.mirageView;

						// Cloning the current perspective will cause it to be added and switched to, which
						// causes the grid to change to the mirage view we just made, and redraw.

						grid.prefs.clonePerspective(null, perspectiveName, function (config) {
							config.mirageView = deepCopy(config.computedView);
							config.isMirage = true;

							return config;
						}, function () {
						}, function (errMsg) {
							if (errMsg != null) {
								alert(errMsg);
							}
						});
					}, function (msg) {
						log.error('Failed to save mirage view: ' + msg);
					});
				}, function (msg) {
					log.error('Failed to initialize mirage view: ' + msg);
				});
			}
		})
		.appendTo(div)
	;

	// }}}2

	// Control my own visibility by only showing myself when the view in use by my grid is a
	// ComputedView.  Other types of views have their own toolbars.

	self.grid.on('renderEnd', function () {
		if (self.grid.view instanceof ComputedView) {
			self.show();
		}
		else {
			self.hide();
		}
	});
});

// Exports {{{1

export {
	PlainToolbar,
	GroupToolbar,
	PivotToolbar,
	PrefsToolbar,
	RendererToolbar,
	ComputedViewToolbar,
};
