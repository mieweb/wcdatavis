import jQuery from 'jquery';

import {
	each,
	fontAwesome,
	getProp,
	getPropDef,
	makeSubclass,
	moveArrayElement,
	setProp,
} from '../util/misc.js';
import { trans } from '../trans.js';
import OrdMap from '../util/ordmap.js';

// TemplatesEditor {{{1

var TemplatesEditor = makeSubclass('TemplatesEditor', Object, function (grid, onSave, onCancel) {
	var self = this;

	var winEffect = {
		effect: 'fade',
		duration: 100
	};

	self.grid = grid;
	self.win = jQuery('<div>', { title: trans('GRID.TEMPLATE_EDITOR.TITLE') }).dialog({
		autoOpen: false,
		modal: true,
		width: 'auto',
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
			text: trans('DIALOG.OK'),
			icon: 'ui-icon-check',
			click: function () {
				// Update the configuration of the grid.

				self.tabData.each(function (v, k) {
					each(['empty', 'before', 'beforeGroup', 'item', 'afterGroup', 'after'], function (t) {
						if (v.inputs[t] != null) {
							setProp(v.inputs[t].val(), self.grid.defn, 'rendererOpts', k, t);
						}
					});
				});

				self.win.dialog('close');
				if (typeof onSave === 'function') {
					onSave();
				}
			}
		}, {
			text: trans('DIALOG.CANCEL'),
			icon: 'ui-icon-cancel',
			click: function () {
				self.win.dialog('close');
				if (typeof onCancel === 'function') {
					onCancel();
				}
			}
		}],
		show: winEffect,
		hide: winEffect,
	});

	// Tabs {{{2

	var makeTab = function (name, displayName) {
		var inputs = {};
		var labels = {};

		var li = jQuery('<li>').append(jQuery('<a>', {href: '#wcdv_hbe_' + name}).text(displayName));
		var div = jQuery('<div>', {id: 'wcdv_hbe_' + name});

		each([
			{id: 'empty', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.EMPTY'), rows: 2},
			{id: 'before', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.BEFORE'), rows: 2},
			{id: 'beforeGroup', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.BEFORE_GROUP'), rows: 2, modes: ['whenPivot']},
			{id: 'item', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.ITEM'), rows: name === 'whenPlain' ? 8 : 4 },
			{id: 'afterGroup', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.AFTER_GROUP'), rows: 2, modes: ['whenPivot']},
			{id: 'after', label: trans('GRID.TEMPLATE_EDITOR.CONFIG.AFTER'), rows: 2},
		], function (x) {
			if (x.modes != null && x.modes.indexOf(name) < 0) {
				return;
			}
			labels[x.id] = jQuery('<label>', {
				for: 'wcdv_hbe_' + name + '_' + x.id
			})
				.css('display', 'block')
				.text(x.label + ':');
			inputs[x.id] = jQuery('<textarea>', {
				id: 'wcdv_hbe_' + name + '_' + x.id,
				rows: x.rows,
				cols: 80
			})
				.css('font-family', 'monospace');
			div.append(labels[x.id]);
			div.append(inputs[x.id]);
		});

		return { li: li, div: div, inputs: inputs };
	};

	self.tabData = new OrdMap();
	self.tabData.set('whenPlain', makeTab('whenPlain', trans('GRID.TEMPLATE_EDITOR.PLAIN')));
	self.tabData.set('whenGroup', makeTab('whenGroup', trans('GRID.TEMPLATE_EDITOR.GROUPED')));
	self.tabData.set('whenPivot', makeTab('whenPivot', trans('GRID.TEMPLATE_EDITOR.PIVOTTED')));

	var tabs = jQuery('<div>').appendTo(self.win);
	var ul = jQuery('<ul>').appendTo(tabs);
	self.tabData.each(function (x) {
		ul.append(x.li);
		tabs.append(x.div);
	});
	tabs.tabs();
});

// #show {{{2

TemplatesEditor.prototype.show = function () {
	var self = this;

	// Setup the values of each textarea.

	self.tabData.each(function (v, k) {
		var config = getProp(self.grid.defn, 'rendererOpts', k);
		if (config != null) {
			each(['empty', 'before', 'beforeGroup', 'item', 'afterGroup', 'after'], function (t) {
				if (v.inputs[t] && config[t]) {
					v.inputs[t].val(config[t]);
				}
			});
		}
	});

	self.win.dialog('open');
};

export {
	TemplatesEditor
};
