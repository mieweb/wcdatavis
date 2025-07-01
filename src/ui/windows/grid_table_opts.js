import jQuery from 'jquery';

import {
	deepCopy,
	deepDefaults,
	makeSubclass,
	getProp,
	getPropDef,
} from '../../util/misc.js';

import GridTable from '../../renderers/grid/table.js';

// GridTableOptsWin {{{1

/**
 * @class
 *
 * @property {GridTable} renderer
 */

var GridTableOptsWin = makeSubclass('GridTableOptsWin', Object, function (renderer) {
	var self = this;

	if (!(renderer instanceof GridTable)) {
		throw new Error('Call Error: `renderer` must be an instance of GridTable');
	}

	self.renderer = renderer;
});

// #show {{{2

GridTableOptsWin.prototype.show = function (onSave) {
	var self = this;

	var curOpts = deepCopy(self.renderer.opts);
	var canGroup = self.renderer.canRender('group');
	var canPivot = self.renderer.canRender('pivot');

	var effectOpts = {
		effect: 'fade',
		duration: 100
	};

	var ui = {};

	var win = jQuery('<div>', { title: 'Columns' }).dialog({
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
		buttons: [{
			text: 'OK',
			icon: 'ui-icon-check',
			click: function () {
				curOpts = deepDefaults(curOpts, {
					displayFormat: {}
				});

				if (canPivot && ui.cellChk.prop('checked')) {
					curOpts.displayFormat.cell = [ui.cellText.val()];
				}

				/*
				if ((canGroup || canPivot) && ui.groupChk.prop('checked')) {
					curOpts.displayFormat.group = [ui.groupText.val()];
				}

				if (canPivot && ui.pivotChk.prop('checked')) {
					curOpts.displayFormat.pivot = [ui.pivotText.val()];
				}

				if ((canGroup || canPivot) && ui.allChk.prop('checked')) {
					curOpts.displayFormat.all = [ui.allText.val()];
				}
				*/

				win.dialog('close');
				onSave(curOpts);
			}
		}, {
			text: 'Cancel',
			icon: 'ui-icon-cancel',
			click: function () {
				win.dialog('close');
			}
		}],
		show: effectOpts,
		hide: effectOpts,
		close: function () {
			win.dialog('destroy');
		}
	});

	ui.root = jQuery('<div>');

	var inputs = [{
		field: 'cell',
		available: canPivot,
		label: 'Customize cell display',
	}/*, {
		field: 'group',
		available: canGroup || canPivot,
		label: 'Customize group display',
	}, {
		field: 'pivot',
		available: canPivot,
		label: 'Customize pivot display',
	}, {
		field: 'all',
		available: canGroup || canPivot,
		label: 'Customize total display',
	}*/];

	inputs.forEach(function (input) {
		if (input.available) {
			var curVal = getPropDef('', curOpts, 'displayFormat', input.field);

			var checkbox = jQuery('<input>', {type: 'checkbox', checked: !!curVal});
			var textarea = jQuery('<textarea>', {cols: 60}).css({display: 'block', fontFamily: 'monospace', marginTop: '1ex'}).val(curVal);
			var label = jQuery('<label>').css({display: 'block', marginTop: '1ex'}).append(checkbox).append(input.label);

			checkbox.on('change', function () {
				textarea.toggle();
			});

			ui[input.field + 'Chk'] = checkbox;
			ui[input.field + 'Text'] = textarea;

			ui.root.append(label);
			ui.root.append(textarea);

			if (!curVal) {
				textarea.hide();
			}
		}
	});

	win.append(ui.root);
	win.dialog('open');
};

export {
	GridTableOptsWin
};
