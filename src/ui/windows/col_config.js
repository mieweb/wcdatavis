import jQuery from 'jquery';

import { trans } from '../../trans.js';
import {
	each,
	fontAwesome,
	getPropDef,
	makeSubclass,
	moveArrayElement,
	without,
} from '../../util/misc.js';

// ColConfigWin {{{1

var ColConfigWin = makeSubclass('ColConfigWin', Object, function (grid) {
	var self = this;

	self.grid = grid;

	grid.on('colConfigUpdate', function (colConfig, initColConfig) {
		self.colConfig = colConfig;
		self.initColConfig = initColConfig;
	});
});

// #show {{{2

ColConfigWin.prototype.show = function (posElt, onSave) {
	var self = this;

	var current = self.colConfig.clone();

	var orderWinEffect = {
		effect: 'fade',
		duration: 100
	};

	var orderWin = jQuery('<div>', { title: trans('GRID.COLCONFIG_WIN.TITLE') }).dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		position: {
			my: 'center',
			at: 'center',
			of: window
		},
		classes: {
			"ui-dialog": "ui-corner-all wcdv_dialog",
			"ui-dialog-titlebar": "ui-corner-all",
		},
		show: orderWinEffect,
		hide: orderWinEffect,
		close: function () {
			orderWin.dialog('destroy');
		}
	});

	var pinnedCount = 0;

	var colTable = jQuery('<table>')
		.addClass('wcdv_colconfigwin_table')
		.appendTo(jQuery('<div>').css({
			'max-height': '40ex',
			'overflow-y': 'scroll'
		}).appendTo(orderWin));

	var colTableHeader = jQuery('<thead>' +
			'<th class="wcdv_bottom_border_teal wcdv_width_1em"></th>' +
			'<th class="wcdv_bottom_border_teal">' + trans('GRID.COLCONFIG_WIN.TBL.FIELD') + '</th>' +
			'<th class="wcdv_bottom_border_teal">' + trans('GRID.COLCONFIG_WIN.TBL.DISPLAY') + '</th>' +
			'<th colspan="7" class="wcdv_bottom_border_teal">' + trans('GRID.COLCONFIG_WIN.TBL.OPTIONS') + '</th>' +
		'</thead>')
		.appendTo(colTable);

	var keys = current.keys();

	var colTableBody = jQuery('<tbody>')
		._makeSortableTable(function (oldIndex, newIndex) {
			colTableBody.children('tr').eq(newIndex).effect('highlight', 750);
			moveArrayElement(keys, oldIndex, newIndex);
		})
		.appendTo(colTable);

	var trsByField = {};
	var clearRenderCache = [];

	current.each(function (colConfig, field) {
		var tr, td;

		tr = jQuery('<tr>', {
			'data-field': field
		});

		trsByField[field] = tr;

		td = jQuery('<td>')
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		jQuery('<button>', {
			'type': 'button',
			'title': trans('GRID.COLCONFIG_WIN.REORDER_COLS')
		})
			.addClass('wcdv_icon_button drag-handle wcdv_button_right')
			.append(fontAwesome('fa-bars'))
			.appendTo(td);

		td = jQuery('<td>')
			.text(field)
			.appendTo(tr);

		td = jQuery('<td>')
			.css('color', colConfig.displayText ? '#000000' : '#C0C0C0')
			.text(colConfig.displayText || field)
			.appendTo(tr);
		var displayTextTd = td;

		td = jQuery('<td>')
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var renameBtn = jQuery('<button>', {
			'type': 'button',
			'title': trans('GRID.COLCONFIG_WIN.RENAME_COL')
		})
			.addClass('wcdv_icon_button')
			.append(fontAwesome('fa-pencil'))
			.on('click', function () {
				var newName = prompt(trans('GRID.COLCONFIG_WIN.RENAME_COL.PROMPT', field));

				if (newName) {
					colConfig.displayText = newName;
					displayTextTd
						.css('color', colConfig.displayText ? '#000000' : '#C0C0C0')
						.text(newName);
				}
			})
			.appendTo(td)
		;

		td = jQuery('<td>', {
			'data-prop': 'isPinned'
		})
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var isPinnedCheckbox = jQuery('<input>', {
			'type': 'checkbox',
			'title': trans('GRID.COLCONFIG_WIN.PIN_COL')
		})
			.prop('checked', getPropDef(false, colConfig, 'isPinned'))
			.on('change', function () {
				colConfig.isPinned = isPinnedCheckbox.prop('checked');
				if (colConfig.isPinned) {
					pinnedCount += 1;
				}
				else {
					pinnedCount -= 1;
				}
				if (pinnedCount > 0) {
					pinnedMsg.show();
				}
				else {
					pinnedMsg.hide();
				}
			})
			.appendTo(td)
			._makeIconCheckbox('fa-thumb-tack');

		if (getPropDef(false, colConfig, 'isPinned')) {
			pinnedCount += 1;
		}

		td = jQuery('<td>', {
			'data-prop': 'isHidden'
		})
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var isHiddenCheckbox = jQuery('<input>', {
			'type': 'checkbox',
			'title': trans('GRID.COLCONFIG_WIN.HIDE_COL')
		})
			.prop('disabled', !getPropDef(true, colConfig, 'canHide'))
			.prop('checked', getPropDef(false, colConfig, 'isHidden'))
			.on('change', function () {
				colConfig.isHidden = isHiddenCheckbox.prop('checked');
			})
			.appendTo(td)
			._makeIconCheckbox('fa-ban');

		td = jQuery('<td>', {
			'data-prop': 'allowHtml'
		})
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var allowHtmlCheckbox = jQuery('<input>', {
			'type': 'checkbox',
			'title': trans('GRID.COLCONFIG_WIN.ALLOW_HTML')
		})
			.prop('checked', getPropDef(false, colConfig, 'allowHtml'))
			.on('change', function () {
				colConfig.allowHtml = allowHtmlCheckbox.prop('checked');
			})
			.appendTo(td)
			._makeIconCheckbox('fa-code');

		td = jQuery('<td>', {
			'data-prop': 'allowFormatting'
		})
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var allowFormattingCheckbox = jQuery('<input>', {
			'type': 'checkbox',
			'title': trans('GRID.COLCONFIG_WIN.ALLOW_FORMATTING')
		})
			.prop('checked', getPropDef(false, colConfig, 'allowFormatting'))
			.on('change', function () {
				if (clearRenderCache.indexOf(field) >= 0) {
					clearRenderCache = without(clearRenderCache, field);
				}
				else {
					clearRenderCache.push(field);
				}
				colConfig.allowFormatting = allowFormattingCheckbox.prop('checked');
			})
			.appendTo(td)
			._makeIconCheckbox('fa-paint-brush');

		/*
		td = jQuery('<td>')
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		var configBtn = jQuery('<button>', {'type': 'button', 'title': 'Click to configure column'})
			.addClass('wcdv_icon_button')
			.append(fontAwesome('fa-gear'))
			.on('click', function () {
				self.showConfigWin(field);
			})
			.appendTo(td);
		*/

		td = jQuery('<td>')
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		jQuery('<button>', {
			'type': 'button',
			'title': trans('GRID.COLCONFIG_WIN.MOVE_COL_TO_TOP')
		})
			.addClass('wcdv_icon_button wcdv_button_left')
			.on('click', function () {
				var oldIndex = tr.index();
				colTableBody.prepend(tr);
				var newIndex = tr.index();
				colTableBody.children('tr').eq(oldIndex).effect('highlight', 750);
				colTableBody.children('tr').eq(newIndex).effect('highlight', 750);
				moveArrayElement(keys, oldIndex, newIndex);
			})
			.append(fontAwesome('fa-angle-double-up'))
			.appendTo(td);

		td = jQuery('<td>')
			.addClass('wcdv_width_1em')
			.appendTo(tr);

		jQuery('<button>', {
			'type': 'button',
			'title': trans('GRID.COLCONFIG_WIN.MOVE_COL_TO_BOTTOM')
		})
			.addClass('wcdv_icon_button wcdv_button_left')
			.on('click', function () {
				var oldIndex = tr.index();
				colTableBody.append(tr);
				var newIndex = tr.index();
				colTableBody.children('tr').eq(oldIndex).effect('highlight', 750);
				colTableBody.children('tr').eq(newIndex).effect('highlight', 750);
				moveArrayElement(keys, oldIndex, newIndex);
			})
			.append(fontAwesome('fa-angle-double-down'))
			.appendTo(td);

		tr.appendTo(colTableBody);
	});

	var pinnedMsg = jQuery('<div>')
		.addClass('wcdv_dlg_info_banner')
		.append(fontAwesome('fa-info-circle'))
		.append(' ')
		.append(trans('GRID.COLCONFIG_WIN.PINNED_COL_WARNING'))
		.hide()
		.appendTo(orderWin);

	if (pinnedCount > 0) {
		pinnedMsg.show();
	}

	jQuery('<hr>')
		.appendTo(orderWin);

	var buttonBar = jQuery('<div>')
		.addClass('wcdv_button_bar')
		.appendTo(orderWin);

	if (self.initColConfig) {
		jQuery('<button>', {
			'type': 'button',
			'class': '',
			'title': trans('GRID.COLCONFIG_WIN.RESET_COL_ORDER')
		})
			.append(fontAwesome('fa-undo'))
			.append(trans('GRID.COLCONFIG_WIN.RESET_COL_ORDER'))
			.on('click', function (evt) {
				keys = self.initColConfig.keys();
				each(keys, function (k) {
					if (trsByField[k] !== null) {
						colTableBody.append(trsByField[k]);
						trsByField[k].effect('highlight', 750);
					}
				});
			})
			.appendTo(buttonBar);
	}

	jQuery('<button>', {
		'type': 'button',
		'class': '',
		'title': trans('DIALOG.OK'),
		'data-role': 'ok'
	})
		.append(fontAwesome('fa-check'))
		.append(trans('DIALOG.OK'))
		.on('click', function () {
			// Overwrite the "initial" configuration with one derived from the current one, based on the
			// order of the keys saved by the reordering the table rows.

			self.colConfig.clear();
			each(keys, function (k) {
				self.colConfig.set(k, current.get(k));
			});

			orderWin.dialog('close');
			onSave(self.colConfig, {
				clearRenderCache: clearRenderCache.length > 0 ? clearRenderCache : null
			});
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
			orderWin.dialog('close');
		})
		.appendTo(buttonBar);

	orderWin.dialog('open');
};

export {
	ColConfigWin
};
